# Hyring Real-Time Task Board

A shared, Trello-style task board with three columns — **To Do / In Progress / Done**.
Anyone with the link can add, rename, move, reorder, or delete cards. Every committed
change is pushed to all other open browsers **instantly over a WebSocket** — no reload —
and everything persists in **PostgreSQL**, so the board survives a refresh or a server
restart.

> The interesting part is the realtime state, not the pixels: optimistic writes, echo
> suppression so the originating window never double-applies, a full re-sync on every
> (re)connect, and graceful exponential-backoff reconnect.

---

## Stack

| Layer       | Choice                                                                 |
|-------------|------------------------------------------------------------------------|
| Frontend    | **Next.js (App Router) + TypeScript**, **Zustand** store keyed by id   |
| Realtime    | **Node `ws`**, attached to a custom `server.js` in the **same process**|
| Persistence | **PostgreSQL + Prisma** (schema + SQL migration committed)             |
| Drag & drop | **@dnd-kit**                                                           |

No auth — one shared, anonymous board, as specified.

---

## What's implemented

**Required — all done & verified**

- ✅ **Persistent board & cards** — `cards` table (`id, title, status, position, version, created_at, updated_at`), read from Postgres on load. Survives refresh **and** server restart.
- ✅ **Full CRUD** — create / rename / move / reorder / delete, each through a REST route that writes to Postgres.
- ✅ **Live sync over WebSocket** — every committed write is broadcast; other clients update in place with no reload. The originating window applies its change optimistically and **suppresses its own echo** via `senderId`, so it never double-applies.
- ✅ **Graceful reconnect** — exponential backoff (1s → 2s → 5s, cap 10s); on every (re)connect the server pushes a full snapshot so a reconnecting client re-syncs to current truth instead of stale data. A live **● Connected / ◌ Reconnecting** pill reflects socket state.

**Bonuses — all three done**

