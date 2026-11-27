import path from 'node:path';
import { Worker } from 'node:worker_threads';
import type {
  FromWorker,
  GuestOptions,
  GuestOutcome,
  HostCallOutcome,
  ToWorker,
} from './sandboxGuest';

/*
 * The sandbox of Code Mode (F-15). JavaScript written by an AI agent runs in QuickJS compiled to
 * WebAssembly (sandboxGuest.ts), never in Node's own engine: Node's `vm` module is no sandbox.
 * Each run gets a worker thread of its own, so that the main thread keeps serving whatever the
 * code does, and holds every limit of time: it ends the worker with `terminate()`, which stops it
 * wherever it is, in a native function of QuickJS that never checks for an interruption too.
 * Nothing is shared between two runs, and the memory of a run goes away with its worker.
 *
 * The code reaches the host through `codemode` only: host calls cross as JSON in messages.
 */

export interface SandboxLimits {
  /** Time a run may take, the start of its worker and the waits for host calls included. */
  wallTimeMs: number;
  /** Time the guest may compute: its worker is busy from a message of the host to its next `idle`. */
  cpuTimeMs: number;
  /** QuickJS heap: past it, an allocation throws "out of memory" in the code. */
  memoryBytes: number;
  /**
   * Hard cap of the WebAssembly memory of the run (QuickJS, its stack, the allocator): some
   * allocations of QuickJS escape `memoryBytes`, never this one.
   */
  wasmMemoryBytes: number;
  /**
   * QuickJS stack: past it, a call throws "stack overflow" in the code. WebAssembly runs on the
   * stack of the worker (STACK_SIZE_MB), far above it. The few paths of QuickJS that recurse
   * without this check exhaust that stack instead, and end the run (`crashed`).
   */
  stackBytes: number;
  /** Host calls of a run, `codemode.spec()` included: the next ones reject. */
  maxHostCalls: number;
  /** Longest JSON or error message a run hands back. */
  outputChars: number;
  /**
   * Longest JSON argument of a host call, as the largest body the API accepts (5 MB): a longer
   * one is refused before it reaches the heap of the worker.
   */
  argumentChars: number;
}

export const SANDBOX_LIMITS: SandboxLimits = {
  wallTimeMs: 10_000,
  cpuTimeMs: 1_000,
  memoryBytes: 64 * 1024 * 1024,
  wasmMemoryBytes: 96 * 1024 * 1024,
  stackBytes: 128 * 1024,
  maxHostCalls: 50,
  outputChars: 24_000,
  argumentChars: 5 * 1024 * 1024,
};

/** Runs at the same time: each holds a worker thread and up to `wasmMemoryBytes`. */
export const MAX_CONCURRENT_RUNS = 2;
/** Runs waiting for one of those: the next ones are refused at once (`busy`). */
export const MAX_QUEUED_RUNS = 4;

/*
 * The stack of a worker, on which WebAssembly runs. Its JavaScript heap keeps Node's defaults:
 * a worker past a heap limit can take the whole process down with it. It only holds what crosses
 * from QuickJS, which the guest bounds (argumentChars, outputChars), and the host's answers.
 */
const STACK_SIZE_MB = 4;
const WORKER_RESOURCE_LIMITS = { stackSizeMb: STACK_SIZE_MB };

// The compiled worker in dist/; from the TypeScript sources (tests, `npm run dev`), tsx loads it
const FROM_SOURCES = path.extname(__filename) === '.ts';
const WORKER_FILE = path.join(__dirname, FROM_SOURCES ? 'sandboxWorker.ts' : 'sandboxWorker.js');
const WORKER_EXEC_ARGV = FROM_SOURCES ? ['--import', 'tsx'] : [];

/**
 * How a worker of the sandbox starts. Its environment is empty: the guest cannot reach
 * `process`, but the worker would otherwise inherit the secrets of the server (JWT_SECRET,
 * ADMIN_PASSWORD), and it needs none of them.
 */
export const SANDBOX_WORKER_OPTIONS = {
  env: {},
  execArgv: WORKER_EXEC_ARGV,
  resourceLimits: WORKER_RESOURCE_LIMITS,
};

/** A function the code calls as `codemode.<name>(argument)`: its argument and result are JSON. */
export type HostFunction = (argument: unknown, signal: AbortSignal) => Promise<unknown>;

/**
 * Thrown by a host function: the call rejects in the code with an Error of this message, which
 * carries `fields` (such as the status and body of an API answer).
 */
