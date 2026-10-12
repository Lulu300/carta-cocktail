import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupTestDatabase, teardownTestDatabase, cleanDatabase, seedRequiredData, prisma, seedUnit } from '../test/helpers';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { TEST_DATABASE_URL } from '../test/testDatabase';
import { createPrismaClient } from './prisma';
import { Lock, serializeTransactions, withSerializedTransactions } from './serializedAdapter';

type SqliteAdapter = Parameters<typeof serializeTransactions>[0];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('Lock', () => {
  it('should let the next holder in only after the release, in arrival order', async () => {
    const lock = new Lock();
    const events: string[] = [];
    const releaseFirst = await lock.acquire();
    const second = lock.acquire().then((release) => {
      events.push('second');
      release();
    });
    const third = lock.acquire().then((release) => {
      events.push('third');
      release();
    });

    await sleep(10);
    events.push('first done');
    releaseFirst();
    await Promise.all([second, third]);

    expect(events).toEqual(['first done', 'second', 'third']);
  });

  it('should ignore a second release', async () => {
    const lock = new Lock();
    const release = await lock.acquire();
    release();
    release();

    const next = await lock.acquire();
    next();
  });
});

describe('queries during an interactive transaction', () => {
  beforeAll(async () => { await setupTestDatabase(); });
  afterAll(async () => { await teardownTestDatabase(); });
  beforeEach(async () => { await cleanDatabase(); await seedRequiredData(); });

  /** Opens a transaction that writes a unit, waits, then rolls back. */
  function rolledBackTransaction(): Promise<unknown> {
    return prisma.$transaction(async (tx) => {
      await tx.unit.create({ data: { name: 'In transaction', abbreviation: 'txu' } });
      await sleep(300);
      throw new Error('rollback');
    });
  }

  it('should keep a concurrent write made outside the transaction after a rollback', async () => {
    const events: string[] = [];
    const transaction = rolledBackTransaction().catch(() => events.push('rolled back'));
    await sleep(50);

    await seedUnit({ name: 'Outside', abbreviation: 'oth' }).then(() => events.push('outside write done'));
    await transaction;

    // Prisma 6 order: the outside write waits for the transaction to end
    expect(events).toEqual(['rolled back', 'outside write done']);
    const units = await prisma.unit.findMany({ where: { abbreviation: { in: ['txu', 'oth'] } } });
    expect(units.map((unit) => unit.abbreviation)).toEqual(['oth']);
  });

  it('should not let a concurrent read see rows the transaction has not committed', async () => {
    const transaction = rolledBackTransaction().catch(() => undefined);
    await sleep(50);

    const seen = await prisma.unit.count({ where: { abbreviation: 'txu' } });
    await transaction;

    expect(seen).toBe(0);
  });

  it('should run the queries again once a transaction is committed', async () => {
    await prisma.$transaction(async (tx) => {
      await tx.unit.create({ data: { name: 'Committed', abbreviation: 'cmt' } });
    });

    expect(await prisma.unit.count({ where: { abbreviation: 'cmt' } })).toBe(1);
  });

  it('should leave no SQLite transaction open after a failed commit', async () => {
    const orphan = 'Bottle of a missing category';
    // The foreign key is only checked at COMMIT, which then fails
    const failedCommit = prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('PRAGMA defer_foreign_keys = ON');
      await tx.bottle.create({ data: { name: orphan, categoryId: 999_999, capacityMl: 700 } });
    });
    await expect(failedCommit).rejects.toThrow();

    expect(await prisma.bottle.count({ where: { name: orphan } })).toBe(0);
    await prisma.$transaction(async (tx) => {
      await tx.unit.create({ data: { name: 'Next transaction', abbreviation: 'nxt' } });
    });
    await seedUnit({ name: 'Next write', abbreviation: 'nwr' });

    // Another connection only sees committed rows
    const other = createPrismaClient(TEST_DATABASE_URL);
    try {
      const committed = await other.unit.findMany({ where: { abbreviation: { in: ['nxt', 'nwr'] } } });
      expect(committed.map((unit) => unit.abbreviation).sort()).toEqual(['nwr', 'nxt']);
    } finally {
      await other.$disconnect();
    }
  });

  it('should serialize raw queries too', async () => {
    const transaction = rolledBackTransaction().catch(() => undefined);
    await sleep(50);

    const [{ count }] = await prisma.$queryRawUnsafe<{ count: number | bigint }[]>(
      "SELECT COUNT(*) AS count FROM \"Unit\" WHERE abbreviation = 'txu';",
    );
    await transaction;

    expect(Number(count)).toBe(0);
  });
});

