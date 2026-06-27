"use client";

import { useState } from "react";
import { CardItem } from "./CardItem";
import { addCard } from "@/lib/commands";
import type { CardDTO, Status } from "@/lib/types";

const DOT: Record<Status, string> = {
  todo: "#9ca3af",
  in_progress: "#f59e0b",
  done: "#22c55e",
};

export function Column({
  status,
  title,
  cards,
}: {
  status: Status;
  title: string;
  cards: CardDTO[];
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  const submit = () => {
    const value = draft.trim();
    if (value) addCard(value, status);
    setDraft("");
    setAdding(false);
  };

  return (
    <section className="column">
      <header className="column__head">
        <span className="column__dot" style={{ background: DOT[status] }} />
        <h2 className="column__title">{title}</h2>
        <span className="column__count">{cards.length}</span>
      </header>

      <div className="column__cards">
        {cards.map((card) => (
          <CardItem key={card.id} card={card} />
        ))}
      </div>

      {adding ? (
        <div className="addbox">
          <input
            autoFocus
            className="card__input"
            placeholder="Card title…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={submit}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape") {
                setDraft("");
                setAdding(false);
              }
            }}
          />
        </div>
      ) : (
        <button className="addbtn" onClick={() => setAdding(true)}>
          + Add card
        </button>
      )}
    </section>
  );
}
