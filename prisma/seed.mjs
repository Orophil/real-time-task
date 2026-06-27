// Optional seed: populates the demo board only when it's empty.
// Run with: npm run db:seed
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SEED = [
  { title: "Project scaffold", status: "done" },
  { title: "Postgres connection", status: "done" },
  { title: "Card CRUD API", status: "in_progress" },
  { title: "Board UI layout", status: "in_progress" },
  { title: "Design the cards table", status: "todo" },
  { title: "Set up the WebSocket server", status: "todo" },
  { title: "Add reconnect handling", status: "todo" },
];

async function main() {
  const existing = await prisma.card.count();
  if (existing > 0) {
    console.log(`Board already has ${existing} cards; skipping seed.`);
    return;
  }

  // Group by status so positions start at 1000, 2000, ... within each column.
  const byStatus = {};
  for (const card of SEED) {
    byStatus[card.status] ??= [];
    byStatus[card.status].push(card);
  }

  const rows = [];
  for (const [status, cards] of Object.entries(byStatus)) {
    cards.forEach((c, i) => {
      rows.push({ title: c.title, status, position: (i + 1) * 1000 });
    });
  }

  await prisma.card.createMany({ data: rows });
  console.log(`Seeded ${rows.length} cards.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
