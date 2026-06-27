import { NextRequest, NextResponse } from "next/server";
import { createCard, listCards } from "@/lib/cards";
import { parseId, parseStatus, parseTitle, ValidationError } from "@/lib/validation";
import { broadcast } from "@/lib/broadcast";

// Node.js runtime so route handlers share the process (and globalThis.__broadcast)
// with the custom server.js / WebSocket server. Never statically cache the board.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/cards -> every card, ordered by status then position.
export async function GET() {
  const cards = await listCards();
  return NextResponse.json({ cards });
}

// POST /api/cards { title, status } -> create at the end of the target column.
export async function POST(req: NextRequest) {
  const senderId = req.headers.get("x-client-id");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  try {
    const data = body as Record<string, unknown>;
    const title = parseTitle(data?.title);
    const status = parseStatus(data?.status);
    const id = data?.id !== undefined ? parseId(data.id) : undefined;

    const card = await createCard({ id, title, status });
    // DB commit succeeded -> now (and only now) broadcast to everyone else.
    broadcast({ type: "card.created", payload: card, senderId });

    return NextResponse.json({ card }, { status: 201 });
  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("POST /api/cards failed:", err);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
