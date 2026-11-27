import { describe, expect, it, vi } from 'vitest';
import {
  HostFunctionError,
  MAX_CONCURRENT_RUNS,
  MAX_QUEUED_RUNS,
  runInSandbox,
  SANDBOX_LIMITS,
  type HostFunction,
  type SandboxLimits,
  type SandboxRequest,
  type SandboxResult,
} from './sandbox';

/*
 * Hostile code against the sandbox, in its worker threads: what the model writes must not get
 * out of QuickJS, nor hold the server. Each test also checks that the event loop of this thread
 * kept turning while the code ran. Some limits are lowered so that the tests stay fast.
 */

const FAST: SandboxLimits = { ...SANDBOX_LIMITS, wallTimeMs: 1_500, cpuTimeMs: 300 };

// Longest pause of this thread's event loop allowed during a run: the code runs elsewhere
const MAX_EVENT_LOOP_PAUSE_MS = 150;

interface Observed {
  result: SandboxResult;
  elapsedMs: number;
  /** Longest pause of the event loop of this thread while the run lasted. */
  pauseMs: number;
}

async function observe(
  code: string,
  request: Omit<SandboxRequest, 'code'> = {},
  limits = FAST,
): Promise<Observed> {
  let pauseMs = 0;
  let last = performance.now();
  const ticker = setInterval(() => {
    const now = performance.now();
    pauseMs = Math.max(pauseMs, now - last);
    last = now;
  }, 5);
  const started = performance.now();
  try {
    const result = await runInSandbox({ code, ...request }, limits);
    return { result, elapsedMs: performance.now() - started, pauseMs };
  } finally {
    clearInterval(ticker);
  }
}

/** The result of a run, which must leave this thread responsive. */
async function run(code: string, request: Omit<SandboxRequest, 'code'> = {}, limits = FAST) {
  const observed = await observe(code, request, limits);
  expect(observed.pauseMs, `event loop paused while running ${code}`).toBeLessThan(
    MAX_EVENT_LOOP_PAUSE_MS,
  );
  return observed.result;
}

async function valueOf(code: string, request: Omit<SandboxRequest, 'code'> = {}) {
  const result = await run(code, request);
  if (!result.ok) throw new Error(`The code failed: ${JSON.stringify(result)}`);
  return result.json === 'undefined' ? undefined : (JSON.parse(result.json) as unknown);
}

const echo: HostFunction = async (argument) => argument;

