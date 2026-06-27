"use client";

import { useBoardStore } from "@/store/boardStore";

// "● Connected" / "◌ Reconnecting", bound to live socket state.
export function ConnectionPill() {
  const connection = useBoardStore((s) => s.connection);
  const online = useBoardStore((s) => s.online);

  const connected = connection === "connected";
  const label =
    connection === "connected"
      ? "Connected"
      : connection === "connecting"
        ? "Connecting"
        : "Reconnecting";

  return (
    <div className="statusbar">
      <span className={`pill ${connected ? "pill--ok" : "pill--wait"}`}>
        <span className="pill__dot">{connected ? "●" : "◌"}</span>
        {label}
      </span>
      <span className="online" title="People viewing this board">
        👥 {online} online
      </span>
    </div>
  );
}