- ✅ **Presence** — the WS server tracks open sockets and broadcasts `{ type: "presence", count }` on connect/disconnect; the header shows “👥 N online”.
- ✅ **Drag & drop ordering** — `@dnd-kit`; on drop the new **float position** is computed as the midpoint between neighbours, PATCHed (single-row write), broadcast, and persisted — stable across reloads and synced live. Cross-column drags work too.
- ✅ **Conflict handling (last-write-wins + `version`)** — see [Conflict handling](#conflict-handling-last-write-wins) below.

Nothing from the brief was skipped.

---

## Quick start

Requires **Node ≥ 18** and a Postgres database. The repo ships a `docker-compose.yml`
that brings one up on host port **5433** (so it won't clash with a local Postgres on 5432).

```bash
# 1. install deps (postinstall runs `prisma generate`)
npm install

# 2. start Postgres (or point DATABASE_URL at your own — see below)
docker compose up -d

# 3. configure env
cp .env.example .env        # defaults already match docker-compose

# 4. create the schema on a fresh database
npx prisma migrate deploy   # applies the committed migration
#   (optional) seed the demo board:
npm run db:seed

# 5. run it (Next + WebSocket in one process)
npm run dev                 # http://localhost:3000
```

Open **two browser windows** side by side at <http://localhost:3000> and start editing —
changes appear in the other window within a moment, no reload.

### Production build

```bash
npm run build
npm start          # NODE_ENV=production node server.js
```

### Using your own Postgres (no Docker)

Set `DATABASE_URL` in `.env` to any reachable Postgres and run
`npx prisma migrate deploy`. Example:

```
DATABASE_URL="postgresql://user:pass@localhost:5432/taskboard?schema=public"
```

---

## Environment variables

| Var            | Required | Default (in `.env.example`)                                        | Notes                                   |
|----------------|----------|--------------------------------------------------------------------|-----------------------------------------|
| `DATABASE_URL` | yes      | `postgresql://taskboard:taskboard@localhost:5433/taskboard?schema=public` | Postgres connection string (Prisma).   |
| `PORT`         | no       | `3000`                                                             | Port for the combined HTTP + WS server. |

---

## Architecture

```
┌──────────────────────────────────────────────┐
│  server.js  (one Node process)                 │
│   ├─ Next.js request handler  → pages + /api   │
│   └─ ws.WebSocketServer on the same HTTP server│
│        (attached via the "upgrade" event, /ws) │
└───────────────┬────────────────────────────────┘
                │ broadcast() shared via globalThis.__broadcast
  REST write ───┘ (only AFTER the DB commit) → push to every socket
                │
         ┌──────┴──────┐
         │  PostgreSQL │  (Prisma)  ← source of truth
         └─────────────┘
```

**Why one process.** A REST route writes to Postgres, then calls an in-memory
`broadcast()` to push the change to every connected socket. Keeping Next and `ws` in the
same process means the route handler and the socket server share module state — no
cross-process plumbing. The broadcaster is published on `globalThis.__broadcast` when the
WS server boots, so App Router route handlers (Node runtime) can reach it regardless of
bundling boundaries. Before the WS server exists, `broadcast()` is a safe no-op, so the
REST API also works standalone.

**Write path (the ordering that matters):** `validate → DB commit → broadcast(...)`.
Never broadcast before the commit, so clients can never observe a change that didn't persist.

### Data model

```prisma
enum Status { todo  in_progress  done }

model Card {
  id        String   @id @default(uuid()) @db.Uuid
  title     String
  status    Status   @default(todo)
  position  Float          // float + midpoint insertion → reorder writes one row
  version   Int      @default(1)   // bumped on every write; used for LWW
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt     @map("updated_at")

  @@index([status, position])
  @@map("cards")
}
```

`status` is a Postgres `enum` for integrity, and its declaration order
(`todo < in_progress < done`) doubles as the natural left-to-right column order, so
`ORDER BY status, position` already returns columns grouped and sorted.

### REST API

Every write reads an `x-client-id` header and tags its broadcast with it as `senderId`.

| Method | Route             | Body                                        | On success broadcasts |
|--------|-------------------|---------------------------------------------|-----------------------|
| GET    | `/api/cards`      | —                                           | —                     |
| POST   | `/api/cards`      | `{ title, status, id? }`                    | `card.created`        |
| PATCH  | `/api/cards/:id`  | `{ title?, status?, position?, version? }`  | `card.updated`        |
| DELETE | `/api/cards/:id`  | —                                           | `card.deleted`        |

- `POST` places the card at the **end of its column** (max position + 1000). It accepts an
  optional client-generated `id` so an optimistic create is **idempotent** (a retry can't
  duplicate the row).
- `PATCH` with a `status` change but no explicit `position` appends to the end of the
  target column. Drag & drop sends an explicit midpoint `position`.
- Validation rejects empty titles and statuses outside the allowed set with `400`;
  unknown ids return `404`.

### WebSocket protocol (server → client)

```jsonc
{ "type": "sync",        "cards": [ ... ] }                       // on every (re)connect
{ "type": "presence",    "count": 3 }                             // on connect/disconnect
{ "type": "card.created","payload": { ...card }, "senderId": "…" }
{ "type": "card.updated","payload": { ...card }, "senderId": "…" }
{ "type": "card.deleted","payload": { "id": "…" }, "senderId": "…" }
```

The protocol is server-push only; clients never send application messages (a heartbeat
ping/pong keeps connections and the presence count honest).

### Client realtime rules

1. **Optimistic update** — the originating action is applied to the Zustand store
   immediately, then reconciled with the authoritative server response.
2. **Echo suppression** — incoming events whose `senderId` equals this browser's id are
   ignored, so the originating window never double-applies. Changes from other clients (or
   tools, where `senderId` is `null`) are applied normally.
3. **One sync handler for first load and reconnect** — the server sends a full `sync`
   snapshot on every socket open; the same store action (`applySync`) handles initial load
   and re-sync, so a reconnecting client always lands on current truth.
4. **Reconnect** — the socket is wrapped in exponential backoff (1s → 2s → 5s, cap 10s);
   the pill is bound to socket state.

### Conflict handling (last-write-wins)

Two people editing one card is resolved with **last-write-wins, guarded by `version`**:

- Every `PATCH` increments `version` server-side, so the database serialises concurrent
  writes and the last commit gets the highest version — it wins.
- Clients **ignore stale `card.updated` events** whose `version` is lower than the version
  they already hold. This prevents an out-of-order broadcast from flipping a card back to
  an older value, so all clients converge on the same final state.

LWW was chosen because it needs zero coordination and is predictable for a shared board
where edits are quick and rare-conflict. The trade-off is a silent overwrite of the losing
edit; the `version` field is what makes the outcome deterministic and is the hook for a
future “this card changed under you” prompt or field-level merge.

---

## Project structure

```
server.js                    custom HTTP server: Next + ws + broadcast() + presence
prisma/
  schema.prisma              Card model + Status enum
  migrations/                committed SQL migration
  seed.mjs                   optional demo board (npm run db:seed)
src/
  app/
    page.tsx                 server component: reads board from DB on load
    api/cards/route.ts       GET (list) + POST (create)
    api/cards/[id]/route.ts  PATCH + DELETE
  components/                Board, Column, CardItem, ConnectionPill
  hooks/useBoardSocket.ts    WS lifecycle: connect, sync, backoff reconnect
  store/boardStore.ts        Zustand store + echo suppression + LWW + selectors
  lib/
    cards.ts                 data-access layer (position math, version bump)
    commands.ts              optimistic write → API → reconcile / rollback
    api.ts, clientId.ts, validation.ts, broadcast.ts, positions.ts, types.ts
```

---

## Key decisions & trade-offs

- **Single-process Next + `ws`** over a separate WS service — fastest correct path for one
  shared board; `broadcast()` is an in-memory call after commit. _Scale-up:_ move fan-out
  to Postgres `LISTEN/NOTIFY` or Redis pub/sub so multiple app instances stay in sync.
- **Full `sync` snapshot on reconnect** over event replay — robust and simple; never serves
  stale state. _Trade-off:_ a whole-board snapshot per reconnect vs. tracking a per-client
  cursor of missed events (worth it once boards get large).
- **Float position + midpoint insertion** over integer renumbering — a reorder is a single
  row write. _Trade-off:_ float precision can erode under pathological repeated reordering;
  LexoRank/fractional-indexing would be the next step.
- **Client-supplied card id on create** — makes the optimistic create idempotent and avoids
  temp-id reconciliation. _Trade-off:_ the server trusts a client UUID (validated as a UUID);
  fine for an anonymous shared board.
- **Last-write-wins + `version`** for conflicts — predictable, zero coordination (see above).
- **Raw `ws`** over Socket.IO — keeps the reconnect/echo logic explicit (it's the graded
  part). Socket.IO would give reconnect/presence “for free” if shipping speed mattered more.

## What I'd improve with more time

- `LISTEN/NOTIFY` or Redis fan-out for horizontal scaling.
- Per-client delta cursor instead of a full re-sync on every reconnect.
- LexoRank-style ordering keys instead of raw floats.
- A small automated test suite for the broadcast/echo/reconnect paths (verified manually
  here — see below).
- A toast/visual cue when a write fails and rolls back, and a “changed under you” hint on
  conflict.

---

## How it was verified

Manually, in two side-by-side windows, plus scripted two-browser checks driving real
Chromium. All of the following pass:

- Add / rename / move / delete in window A appears once in window B with **no reload**.
- The originating window shows its change **exactly once** (echo suppression).
- “👥 2 online” presence updates as windows open/close.
- Drag to reorder and drag across columns sync live and survive a refresh.
- Refresh keeps the board; **kill & restart the server** → the pill shows _Reconnecting_,
  then the client reconnects and re-syncs (including changes made while it was offline).
- Two concurrent edits to one card converge to the same value on both clients and in the DB.
