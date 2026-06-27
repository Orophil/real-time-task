// Shared types used by both the API routes, the WebSocket server, and the client.

export const STATUSES = ["todo", "in_progress", "done"] as const;
export type Status = (typeof STATUSES)[number];

export function isStatus(value: unknown): value is Status {
  return typeof value === "string" && (STATUSES as readonly string[]).includes(value);
}

// Wire shape of a card (dates serialized as ISO strings).
export interface CardDTO {
  id: string;
  title: string;
  status: Status;
  position: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

// Messages the server pushes to clients over the WebSocket.
export type ServerMessage =
  | { type: "sync"; cards: CardDTO[] }
  | { type: "presence"; count: number }
  | { type: "card.created"; payload: CardDTO; senderId: string | null }
  | { type: "card.updated"; payload: CardDTO; senderId: string | null }
  | { type: "card.deleted"; payload: { id: string }; senderId: string | null };

// Shape broadcast() accepts from the API routes.
export type BroadcastMessage =
  | { type: "card.created"; payload: CardDTO; senderId: string | null }
  | { type: "card.updated"; payload: CardDTO; senderId: string | null }
  | { type: "card.deleted"; payload: { id: string }; senderId: string | null };
