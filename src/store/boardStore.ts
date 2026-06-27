import { create } from "zustand";
import { POSITION_STEP } from "@/lib/positions";
import type { CardDTO, ServerMessage, Status } from "@/lib/types";
import { STATUSES } from "@/lib/types";

export type ConnectionState = "connecting" | "connected" | "reconnecting";

interface BoardState {
  cards: Record<string, CardDTO>;
  connection: ConnectionState;
  online: number;

  // Replace the whole board — used for first load AND every (re)connect sync.
  applySync: (cards: CardDTO[]) => void;
  // Insert/replace a single card (optimistic writes + authoritative reconcile).
  upsertCard: (card: CardDTO) => void;
  removeCard: (id: string) => void;
  // Apply a server change event, with echo suppression + last-write-wins.
  applyRemote: (msg: ServerMessage, myClientId: string) => void;

  setConnection: (state: ConnectionState) => void;
  setOnline: (count: number) => void;
}

function indexById(cards: CardDTO[]): Record<string, CardDTO> {
  const map: Record<string, CardDTO> = {};
  for (const card of cards) map[card.id] = card;
  return map;
}

export const useBoardStore = create<BoardState>((set) => ({
  cards: {},
  connection: "connecting",
  online: 0,

  applySync: (cards) => set({ cards: indexById(cards) }),

  upsertCard: (card) =>
    set((state) => ({ cards: { ...state.cards, [card.id]: card } })),

  removeCard: (id) =>
    set((state) => {
      if (!state.cards[id]) return state;
      const cards = { ...state.cards };
      delete cards[id];
      return { cards };
    }),

  applyRemote: (msg, myClientId) =>
    set((state) => {
      // Echo suppression: never re-apply our own change (we already did it
      // optimistically). Writes from other clients / tools (senderId null) pass.
      if ("senderId" in msg && msg.senderId && msg.senderId === myClientId) {
        return state;
      }

      if (msg.type === "card.created") {
        return { cards: { ...state.cards, [msg.payload.id]: msg.payload } };
      }
      if (msg.type === "card.updated") {
        const existing = state.cards[msg.payload.id];
        // Last-write-wins guarded by version: drop stale updates.
        if (existing && existing.version > msg.payload.version) return state;
        return { cards: { ...state.cards, [msg.payload.id]: msg.payload } };
      }
      if (msg.type === "card.deleted") {
        if (!state.cards[msg.payload.id]) return state;
        const cards = { ...state.cards };
        delete cards[msg.payload.id];
        return { cards };
      }
      return state;
    }),

  setConnection: (connection) => set({ connection }),
  setOnline: (online) => set({ online }),
}));

// ---- selectors / helpers --------------------------------------------------

// Cards in a column, sorted by position (stable secondary sort by id).
export function selectColumn(
  cards: Record<string, CardDTO>,
  status: Status,
): CardDTO[] {
  return Object.values(cards)
    .filter((c) => c.status === status)
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
}

export function countByStatus(cards: Record<string, CardDTO>): Record<Status, number> {
  const counts = { todo: 0, in_progress: 0, done: 0 } as Record<Status, number>;
  for (const card of Object.values(cards)) counts[card.status]++;
  return counts;
}

// Position for a card appended at the end of a column, computed from local
// state for an instant optimistic placement (server recomputes authoritatively).
export function endPositionFor(
  cards: Record<string, CardDTO>,
  status: Status,
): number {
  let max = 0;
  for (const card of Object.values(cards)) {
    if (card.status === status && card.position > max) max = card.position;
  }
  return max + POSITION_STEP;
}

export const COLUMN_STATUSES = STATUSES;
