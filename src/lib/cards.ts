import { Prisma } from "@prisma/client";
import type { Card } from "@prisma/client";
import { prisma } from "./prisma";
import type { CardDTO, Status } from "./types";

// Gap between appended cards. Large gap leaves room for midpoint inserts on
// drag-and-drop without ever needing to renumber the whole column.
export const POSITION_STEP = 1000;

export function serialize(card: Card): CardDTO {
  return {
    id: card.id,
    title: card.title,
    status: card.status as Status,
    position: card.position,
    version: card.version,
    createdAt: card.createdAt.toISOString(),
    updatedAt: card.updatedAt.toISOString(),
  };
}

// Position one step past the last card in a column (i.e. append at the end).
async function endPosition(
  status: Status,
  client: Prisma.TransactionClient = prisma,
): Promise<number> {
  const agg = await client.card.aggregate({
    where: { status },
    _max: { position: true },
  });
  return (agg._max.position ?? 0) + POSITION_STEP;
}

// All cards, grouped by column (enum order) then by position within a column.
export async function listCards(): Promise<CardDTO[]> {
  const cards = await prisma.card.findMany({
    orderBy: [{ status: "asc" }, { position: "asc" }],
  });
  return cards.map(serialize);
}

export async function createCard(input: {
  title: string;
  status: Status;
}): Promise<CardDTO> {
  const position = await endPosition(input.status);
  const card = await prisma.card.create({
    data: { title: input.title, status: input.status, position },
  });
  return serialize(card);
}

export interface UpdateInput {
  title?: string;
  status?: Status;
  position?: number;
}

// Returns the updated card, or null if the id does not exist.
export async function updateCard(
  id: string,
  input: UpdateInput,
): Promise<CardDTO | null> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.card.findUnique({ where: { id } });
    if (!existing) return null;

    const data: Prisma.CardUpdateInput = { version: { increment: 1 } };
    if (input.title !== undefined) data.title = input.title;
    if (input.status !== undefined) data.status = input.status;

    if (input.position !== undefined) {
      data.position = input.position;
    } else if (input.status !== undefined && input.status !== existing.status) {
      // Moved to a new column without an explicit position -> append at its end.
      data.position = await endPosition(input.status, tx);
    }

    const updated = await tx.card.update({ where: { id }, data });
    return serialize(updated);
  });
}

// Returns false if the id did not exist.
export async function deleteCard(id: string): Promise<boolean> {
  try {
    await prisma.card.delete({ where: { id } });
    return true;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return false;
    }
    throw e;
  }
}
