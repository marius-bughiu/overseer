import { useEffect, useRef } from "react";
import RFB from "@novnc/novnc";

import { registerScreen } from "../lib/screenRegistry";
import type { SessionStatus } from "../lib/types";

/**
 * Embedded VNC viewer. noVNC speaks the RFB protocol over the loopback
 * WebSocket bridge, which the Rust backend splices to the remote VNC server's
 * TCP socket.
 */
export function VncViewer({
  wsUrl,
  password,
  sessionId,
  onStatus,
}: {
  wsUrl: string;
  password?: string | null;
  sessionId?: string;
  onStatus?: (status: SessionStatus) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const creds = password ? { password } : undefined;
    const rfb = new RFB(container, wsUrl, { credentials: creds });
    rfb.scaleViewport = true;
    rfb.resizeSession = false;
    rfb.background = "#0a0e14";

    // noVNC renders into a <canvas> inside the container; expose it for thumbnails.
    const unregister = sessionId
      ? registerScreen(sessionId, () => container.querySelector("canvas"))
      : undefined;

    const onConnect = () => onStatus?.("open");
    const onDisconnect = () => onStatus?.("closed");
    const onCredentials = () => {
      if (password) rfb.sendCredentials({ password });
    };

    rfb.addEventListener("connect", onConnect);
    rfb.addEventListener("disconnect", onDisconnect);
    rfb.addEventListener("credentialsrequired", onCredentials);

    return () => {
      unregister?.();
      rfb.removeEventListener("connect", onConnect);
      rfb.removeEventListener("disconnect", onDisconnect);
      rfb.removeEventListener("credentialsrequired", onCredentials);
      try {
        rfb.disconnect();
      } catch {
        /* ignore */
      }
    };
  }, [wsUrl, password, sessionId, onStatus]);

  return <div ref={containerRef} className="h-full w-full bg-ink-950" />;
}
