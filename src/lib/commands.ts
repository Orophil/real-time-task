// User intents, each: (1) apply optimistically, (2) call the API,
// (3) reconcile with the authoritative server response, (4) roll back on error.
// The originating window never relies on its own WebSocket echo (it's suppressed
// by senderId); these functions keep it consistent on their own.
import {
  apiCreateCard,
  apiDeleteCard,
  apiFetchCards,
  apiUpdateCard,
} from "@/lib/api";
import { endPositionFor, useBoardStore } from "@/store/boardStore";
import type { CardDTO, Status } from "@/lib/types";

// Full re-sync fallback: guarantees consistency after a failed optimistic write.
async function resync(): Promise<void> {
  try {
    useBoardStore.getState().applySync(await apiFetchCards());
  } catch (err) {
    console.error("Re-sync after failed write also failed:", err);
  }
}

export async function addCard(title: string, status: Status): Promise<void> {
  const trimmed = title.trim();
  if (!trimmed) return;

  const store = useBoardStore.getState();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const optimistic: CardDTO = {
    id,
    title: trimmed,
    status,
    position: endPositionFor(store.cards, status),
    version: 1,
    createdAt: now,
    updatedAt: now,
  };

  store.upsertCard(optimistic);
  try {
    const card = await apiCreateCard({ id, title: trimmed, status });
    store.upsertCard(card); // authoritative (real position/version/timestamps)
  } catch (err) {
    console.error("addCard failed:", err);
    useBoardStore.getState().removeCard(id);
  }
}

export async function renameCard(id: string, title: string): Promise<void> {
  const trimmed = title.trim();
  const store = useBoardStore.getState();
  const prev = store.cards[id];
  if (!prev || !trimmed || trimmed === prev.title) return;

  store.upsertCard({ ...prev, title: trimmed });
  try {
    const card = await apiUpdateCard(id, { title: trimmed });
    store.upsertCard(card);
  } catch (err) {
    console.error("renameCard failed:", err);
    useBoardStore.getState().upsertCard(prev); // roll back
  }
}

// Move to a different column; server appends it at the end of that column.
export async function moveCard(id: string, status: Status): Promise<void> {
  const store = useBoardStore.getState();
  const prev = store.cards[id];
  if (!prev || prev.status === status) return;

  store.upsertCard({
    ...prev,
    status,
    position: endPositionFor(store.cards, status),
  });
  try {
    const card = await apiUpdateCard(id, { status });
    store.upsertCard(card);
  } catch (err) {
    console.error("moveCard failed:", err);
    useBoardStore.getState().upsertCard(prev);
    await resync();
  }
}

// Reposition (and possibly re-column) a card at an explicit float position.
// Used by drag-and-drop.
export async function reorderCard(
  id: string,
  status: Status,
  position: number,
): Promise<void> {
  const store = useBoardStore.getState();
  const prev = store.cards[id];
  if (!prev) return;

  store.upsertCard({ ...prev, status, position });
  try {
    const card = await apiUpdateCard(id, { status, position });
    store.upsertCard(card);
  } catch (err) {
    console.error("reorderCard failed:", err);
    useBoardStore.getState().upsertCard(prev);
    await resync();
  }
}

export async function deleteCard(id: string): Promise<void> {
  const store = useBoardStore.getState();
  const prev = store.cards[id];
  if (!prev) return;

  store.removeCard(id);
  try {
    await apiDeleteCard(id);
  } catch (err) {
    console.error("deleteCard failed:", err);
    useBoardStore.getState().upsertCard(prev); // restore on failure
  }
}
