import releaseSyncVariant from '@jitl/quickjs-wasmfile-release-sync';
import {
  newQuickJSWASMModuleFromVariant,
  type QuickJSContext,
  type QuickJSDeferredPromise,
  type QuickJSHandle,
  type QuickJSRuntime,
} from 'quickjs-emscripten-core';

/*
 * The sandbox of Code Mode (F-15): JavaScript written by an AI agent runs in QuickJS compiled to
 * WebAssembly, never in Node's own engine. Node's `vm` module is no sandbox: code there reaches
 * the host through the prototypes of the objects it is given. QuickJS is another engine, whose
 * heap lies inside the memory of its WebAssembly instance: the code sees the language's
 * built-ins and the `codemode` object made here, nothing else. No require, process, fetch, file
 * system, network or timers: a host function is its only way out, with JSON in and JSON out.
 *
 * Each run gets a WebAssembly instance of its own (about 2 ms): nothing is shared between two
 * runs, and the memory of a run goes away with its instance.
 */

export interface SandboxLimits {
  /** Time a run may take, waits for the host functions included. */
  wallTimeMs: number;
  /**
   * Time the code itself may run. QuickJS runs on Node's thread: while the code computes, the
   * server waits. QuickJS's interrupt handler stops it once this budget is spent.
   */
  cpuTimeMs: number;
  /** QuickJS heap: past it, an allocation throws "out of memory" in the code. */
  memoryBytes: number;
  /**
   * QuickJS stack: past it, a call throws "stack overflow" in the code. WebAssembly runs on
   * Node's own stack, where 128 KiB of QuickJS take about 400 KiB of Node's 984 KiB: QuickJS
   * stops a deep recursion long before Node would (at about 300 KiB, measured). The few paths
   * of QuickJS that recurse without this check end the run instead (`crashed`).
   */
  stackBytes: number;
}

