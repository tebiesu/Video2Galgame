export type MediaKind = "image" | "audio";

interface MediaRecord {
  id: string;
  kind: MediaKind;
  data: string;
  name?: string;
  createdAt: number;
}

const DB_NAME = "videofetch-media";
const STORE_NAME = "assets";
const REF_PREFIX = "idb:";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("IndexedDB open failed"));
  });
  return dbPromise;
}

function uid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function isMediaRef(v?: string): boolean {
  return Boolean(v && v.startsWith(REF_PREFIX));
}

export function makeMediaRef(id: string): string {
  return `${REF_PREFIX}${id}`;
}

export function parseMediaRef(ref?: string): string {
  if (!ref) return "";
  return isMediaRef(ref) ? ref.slice(REF_PREFIX.length) : "";
}

export async function saveMedia(data: string, kind: MediaKind, name = ""): Promise<string> {
  const db = await openDb();
  const id = uid();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  const record: MediaRecord = { id, kind, data, name, createdAt: Date.now() };
  await new Promise<void>((resolve, reject) => {
    const req = store.put(record);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error || new Error("IndexedDB write failed"));
  });
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted"));
  });
  return makeMediaRef(id);
}

export async function readMedia(ref?: string): Promise<string> {
  const id = parseMediaRef(ref);
  if (!id) return "";
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, "readonly");
  const store = tx.objectStore(STORE_NAME);
  const result = await new Promise<MediaRecord | undefined>((resolve, reject) => {
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result as MediaRecord | undefined);
    req.onerror = () => reject(req.error || new Error("IndexedDB read failed"));
  });
  return result?.data || "";
}

export async function removeMedia(ref?: string): Promise<void> {
  const id = parseMediaRef(ref);
  if (!id) return;
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  await new Promise<void>((resolve, reject) => {
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error || new Error("IndexedDB delete failed"));
  });
}

export async function replaceMedia(oldRef: string | undefined, nextData: string, kind: MediaKind, name = ""): Promise<string> {
  const nextRef = await saveMedia(nextData, kind, name);
  if (oldRef) {
    await removeMedia(oldRef).catch(() => undefined);
  }
  return nextRef;
}
