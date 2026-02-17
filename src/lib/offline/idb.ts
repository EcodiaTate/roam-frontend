// src/lib/offline/idb.ts
/* Minimal IndexedDB helper (no deps) */

export type IDBValue = any;

const DB_NAME = "roam_offline";
const DB_VERSION = 5; // baseline version

const STORE_PLANS = "plans"; // keyPath: plan_id
const STORE_META = "meta"; // key: string -> any
const STORE_EMERGENCY = "emergency_contacts"; // keyPath: id (uuid)
const STORE_PACKS = "packs"; // keyPath: k (plan_id:kind)
const STORE_SYNC_QUEUE = "sync_queue"; // keyPath: id (auto-incrementing ops queue)

const REQUIRED_STORES = [STORE_PLANS, STORE_META, STORE_PACKS, STORE_SYNC_QUEUE, STORE_EMERGENCY];

let _dbPromise: Promise<IDBDatabase> | null = null;

/**
 * Ensures all required object stores exist in the DB.
 * Called inside onupgradeneeded — safe to call at any version transition
 * because it only creates stores that are missing.
 */
function ensureStores(db: IDBDatabase) {
  if (!db.objectStoreNames.contains(STORE_PLANS)) {
    db.createObjectStore(STORE_PLANS, { keyPath: "plan_id" });
  }
  if (!db.objectStoreNames.contains(STORE_EMERGENCY)) {
    db.createObjectStore(STORE_EMERGENCY, { keyPath: "id" });
  }
  if (!db.objectStoreNames.contains(STORE_META)) {
    db.createObjectStore(STORE_META);
  }
  if (!db.objectStoreNames.contains(STORE_PACKS)) {
    db.createObjectStore(STORE_PACKS, { keyPath: "k" });
  }
  if (!db.objectStoreNames.contains(STORE_SYNC_QUEUE)) {
    const sq = db.createObjectStore(STORE_SYNC_QUEUE, {
      keyPath: "id",
      autoIncrement: true,
    });
    sq.createIndex("created_at", "created_at", { unique: false });
  }
}

/**
 * Opens the DB at a specific version. Returns the DB if all stores are present,
 * or null if stores are still missing after open (caller should retry at higher version).
 */
function openAtVersion(version: number): Promise<IDBDatabase | null> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, version);

    req.onupgradeneeded = () => {
      ensureStores(req.result);
    };

    req.onblocked = () => {
      // Another tab has the DB open at an older version.
      // We can't force-close it, but we can tell the user.
      console.warn(
        "[roam/idb] DB upgrade blocked — close other tabs with Roam open and retry.",
      );
      reject(
        new Error(
          "IndexedDB upgrade blocked by another tab. Please close other Roam tabs and refresh.",
        ),
      );
    };

    req.onsuccess = () => {
      const db = req.result;

      // Listen for versionchange so this tab yields if another tab needs to upgrade
      db.onversionchange = () => {
        db.close();
        _dbPromise = null;
        console.info("[roam/idb] DB closing for version change in another tab.");
      };

      const missing = REQUIRED_STORES.filter((s) => !db.objectStoreNames.contains(s));
      if (missing.length) {
        // Stores still missing — close so caller can retry at a higher version
        db.close();
        resolve(null);
        return;
      }

      resolve(db);
    };

    req.onerror = () => reject(req.error ?? new Error("Failed to open IndexedDB"));
  });
}

/**
 * Main entry point. Opens the DB, self-healing missing stores by bumping
 * the version if needed. Existing data is preserved — we only *add* stores.
 */
function openDb(): Promise<IDBDatabase> {
  if (_dbPromise) return _dbPromise;

  _dbPromise = (async () => {
    // 1. Try at the baseline version first
    let db = await openAtVersion(DB_VERSION);
    if (db) return db;

    // 2. Stores are missing — the DB already existed at DB_VERSION (or higher)
    //    without all stores. We need to figure out the *current* version and
    //    bump past it to trigger onupgradeneeded.
    //    Open without a version argument to get the current version.
    const currentVersion: number = await new Promise((resolve, reject) => {
      const probe = indexedDB.open(DB_NAME);
      probe.onsuccess = () => {
        const v = probe.result.version;
        probe.result.close();
        resolve(v);
      };
      probe.onerror = () => reject(probe.error ?? new Error("Failed to probe DB version"));
    });

    const healVersion = currentVersion + 1;
    console.info(
      `[roam/idb] Self-healing: DB at v${currentVersion} missing stores, upgrading to v${healVersion}`,
    );

    db = await openAtVersion(healVersion);
    if (db) return db;

    // 3. Should not happen — but if it does, give a clear error
    throw new Error(
      `IndexedDB self-heal failed: stores still missing after upgrading to v${healVersion}. ` +
        `Try clearing site data for this origin.`,
    );
  })();

  // If the open pipeline fails, clear the cached promise so next call retries
  _dbPromise.catch(() => {
    _dbPromise = null;
  });

  return _dbPromise;
}

// ─── Low-level helpers ───────────────────────────────────────────────

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

// ─── Public API ──────────────────────────────────────────────────────

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

    Promise.resolve()
      .then(() => fn(ctx.os, ctx.tx))
      .then((result) => {
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
  syncQueue: STORE_SYNC_QUEUE,
  emergency: STORE_EMERGENCY,
};