describe('serializeTransactions', () => {
  /** An adapter that records its calls; startTransaction fails when `failStart` is set. */
  function fakeAdapter(events: string[], failStart = false): SqliteAdapter {
    const transaction = {
      commit: async () => { events.push('commit'); },
      rollback: async () => { events.push('rollback'); },
    };
    return {
      executeScript: async (script: string) => { events.push(script); },
      startTransaction: async () => {
        if (failStart) throw new Error('cannot begin');
        events.push('begin');
        return transaction;
      },
    } as unknown as SqliteAdapter;
  }

  it('should make a script wait until the transaction commits', async () => {
    const events: string[] = [];
    const adapter = serializeTransactions(fakeAdapter(events));
    const transaction = await adapter.startTransaction();

    const script = adapter.executeScript('script');
    await sleep(10);
    await transaction.commit();
    await script;

    expect(events).toEqual(['begin', 'commit', 'script']);
  });

  /** A transaction whose ROLLBACK statement fails with `message`, recording its calls. */
  function transactionFailingRollback(events: string[], message: string) {
    return {
      executeRaw: async () => {
        events.push('ROLLBACK');
        throw new Error(message);
      },
      rollback: async () => { events.push('rollback'); },
    };
  }

  function adapterWith(transaction: object, events: string[]): SqliteAdapter {
    return {
      executeScript: async (script: string) => { events.push(script); },
      startTransaction: async () => transaction,
    } as unknown as SqliteAdapter;
  }

  it('should ignore the error of a ROLLBACK when Prisma has already rolled back', async () => {
    const events: string[] = [];
    const transaction = transactionFailingRollback(events, 'cannot rollback - no transaction is active');
    const adapter = serializeTransactions(adapterWith(transaction, events));

    await (await adapter.startTransaction()).rollback();
    await adapter.executeScript('script');

    expect(events).toEqual(['ROLLBACK', 'rollback', 'script']);
  });

  it('should report another ROLLBACK error, and still end the transaction and release the lock', async () => {
    const events: string[] = [];
    const transaction = transactionFailingRollback(events, 'disk I/O error');
    const adapter = serializeTransactions(adapterWith(transaction, events));

    await expect((await adapter.startTransaction()).rollback()).rejects.toThrow('disk I/O error');
    await adapter.executeScript('script');

    expect(events).toEqual(['ROLLBACK', 'rollback', 'script']);
  });

  it('should release the lock when the transaction cannot start', async () => {
    const events: string[] = [];
    const adapter = serializeTransactions(fakeAdapter(events, true));

    await expect(adapter.startTransaction()).rejects.toThrow('cannot begin');
    await adapter.executeScript('script');

    expect(events).toEqual(['script']);
  });
});

describe('withSerializedTransactions', () => {
  it('should serialize the connections of the factory, shadow database included', async () => {
    const factory = withSerializedTransactions(new PrismaBetterSqlite3({ url: ':memory:' }));
    expect(factory.provider).toBe('sqlite');

    for (const adapter of [await factory.connect(), await factory.connectToShadowDb()]) {
      const transaction = await adapter.startTransaction();
      const query = adapter.executeScript('CREATE TABLE item (name TEXT);');
      await transaction.rollback();
      await query;
      await adapter.dispose();
    }
  });
});