describe('runInSandbox', () => {
  it('should answer the JSON of what the function returns, and the memory it reached', async () => {
    expect(await valueOf('async () => ({ answer: 6 * 7, list: [1, "a", null] })')).toEqual({
      answer: 42,
      list: [1, 'a', null],
    });
    expect(await run('async () => {}')).toMatchObject({ ok: true, json: 'undefined' });
    expect(await run('async () => 1')).toMatchObject({ memoryBytes: 16 * 1024 * 1024 });
  });

  it('should refuse code that is not a function, and report what the code throws', async () => {
    expect(await run('1 + 1')).toMatchObject({ ok: false, reason: 'notAFunction' });
    expect(await run('async () => {')).toMatchObject({
      reason: 'thrown',
      message: expect.stringMatching(/^SyntaxError/),
    });
    expect(await run('async () => { throw new TypeError("no way") }')).toMatchObject({
      reason: 'thrown',
      message: 'TypeError: no way',
    });
  });

  it('should give the code no way to the host: no require, process, fetch, timers or modules', async () => {
    const globals = [
      'require',
      'process',
      'fetch',
      'setTimeout',
      'setInterval',
      'queueMicrotask',
      'WebAssembly',
      'Buffer',
      'module',
      'std',
      'os',
    ];
    const code = `async () => [${globals.map((name) => `typeof globalThis.${name}`).join(', ')}]`;

    expect(await valueOf(code)).toEqual(globals.map(() => 'undefined'));
    expect(await valueOf('async () => Object.keys(globalThis)')).toEqual(['codemode']);
    for (const specifier of ['fs', 'node:fs', '/etc/passwd', 'file:///etc/passwd']) {
      expect(
        await run(`async () => (await import(${JSON.stringify(specifier)})).default`),
      ).toMatchObject({
        reason: 'thrown',
      });
    }
  });

  it('should keep Function and the prototypes inside QuickJS', async () => {
    const escapes = [
      '(() => {}).constructor("return typeof process")()',
      'Function("return typeof require")()',
      'codemode.echo.constructor("return typeof process")()',
      '({}).constructor.constructor("return typeof globalThis.process")()',
      '(function () { return typeof this.process })()',
    ];
    for (const escape of escapes) {
      expect(await valueOf(`async () => await (${escape})`, { functions: { echo } }), escape).toBe(
        'undefined',
      );
    }
    await valueOf(
      'async () => { Object.prototype.polluted = true; Array.prototype.push = null; return 1 }',
    );
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(typeof Array.prototype.push).toBe('function');
  });

  describe('time', () => {
    it.each([
      ['an endless loop', 'async () => { while (true) {} }'],
      [
        'an endless loop that catches',
        'async () => { for (;;) { try { while (true) {} } catch {} } }',
      ],
      [
        'endless promise callbacks',
        'async () => { const loop = () => Promise.resolve().then(loop); loop(); await new Promise(() => {}) }',
      ],
      // A native function of QuickJS that never checks for an interruption
      ['a native search', 'async () => "a".repeat(2 ** 24).indexOf("a".repeat(2 ** 12) + "b")'],
      // The getters of a thrown object, read to describe it
      ['a thrown object that loops', 'async () => { throw { get message() { for (;;) {} } } }'],
      // toJSON, called by JSON.stringify on the result
      ['a result that loops', 'async () => ({ toJSON() { for (;;) {} } })'],
    ])('should stop %s at the CPU limit, and keep this thread responsive', async (_label, code) => {
      const { result, elapsedMs, pauseMs } = await observe(code);

      expect(result).toEqual({ ok: false, reason: 'cpuTime' });
      expect(elapsedMs).toBeLessThan(FAST.cpuTimeMs + 500);
      expect(pauseMs).toBeLessThan(MAX_EVENT_LOOP_PAUSE_MS);
    });

    it('should stop a promise that never settles at the wall time limit', async () => {
      const { result, elapsedMs } = await observe('async () => { await new Promise(() => {}) }');

      expect(result).toEqual({ ok: false, reason: 'wallTime' });
      expect(elapsedMs).toBeGreaterThanOrEqual(FAST.wallTimeMs - 50);
    });

    it('should stop a host call that never answers, and abort it', async () => {
      let signal: AbortSignal | undefined;
      const hang: HostFunction = (_argument, abortSignal) => {
        signal = abortSignal;
        return new Promise(() => {});
      };

      expect(await run('async () => codemode.hang()', { functions: { hang } })).toEqual({
        ok: false,
        reason: 'wallTime',
      });
      expect(signal?.aborted).toBe(true);
    });

    it('should count the computing between host calls, not the waits', async () => {
      // Three waits of 200 ms, longer than the CPU limit together, and little computing
      const slow: HostFunction = () => new Promise((resolve) => setTimeout(() => resolve(1), 200));
      const code =
        'async () => (await codemode.slow()) + (await codemode.slow()) + (await codemode.slow())';

      expect(await valueOf(code, { functions: { slow } })).toBe(3);
    });
  });

  describe('memory', () => {
    const roomy = { ...SANDBOX_LIMITS, cpuTimeMs: 5_000, wallTimeMs: 10_000 };

    it.each([
      [
        'arrays kept one after the other',
        'async () => { const k = []; for (let j = 0;; j++) k.push(new Array(100000).fill(j)) }',
      ],
      [
        'buffers of 1 MB',
        'async () => { const k = []; for (;;) k.push(new ArrayBuffer(1 << 20)) }',
      ],
      ['objects', 'async () => { const k = []; for (;;) k.push({ a: [1, 2, 3], b: "text" }) }'],
    ])('should refuse %s within the WebAssembly memory cap', async (_label, code) => {
      const result = await run(code, {}, roomy);

      // QuickJS throws "out of memory", or null when it has no memory left to build an error
      expect(result).toMatchObject({ ok: false, reason: 'thrown' });
      // The memory the run really reached, measured in the worker
      expect(result.memoryBytes).toBeGreaterThan(SANDBOX_LIMITS.memoryBytes / 4);
      expect(result.memoryBytes).toBeLessThanOrEqual(SANDBOX_LIMITS.wasmMemoryBytes);
    });

    it('should refuse a host call whose argument is too long, without reading it', async () => {
      const spy = vi.fn<HostFunction>(echo);
      const code = `async () => {
        try { await codemode.echo("x".repeat(${SANDBOX_LIMITS.argumentChars})) } catch (e) { return e.message }
      }`;

      expect(await valueOf(code, { functions: { echo: spy } })).toMatch(/is longer than/);
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('stack', () => {
    it.each([
      'async () => { const f = () => f(); return f() }',
      'async () => { const f = () => [f()]; return JSON.stringify(f()) }',
      'async () => JSON.parse("[".repeat(100000) + "]".repeat(100000))',
      'async () => { let o = {}; for (let i = 0; i < 100000; i++) o = { o }; return o }',
    ])('should stop %s with a stack overflow', async (code) => {
      expect(await run(code)).toMatchObject({
        reason: 'thrown',
        message: expect.stringMatching(/stack overflow/),
      });
    });
  });

  describe('what the host reads', () => {
    it('should read the result through the prelude, not the promises of the code', async () => {
      // A then of its own may call back with anything: the host never runs it
      const code = `async () => {
        Promise.prototype.then = function (resolve) { resolve({ toString() { for (;;) {} } }) };
        return { real: true };
      }`;

      expect(await valueOf(code)).toEqual({ real: true });
    });

    it('should read only JSON, whatever the code replaces', async () => {
      const code = `async () => {
        JSON.stringify = () => 'not JSON';
        String.prototype.slice = () => 'forged';
        Reflect.apply = () => 'forged';
        return { real: true };
      }`;

      expect(await valueOf(code)).toEqual({ real: true });
    });

    it('should describe a thrown object from its name and message only', async () => {
      const code = 'async () => { throw { toJSON() { for (;;) {} }, toString() { for (;;) {} } } }';

      expect(await run(code)).toMatchObject({ reason: 'thrown', message: 'Error' });
    });

    it('should cut a huge answer at outputChars and give its length', async () => {
      const result = await run('async () => "x".repeat(1e6)');

      expect(result).toMatchObject({ ok: true, length: 1e6 + 2 });
      expect(result.ok && result.json.length).toBe(SANDBOX_LIMITS.outputChars);
    });
  });

  describe('host calls', () => {
    it('should hand host functions JSON and resolve with their JSON answer', async () => {
      const spy = vi.fn<HostFunction>(async (argument) => ({ received: argument }));

      expect(
        await valueOf('async () => [await codemode.echo({ a: [1, 2] }), await codemode.echo()]', {
          functions: { echo: spy },
        }),
      ).toEqual([{ received: { a: [1, 2] } }, { received: null }]);
      expect(spy.mock.calls.map(([argument]) => argument)).toEqual([{ a: [1, 2] }, null]);
    });

    it('should reject in the code with the message and fields of a HostFunctionError', async () => {
      const refuse: HostFunction = async () => {
        throw new HostFunctionError('refused', { status: 403, body: { error: 'No' } });
      };

      expect(
        await valueOf(
          'async () => { try { await codemode.refuse() } catch (e) { return [e.message, e.status, e.body] } }',
          { functions: { refuse } },
        ),
      ).toEqual(['refused', 403, { error: 'No' }]);
    });

    it('should hide the details of a host fault from the code, and log it', async () => {
      const broken: HostFunction = async () => {
        throw new Error('secret detail');
      };
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(await run('async () => codemode.broken()', { functions: { broken } })).toMatchObject({
        reason: 'thrown',
        message: 'Error: The call failed on the server',
      });
      expect(consoleError).toHaveBeenCalledOnce();
      consoleError.mockRestore();
    });

    it('should ask for a value once per run, however often the code asks', async () => {
      const spec = vi.fn(async () => ({ paths: {} }));
      const code =
        'async () => { const ps = []; for (let i = 0; i < 2000; i++) ps.push(codemode.spec()); return (await Promise.all(ps)).length }';

      expect(await valueOf(code, { values: { spec } })).toBe(2000);
      expect(spec).toHaveBeenCalledOnce();
    });

    it('should send at most maxHostCalls calls, and reject the next ones with the refusal', async () => {
      const spy = vi.fn<HostFunction>(echo);
      const code = `async () => {
        const results = await Promise.allSettled(Array.from({ length: 80 }, (_, i) => codemode.echo(i)));
        return results.filter((r) => r.status === 'rejected').map((r) => r.reason.status);
      }`;
      const callRefusal = new HostFunctionError('too many', { status: 429 });

      const refused = (await valueOf(code, { functions: { echo: spy }, callRefusal })) as number[];

      expect(spy).toHaveBeenCalledTimes(SANDBOX_LIMITS.maxHostCalls);
      expect(refused).toEqual(Array(80 - SANDBOX_LIMITS.maxHostCalls).fill(429));
    });
  });

  it('should run a few runs at a time, queue a few more, and refuse the next ones at once', async () => {
    const accepted = MAX_CONCURRENT_RUNS + MAX_QUEUED_RUNS;
    const runs = Array.from({ length: accepted + 1 }, () =>
      runInSandbox({ code: 'async () => { while (true) {} }' }, { ...FAST, cpuTimeMs: 200 }),
    );

    const refused = await runs[accepted];
    const results = await Promise.all(runs.slice(0, accepted));

    expect(refused).toEqual({ ok: false, reason: 'busy' });
    expect(results.every((result) => !result.ok && result.reason === 'cpuTime')).toBe(true);
    // Once they ended, a run starts again
    expect(await valueOf('async () => "free again"')).toBe('free again');
  });
});
