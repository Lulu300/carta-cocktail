import { describe, expect, it } from 'vitest';
import {
  type GuestOptions,
  type GuestOutcome,
  GuestRun,
  type HostCallOutcome,
} from './sandboxGuest';

/*
 * The guest side of the sandbox, run in the test process: what the worker of sandboxWorker.ts
 * does with the messages of the main thread. Code that never ends cannot be tested here: the
 * main thread stops it by ending the worker (sandbox.test.ts).
 */

type HostAnswers = Record<string, (argument: unknown) => HostCallOutcome>;

const OPTIONS: GuestOptions = {
  code: 'async () => 1',
  functions: [],
  values: [],
  memoryBytes: 64 * 1024 * 1024,
  wasmMemoryBytes: 96 * 1024 * 1024,
  stackBytes: 128 * 1024,
  maxHostCalls: 50,
  callRefusal: { ok: false, message: 'Too many calls', fields: { status: 429 } },
  outputChars: 100,
  argumentChars: 50,
};

interface GuestReport {
  outcome: GuestOutcome;
  memoryBytes: number;
  /** The host calls, in order: name and argument. */
  calls: [string, unknown][];
  /** The `answered` counts of each `idle`. */
  idles: number[];
}

/** Runs `options.code` as the worker would, the host answering each call on the next turn. */
function runGuest(options: Partial<GuestOptions>, answers: HostAnswers = {}): Promise<GuestReport> {
  return new Promise((resolve) => {
    const calls: [string, unknown][] = [];
    const idles: number[] = [];
    let run: GuestRun | undefined;
    void GuestRun.start(
      { ...OPTIONS, ...options },
      {
        call: (id, name, argumentJson) => {
          const argument: unknown = JSON.parse(argumentJson);
          calls.push([name, argument]);
          setImmediate(() => run?.answer(id, JSON.stringify(answers[name]!(argument))));
        },
        idle: (answered) => idles.push(answered),
        done: (outcome, memoryBytes) => resolve({ outcome, memoryBytes, calls, idles }),
      },
    ).then((started) => (run = started));
  });
}

async function outcomeOf(code: string, answers?: HostAnswers, options: Partial<GuestOptions> = {}) {
  const names = Object.keys(answers ?? {});
  return (await runGuest({ code, functions: names, ...options }, answers)).outcome;
}

