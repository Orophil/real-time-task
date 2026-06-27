"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Column } from "./Column";
import { ConnectionPill } from "./ConnectionPill";
import { useBoardSocket } from "@/hooks/useBoardSocket";
import { reorderCard } from "@/lib/commands";
import { midpoint } from "@/lib/positions";
import { selectColumn, useBoardStore } from "@/store/boardStore";
import type { CardDTO, Status } from "@/lib/types";

const COLUMNS = [
  { status: "todo", title: "To Do" },
  { status: "in_progress", title: "In Progress" },
  { status: "done", title: "Done" },
] as const;

export function Board({ initialCards }: { initialCards: CardDTO[] }) {
  // Seed the store once from the SSR snapshot (no empty flash; matches hydration).
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

  const [activeId, setActiveId] = useState<string | null>(null);
  const activeCard = activeId ? cards[activeId] : null;

  // Small activation distance so card clicks/buttons aren't swallowed by drags.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));

  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;

    const activeIdStr = String(active.id);
    const overId = String(over.id);
    if (activeIdStr === overId) return;

    const map = useBoardStore.getState().cards;
    const moving = map[activeIdStr];
    if (!moving) return;

    // Resolve the target column (dropped on a column area vs. on a card).
    const targetStatus: Status = overId.startsWith("col:")
      ? (overId.slice(4) as Status)
      : map[overId]?.status;
    if (!targetStatus) return;

    // Target column sorted, excluding the card being moved.
    const list = selectColumn(map, targetStatus).filter(
      (c) => c.id !== activeIdStr,
    );
    const index = overId.startsWith("col:")
      ? list.length // dropped on empty space -> append
      : Math.max(0, list.findIndex((c) => c.id === overId));

    const before = index > 0 ? list[index - 1].position : null;
    const after = index < list.length ? list[index].position : null;
    const position = midpoint(before, after);

    if (targetStatus === moving.status && position === moving.position) return;
    reorderCard(activeIdStr, targetStatus, position);
  };

  return (
    <main className="board">
      <div className="board__bar">
        <ConnectionPill />
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
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
        <DragOverlay>
          {activeCard ? (
            <div className="card card--overlay">
              <div className="card__top">
                <span className="card__grip">⠿</span>
                <div className="card__title">{activeCard.title}</div>
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </main>
  );
}
