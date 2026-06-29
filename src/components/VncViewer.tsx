import { useEffect, useRef } from "react";
import RFB from "@novnc/novnc";

import type { SessionStatus } from "../lib/types";

/**
 * Embedded VNC viewer. noVNC speaks the RFB protocol over the loopback
 * WebSocket bridge, which the Rust backend splices to the remote VNC server's
 * TCP socket.
 */
export function VncViewer({
  wsUrl,
  password,
  onStatus,
}: {
  wsUrl: string;
  password?: string | null;
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

    const onConnect = () => onStatus?.("open");
    const onDisconnect = () => onStatus?.("closed");
    const onCredentials = () => {
      if (password) rfb.sendCredentials({ password });
    };

    rfb.addEventListener("connect", onConnect);
    rfb.addEventListener("disconnect", onDisconnect);
    rfb.addEventListener("credentialsrequired", onCredentials);

    return () => {
      rfb.removeEventListener("connect", onConnect);
      rfb.removeEventListener("disconnect", onDisconnect);
      rfb.removeEventListener("credentialsrequired", onCredentials);
      try {
        rfb.disconnect();
      } catch {
        /* ignore */
      }
    };
  }, [wsUrl, password, onStatus]);

  return <div ref={containerRef} className="h-full w-full bg-ink-950" />;
}
