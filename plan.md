# Hyring Real-Time Task Board — Build Plan

A shared real-time Trello-style task board. Three columns (To Do / In Progress / Done).
Anyone with the link can add / rename / move / delete cards. Every committed change is
broadcast over a WebSocket so all other open browsers update live with no reload.
Everything persists in Postgres so the board survives refresh and server restart.

**Grade is on realtime state correctness, not UI polish.**

## Stack (fixed)
- Next.js (App Router) + TypeScript — board UI + REST routes under `app/api`.
- Node `ws` — WebSocket server attached to a custom `server.js` HTTP server in the **same process** as Next.
- PostgreSQL + Prisma — source of truth. Ship `schema.prisma` + a generated SQL migration.
- Zustand — client board store keyed by card id.
- No auth. One shared anonymous board.

## Data model
`Card { id (uuid), title, status ('todo'|'in_progress'|'done'), position (Float), version (Int default 1), created_at, updated_at }`.
Index `[status, position]`. Float position + midpoint insertion so a reorder writes one row.

## REST API (writes commit, THEN broadcast)
- `GET /api/cards` → all cards ordered by `status, position`.
- `POST /api/cards` → `{ title, status }`, position = end of that column.
- `PATCH /api/cards/:id` → `{ title?, status?, position?, version? }`.
- `DELETE /api/cards/:id`.
Every write reads an `x-client-id` header. After the DB commit succeeds, call
`broadcast({ type, payload, senderId })`. Never broadcast before the commit.

## WebSocket layer
- `server.js`: one HTTP server hands non-WS requests to the Next handler; a `ws.WebSocketServer`
  attaches via the `upgrade` event on path `/ws`.
- `globalThis.__broadcast` exposed so App Router route handlers can broadcast.
- On each socket connect → full `{ type:'sync', cards }` snapshot.
- Server→client change events: `card.created`, `card.updated`, `card.deleted` (each carries `senderId`).

## Client realtime rules (the graded part)
1. Optimistic update on the originating action.
2. Echo suppression: ignore incoming events where `senderId === myClientId`.
3. Reconnect: exponential backoff (1s→2s→5s, cap ~10s); on every (re)open, re-sync from `sync`.
4. Status pill: "● Connected" / "◌ Reconnecting" bound to socket state.

## Required (must all work)
1. Persistent board — survives refresh AND server restart.
2. Full CRUD via API routes hitting Postgres.
3. Live sync over WebSocket, no reload, no double-apply.
4. Graceful reconnect + re-sync + visible indicator.

## Bonuses (after required is solid, in order)
1. Presence — broadcast `{ type:'presence', count }` on connect/disconnect; show "N online".
2. Drag & drop — `@dnd-kit`; on drop compute midpoint position → PATCH → broadcast.
3. Conflict handling — last-write-wins guarded by `version`; ignore stale `card.updated`.

## Local infra
- Postgres via `docker compose` on host port **5433** (system PG already owns 5432).
- `DATABASE_URL=postgresql://taskboard:taskboard@localhost:5433/taskboard?schema=public`