export const SANDBOX_LIMITS: SandboxLimits = {
  wallTimeMs: 10_000,
  cpuTimeMs: 1_000,
  memoryBytes: 64 * 1024 * 1024,
  stackBytes: 128 * 1024,
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

/** Why a run ended early: one of its limits, or its instance broke (Node's stack exhausted). */
type StopReason = 'wallTime' | 'cpuTime' | 'crashed';

export type SandboxResult =
  /** The JSON of what the code returned, or `undefined`. */
  | { ok: true; json: string }
  /** The code threw, or did not compile: the message of its error. */
  | { ok: false; reason: 'thrown'; message: string }
  | { ok: false; reason: 'notAFunction' | StopReason };

/*
 * Runs in QuickJS before the code. It builds `codemode` from the host's single function `call`,
 * and answers the function that runs the code and turns its result into JSON. JSON's own
 * functions are kept before the code runs: the code may replace `JSON.stringify` for itself, not
 * for what the host reads.
 */
const PRELUDE = `(call, namesJson) => {
  const { parse, stringify } = JSON;
  const codemode = {};
  for (const name of parse(namesJson)) {
    codemode[name] = async (argument) => {
      const outcome = parse(await call(name, stringify(argument === undefined ? null : argument)));
      if (outcome.ok) return outcome.value;
      throw Object.assign(new Error(outcome.message), outcome.fields);
    };
  }
  globalThis.codemode = Object.freeze(codemode);
  return async (main) => {
    const json = stringify(await main());
    return json === undefined ? 'undefined' : json;
  };
}`;

/** Wall time and time spent inside QuickJS, against the limits of a run. */
class Clock {
  private readonly deadline: number;
  private spentMs = 0;
  private enteredAt: number | undefined;

  constructor(private readonly limits: SandboxLimits) {
    this.deadline = Date.now() + limits.wallTimeMs;
  }

  /** Runs `step` inside QuickJS, counting its time. */
  measure<T>(step: () => T): T {
    this.enteredAt = performance.now();
    try {
      return step();
    } finally {
      this.spentMs += performance.now() - this.enteredAt;
      this.enteredAt = undefined;
    }
  }

  /** The limit the run went past, if any: QuickJS then interrupts whatever the code does. */
  get exceededLimit(): 'cpuTime' | 'wallTime' | undefined {
    const running = this.enteredAt === undefined ? 0 : performance.now() - this.enteredAt;
    if (this.spentMs + running > this.limits.cpuTimeMs) return 'cpuTime';
    if (Date.now() > this.deadline) return 'wallTime';
    return undefined;
  }

  get remainingWallMs(): number {
    return Math.max(0, this.deadline - Date.now());
  }
}

interface Outcome {
  ok: boolean;
  value?: unknown;
  message?: string;
  fields?: Record<string, unknown>;
}

/**
 * An exception out of the WebAssembly instance itself rather than out of the code: Node's stack
 * exhausted inside it (RangeError), or an abort or trap of QuickJS (WebAssembly.RuntimeError,
 * whose lib types are not loaded here). The instance is unusable after it.
 */
function isInstanceFault(error: unknown): boolean {
  return error instanceof RangeError || (error instanceof Error && error.name === 'RuntimeError');
}

/** Ends a run whose instance faulted: nothing more runs in it. */
class InstanceFault extends Error {}

/** One run: a fresh WebAssembly instance, released by `dispose()` whatever happened. */
class SandboxRun {
  private readonly handles: QuickJSHandle[] = [];
  private readonly pending = new Set<QuickJSDeferredPromise>();
  private readonly aborted = new AbortController();
  private readonly stopTimer: NodeJS.Timeout;
  private faulted = false;
  /** Why the run stopped before its code settled, if it did. */
  private stopReason: StopReason | undefined;
  private resolveStopped: (reason: StopReason) => void = () => {};
  private readonly stopped = new Promise<StopReason>((resolve) => (this.resolveStopped = resolve));

  constructor(
    private readonly runtime: QuickJSRuntime,
    private readonly context: QuickJSContext,
    private readonly clock: Clock,
    private readonly functions: Record<string, HostFunction>,
  ) {
    this.stopTimer = setTimeout(() => this.stop('wallTime'), clock.remainingWallMs);
  }

  private stop(reason: StopReason): void {
    this.stopReason ??= reason;
    this.resolveStopped(reason);
  }

  /** Runs `step` inside QuickJS. Throws InstanceFault once the instance is unusable. */
  private enter<T>(step: () => T): T {
    if (this.faulted) throw new InstanceFault();
    try {
      return this.clock.measure(step);
    } catch (error) {
      if (!isInstanceFault(error)) throw error;
      this.faulted = true;
      this.stop('crashed');
      throw new InstanceFault();
    }
  }

  /** Keeps `handle` until the run ends. */
  private keep(handle: QuickJSHandle): QuickJSHandle {
    this.handles.push(handle);
    return handle;
  }

  /** Evaluates `code` and keeps its value; the error of the code otherwise. */
  evaluate(code: string, fileName: string): { value: QuickJSHandle } | { message: string } {
    const result = this.enter(() => this.context.evalCode(code, fileName));
    if (result.error) return { message: this.describeAndDispose(result.error) };
    return { value: this.keep(result.value) };
  }

  call(
    fn: QuickJSHandle,
    ...args: QuickJSHandle[]
  ): { value: QuickJSHandle } | { message: string } {
    const result = this.enter(() => this.context.callFunction(fn, this.context.undefined, ...args));
    if (result.error) return { message: this.describeAndDispose(result.error) };
    return { value: this.keep(result.value) };
  }

  isFunction(handle: QuickJSHandle): boolean {
    return this.context.typeof(handle) === 'function';
  }

  string(value: string): QuickJSHandle {
    return this.keep(this.context.newString(value));
  }

  /** The host's `call(name, argumentJson)`: a promise settled with the JSON of an Outcome. */
  hostCall(): QuickJSHandle {
    const call = this.context.newFunction('call', (nameHandle, argumentHandle) => {
      const name = this.context.getString(nameHandle);
      const argumentJson =
        this.context.typeof(argumentHandle) === 'string'
          ? this.context.getString(argumentHandle)
          : 'null';
      const deferred = this.context.newPromise();
      this.pending.add(deferred);
      this.settle(deferred, name, argumentJson).catch((error: unknown) => this.fail(error));
      return deferred.handle;
    });
    return this.keep(call);
  }

  private async outcomeOf(name: string, argumentJson: string): Promise<Outcome> {
    const fn = this.functions[name];
    if (!fn) return { ok: false, message: `codemode.${name} does not exist` };
    try {
      const value = await fn(JSON.parse(argumentJson), this.aborted.signal);
      return { ok: true, value: value ?? null };
    } catch (error) {
      if (error instanceof HostFunctionError) {
        return { ok: false, message: error.message, fields: error.fields };
      }
      // A fault of the host, not of the code: logged here, and the code only learns it failed.
      // Once the run is over, the call was aborted on purpose, and nobody reads its outcome.
      if (!this.aborted.signal.aborted) console.error(`Code Mode: codemode.${name} failed`, error);
      return { ok: false, message: `codemode.${name} failed on the server` };
    }
  }

  private async settle(
    deferred: QuickJSDeferredPromise,
    name: string,
    argumentJson: string,
  ): Promise<void> {
    const outcome = await this.outcomeOf(name, argumentJson);
    // The run is over: its instance is gone
    if (!deferred.alive) return;
    this.enter(() => {
      const json = this.context.newString(JSON.stringify(outcome));
      deferred.resolve(json);
      json.dispose();
    });
    this.pending.delete(deferred);
    deferred.dispose();
    this.runPendingJobs();
  }

  /** Ends the run on an error out of a host call's continuation, which no caller awaits. */
  private fail(error: unknown): void {
    if (!(error instanceof InstanceFault)) console.error('Code Mode: the sandbox failed', error);
    this.stop('crashed');
  }

  /** Runs the promise callbacks waiting in QuickJS: the code goes on after an `await`. */
  runPendingJobs(): void {
    const result = this.enter(() => this.runtime.executePendingJobs());
    // A job that throws rejects its promise, which the result of the code reports
    if (result.error) result.error.dispose();
    const limit = this.clock.exceededLimit;
    if (limit) this.stop(limit);
  }

  /** The value `promise` settles with, unless the run is stopped first. */
  async settled(promise: QuickJSHandle): Promise<SandboxResult> {
    const resolved = this.enter(() => this.context.resolvePromise(promise));
    this.runPendingJobs();
    const result = await Promise.race([resolved, this.stopped]);
    if (typeof result === 'string') return { ok: false, reason: result };
    if (result.error) return this.failure(this.describeAndDispose(result.error));
    const json = this.context.getString(this.keep(result.value));
    return { ok: true, json };
  }

  /** The error of the code, or the limit it went past: QuickJS then throws a bare "interrupted". */
  failure(message: string): SandboxResult {
    const limit = this.clock.exceededLimit;
    return limit ? { ok: false, reason: limit } : { ok: false, reason: 'thrown', message };
  }

  /** `Name: message` of a thrown value, read without running more of its code. */
  private describeAndDispose(error: QuickJSHandle): string {
    try {
      // Reading it would run more code, which QuickJS interrupts at once
      if (this.clock.exceededLimit) return 'InternalError: interrupted';
      if (this.context.typeof(error) !== 'object') return String(this.context.dump(error));
      const name = this.stringProperty(error, 'name') ?? 'Error';
      const message = this.stringProperty(error, 'message') ?? '';
      return message ? `${name}: ${message}` : name;
    } finally {
      error.dispose();
    }
  }

  private stringProperty(handle: QuickJSHandle, key: string): string | undefined {
    const property = this.enter(() => this.context.getProp(handle, key));
    try {
      return this.context.typeof(property) === 'string'
        ? this.context.getString(property)
        : undefined;
    } finally {
      property.dispose();
    }
  }

  /** Stops what the run still waits for, and frees the QuickJS objects the host holds, then QuickJS. */
  dispose(): void {
    clearTimeout(this.stopTimer);
    this.aborted.abort();
    // A faulted instance runs nothing more, not even its own clean-up
    if (this.faulted) return;
    for (const deferred of this.pending) deferred.dispose();
    for (const handle of this.handles) if (handle.alive) handle.dispose();
    this.freeQuickJs();
  }

  /*
   * QuickJS frees a runtime only once nothing references its objects, and aborts otherwise. A
   * run stopped midway (a limit) can leave some referenced by its jobs or by the code it
   * interrupted, and QuickJS itself loses track of a few after some errors. The instance belongs
   * to this run alone: V8 frees its whole memory once nothing references it.
   */
  private freeQuickJs(): void {
    if (this.stopReason || this.clock.exceededLimit || this.runtime.hasPendingJob()) return;
    try {
      this.context.dispose();
      this.runtime.dispose();
    } catch (error) {
      if (!isInstanceFault(error)) throw error;
    }
  }
}

/** Evaluates the prelude, then runs the code with it. */
async function execute(run: SandboxRun, code: string, functionNames: string[]) {
  const prelude = run.evaluate(PRELUDE, 'prelude.js');
  if (!('value' in prelude)) throw new Error(`The Code Mode prelude failed: ${prelude.message}`);
  const runner = run.call(prelude.value, run.hostCall(), run.string(JSON.stringify(functionNames)));
  if (!('value' in runner)) throw new Error(`The Code Mode prelude failed: ${runner.message}`);

  const main = run.evaluate(code, 'code.js');
  if (!('value' in main)) return run.failure(main.message);
  if (!run.isFunction(main.value)) return { ok: false, reason: 'notAFunction' } as const;
  const promise = run.call(runner.value, main.value);
  if (!('value' in promise)) return run.failure(promise.message);
  return run.settled(promise.value);
}

/**
 * Runs `code`, an async arrow function such as `async () => { … }`, in a fresh QuickJS
 * instance where `codemode.<name>(argument)` calls `functions[name]`. Answers the JSON of what
 * the function returned, or why it failed.
 */
export async function runInSandbox(
  code: string,
  functions: Record<string, HostFunction>,
  limits: SandboxLimits = SANDBOX_LIMITS,
): Promise<SandboxResult> {
  const module = await newQuickJSWASMModuleFromVariant(releaseSyncVariant);
  const clock = new Clock(limits);
  const runtime = module.newRuntime();
  runtime.setMemoryLimit(limits.memoryBytes);
  runtime.setMaxStackSize(limits.stackBytes);
  runtime.setInterruptHandler(() => clock.exceededLimit !== undefined);
  const run = new SandboxRun(runtime, runtime.newContext(), clock, functions);
  try {
    return await execute(run, code, Object.keys(functions));
  } catch (error) {
    if (error instanceof InstanceFault) return { ok: false, reason: 'crashed' };
    throw error;
  } finally {
    run.dispose();
  }
}
