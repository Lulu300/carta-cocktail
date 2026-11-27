import releaseSyncVariant from '@jitl/quickjs-wasmfile-release-sync';
import {
  newQuickJSWASMModuleFromVariant,
  newVariant,
  type QuickJSContext,
  type QuickJSDeferredPromise,
  type QuickJSHandle,
  type QuickJSRuntime,
} from 'quickjs-emscripten-core';

/*
 * The guest side of the Code Mode sandbox (F-15): QuickJS compiled to WebAssembly, run by the
 * worker thread of sandboxWorker.ts. The main thread (sandbox.ts) holds every limit of time and
 * kills the worker when one is reached, wherever the code is, native code of QuickJS included.
 *
 * The code sees the language's built-ins and `codemode`, nothing else: no require, process,
 * fetch, file system, network or timers. The host reads strings only, handed to two functions
 * that the prelude keeps before the code runs: `call` (a host call, JSON in and out) and `done`
 * (the outcome). Nothing of the guest's own objects is ever read or run by the host.
 */

/** What the run of the guest ends with, as the host reads it. */
export type GuestOutcome =
  /** The JSON of the value, cut at `outputChars`; `length` is the length of the whole JSON. */
  | { kind: 'ok'; json: string; length: number }
  /** `Name: message` of what the code threw, cut at `outputChars`; `length` is the whole length. */
  | { kind: 'thrown'; message: string; length: number }
  | { kind: 'notAFunction' }
  /** Node's stack exhausted inside the instance, or QuickJS aborted: the instance is unusable. */
  | { kind: 'crashed' };

export interface GuestOptions {
  code: string;
  /** `codemode.<name>(argument)`: a host call at each call. */
  functions: string[];
  /** `codemode.<name>()`: one host call on the first call of the run, the same value after. */
  values: string[];
  /** QuickJS heap: past it, an allocation throws "out of memory" in the code. */
  memoryBytes: number;
  /** Hard cap of the WebAssembly memory: QuickJS, its stack and the allocator's own data. */
  wasmMemoryBytes: number;
  /** QuickJS stack: past it, a call throws "stack overflow" in the code. */
  stackBytes: number;
  /** Host calls of a run, values included: the next ones reject with `callRefusal`. */
  maxHostCalls: number;
  callRefusal: HostCallOutcome;
  /** Longest JSON or error message handed to the host. */
  outputChars: number;
  /** Longest JSON argument of a host call: a longer one is refused without being read. */
  argumentChars: number;
}

/** The answer of a host call: its JSON value, or the error the call rejects with in the code. */
export type HostCallOutcome =
  { ok: true; value: unknown } | { ok: false; message: string; fields?: Record<string, unknown> };

/** Messages of the main thread to the worker of sandboxWorker.ts. */
export type ToWorker =
  { type: 'run'; options: GuestOptions } | { type: 'answer'; id: number; outcomeJson: string };

/** Messages of the worker to the main thread. */
export type FromWorker =
  /** Loaded, waiting for its run. */
  | { type: 'ready' }
  | { type: 'call'; id: number; name: string; argumentJson: string }
  /** Nothing to run until a host call answers, once `answered` answers were handled. */
  | { type: 'idle'; answered: number }
  | { type: 'done'; outcome: GuestOutcome; memoryBytes: number };

/** How the guest reaches the host: messages to the main thread in the worker, direct calls in tests. */
export interface HostLink {
  call(id: number, name: string, argumentJson: string): void;
  /**
   * Nothing left to run until a host call answers. `answered` counts the answers handled so far:
   * an answer the main thread sent meanwhile keeps the guest busy.
   */
  idle(answered: number): void;
  /** `memoryBytes`: the size the WebAssembly memory reached. */
  done(outcome: GuestOutcome, memoryBytes: number): void;
}

const WASM_PAGE_BYTES = 64 * 1024;
// Names of the host functions, made by the prelude from the list the host gave
const MAX_NAME_CHARS = 100;
// The memory QuickJS starts with (16 MiB): what the release build declares as its minimum
const INITIAL_WASM_PAGES = 256;

/** WebAssembly.Memory, whose types are not in the libs of this backend (ES2020 and node). */
interface WasmMemory {
  readonly buffer: ArrayBuffer;
}
const { Memory } = (
  globalThis as unknown as {
    WebAssembly: { Memory: new (descriptor: { initial: number; maximum: number }) => WasmMemory };
  }
).WebAssembly;

