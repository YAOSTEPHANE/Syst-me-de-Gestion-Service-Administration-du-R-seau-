type QueueBody =
  | { kind: "json"; value: string }
  | { kind: "text"; value: string }
  | { kind: "none" };

type QueuedMutation = {
  id: string;
  url: string;
  method: "POST" | "PUT" | "PATCH" | "DELETE";
  headers: Record<string, string>;
  body: QueueBody;
  createdAt: string;
  retries: number;
};

export type QueuedMutationPreview = {
  id: string;
  method: QueuedMutation["method"];
  path: string;
  createdAt: string;
  retries: number;
};

const STORAGE_KEY = "lonaci:offline-mutation-queue:v1";
const CHANGE_EVENT = "lonaci-offline-queue-changed";
const SYNC_EVENT = "lonaci-offline-queue-sync";

let installed = false;
let syncRunner: (() => Promise<void>) | null = null;
let fetchRunner: typeof window.fetch | null = null;

function readQueue(): QueuedMutation[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as QueuedMutation[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function writeQueue(items: QueuedMutation[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { count: items.length } }));
}

function enqueue(item: QueuedMutation) {
  const queue = readQueue();
  queue.push(item);
  writeQueue(queue);
}

function queueResponse() {
  return new Response(
    JSON.stringify({
      queued: true,
      message: "Action stockee hors connexion. Synchronisation des que la connexion revient.",
    }),
    {
      status: 202,
      headers: { "Content-Type": "application/json" },
    },
  );
}

function isMutationMethod(method: string): method is "POST" | "PUT" | "PATCH" | "DELETE" {
  return method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE";
}

function canQueueRequest(url: URL, method: string) {
  if (!isMutationMethod(method)) return false;
  if (url.origin !== window.location.origin) return false;
  if (!url.pathname.startsWith("/api/")) return false;
  if (url.pathname.startsWith("/api/auth/")) return false;
  return true;
}

function parseBody(body: BodyInit | null | undefined, headers: Headers): QueueBody | null {
  if (body == null) return { kind: "none" };
  if (typeof body === "string") {
    const contentType = (headers.get("content-type") || "").toLowerCase();
    if (contentType.includes("application/json")) return { kind: "json", value: body };
    return { kind: "text", value: body };
  }
  if (body instanceof URLSearchParams) {
    return { kind: "text", value: body.toString() };
  }
  return null;
}

function toHeadersObject(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

function makeRequestInit(item: QueuedMutation): RequestInit {
  const headers = new Headers(item.headers);
  let body: BodyInit | undefined;
  if (item.body.kind === "json" || item.body.kind === "text") {
    body = item.body.value;
  }
  return {
    method: item.method,
    headers,
    body,
    credentials: "include",
  };
}

async function flushQueue(originalFetch: typeof window.fetch) {
  const queue = readQueue();
  if (!queue.length || !navigator.onLine) return;
  window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: { syncing: true } }));
  const remaining: QueuedMutation[] = [];
  for (const item of queue) {
    try {
      const response = await originalFetch(item.url, makeRequestInit(item));
      if (!response.ok) {
        if (response.status >= 500) {
          remaining.push({ ...item, retries: item.retries + 1 });
        }
      }
    } catch {
      remaining.push({ ...item, retries: item.retries + 1 });
    }
  }
  writeQueue(remaining);
  window.dispatchEvent(
    new CustomEvent(SYNC_EVENT, { detail: { syncing: false, remaining: remaining.length } }),
  );
}

export function getQueuedMutationsCount(): number {
  if (typeof window === "undefined") return 0;
  return readQueue().length;
}

export function getQueuedMutationsPreview(limit = 50): QueuedMutationPreview[] {
  if (typeof window === "undefined") return [];
  return readQueue()
    .slice(0, Math.max(1, limit))
    .map((item) => ({
      id: item.id,
      method: item.method,
      path: new URL(item.url, window.location.origin).pathname,
      createdAt: item.createdAt,
      retries: item.retries,
    }));
}

export function removeQueuedMutation(id: string): boolean {
  if (typeof window === "undefined") return false;
  const queue = readQueue();
  const next = queue.filter((item) => item.id !== id);
  if (next.length === queue.length) return false;
  writeQueue(next);
  return true;
}

export async function forceSyncQueuedMutations(): Promise<void> {
  if (!syncRunner) return;
  await syncRunner();
}

export async function syncQueuedMutationById(id: string): Promise<boolean> {
  if (typeof window === "undefined" || !fetchRunner || !navigator.onLine) return false;
  const queue = readQueue();
  const target = queue.find((item) => item.id === id);
  if (!target) return false;

  let keepItem = false;
  try {
    const response = await fetchRunner(target.url, makeRequestInit(target));
    if (!response.ok && response.status >= 500) {
      keepItem = true;
    }
  } catch {
    keepItem = true;
  }

  const next = readQueue()
    .filter((item) => item.id !== id)
    .concat(keepItem ? [{ ...target, retries: target.retries + 1 }] : []);
  writeQueue(next);
  return !keepItem;
}

export function installOfflineMutationQueue() {
  if (typeof window === "undefined" || installed) return;
  installed = true;
  const originalFetch = window.fetch.bind(window);
  fetchRunner = originalFetch;

  const syncNow = async () => {
    await flushQueue(originalFetch);
  };
  syncRunner = syncNow;

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url, window.location.origin);
    const method = request.method.toUpperCase();
    if (!isMutationMethod(method)) {
      return originalFetch(input, init);
    }
    if (!canQueueRequest(url, method)) {
      return originalFetch(input, init);
    }

    const headers = new Headers(request.headers);
    const body = parseBody(init?.body, headers);
    if (!body) {
      return originalFetch(input, init);
    }

    const queued: QueuedMutation = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      url: url.toString(),
      method: method as QueuedMutation["method"],
      headers: toHeadersObject(headers),
      body,
      createdAt: new Date().toISOString(),
      retries: 0,
    };

    if (!navigator.onLine) {
      enqueue(queued);
      return queueResponse();
    }

    try {
      return await originalFetch(input, init);
    } catch {
      enqueue(queued);
      return queueResponse();
    }
  };

  window.addEventListener("online", () => {
    void syncNow();
  });
  void syncNow();
}

export const offlineQueueEvents = {
  change: CHANGE_EVENT,
  sync: SYNC_EVENT,
};
