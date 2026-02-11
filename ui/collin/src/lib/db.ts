import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

type Stored<T> = T & { id: number };

export type ScEventStored = Stored<{
  ts: number;
  channel: string;
  kind: string;
  trade_id: string;
  seq: number | null;
  evt: any;
}>;

export type PromptEventStored = Stored<{
  ts: number;
  session_id: string;
  type: string;
  evt: any;
}>;

export type ChatMessageStored = Stored<{
  ts: number;
  role: 'user' | 'assistant';
  text: string;
}>;

interface CollinDb extends DBSchema {
  sc_events: {
    key: number;
    value: {
      id?: number;
      ts: number;
      channel: string;
      kind: string;
      trade_id: string;
      seq: number | null;
      evt: any;
    };
    indexes: { 'by_ts': number };
  };
  prompt_events: {
    key: number;
    value: {
      id?: number;
      ts: number;
      session_id: string;
      type: string;
      evt: any;
    };
    indexes: { 'by_ts': number };
  };
  chat_messages: {
    key: number;
    value: {
      id?: number;
      ts: number;
      role: 'user' | 'assistant';
      text: string;
    };
    indexes: { 'by_ts': number };
  };
}

let _dbName = 'collin';
const DB_VERSION = 2;

let _dbPromise: Promise<IDBPDatabase<CollinDb>> | null = null;

export function setDbNamespace(ns: string) {
  const raw = String(ns || '').trim().toLowerCase();
  // Keep the name short and filesystem-like to avoid browser edge cases.
  const safe = raw.replaceAll(/[^a-z0-9._-]/g, '_').slice(0, 32);
  const next = safe ? `collin-${safe}` : 'collin';
  if (next === _dbName) return;
  _dbName = next;
  // Best-effort close the previous DB handle (if any) and reopen on demand.
  if (_dbPromise) {
    _dbPromise
      .then((d) => {
        try {
          d.close();
        } catch (_e) {}
      })
      .catch(() => {});
  }
  _dbPromise = null;
}

function db() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = openDB<CollinDb>(_dbName, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('sc_events')) {
        const s = db.createObjectStore('sc_events', { keyPath: 'id', autoIncrement: true });
        s.createIndex('by_ts', 'ts');
      }
      if (!db.objectStoreNames.contains('prompt_events')) {
        const s = db.createObjectStore('prompt_events', { keyPath: 'id', autoIncrement: true });
        s.createIndex('by_ts', 'ts');
      }
      if (!db.objectStoreNames.contains('chat_messages')) {
        const s = db.createObjectStore('chat_messages', { keyPath: 'id', autoIncrement: true });
        s.createIndex('by_ts', 'ts');
      }
    },
  });
  return _dbPromise;
}

export async function scAdd(evt: { ts: number; channel: string; kind: string; trade_id: string; seq: number | null; evt: any }) {
  const d = await db();
  return await d.add('sc_events', evt);
}

export async function scListBefore({
  beforeId,
  limit = 200,
}: {
  beforeId: number | null;
  limit?: number;
}): Promise<ScEventStored[]> {
  const d = await db();
  const tx = d.transaction('sc_events', 'readonly');
  const store = tx.objectStore('sc_events');
  const range = beforeId && beforeId > 0 ? IDBKeyRange.upperBound(beforeId - 1) : null;
  const out: ScEventStored[] = [];
  let cursor = await store.openCursor(range, 'prev');
  while (cursor && out.length < limit) {
    const v: any = cursor.value;
    out.push({ ...(v || {}), id: Number(cursor.key) } as ScEventStored);
    cursor = await cursor.continue();
  }
  await tx.done;
  // Return newest-first (descending by id) so the UI can render latest at top.
  return out;
}

export async function scListLatest({ limit = 200 }: { limit?: number } = {}): Promise<ScEventStored[]> {
  return scListBefore({ beforeId: null, limit });
}

export async function promptAdd(evt: { ts: number; session_id: string; type: string; evt: any }) {
  const d = await db();
  return await d.add('prompt_events', evt);
}

export async function promptListBefore({
  beforeId,
  limit = 200,
}: {
  beforeId: number | null;
  limit?: number;
}): Promise<PromptEventStored[]> {
  const d = await db();
  const tx = d.transaction('prompt_events', 'readonly');
  const store = tx.objectStore('prompt_events');
  const range = beforeId && beforeId > 0 ? IDBKeyRange.upperBound(beforeId - 1) : null;
  const out: PromptEventStored[] = [];
  let cursor = await store.openCursor(range, 'prev');
  while (cursor && out.length < limit) {
    const v: any = cursor.value;
    out.push({ ...(v || {}), id: Number(cursor.key) } as PromptEventStored);
    cursor = await cursor.continue();
  }
  await tx.done;
  // Return newest-first (descending by id) so the UI can render latest at top.
  return out;
}

export async function promptListLatest({ limit = 200 }: { limit?: number } = {}): Promise<PromptEventStored[]> {
  return promptListBefore({ beforeId: null, limit });
}

export async function chatAdd(msg: { ts: number; role: 'user' | 'assistant'; text: string }) {
  const d = await db();
  return await d.add('chat_messages', msg);
}

export async function chatClear() {
  const d = await db();
  const tx = d.transaction('chat_messages', 'readwrite');
  await tx.objectStore('chat_messages').clear();
  await tx.done;
}

export async function chatListBefore({
  beforeId,
  limit = 200,
}: {
  beforeId: number | null;
  limit?: number;
}): Promise<ChatMessageStored[]> {
  const d = await db();
  const tx = d.transaction('chat_messages', 'readonly');
  const store = tx.objectStore('chat_messages');
  const range = beforeId && beforeId > 0 ? IDBKeyRange.upperBound(beforeId - 1) : null;
  const out: ChatMessageStored[] = [];
  let cursor = await store.openCursor(range, 'prev');
  while (cursor && out.length < limit) {
    const v: any = cursor.value;
    out.push({ ...(v || {}), id: Number(cursor.key) } as ChatMessageStored);
    cursor = await cursor.continue();
  }
  await tx.done;
  // Newest-first (descending by id). UI can reverse for chat view.
  return out;
}

export async function chatListLatest({ limit = 200 }: { limit?: number } = {}): Promise<ChatMessageStored[]> {
  return chatListBefore({ beforeId: null, limit });
}
