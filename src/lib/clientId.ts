// A stable per-browser id. Sent as the `x-client-id` header on every write and
// compared against broadcast `senderId` to suppress our own echoes. Persisted in
// localStorage so a refresh / reconnect keeps the same identity.
const KEY = "taskboard-client-id";

let cached: string | null = null;

export function getClientId(): string {
  if (cached) return cached;
  if (typeof window === "undefined") {
    // Should only be read on the client; return a throwaway just in case.
    return "ssr";
  }
  let id = window.localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    window.localStorage.setItem(KEY, id);
  }
  cached = id;
  return id;
}