/*
 * Runs in QuickJS before the code, which cannot reach what it keeps: the host's `call` and
 * `done`, and the built-ins it uses, taken before the code can replace them. It builds
 * `codemode`, and answers the runner, which evaluates the code, runs it and hands `done` the JSON
 * of its result or the description of its error. Reading a thrown object runs its getters: that
 * is still the guest's code, under the same limits.
 */
const PRELUDE = `(call, done, namesJson, outputChars) => {
  const { parse, stringify } = JSON;
  const evaluate = eval;
  const apply = Reflect.apply;
  const slice = String.prototype.slice;
  const toText = String;
  const assign = Object.assign;
  const freeze = Object.freeze;
  const ErrorClass = Error;
  const report = (kind, text) =>
    done(kind, text.length > outputChars ? apply(slice, text, [0, outputChars]) : text, text.length);
  const describe = (error) => {
    try {
      if (error === null || (typeof error !== 'object' && typeof error !== 'function')) {
        return toText(error);
      }
      const name = error.name;
      const message = error.message;
      const label = typeof name === 'string' ? name : 'Error';
      return typeof message === 'string' && message ? label + ': ' + message : label;
    } catch {
      return 'The code threw a value that cannot be read';
    }
  };
  const send = async (name, argument) => {
    const outcome = parse(await call(name, stringify(argument === undefined ? null : argument)));
    if (outcome.ok) return outcome.value;
    throw assign(new ErrorClass(outcome.message), outcome.fields);
  };
  const { functions, values } = parse(namesJson);
  const codemode = {};
  for (const name of functions) codemode[name] = (argument) => send(name, argument);
  for (const name of values) {
    let value;
    codemode[name] = () => (value ??= send(name));
  }
  globalThis.codemode = freeze(codemode);
  const finish = async (pending) => {
    try {
      const json = stringify(await pending);
      report('ok', json === undefined ? 'undefined' : json);
    } catch (error) {
      report('thrown', describe(error));
    }
  };
  return (source) => {
    let main;
    try {
      main = evaluate(source);
    } catch (error) {
      return report('thrown', describe(error));
    }
    if (typeof main !== 'function') return report('notAFunction', '');
    try {
      finish(main());
    } catch (error) {
      report('thrown', describe(error));
    }
  };
}`;

/**
 * An exception out of the WebAssembly instance itself rather than out of the code: Node's stack
 * exhausted inside it (RangeError), or an abort or trap of QuickJS (WebAssembly.RuntimeError).
 */
function isInstanceFault(error: unknown): boolean {
  return error instanceof RangeError || (error instanceof Error && error.name === 'RuntimeError');
}

/** One run of guest code in a fresh QuickJS instance. */
export class GuestRun {
  private readonly pending = new Map<number, QuickJSDeferredPromise>();
  private nextCallId = 0;
  private answered = 0;
  private finished = false;

  private constructor(
    private readonly options: GuestOptions,
    private readonly link: HostLink,
    private readonly memory: WasmMemory,
    private readonly runtime: QuickJSRuntime,
    private readonly context: QuickJSContext,
  ) {}

  /** Starts the code, which runs until it awaits a host call or ends. */
  static async start(options: GuestOptions, link: HostLink): Promise<GuestRun> {
    const memory = new Memory({
      initial: INITIAL_WASM_PAGES,
      maximum: Math.floor(options.wasmMemoryBytes / WASM_PAGE_BYTES),
    });
    const quickjs = await newQuickJSWASMModuleFromVariant(
      newVariant(releaseSyncVariant, { wasmMemory: memory as never }),
    );
    const runtime = quickjs.newRuntime();
    runtime.setMemoryLimit(options.memoryBytes);
    runtime.setMaxStackSize(options.stackBytes);
    const run = new GuestRun(options, link, memory, runtime, runtime.newContext());
    run.guarded(() => run.begin());
    return run;
  }

  /** The answer of host call `id`: the code goes on after its `await`. */
  answer(id: number, outcomeJson: string): void {
    this.answered += 1;
    const deferred = this.pending.get(id);
    if (this.finished || !deferred) return;
    this.pending.delete(id);
    this.guarded(() => {
      this.resolve(deferred, outcomeJson);
      this.runPendingJobs();
    });
  }