describe('GuestRun', () => {
  it('should hand the JSON of the value, and the size of its memory', async () => {
    const report = await runGuest({ code: 'async () => ({ a: [1, "b", null] })' });

    expect(report.outcome).toEqual({ kind: 'ok', json: '{"a":[1,"b",null]}', length: 18 });
    expect(report.memoryBytes).toBe(16 * 1024 * 1024);
    expect(await outcomeOf('async () => {}')).toEqual({ kind: 'ok', json: 'undefined', length: 9 });
  });

  it('should cut a long answer or message at outputChars and give its whole length', async () => {
    expect(await outcomeOf('async () => "x".repeat(500)')).toEqual({
      kind: 'ok',
      json: `"${'x'.repeat(99)}`,
      length: 502,
    });
    expect(await outcomeOf('async () => { throw new Error("y".repeat(500)) }')).toEqual({
      kind: 'thrown',
      message: `Error: ${'y'.repeat(93)}`,
      length: 507,
    });
  });

  it('should describe what the code throws, reading strings only', async () => {
    expect(await outcomeOf('async () => { throw new TypeError("no") }')).toEqual({
      kind: 'thrown',
      message: 'TypeError: no',
      length: 13,
    });
    expect(await outcomeOf('async () => { throw "text" }')).toMatchObject({ message: 'text' });
    expect(await outcomeOf('async () => { throw { name: 42, message: {} } }')).toMatchObject({
      message: 'Error',
    });
    expect(
      await outcomeOf('async () => { throw { get name() { throw new Error("hidden") } } }'),
    ).toMatchObject({ message: 'The code threw a value that cannot be read' });
    expect(await outcomeOf('() => { throw new RangeError("sync") }')).toMatchObject({
      message: 'RangeError: sync',
    });
    expect(await outcomeOf('async () => 10n')).toMatchObject({ kind: 'thrown' });
  });

  it('should refuse code that does not compile, or is not a function', async () => {
    expect(await outcomeOf('async () => {')).toMatchObject({
      kind: 'thrown',
      message: expect.stringMatching(/^SyntaxError/),
    });
    expect(await outcomeOf('throw new Error("top")')).toMatchObject({ message: 'Error: top' });
    expect(await outcomeOf('1 + 1')).toEqual({ kind: 'notAFunction' });
  });

  it('should keep its own JSON and String functions, whatever the code replaces', async () => {
    const code = `async () => {
      JSON.stringify = () => '"forged"';
      String.prototype.slice = () => 'forged';
      Reflect.apply = () => 'forged';
      return { real: "z".repeat(200) };
    }`;

    expect(await outcomeOf(code)).toEqual({
      kind: 'ok',
      json: `{"real":"${'z'.repeat(91)}`,
      length: 211,
    });
  });

  it('should send host calls as JSON and resolve them with the answer', async () => {
    const report = await runGuest(
      {
        code: 'async () => [await codemode.echo({ a: 1 }), await codemode.echo()]',
        functions: ['echo'],
      },
      { echo: (argument) => ({ ok: true, value: { got: argument } }) },
    );

    expect(report.outcome).toMatchObject({ json: '[{"got":{"a":1}},{"got":null}]' });
    expect(report.calls).toEqual([
      ['echo', { a: 1 }],
      ['echo', null],
    ]);
    // Idle after the start, then after each answer: the main thread counts its CPU time from these
    expect(report.idles).toEqual([0, 1]);
  });

  it('should reject a refused host call with its message and fields', async () => {
    const code =
      'async () => { try { await codemode.no() } catch (e) { return [e instanceof Error, e.message, e.status] } }';

    expect(
      await outcomeOf(code, {
        no: () => ({ ok: false, message: 'refused', fields: { status: 403 } }),
      }),
    ).toMatchObject({ json: '[true,"refused",403]' });
  });

  it('should ask the host for a value once per run', async () => {
    const report = await runGuest(
      {
        code: 'async () => { const all = await Promise.all(Array.from({ length: 1000 }, () => codemode.spec())); return all.every((v) => v === all[0]) }',
        values: ['spec'],
      },
      { spec: () => ({ ok: true, value: { paths: {} } }) },
    );

    expect(report.outcome).toMatchObject({ json: 'true' });
    expect(report.calls).toEqual([['spec', null]]);
  });

  it('should refuse the host calls past maxHostCalls without sending them', async () => {
    const code = `async () => {
      const results = await Promise.allSettled(Array.from({ length: 8 }, (_, i) => codemode.echo(i)));
      return results.map((r) => r.status === 'fulfilled' ? r.value : r.reason.status);
    }`;
    const report = await runGuest(
      { code, functions: ['echo'], maxHostCalls: 5 },
      { echo: (argument) => ({ ok: true, value: argument }) },
    );

    expect(report.outcome).toMatchObject({ json: '[0,1,2,3,4,429,429,429]' });
    expect(report.calls).toHaveLength(5);
  });

  it('should refuse an argument longer than argumentChars without sending it', async () => {
    const report = await runGuest(
      {
        code: 'async () => { try { await codemode.echo("x".repeat(60)) } catch (e) { return e.message } }',
        functions: ['echo'],
      },
      { echo: (argument) => ({ ok: true, value: argument }) },
    );

    expect(report.outcome).toMatchObject({
      json: '"The argument of codemode.echo is longer than 50 characters as JSON"',
    });
    expect(report.calls).toEqual([]);
  });

  it('should ignore an answer to no call, and answers once the run is over', async () => {
    const done: GuestOutcome[] = [];
    const run = await GuestRun.start(
      { ...OPTIONS, code: 'async () => { codemode.echo(1); return "first" }', functions: ['echo'] },
      { call: () => {}, idle: () => {}, done: (outcome) => done.push(outcome) },
    );

    run.answer(99, JSON.stringify({ ok: true, value: 1 }));
    run.answer(0, JSON.stringify({ ok: true, value: 1 }));

    expect(done).toEqual([{ kind: 'ok', json: '"first"', length: 7 }]);
  });

  it('should stop at the QuickJS limits of memory and stack', async () => {
    expect(await outcomeOf('async () => "x".repeat(2 ** 28).length')).toMatchObject({
      kind: 'thrown',
      message: expect.stringMatching(/out of memory|invalid string length/),
    });
    expect(await outcomeOf('async () => { const f = () => f(); return f() }')).toMatchObject({
      message: 'InternalError: stack overflow',
    });
  });

  it('should end the run when Node exhausts its stack inside the instance', async () => {
    // JSON.stringify of a very deep object recurses where QuickJS does not check its stack: the
    // small stack of this test process runs out first (the worker of a run has a larger one)
    const deep = 'let o = {}; for (let i = 0; i < 100000; i++) o = { o };';

    expect(await outcomeOf(`async () => { ${deep} return o }`)).toEqual({ kind: 'crashed' });
  });

  it('should see no host global', async () => {
    expect(
      await outcomeOf(
        'async () => [typeof require, typeof process, typeof fetch, Object.keys(globalThis)]',
      ),
    ).toMatchObject({ json: '["undefined","undefined","undefined",["codemode"]]' });
  });
});
