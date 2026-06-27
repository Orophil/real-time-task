// Shared by server (data layer) and client (optimistic placement).
// Gap between appended cards; large enough to allow many midpoint inserts on
// drag-and-drop before positions would ever need renumbering.
export const POSITION_STEP = 1000;

// Midpoint between two neighbours (used when dropping a card between cards).
// `before`/`after` are the neighbouring positions; null means the list edge.
export function midpoint(
  before: number | null,
  after: number | null,
): number {
  if (before === null && after === null) return POSITION_STEP;
  if (before === null) return (after as number) - POSITION_STEP;
  if (after === null) return before + POSITION_STEP;
  return (before + after) / 2;
}
