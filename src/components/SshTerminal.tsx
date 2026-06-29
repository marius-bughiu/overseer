import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

import type { SessionStatus } from "../lib/types";

/**
 * Embedded SSH terminal. Connects to the loopback WebSocket bridge opened by
 * the Rust backend and renders the live shell with xterm.js.
 *
 * Wire protocol with the backend:
 * - binary frames  ↔ raw terminal bytes (stdout in, keystrokes out)
 * - text frames    → `{"cols","rows"}` resize control (frontend → backend)
 */
export function SshTerminal({
  wsUrl,
  onStatus,
}: {
  wsUrl: string;
  onStatus?: (status: SessionStatus) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new Terminal({
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      fontSize: 13,
      cursorBlink: true,
      theme: {
        background: "#0a0e14",
        foreground: "#e2e8f0",
        cursor: "#34d3e0",
        selectionBackground: "#26303f",
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(container);
    try {
      fit.fit();
    } catch {
      /* container not measured yet */
    }

    const encoder = new TextEncoder();
    const ws = new WebSocket(wsUrl);
    ws.binaryType = "arraybuffer";

    const sendResize = () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ cols: term.cols, rows: term.rows }));
      }
    };

    ws.onopen = () => {
      try {
        fit.fit();
      } catch {
        /* ignore */
      }
      sendResize();
      onStatus?.("open");
      term.focus();
    };
    ws.onmessage = (ev) => {
      if (typeof ev.data === "string") term.write(ev.data);
      else term.write(new Uint8Array(ev.data as ArrayBuffer));
    };
    ws.onclose = () => {
      term.write("\r\n\x1b[2m[overseer] session closed\x1b[0m\r\n");
      onStatus?.("closed");
    };
    ws.onerror = () => onStatus?.("error");

    const dataSub = term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(encoder.encode(data));
    });
    const resizeSub = term.onResize(() => sendResize());

    const ro = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch {
        /* ignore */
      }
    });
    ro.observe(container);

    return () => {
      ro.disconnect();
      dataSub.dispose();
      resizeSub.dispose();
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      term.dispose();
    };
  }, [wsUrl, onStatus]);

  return <div ref={containerRef} className="h-full w-full bg-ink-950 p-1" />;
}
