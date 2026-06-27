"use client";

import { useEffect, useRef, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { deleteCard, renameCard } from "@/lib/commands";
import type { CardDTO } from "@/lib/types";

export function CardItem({ card }: { card: CardDTO }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(card.title);
  const inputRef = useRef<HTMLInputElement>(null);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  // Reflect remote renames while not actively editing.
  useEffect(() => {
    if (!editing) setDraft(card.title);
  }, [card.title, editing]);

  const commit = () => {
    setEditing(false);
    renameCard(card.id, draft);
  };

  return (
    <div ref={setNodeRef} style={style} className="card">
      <div className="card__top">
        <button
          className="card__grip"
          title="Drag to reorder / move"
          aria-label="Drag handle"
          {...attributes}
          {...listeners}
        >
          ⠿
        </button>
        {editing ? (
          <input
            ref={inputRef}
            className="card__input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") {
                setDraft(card.title);
                setEditing(false);
              }
            }}
          />
        ) : (
          <div
            className="card__title"
            onDoubleClick={() => setEditing(true)}
            title="Double-click to rename"
          >
            {card.title}
          </div>
        )}
      </div>

      <div className="card__actions">
        <span className="card__spacer" />
        <button
          className="iconbtn iconbtn--danger"
          title="Delete"
          onClick={() => deleteCard(card.id)}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