  /** Runs `step`; a fault of the instance ends the run, which runs nothing more. */
  private guarded(step: () => void): void {
    try {
      step();
      if (!this.finished) this.link.idle(this.answered);
    } catch (error) {
      if (!isInstanceFault(error)) throw error;
      this.finish({ kind: 'crashed' });
    }
  }

  private begin(): void {
    const { context } = this;
    const names = JSON.stringify({
      functions: this.options.functions,
      values: this.options.values,
    });
    const prelude = context.unwrapResult(context.evalCode(PRELUDE, 'prelude.js'));
    const args = [
      this.hostCall(),
      this.doneFunction(),
      context.newString(names),
      context.newNumber(this.options.outputChars),
    ];
    const runner = context.unwrapResult(context.callFunction(prelude, context.undefined, ...args));
    const code = context.newString(this.options.code);
    const started = context.callFunction(runner, context.undefined, code);
    // The runner catches everything the code throws: an error here is the instance's
    started.dispose();
    for (const handle of [prelude, runner, code, ...args]) handle.dispose();
    this.runPendingJobs();
  }

  /**
   * The QuickJS string of `handle`, read only when it holds at most `maxChars` characters: a
   * string of the guest takes room in the JavaScript heap of the worker, which must stay small.
   * The length of a primitive string is its own: no code of the guest runs to read it.
   */
  private stringOf(handle: QuickJSHandle, maxChars: number): string | undefined {
    const { context } = this;
    if (context.typeof(handle) !== 'string') return undefined;
    const lengthHandle = context.getProp(handle, 'length');
    const length = context.getNumber(lengthHandle);
    lengthHandle.dispose();
    return length <= maxChars ? context.getString(handle) : undefined;
  }

  /** `call(name, argumentJson)`: a promise of the JSON of a HostCallOutcome. */
  private hostCall(): QuickJSHandle {
    const { context } = this;
    let calls = 0;
    return context.newFunction('call', (nameHandle, argumentHandle) => {
      const deferred = context.newPromise();
      calls += 1;
      const name = this.stringOf(nameHandle, MAX_NAME_CHARS) ?? '';
      const argumentJson = this.stringOf(argumentHandle, this.options.argumentChars);
      if (calls > this.options.maxHostCalls || this.finished) {
        this.resolve(deferred, JSON.stringify(this.options.callRefusal));
      } else if (argumentJson === undefined) {
        const message = `The argument of codemode.${name} is longer than ${this.options.argumentChars} characters as JSON`;
        this.resolve(deferred, JSON.stringify({ ok: false, message }));
      } else {
        const id = this.nextCallId++;
        this.pending.set(id, deferred);
        this.link.call(id, name, argumentJson);
      }
      return deferred.handle;
    });
  }

  /** `done(kind, text, length)`: the outcome, read once, as strings and a number only. */
  private doneFunction(): QuickJSHandle {
    const { context } = this;
    return context.newFunction('done', (kindHandle, textHandle, lengthHandle) => {
      if (this.finished) return;
      const kind = this.stringOf(kindHandle, MAX_NAME_CHARS) ?? '';
      const text = this.stringOf(textHandle, this.options.outputChars) ?? '';
      const length =
        context.typeof(lengthHandle) === 'number' ? context.getNumber(lengthHandle) : 0;
      if (kind === 'ok') this.finish({ kind, json: text, length });
      else if (kind === 'notAFunction') this.finish({ kind });
      else this.finish({ kind: 'thrown', message: text, length });
    });
  }

  /** Settles the promise of a host call. Its handle went to QuickJS, and resolving frees the rest. */
  private resolve(deferred: QuickJSDeferredPromise, outcomeJson: string): void {
    const json = this.context.newString(outcomeJson);
    deferred.resolve(json);
    json.dispose();
  }

  /** Runs the promise callbacks waiting in QuickJS. */
  private runPendingJobs(): void {
    const result = this.runtime.executePendingJobs();
    // A job that throws rejects its promise, which the runner reports
    if (result.error) result.error.dispose();
  }

  private finish(outcome: GuestOutcome): void {
    if (this.finished) return;
    this.finished = true;
    this.link.done(outcome, this.memory.buffer.byteLength);
  }
}
