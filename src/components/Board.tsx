"use client";

import { useMemo, useState } from "react";
import { Column } from "./Column";
import { ConnectionPill } from "./ConnectionPill";
import { useBoardSocket } from "@/hooks/useBoardSocket";
import { selectColumn, useBoardStore } from "@/store/boardStore";
import type { CardDTO } from "@/lib/types";

const COLUMNS = [
  { status: "todo", title: "To Do" },
  { status: "in_progress", title: "In Progress" },
  { status: "done", title: "Done" },
] as const;

export function Board({ initialCards }: { initialCards: CardDTO[] }) {
  // Seed the store once from the server-rendered snapshot so the first paint
  // shows the board (no empty flash, SSR markup matches first client render).
  useState(() => {
    useBoardStore.getState().applySync(initialCards);
    return null;
  });

  useBoardSocket();

  const cards = useBoardStore((s) => s.cards);
  const columns = useMemo(
    () =>
      COLUMNS.map((col) => ({ ...col, cards: selectColumn(cards, col.status) })),
    [cards],
  );

  return (
    <main className="board">
      <div className="board__bar">
        <ConnectionPill />
      </div>
      <div className="board__columns">
        {columns.map((col) => (
          <Column
            key={col.status}
            status={col.status}
            title={col.title}
            cards={col.cards}
          />
        ))}
      </div>
    </main>
  );
}
