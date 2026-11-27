import { describe, expect, it, vi } from 'vitest';
import { HostFunctionError, runInSandbox, SANDBOX_LIMITS, type HostFunction } from './sandbox';

/*
 * Hostile code against the sandbox itself: what the model writes must not get out of QuickJS,
 * nor hold the server. Some limits are lowered so that the tests stay fast.
 */

const FAST = { ...SANDBOX_LIMITS, wallTimeMs: 1_000, cpuTimeMs: 200 };

async function run(code: string, functions: Record<string, HostFunction> = {}, limits = FAST) {
  return runInSandbox(code, functions, limits);
}

async function valueOf(code: string, functions: Record<string, HostFunction> = {}) {
  const result = await run(code, functions);
  if (!result.ok) throw new Error(`The code failed: ${JSON.stringify(result)}`);
  return result.json === 'undefined' ? undefined : (JSON.parse(result.json) as unknown);
}

describe('runInSandbox', () => {
  it('should answer the JSON of what the function returns', async () => {
    expect(await valueOf('async () => ({ answer: 6 * 7, list: [1, "a", null] })')).toEqual({
      answer: 42,
      list: [1, 'a', null],
    });
    expect(await run('async () => {}')).toEqual({ ok: true, json: 'undefined' });
  });

  it('should refuse code that is not a function', async () => {
    expect(await run('1 + 1')).toEqual({ ok: false, reason: 'notAFunction' });
  });

  it('should report a syntax error and an error thrown by the code', async () => {
    expect(await run('async () => {')).toMatchObject({
      ok: false,
      reason: 'thrown',
      message: expect.stringMatching(/^SyntaxError/),
    });
    expect(await run('async () => { throw new TypeError("no way") }')).toEqual({
      ok: false,
      reason: 'thrown',
      message: 'TypeError: no way',
    });
    expect(await run('async () => { throw "a string" }')).toEqual({
      ok: false,
      reason: 'thrown',
      message: 'a string',
    });
  });

  it('should report a value JSON cannot hold', async () => {
    expect(await run('async () => 10n')).toMatchObject({ ok: false, reason: 'thrown' });
    expect(await run('async () => { const a = {}; a.a = a; return a }')).toMatchObject({
      ok: false,
      reason: 'thrown',
    });
  });

  it('should give the code no way to the host: no require, process, fetch, timers or modules', async () => {
    const globals = [
      'require',
      'process',
      'fetch',
      'setTimeout',
      'setInterval',
      'setImmediate',
      'queueMicrotask',
      'XMLHttpRequest',
      'WebSocket',
      'WebAssembly',
      'Buffer',
      'global',
      'module',
      'std',
      'os',
      'Deno',
      'Bun',
    ];
    const code = `async () => ({ ${globals.map((name) => `${name}: typeof globalThis.${name}`).join(', ')} })`;

    const types = (await valueOf(code)) as Record<string, string>;

    expect(Object.values(types).every((type) => type === 'undefined')).toBe(true);
    expect(await valueOf('async () => Object.keys(globalThis).sort()')).toEqual(['codemode']);
  });

  it('should refuse a dynamic import, so no file or module can be read', async () => {
    for (const specifier of [
      'fs',
      'node:fs',
      '/etc/passwd',
      'file:///etc/passwd',
      './package.json',
    ]) {
      expect(
        await run(`async () => (await import(${JSON.stringify(specifier)})).default`),
      ).toMatchObject({ ok: false, reason: 'thrown' });
    }
  });

  it('should keep Function and the prototypes inside QuickJS', async () => {
    // Each one answers the type of a host global, as the function it builds sees it
    const escapes = [
      '(() => {}).constructor("return typeof process")()',
      'Function("return typeof require")()',
      'codemode.echo.constructor("return typeof process")()',
      'Object.getPrototypeOf(async () => {}).constructor("return typeof fetch")()',
      '({}).constructor.constructor("return typeof globalThis.process")()',
      '(function () { return typeof this.process })()',
      'Reflect.getPrototypeOf(codemode).constructor.constructor("return typeof require")()',
    ];
    for (const escape of escapes) {
      const value = await valueOf(`async () => await (${escape})`, {
        echo: async (argument) => argument,
      });
      expect(value, escape).toBe('undefined');
    }
  });

  it('should leave the prototypes of the host untouched', async () => {
    await valueOf(
      'async () => { Object.prototype.polluted = true; Array.prototype.push = null; JSON.parse = () => 1; return 1 }',
    );

    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(typeof Array.prototype.push).toBe('function');
    expect(JSON.parse('2')).toBe(2);
  });

  it('should keep the host reading JSON with its own functions, whatever the code replaces', async () => {
    expect(
      await valueOf(
        'async () => { JSON.stringify = () => "{\\"forged\\":true}"; return { real: true } }',
      ),
    ).toEqual({ real: true });
  });

  it('should stop an endless loop at the CPU limit', async () => {
    const started = Date.now();

    expect(await run('async () => { while (true) {} }')).toEqual({ ok: false, reason: 'cpuTime' });
    expect(Date.now() - started).toBeLessThan(FAST.wallTimeMs);
  });

  it('should stop an endless loop that catches the interruption', async () => {
    expect(await run('async () => { for (;;) { try { while (true) {} } catch (e) {} } }')).toEqual({
      ok: false,
      reason: 'cpuTime',
    });
  });

  it('should stop endless promise callbacks at the CPU limit', async () => {
    expect(
      await run(
        'async () => { const loop = () => Promise.resolve().then(loop); loop(); await new Promise(() => {}) }',
      ),
    ).toEqual({ ok: false, reason: 'cpuTime' });
  });

  it('should stop a promise that never settles at the wall time limit', async () => {
    const started = Date.now();

    expect(await run('async () => { await new Promise(() => {}) }')).toEqual({
      ok: false,
      reason: 'wallTime',
    });
    expect(Date.now() - started).toBeGreaterThanOrEqual(FAST.wallTimeMs - 50);
  });

  it('should stop a host call that never answers, and abort it', async () => {
    let signal: AbortSignal | undefined;
    const hang: HostFunction = (_argument, abortSignal) => {
      signal = abortSignal;
      return new Promise(() => {});
    };

    expect(await run('async () => codemode.hang()', { hang })).toEqual({
      ok: false,
      reason: 'wallTime',
    });
    expect(signal?.aborted).toBe(true);
  });

  it('should refuse a massive allocation at the memory limit', async () => {
    const limits = { ...SANDBOX_LIMITS, cpuTimeMs: 5_000, wallTimeMs: 10_000 };

    expect(await run('async () => "x".repeat(2 ** 29).length', {}, limits)).toMatchObject({
      ok: false,
      reason: 'thrown',
      message: expect.stringMatching(/out of memory/),
    });
    expect(
      await run(
        'async () => { const kept = []; for (;;) kept.push(new Array(100000).fill(1)) }',
        {},
        limits,
      ),
    ).toMatchObject({
      ok: false,
      reason: 'thrown',
      message: expect.stringMatching(/out of memory/),
    });
  });

  it('should stop an endless recursion before the stack of Node', async () => {
    for (const code of [
      'async () => { const f = () => f(); return f() }',
      'async () => { const f = () => [f()]; return JSON.stringify(f()) }',
      'async () => JSON.parse("[".repeat(100000) + "]".repeat(100000))',
    ]) {
      expect(await run(code)).toMatchObject({
        ok: false,
        reason: 'thrown',
        message: expect.stringMatching(/stack overflow/),
      });
    }
  });

  it('should end the run, not the server, when QuickJS exhausts the stack of Node', async () => {
    // JSON.stringify of a very deep object recurses where QuickJS does not check its stack
    const deep = 'let o = {}; for (let i = 0; i < 100000; i++) o = { o };';

    expect(await run(`async () => { ${deep} return o }`)).toEqual({ ok: false, reason: 'crashed' });
    expect(await run(`async () => { ${deep} return JSON.stringify(o).length }`)).toEqual({
      ok: false,
      reason: 'crashed',
    });
    expect(await valueOf('async () => "next run"')).toBe('next run');
  });

  it('should end the run when its instance faults during a host call', async () => {
    const deep = 'let o = {}; for (let i = 0; i < 100000; i++) o = { o };';

    expect(
      await run(`async () => { await codemode.echo(1); ${deep} return JSON.stringify(o) }`, {
        echo: async (argument) => argument,
      }),
    ).toEqual({ ok: false, reason: 'crashed' });
  });

  it('should hand host functions JSON, and resolve with their JSON answer', async () => {
    const echo = vi.fn<HostFunction>(async (argument) => ({ received: argument }));

    expect(
      await valueOf('async () => [await codemode.echo({ a: [1, 2] }), await codemode.echo()]', {
        echo,
      }),
    ).toEqual([{ received: { a: [1, 2] } }, { received: null }]);
    expect(echo.mock.calls.map(([argument]) => argument)).toEqual([{ a: [1, 2] }, null]);
  });

  it('should reject in the code with the message and fields of a HostFunctionError', async () => {
    const refuse: HostFunction = async () => {
      throw new HostFunctionError('refused', { status: 403, body: { error: 'No' } });
    };

    expect(
      await valueOf(
        'async () => { try { await codemode.refuse() } catch (e) { return [e instanceof Error, e.message, e.status, e.body] } }',
        { refuse },
      ),
    ).toEqual([true, 'refused', 403, { error: 'No' }]);
  });

  it('should hide the details of a host fault from the code', async () => {
    const broken: HostFunction = async () => {
      throw new Error('secret detail');
    };
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await run('async () => codemode.broken()', { broken });

    expect(result).toEqual({
      ok: false,
      reason: 'thrown',
      message: 'Error: codemode.broken failed on the server',
    });
    expect(consoleError).toHaveBeenCalledOnce();
    consoleError.mockRestore();
  });

  it('should keep codemode as the host made it', async () => {
    expect(
      await valueOf(
        'async () => { codemode.echo = () => "forged"; return [Object.isFrozen(codemode), await codemode.echo(1)] }',
        {
          echo: async (argument) => argument,
        },
      ),
    ).toEqual([true, 1]);
    expect(await run('async () => codemode.missing()', {})).toMatchObject({
      ok: false,
      reason: 'thrown',
    });
  });

  it('should release its instance after a failure, and run again', async () => {
    await run('async () => { while (true) {} }');
    await run('async () => { await new Promise(() => {}) }');
    await run('async () => codemode.hang()', { hang: () => new Promise(() => {}) });

    expect(await valueOf('async () => "still running"')).toBe('still running');
  });

  it('should free every QuickJS object of a run that settles: QuickJS aborts on one left behind', async () => {
    // Emscripten reports the abort of an instance on console.error
    const consoleError = vi.spyOn(console, 'error');
    const functions: Record<string, HostFunction> = {
      echo: async (argument) => argument,
      refuse: async () => {
        throw new HostFunctionError('refused', { status: 403 });
      },
    };

    for (const code of [
      'async () => [await codemode.echo({ a: 1 }), await Promise.all([codemode.echo(1), codemode.echo(2)])]',
      'async () => { try { await codemode.refuse() } catch (e) { return e.status } }',
      'async () => codemode.refuse()',
      'async () => { throw new Error("thrown") }',
      'async () => {',
      '1 + 1',
    ]) {
      await run(code, functions);
    }

    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
