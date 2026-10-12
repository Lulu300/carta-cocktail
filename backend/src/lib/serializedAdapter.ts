import type { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

type SqliteAdapter = Awaited<ReturnType<PrismaBetterSqlite3['connect']>>;
type SqliteTransaction = Awaited<ReturnType<SqliteAdapter['startTransaction']>>;

/** First come, first served lock: one holder at a time, the others wait in order. */
export class Lock {
  private last: Promise<void> = Promise.resolve();

  /** Resolves when the caller holds the lock, with the function that releases it. */
  acquire(): Promise<() => void> {
    let release!: () => void;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    const turn = this.last.then(() => release);
    this.last = this.last.then(() => released);
    return turn;
  }
}

/** Wraps `target`: the listed members are replaced, every other one is the target's own, bound to it. */
function override<T extends object>(target: T, replacements: Partial<T>): T {
  return new Proxy(target, {
    get(object, property) {
      if (Object.prototype.hasOwnProperty.call(replacements, property)) {
        return replacements[property as keyof T];
      }
      // Bound to the target: the adapter's methods read its private fields
      const value = Reflect.get(object, property, object);
      return typeof value === 'function' ? value.bind(object) : value;
    },
  });
}

/** The transaction, which gives the lock back once it is committed or rolled back. */
function releasingOnEnd(transaction: SqliteTransaction, release: () => void): SqliteTransaction {
  const end = (finish: () => Promise<void>) => async () => {
    try {
      await finish();
    } finally {
      release();
    }
  };
  return override(transaction, {
    commit: end(() => transaction.commit()),
    rollback: end(() => transaction.rollback()),
  });
}

/**
 * Makes every query outside a transaction wait until the open interactive
 * transaction ends, as Prisma 6 did.
 *
 * The better-sqlite3 adapter runs everything on a single connection and only
 * serializes transactions with each other. Without this lock, a query from
 * another request would run inside the open transaction: a write would be
 * rolled back with it, and a read would see rows not yet committed.
 *
 * A transaction callback must therefore only use its own client (`tx`): a call
 * to the shared client would wait for the transaction, until it times out.
 */
export function serializeTransactions(adapter: SqliteAdapter): SqliteAdapter {
  const lock = new Lock();
  async function exclusive<T>(run: () => Promise<T>): Promise<T> {
    const release = await lock.acquire();
    try {
      return await run();
    } finally {
      release();
    }
  }

  return override(adapter, {
    queryRaw: (query) => exclusive(() => adapter.queryRaw(query)),
    executeRaw: (query) => exclusive(() => adapter.executeRaw(query)),
    executeScript: (script) => exclusive(() => adapter.executeScript(script)),
    startTransaction: async (isolationLevel) => {
      const release = await lock.acquire();
      try {
        return releasingOnEnd(await adapter.startTransaction(isolationLevel), release);
      } catch (err) {
        release();
        throw err;
      }
    },
  });
}

/** The better-sqlite3 adapter factory, whose connections serialize transactions (serializeTransactions). */
export function withSerializedTransactions(factory: PrismaBetterSqlite3): PrismaBetterSqlite3 {
  return override(factory, {
    connect: async () => serializeTransactions(await factory.connect()),
    connectToShadowDb: async () => serializeTransactions(await factory.connectToShadowDb()),
  });
}