export class HostFunctionError extends Error {
  constructor(
    message: string,
    readonly fields: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export interface SandboxRequest {
  /** An async arrow function, such as `async () => { … }`. */
  code: string;
  /** `codemode.<name>(argument)`: called at each call. */
  functions?: Record<string, HostFunction>;
  /** `codemode.<name>()`: called on the first call of a run, the same value after. */
  values?: Record<string, () => Promise<unknown>>;
  /** What a host call past `maxHostCalls` rejects with. */
  callRefusal?: HostFunctionError;
  /** The cancellation of the call by the client: a run still waiting for a slot never starts. */
  signal?: AbortSignal;
}

/** The size the WebAssembly memory of the run reached, when the run reported it. */
interface Measured {
  memoryBytes?: number;
}

export type SandboxResult = Measured &
  (
    | /** The JSON of what the code returned, cut at `outputChars`; `length` is the whole length. */
      { ok: true; json: string; length: number }
      /** The code threw, or did not compile: its error, cut at `outputChars` from `length`. */
    | { ok: false; reason: 'thrown'; message: string; length: number }
    | {
        ok: false;
        reason: 'notAFunction' | 'wallTime' | 'cpuTime' | 'crashed' | 'busy' | 'cancelled';
      }
  );

function outcomeOf(error: unknown): HostCallOutcome {
  if (error instanceof HostFunctionError) {
    return { ok: false, message: error.message, fields: error.fields };
  }
  return { ok: false, message: 'The call failed on the server' };
}

function resultOf(outcome: GuestOutcome, memoryBytes: number): SandboxResult {
  switch (outcome.kind) {
    case 'ok':
      return { ok: true, json: outcome.json, length: outcome.length, memoryBytes };
    case 'thrown':
      return {
        ok: false,
        reason: 'thrown',
        message: outcome.message,
        length: outcome.length,
        memoryBytes,
      };
    case 'notAFunction':
    case 'crashed':
      return { ok: false, reason: outcome.kind, memoryBytes };
  }
}

/** One run in its worker thread, ended by its outcome, a limit or a fault of the worker. */
class WorkerRun {
  readonly result: Promise<SandboxResult>;
  private resolveResult: (result: SandboxResult) => void = () => {};
  private readonly worker: Worker;
  private readonly aborted = new AbortController();
  private readonly wallTimer: NodeJS.Timeout;
  private cpuTimer: NodeJS.Timeout | undefined;
  /** When the guest started computing; undefined while it waits for host calls. */
  private busySince: number | undefined;
  private spentMs = 0;
  private answersSent = 0;
  private finished = false;

  constructor(
    private readonly request: SandboxRequest,
    private readonly limits: SandboxLimits,
  ) {
    this.result = new Promise((resolve) => (this.resolveResult = resolve));
    this.wallTimer = setTimeout(
      () => this.finish({ ok: false, reason: 'wallTime' }),
      limits.wallTimeMs,
    );
    this.worker = new Worker(WORKER_FILE, SANDBOX_WORKER_OPTIONS);
    this.worker.on('message', (message: FromWorker) => this.receive(message));
    // An uncaught error, the resource limits, or an exit before the outcome: a fault of the run
    this.worker.on('error', (error: Error) => this.fail(error));
    this.worker.on('exit', () => this.finish({ ok: false, reason: 'crashed' }));
  }

  private post(message: ToWorker): void {
    this.worker.postMessage(message);
  }

  private receive(message: FromWorker): void {
    switch (message.type) {
      case 'ready':
        this.post({ type: 'run', options: this.guestOptions() });
        this.startBusy();
        break;
      case 'call':
        void this.hostCall(message.id, message.name, message.argumentJson);
        break;
      case 'idle':
        // An answer sent since keeps the guest busy: its own `idle` comes later
        if (message.answered === this.answersSent) this.stopBusy();
        break;
      case 'done':
        this.finish(resultOf(message.outcome, message.memoryBytes));
        break;
    }
  }

  private guestOptions(): GuestOptions {
    const { request, limits } = this;
    const refusal =
      request.callRefusal ??
      new HostFunctionError(`This run made the ${limits.maxHostCalls} calls to the server it may`);
    return {
      code: request.code,
      functions: Object.keys(request.functions ?? {}),
      values: Object.keys(request.values ?? {}),
      memoryBytes: limits.memoryBytes,
      wasmMemoryBytes: limits.wasmMemoryBytes,
      stackBytes: limits.stackBytes,
      maxHostCalls: limits.maxHostCalls,
      callRefusal: outcomeOf(refusal),
      outputChars: limits.outputChars,
      argumentChars: limits.argumentChars,
    };
  }

  private async hostCall(id: number, name: string, argumentJson: string): Promise<void> {
    const outcome = await this.callOutcome(name, argumentJson);
    // Past a limit, or once the run is over, nothing crosses any more: not even its JSON is made
    if (this.finished) return;
    this.answersSent += 1;
    this.post({ type: 'answer', id, outcomeJson: JSON.stringify(outcome) });
    this.startBusy();
  }

  private async callOutcome(name: string, argumentJson: string): Promise<HostCallOutcome> {
    try {
      const fn = this.request.functions?.[name];
      if (fn) return { ok: true, value: await fn(JSON.parse(argumentJson), this.aborted.signal) };
      const value = this.request.values?.[name];
      if (value) return { ok: true, value: await value() };
      return { ok: false, message: `codemode.${name} does not exist` };
    } catch (error) {
      // A fault of the host, not of the code: logged, and the code only learns it failed. Once
      // the run is over, its calls are aborted on purpose and nobody reads their outcome.
      if (!(error instanceof HostFunctionError) && !this.aborted.signal.aborted) {
        console.error(`Code Mode: codemode.${name} failed`, error);
      }
      return outcomeOf(error);
    }
  }

  private startBusy(): void {
    if (this.finished || this.busySince !== undefined) return;
    this.busySince = performance.now();
    this.cpuTimer = setTimeout(
      () => this.finish({ ok: false, reason: 'cpuTime' }),
      Math.max(0, this.limits.cpuTimeMs - this.spentMs),
    );
  }

  private stopBusy(): void {
    if (this.busySince === undefined) return;
    this.spentMs += performance.now() - this.busySince;
    this.busySince = undefined;
    clearTimeout(this.cpuTimer);
  }

  /** A fault of the worker itself, outside the guest's code: logged. */
  private fail(error: Error): void {
    if (!this.finished) console.error('Code Mode: the sandbox worker failed', error);
    this.finish({ ok: false, reason: 'crashed' });
  }

  /** Ends the run with `result`, and its worker with it, wherever it is. */
  private finish(result: SandboxResult): void {
    if (this.finished) return;
    this.finished = true;
    clearTimeout(this.wallTimer);
    clearTimeout(this.cpuTimer);
    this.aborted.abort();
    void this.worker.terminate();
    this.resolveResult(result);
  }
}

/** Runs allowed at once, and a short queue: past both, a run is refused at once. */
class RunSlots {
  private running = 0;
  private readonly waiting: (() => void)[] = [];

  /**
   * Resolves once the run may start; `busy` when the queue is full too, `cancelled` when
   * `signal` aborts first: the run then leaves the queue without running.
   */
  acquire(signal?: AbortSignal): Promise<'acquired' | 'busy' | 'cancelled'> {
    if (signal?.aborted) return Promise.resolve('cancelled');
    if (this.running < MAX_CONCURRENT_RUNS) {
      this.running += 1;
      return Promise.resolve('acquired');
    }
    if (this.waiting.length >= MAX_QUEUED_RUNS) return Promise.resolve('busy');
    return new Promise((resolve) => {
      // The run that ends hands its slot over (release)
      const start = () => {
        signal?.removeEventListener('abort', leave);
        resolve('acquired');
      };
      const leave = () => {
        this.waiting.splice(this.waiting.indexOf(start), 1);
        resolve('cancelled');
      };
      this.waiting.push(start);
      signal?.addEventListener('abort', leave, { once: true });
    });
  }

  release(): void {
    const next = this.waiting.shift();
    if (next) next();
    else this.running -= 1;
  }
}

const slots = new RunSlots();

/**
 * Runs `request.code` in a fresh sandbox where `codemode.<name>` calls the host functions and
 * values of the request. Answers the JSON of what the code returned, or why it failed.
 */
export async function runInSandbox(
  request: SandboxRequest,
  limits: SandboxLimits = SANDBOX_LIMITS,
): Promise<SandboxResult> {
  const slot = await slots.acquire(request.signal);
  if (slot !== 'acquired') return { ok: false, reason: slot };
  try {
    return await new WorkerRun(request, limits).result;
  } finally {
    slots.release();
  }
}
