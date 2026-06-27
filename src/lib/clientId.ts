// A unique id for THIS tab/window, generated fresh on page load and kept only in
// memory for the page's lifetime.
//
// It MUST be unique per browsing context (tab/window) — never shared across tabs.
// It drives echo suppression: a write is tagged with this id, the originating
// window ignores its own broadcast echo (it already applied the change
// optimistically), and OTHER windows (different id) apply it.
//
// Earlier this was persisted in localStorage, which is shared by all tabs of the
// same origin — so two windows in one browser got the SAME id and each wrongly
// suppressed the other's updates. In-memory per page load avoids that: every tab
// (even a duplicated one) runs its own JS and gets its own id.
let clientId: string | null = null;

function generate(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `client-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

export function getClientId(): string {
  if (clientId) return clientId;
  if (typeof window === "undefined") {
    // Only read on the client; never persisted, so SSR doesn't need a real one.
    return "ssr";
  }
  clientId = generate();
  return clientId;
}
