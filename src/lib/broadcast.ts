import type { BroadcastMessage } from "./types";

// server.js attaches the real implementation on globalThis.__broadcast once the
// WebSocket server is up. Route handlers run in the same Node process, so they
// share that global. Before the WS server exists (or in tests) this is a no-op,
// which keeps the REST API usable on its own.
type BroadcastFn = (msg: BroadcastMessage) => void;

export function broadcast(msg: BroadcastMessage): void {
  const fn = (globalThis as { __broadcast?: BroadcastFn }).__broadcast;
  if (typeof fn === "function") {
    fn(msg);
  }
}
