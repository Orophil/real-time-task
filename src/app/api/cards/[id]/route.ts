import { NextRequest, NextResponse } from "next/server";
import { deleteCard, updateCard, type UpdateInput } from "@/lib/cards";
import {
  parsePosition,
  parseStatus,
  parseTitle,
  ValidationError,
} from "@/lib/validation";
import { broadcast } from "@/lib/broadcast";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// In Next 15 dynamic route params are async.
type Context = { params: Promise<{ id: string }> };

// PATCH /api/cards/:id { title?, status?, position?, version? }
// Last-write-wins: the write always applies and version is bumped server-side.
// `version` in the body is accepted for forward-compat but does not gate the write.
export async function PATCH(req: NextRequest, ctx: Context) {
  const { id } = await ctx.params;
  const senderId = req.headers.get("x-client-id");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  try {
    const data = body as Record<string, unknown>;
    const input: UpdateInput = {};
    if (data?.title !== undefined) input.title = parseTitle(data.title);
    if (data?.status !== undefined) input.status = parseStatus(data.status);
    if (data?.position !== undefined) input.position = parsePosition(data.position);

    if (Object.keys(input).length === 0) {
      return NextResponse.json(
        { error: "provide at least one of: title, status, position" },
        { status: 400 },
      );
    }

    const card = await updateCard(id, input);
    if (!card) {
      return NextResponse.json({ error: "card not found" }, { status: 404 });
    }

    broadcast({ type: "card.updated", payload: card, senderId });
    return NextResponse.json({ card });
  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error(`PATCH /api/cards/${id} failed:`, err);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}

// DELETE /api/cards/:id
export async function DELETE(req: NextRequest, ctx: Context) {
  const { id } = await ctx.params;
  const senderId = req.headers.get("x-client-id");

  const ok = await deleteCard(id);
  if (!ok) {
    return NextResponse.json({ error: "card not found" }, { status: 404 });
  }

  broadcast({ type: "card.deleted", payload: { id }, senderId });
  return NextResponse.json({ ok: true });
}
