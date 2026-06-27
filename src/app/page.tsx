import { Board } from "@/components/Board";
import { listCards } from "@/lib/cards";

// Server component: read the current board from Postgres on load, then hand it
// to the client board which takes over via the WebSocket.
export const dynamic = "force-dynamic";

export default async function Page() {
  const initialCards = await listCards();
  return <Board initialCards={initialCards} />;
}
