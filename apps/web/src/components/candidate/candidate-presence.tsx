"use client";

import { useEffect } from "react";
import { endPresence, getPresenceConnectionId, sendPresenceHeartbeat } from "@/lib/api";

const HEARTBEAT_INTERVAL_MS = 30_000;
let pendingDisconnect: number | undefined;

export function CandidatePresence() {
  useEffect(() => {
    const connectionId = getPresenceConnectionId();
    if (pendingDisconnect !== undefined) {
      window.clearTimeout(pendingDisconnect);
      pendingDisconnect = undefined;
    }

    const heartbeat = () => {
      if (document.visibilityState === "visible") {
        void sendPresenceHeartbeat(connectionId).catch(() => undefined);
      }
    };

    heartbeat();
    const timer = window.setInterval(heartbeat, HEARTBEAT_INTERVAL_MS);
    document.addEventListener("visibilitychange", heartbeat);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", heartbeat);
      pendingDisconnect = window.setTimeout(() => {
        void endPresence(connectionId).catch(() => undefined);
        pendingDisconnect = undefined;
      }, 100);
    };
  }, []);

  return null;
}
