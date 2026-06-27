"use client";

import { useEffect } from "react";
import { getClientId } from "@/lib/clientId";
import { useBoardStore } from "@/store/boardStore";
import type { ServerMessage } from "@/lib/types";

// Exponential backoff schedule (ms): 1s, 2s, 5s, then capped at 10s.
const BACKOFF = [1000, 2000, 5000, 10000];

// Opens the board WebSocket and keeps the store in sync:
//  - server pushes a `sync` snapshot on every (re)connect -> applySync
//  - change events are applied with echo suppression + last-write-wins
//  - drops trigger exponential-backoff reconnect; the next sync re-syncs state
export function useBoardSocket(): void {
  const applySync = useBoardStore((s) => s.applySync);
  const applyRemote = useBoardStore((s) => s.applyRemote);
  const setConnection = useBoardStore((s) => s.setConnection);
  const setOnline = useBoardStore((s) => s.setOnline);

  useEffect(() => {
    const clientId = getClientId();
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    let disposed = false;

    const connect = () => {
      setConnection(attempt === 0 ? "connecting" : "reconnecting");

      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      ws = new WebSocket(`${proto}://${window.location.host}/ws`);

      ws.onopen = () => {
        attempt = 0; // reset backoff
        setConnection("connected");
        // Server sends a `sync` snapshot automatically on connect.
      };

      ws.onmessage = (event) => {
        let msg: ServerMessage;
        try {
          msg = JSON.parse(event.data as string);
        } catch {
          return;
        }
        if (msg.type === "sync") {
          applySync(msg.cards); // same handler for first load and reconnect
        } else if (msg.type === "presence") {
          setOnline(msg.count);
        } else {
          applyRemote(msg, clientId);
        }
      };

      ws.onclose = () => {
        if (disposed) return;
        setConnection("reconnecting");
        const delay = BACKOFF[Math.min(attempt, BACKOFF.length - 1)];
        attempt += 1;
        reconnectTimer = setTimeout(connect, delay);
      };

      ws.onerror = () => {
        // Let onclose handle the reconnect; just ensure the socket tears down.
        ws?.close();
      };
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) {
        ws.onclose = null; // don't schedule a reconnect on intentional close
        ws.close();
      }
    };
  }, [applySync, applyRemote, setConnection, setOnline]);
}
