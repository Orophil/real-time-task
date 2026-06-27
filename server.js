// Custom server: one HTTP server hosts both Next.js and a `ws` WebSocket server
// in the SAME process. Because they share the process, App Router route handlers
// can reach the broadcaster via globalThis.__broadcast.
const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const { WebSocketServer, WebSocket } = require("ws");
const { PrismaClient } = require("@prisma/client");

const dev = process.env.NODE_ENV !== "production";

// Load .env the same way Next does, so PORT and DATABASE_URL are available here
// (node runs this file directly, before Next's own env loading kicks in).
require("@next/env").loadEnvConfig(process.cwd(), dev);

const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev });
const handle = app.getRequestHandler();

const prisma = new PrismaClient();

// ---- WebSocket layer ------------------------------------------------------

const wss = new WebSocketServer({ noServer: true });

// Full board snapshot, shaped exactly like the REST CardDTO.
async function getSnapshot() {
  const cards = await prisma.card.findMany({
    orderBy: [{ status: "asc" }, { position: "asc" }],
  });
  return cards.map((c) => ({
    id: c.id,
    title: c.title,
    status: c.status,
    position: c.position,
    version: c.version,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  }));
}

function send(client, message) {
  if (client.readyState === WebSocket.OPEN) {
    client.send(JSON.stringify(message));
  }
}

// Send a message to every connected client (including the originator — the
// client suppresses its own echo by comparing senderId).
function broadcast(message) {
  const data = JSON.stringify(message);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

function onlineCount() {
  let n = 0;
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) n++;
  }
  return n;
}

function broadcastPresence() {
  broadcast({ type: "presence", count: onlineCount() });
}

// Route handlers call this after a successful DB commit.
globalThis.__broadcast = broadcast;

wss.on("connection", async (ws) => {
  ws.isAlive = true;
  ws.on("pong", () => {
    ws.isAlive = true;
  });
  // Ignore client->server payloads; the protocol is server-push only.
  ws.on("message", () => {});
  ws.on("error", () => {});
  ws.on("close", () => {
    broadcastPresence();
  });

  // 1) Send this client the current board so it never shows stale data.
  try {
    send(ws, { type: "sync", cards: await getSnapshot() });
  } catch (err) {
    console.error("Failed to send sync snapshot:", err);
  }
  // 2) Tell everyone the new online count.
  broadcastPresence();
});

// Drop connections that stopped responding to pings (e.g. a yanked network),
// which keeps the presence count and the client set honest.
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000);
wss.on("close", () => clearInterval(heartbeat));

// ---- HTTP + Next ----------------------------------------------------------

app.prepare().then(() => {
  // Forwards Next's own upgrade requests (e.g. dev HMR socket) to Next.
  // Must be obtained after prepare().
  const upgradeHandler = app.getUpgradeHandler?.();

  const server = createServer((req, res) => {
    handle(req, res, parse(req.url, true));
  });

  server.on("upgrade", (req, socket, head) => {
    const { pathname } = parse(req.url || "/", true);
    if (pathname === "/ws") {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    } else if (typeof upgradeHandler === "function") {
      // Next.js internal sockets (dev HMR, etc.)
      upgradeHandler(req, socket, head);
    } else {
      socket.destroy();
    }
  });

  server.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}  (ws: /ws)`);
  });
});

// Clean shutdown so restarts don't leak the DB pool / sockets.
function shutdown() {
  clearInterval(heartbeat);
  wss.close();
  prisma.$disconnect().finally(() => process.exit(0));
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
