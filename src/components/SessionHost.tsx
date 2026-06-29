import { useCallback, useEffect, useRef, useState } from "react";
import {
  Circle,
  ClipboardPaste,
  Loader2,
  Maximize2,
  RefreshCw,
  Square,
  X,
} from "lucide-react";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";

import {
  cancelRecording,
  isRecording,
  startRecording,
  stopRecording,
} from "../lib/recorder";
import { useStore } from "../lib/store";
import {
  getTerminalDims,
  sendToTerminal,
  toKeystrokes,
} from "../lib/terminalBus";
import type { SessionStatus, SessionTab } from "../lib/types";
import { FileBrowser } from "./FileBrowser";
import { RdpViewer } from "./RdpViewer";
import { SshTerminal } from "./SshTerminal";
import { VncViewer } from "./VncViewer";

const STATUS_LABEL: Record<SessionStatus, string> = {
  connecting: "Connecting…",
  open: "Connected",
  error: "Error",
  closed: "Disconnected",
};

const STATUS_COLOR: Record<SessionStatus, string> = {
  connecting: "bg-amber-400",
  open: "bg-emerald-400",
  error: "bg-red-400",
  closed: "bg-slate-500",
};

export function SessionHost({ session }: { session: SessionTab }) {
  const updateSession = useStore((s) => s.updateSession);
  const closeSession = useStore((s) => s.closeSession);
  const reopenSession = useStore((s) => s.reopenSession);
  const autoReconnect = useStore((s) => s.settings.autoReconnect);
  const snippets = useStore((s) => s.settings.snippets);
  const pushToast = useStore((s) => s.pushToast);

  const hostRef = useRef<HTMLDivElement>(null);
  const attempts = useRef(0);
  const [snippetMenu, setSnippetMenu] = useState(false);
  const [recording, setRecording] = useState(() => isRecording(session.id));

  const isTerminal =
    session.kind === "screen" &&
    (session.protocol === "ssh" || session.protocol === "telnet");

  function paste(text: string) {
    setSnippetMenu(false);
    if (!sendToTerminal(session.id, toKeystrokes(text))) {
      pushToast("error", "Terminal is not connected.");
    }
  }

  async function toggleRecord() {
    if (isRecording(session.id)) {
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      const safe = session.title.replace(/[^\w.-]+/g, "_");
      const path = await saveDialog({
        defaultPath: `${safe}-${stamp}.cast`,
        filters: [{ name: "asciicast", extensions: ["cast"] }],
      });
      if (!path) return; // user cancelled; keep recording
      try {
        const n = await stopRecording(session.id, path, session.title);
        setRecording(false);
        pushToast("success", `Saved recording (${n ?? 0} events).`);
      } catch (e) {
        pushToast("error", `Could not save recording: ${String(e)}`);
      }
    } else {
      const dims = getTerminalDims(session.id) ?? { cols: 80, rows: 24 };
      startRecording(session.id, dims.cols, dims.rows);
      setRecording(true);
      pushToast("info", "Recording started.");
    }
  }

  const onStatus = useCallback(
    (status: SessionStatus) => updateSession(session.id, { status }),
    [session.id, updateSession],
  );

  function toggleFullscreen() {
    const el = hostRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.();
  }

  const reconnect = useCallback(() => {
    attempts.current = 0;
    return reopenSession(session.id);
  }, [reopenSession, session.id]);

  // Bounded auto-reconnect on an unexpected drop (max 3 attempts per episode).
  useEffect(() => {
    if (session.status === "open") attempts.current = 0;
    if (autoReconnect && session.status === "closed" && attempts.current < 3) {
      attempts.current += 1;
      const t = setTimeout(() => void reopenSession(session.id), 1500);
      return () => clearTimeout(t);
    }
  }, [session.status, autoReconnect, reopenSession, session.id]);

  return (
    <div ref={hostRef} className="flex h-full flex-col bg-ink-950">
      <div className="flex items-center justify-between border-b border-ink-800 bg-ink-900/60 px-3 py-1.5 text-xs">
        <div className="flex items-center gap-2 text-slate-300">
          <span
            className={`h-2 w-2 rounded-full ${STATUS_COLOR[session.status]}`}
          />
          <span className="font-medium">{session.title}</span>
          <span className="text-slate-500">
            {session.protocol.toUpperCase()} · {session.host}:{session.port} ·{" "}
            {STATUS_LABEL[session.status]}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {isTerminal && (
            <button
              className={`btn-subtle p-1.5 ${recording ? "text-red-400" : ""}`}
              onClick={() => void toggleRecord()}
              title={recording ? "Stop & save recording" : "Record session"}
            >
              {recording ? (
                <Square size={14} className="fill-current" />
              ) : (
                <Circle size={14} />
              )}
            </button>
          )}
          {isTerminal && (
            <div className="relative">
              <button
                className="btn-subtle p-1.5"
                onClick={() => setSnippetMenu((v) => !v)}
                title="Send a snippet"
              >
                <ClipboardPaste size={14} />
              </button>
              {snippetMenu && (
                <div
                  className="absolute right-0 z-20 mt-1 w-56 overflow-hidden rounded-md border border-ink-700 bg-ink-900 shadow-lg"
                  onMouseLeave={() => setSnippetMenu(false)}
                >
                  {snippets.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-slate-500">
                      No snippets yet. Add them in Settings.
                    </p>
                  ) : (
                    <ul className="max-h-64 overflow-y-auto py-1">
                      {snippets.map((sn) => (
                        <li key={sn.id}>
                          <button
                            className="block w-full truncate px-3 py-1.5 text-left text-xs text-slate-200 hover:bg-ink-800"
                            title={sn.text}
                            onClick={() => paste(sn.text)}
                          >
                            {sn.label || sn.text}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}
          <button
            className="btn-subtle p-1.5"
            onClick={toggleFullscreen}
            title="Fullscreen"
          >
            <Maximize2 size={14} />
          </button>
          <button
            className="btn-subtle p-1.5"
            onClick={() => void reconnect()}
            title="Reconnect"
          >
            <RefreshCw size={14} />
          </button>
          <button
            className="btn-subtle p-1.5"
            onClick={() => {
              cancelRecording(session.id);
              closeSession(session.id);
            }}
            title="Close session"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        {session.status === "error" ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
            <p className="max-w-md text-sm text-red-300">
              {session.error ?? "Session failed."}
            </p>
            <button className="btn-ghost" onClick={() => void reconnect()}>
              <RefreshCw size={15} /> Retry
            </button>
          </div>
        ) : session.kind === "files" ? (
          session.sftpId ? (
            <FileBrowser session={session} />
          ) : (
            <div className="flex h-full items-center justify-center">
              <Loader2 size={24} className="animate-spin text-brand-400" />
            </div>
          )
        ) : !session.wsUrl ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 size={24} className="animate-spin text-brand-400" />
          </div>
        ) : session.protocol === "ssh" || session.protocol === "telnet" ? (
          <SshTerminal
            wsUrl={session.wsUrl}
            sessionId={session.id}
            onStatus={onStatus}
          />
        ) : session.protocol === "rdp" ? (
          <RdpViewer wsUrl={session.wsUrl} onStatus={onStatus} />
        ) : (
          <VncViewer
            wsUrl={session.wsUrl}
            password={session.password}
            onStatus={onStatus}
          />
        )}
      </div>
    </div>
  );
}
