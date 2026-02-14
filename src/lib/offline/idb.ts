// src/lib/offline/idb.ts
/* Minimal IndexedDB helper (no deps) */

export type IDBValue = any;

// If you previously created the DB without the required stores,
// bumping this forces onupgradeneeded to run and create them.
const DB_NAME = "roam_offline";
const DB_VERSION = 4; // ✅ bump to 4 to add packs store

const STORE_PLANS = "plans"; // keyPath: plan_id
const STORE_META = "meta"; // key: string -> any
const STORE_PACKS = "packs"; // keyPath: k (plan_id:kind)

let _dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (_dbPromise) return _dbPromise;

  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;

      // ✅ Create missing stores idempotently
      if (!db.objectStoreNames.contains(STORE_PLANS)) {
        db.createObjectStore(STORE_PLANS, { keyPath: "plan_id" });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META);
      }
      if (!db.objectStoreNames.contains(STORE_PACKS)) {
        db.createObjectStore(STORE_PACKS, { keyPath: "k" });
      }
    };

    req.onsuccess = () => {
      const db = req.result;

      // ✅ Defensive: if somehow still missing, fail with a clear message
      const have = Array.from(db.objectStoreNames);
      const need = [STORE_PLANS, STORE_META, STORE_PACKS];
      const missing = need.filter((s) => !db.objectStoreNames.contains(s));
      if (missing.length) {
        reject(
          new Error(
            `IndexedDB schema missing required stores. Have=[${have.join(", ")}] Need=[${need.join(
              ", ",
            )}]. Try hard refresh, or clear site data for localhost.`,
          ),
        );
        return;
      }

      resolve(db);
    };

    req.onerror = () => reject(req.error ?? new Error("Failed to open IndexedDB"));
  });

  return _dbPromise;
}

function txStore(db: IDBDatabase, store: string, mode: IDBTransactionMode) {
  if (!db.objectStoreNames.contains(store)) {
    throw new Error(`IDB store not found: "${store}"`);
  }
  return db.transaction(store, mode).objectStore(store);
}
function txStores(db: IDBDatabase, stores: string[], mode: IDBTransactionMode) {
  for (const s of stores) {
    if (!db.objectStoreNames.contains(s)) throw new Error(`IDB store not found: "${s}"`);
  }
  const tx = db.transaction(stores, mode);
  const os = new Map<string, IDBObjectStore>();
  for (const s of stores) os.set(s, tx.objectStore(s));
  return { tx, os };
}

export async function idbWithTx<T>(
  stores: string[],
  fn: (os: Map<string, IDBObjectStore>, tx: IDBTransaction) => Promise<T> | T,
): Promise<T> {
  const db = await openDb();

  return await new Promise<T>((resolve, reject) => {
    let ctx: ReturnType<typeof txStores>;
    try {
      ctx = txStores(db, stores, "readwrite");
    } catch (e) {
      reject(e);
      return;
    }

    ctx.tx.onabort = () => reject(ctx.tx.error ?? new Error("IDB tx aborted"));
    ctx.tx.onerror = () => reject(ctx.tx.error ?? new Error("IDB tx error"));
    ctx.tx.oncomplete = () => {
      // resolve happens after fn resolves
    };

    Promise.resolve()
      .then(() => fn(ctx.os, ctx.tx))
      .then((result) => {
        // Ensure resolve happens only after tx completes
        ctx.tx.oncomplete = () => resolve(result);
      })
      .catch((err) => {
        try {
          ctx.tx.abort();
        } catch {}
        reject(err);
      });
  });
}

export async function idbGet<T = IDBValue>(store: string, key: IDBValidKey): Promise<T | undefined> {
  const db = await openDb();
  return await new Promise((resolve, reject) => {
    let os: IDBObjectStore;
    try {
      os = txStore(db, store, "readonly");
    } catch (e) {
      reject(e);
      return;
    }
    const req = os.get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error ?? new Error("IDB get failed"));
  });
}

export async function idbPut(store: string, value: any, key?: IDBValidKey): Promise<void> {
  const db = await openDb();
  return await new Promise((resolve, reject) => {
    let os: IDBObjectStore;
    try {
      os = txStore(db, store, "readwrite");
    } catch (e) {
      reject(e);
      return;
    }
    const req = key !== undefined ? os.put(value, key) : os.put(value);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error("IDB put failed"));
  });
}

export async function idbDel(store: string, key: IDBValidKey): Promise<void> {
  const db = await openDb();
  return await new Promise((resolve, reject) => {
    let os: IDBObjectStore;
    try {
      os = txStore(db, store, "readwrite");
    } catch (e) {
      reject(e);
      return;
    }
    const req = os.delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error("IDB delete failed"));
  });
}

export async function idbGetAll<T = IDBValue>(store: string): Promise<T[]> {
  const db = await openDb();
  return await new Promise((resolve, reject) => {
    let os: IDBObjectStore;
    try {
      os = txStore(db, store, "readonly");
    } catch (e) {
      reject(e);
      return;
    }
    const req = os.getAll();
    req.onsuccess = () => resolve((req.result as T[]) ?? []);
    req.onerror = () => reject(req.error ?? new Error("IDB getAll failed"));
  });
}

export const idbStores = {
  plans: STORE_PLANS,
  meta: STORE_META,
  packs: STORE_PACKS,
};
