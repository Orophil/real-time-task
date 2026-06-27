// Thin client-side wrappers around the REST API. Every write carries this
// browser's x-client-id so the server can tag broadcasts with senderId.
import { getClientId } from "./clientId";
import type { CardDTO, Status } from "./types";

function writeHeaders(): HeadersInit {
  return {
    "content-type": "application/json",
    "x-client-id": getClientId(),
  };
}

async function parseError(res: Response): Promise<never> {
  let message = `request failed (${res.status})`;
  try {
    const body = await res.json();
    if (body?.error) message = body.error;
  } catch {
    /* ignore */
  }
  throw new Error(message);
}

export async function apiFetchCards(): Promise<CardDTO[]> {
  const res = await fetch("/api/cards", { cache: "no-store" });
  if (!res.ok) return parseError(res);
  return (await res.json()).cards;
}

export async function apiCreateCard(input: {
  id: string;
  title: string;
  status: Status;
}): Promise<CardDTO> {
  const res = await fetch("/api/cards", {
    method: "POST",
    headers: writeHeaders(),
    body: JSON.stringify(input),
  });
  if (!res.ok) return parseError(res);
  return (await res.json()).card;
}

export async function apiUpdateCard(
  id: string,
  patch: { title?: string; status?: Status; position?: number },
): Promise<CardDTO> {
  const res = await fetch(`/api/cards/${id}`, {
    method: "PATCH",
    headers: writeHeaders(),
    body: JSON.stringify(patch),
  });
  if (!res.ok) return parseError(res);
  return (await res.json()).card;
}

export async function apiDeleteCard(id: string): Promise<void> {
  const res = await fetch(`/api/cards/${id}`, {
    method: "DELETE",
    headers: writeHeaders(),
  });
  if (!res.ok) return parseError(res);
}
