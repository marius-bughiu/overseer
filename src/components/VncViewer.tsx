import { useEffect, useRef } from "react";
import RFB from "@novnc/novnc";

import { registerScreen } from "../lib/screenRegistry";
import { registerVnc } from "../lib/vncBus";
import type { SessionStatus } from "../lib/types";

/**
 * Embedded VNC viewer. noVNC speaks the RFB protocol over the loopback
 * WebSocket bridge, which the Rust backend splices to the remote VNC server's
 * TCP socket.
 */
export function VncViewer({
  wsUrl,
  password,
  username,
  sessionId,
  onStatus,
  onLog,
}: {
  wsUrl: string;
  password?: string | null;
  username?: string | null;
  sessionId?: string;
  onStatus?: (status: SessionStatus, detail?: string) => void;
  onLog?: (message: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // macOS Screen Sharing (Apple auth) requires a username *and* password;
    // standard VNC auth uses the password alone. Pass whatever we have.
    const creds =
      username || password
        ? { username: username ?? undefined, password: password ?? undefined }
        : undefined;
    const rfb = new RFB(container, wsUrl, { credentials: creds });
    rfb.scaleViewport = true;
    rfb.resizeSession = false;
    rfb.background = "#0a0e14";

    // noVNC renders into a <canvas> inside the container; expose it for thumbnails.
    const unregisterScreen = sessionId
      ? registerScreen(sessionId, () => container.querySelector("canvas"))
      : undefined;
    // Expose clipboard paste into the remote VNC server.
    const unregisterVnc = sessionId
      ? registerVnc(sessionId, (text) => rfb.clipboardPasteFrom(text))
      : undefined;

    // Whether we ever reached a fully-established RFB session. Distinguishes a
    // handshake that was rejected from a session that connected then dropped.
    let established = false;
    const onConnect = () => {
      established = true;
      onStatus?.("open");
    };
    const onDisconnect = (e: Event) => {
      // noVNC marks a handshake/protocol failure as an unclean disconnect.
      const clean = (e as CustomEvent<{ clean?: boolean }>).detail?.clean;
      if (clean !== false) {
        onStatus?.("closed");
        return;
      }
      onStatus?.(
        "closed",
        established
          ? "The VNC session connected, then the remote closed it moments later. On macOS this usually means Remote Management is enabled (instead of, or alongside, Screen Sharing) and it hangs up generic VNC clients — turn Remote Management OFF and Screen Sharing ON in System Settings → General → Sharing."
          : "Disconnected during VNC negotiation — the remote dropped the handshake before a session was established (it may require different credentials or a different auth mode).",
      );
    };
    const onSecurityFailure = (e: Event) => {
      const d = (e as CustomEvent<{ status?: number; reason?: string }>).detail;
      const reason = d?.reason ? `: ${d.reason}` : "";
      const status = d?.status != null ? ` (status ${d.status})` : "";
      onStatus?.(
        "error",
        `VNC authentication failed${reason}${status}. macOS Screen Sharing needs your Mac account username and password entered here, or a dedicated VNC password (Screen Sharing options → “VNC viewers may control screen with password”).`,
      );
    };
    const onCredentials = (e: Event) => {
      const types =
        (e as CustomEvent<{ types?: string[] }>).detail?.types ?? [];
      onLog?.(
        `Remote requested credentials (${types.join(", ") || "password"}).`,
      );
      rfb.sendCredentials({
        username: username ?? "",
        password: password ?? "",
      });
    };

    rfb.addEventListener("connect", onConnect);
    rfb.addEventListener("disconnect", onDisconnect);
    rfb.addEventListener("securityfailure", onSecurityFailure);
    rfb.addEventListener("credentialsrequired", onCredentials);

    return () => {
      unregisterScreen?.();
      unregisterVnc?.();
      rfb.removeEventListener("connect", onConnect);
      rfb.removeEventListener("disconnect", onDisconnect);
      rfb.removeEventListener("securityfailure", onSecurityFailure);
      rfb.removeEventListener("credentialsrequired", onCredentials);
      try {
        rfb.disconnect();
      } catch {
        /* ignore */
      }
    };
  }, [wsUrl, password, username, sessionId, onStatus, onLog]);

  return <div ref={containerRef} className="h-full w-full bg-ink-950" />;
}
