import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Circle,
  Clipboard,
  ClipboardPaste,
  Loader2,
  Maximize2,
  RefreshCw,
  Square,
  Unplug,
  X,
} from "lucide-react";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { readText } from "@tauri-apps/plugin-clipboard-manager";

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
import { pasteToVnc } from "../lib/vncBus";
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

/** A session must stay open at least this long for a later drop to be treated
 *  as a genuine disconnect (and refresh the auto-reconnect budget). Shorter than
 *  this is a flap and counts against the budget so it can't loop forever. */
const STABLE_SESSION_MS = 8000;

export function SessionHost({ session }: { session: SessionTab }) {
  const updateSession = useStore((s) => s.updateSession);
  const closeSession = useStore((s) => s.closeSession);
  const reopenSession = useStore((s) => s.reopenSession);
  const logSession = useStore((s) => s.logSession);
  const autoReconnect = useStore((s) => s.settings.autoReconnect);
  const snippets = useStore((s) => s.settings.snippets);
  const pushToast = useStore((s) => s.pushToast);

  const hostRef = useRef<HTMLDivElement>(null);
  const attempts = useRef(0);
  const gaveUp = useRef(false);
  const openedAt = useRef(0);
  const [snippetMenu, setSnippetMenu] = useState(false);
  const [recording, setRecording] = useState(() => isRecording(session.id));
  // The connection overlay can be dismissed to reveal the viewer/terminal
  // underneath (e.g. to read terminal scrollback after a session closes). It
  // re-appears whenever the connection state changes.
  const [logDismissed, setLogDismissed] = useState(false);
  useEffect(() => setLogDismissed(false), [session.status]);

  const isTerminal =
    session.kind === "screen" &&
    (session.protocol === "ssh" || session.protocol === "telnet");
  const isVnc = session.kind === "screen" && session.protocol === "vnc";
  const canPaste = isTerminal || isVnc;

  function paste(text: string) {
    setSnippetMenu(false);
    if (!sendToTerminal(session.id, toKeystrokes(text))) {
      pushToast("error", "Terminal is not connected.");
    }
  }

  async function pasteClipboard() {
    try {
      const text = await readText();
      if (!text) {
        pushToast("info", "Clipboard is empty.");
        return;
      }
      const ok = isVnc
        ? pasteToVnc(session.id, text)
        : sendToTerminal(session.id, text);
      if (!ok) pushToast("error", "Session is not connected.");
    } catch (e) {
      pushToast("error", `Paste failed: ${String(e)}`);
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
    (status: SessionStatus, detail?: string) => {
      // On error, surface the viewer's own message (e.g. an RDP/VNC failure
      // reason) so the overlay shows the real cause, not a generic "Error".
      updateSession(session.id, {
        status,
        ...(status === "error" && detail ? { error: detail } : {}),
      });
      if (status === "open")
        logSession(session.id, "info", detail ?? "Connected.");
      else if (status === "closed")
        logSession(session.id, "info", detail ?? "Disconnected.");
      else if (status === "error")
        logSession(
          session.id,
          "error",
          detail ?? "The viewer reported a connection error.",
        );
    },
    [session.id, updateSession, logSession],
  );

  // Stable so it doesn't re-run the viewer effect (and tear down the live
  // connection) on every store update.
  const onLog = useCallback(
    (message: string) => logSession(session.id, "info", message),
    [session.id, logSession],
  );

  function toggleFullscreen() {
    const el = hostRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.();
  }

  const reconnect = useCallback(() => {
    attempts.current = 0;
    gaveUp.current = false;
    return reopenSession(session.id);
  }, [reopenSession, session.id]);

  // Bounded auto-reconnect on an unexpected drop (max 3 attempts per episode).
  // The 3-attempt budget only refreshes if the session was actually stable for
  // a while — otherwise a connect-then-instant-drop cycle (e.g. macOS hanging
  // up right after connect) would reset the counter every time and reconnect
  // forever.
  useEffect(() => {
    if (session.status === "open") {
      openedAt.current = Date.now();
      return;
    }
    if (session.status !== "closed") {
      gaveUp.current = false;
      return;
    }
    if (!autoReconnect) return;

    const wasStable =
      openedAt.current > 0 &&
      Date.now() - openedAt.current >= STABLE_SESSION_MS;
    if (wasStable) attempts.current = 0;
    openedAt.current = 0;

    if (attempts.current < 3) {
      attempts.current += 1;
      logSession(
        session.id,
        "info",
        `Auto-reconnecting (attempt ${attempts.current} of 3)…`,
      );
      const t = setTimeout(() => void reopenSession(session.id), 1500);
      return () => clearTimeout(t);
    } else if (!gaveUp.current) {
      gaveUp.current = true;
      logSession(
        session.id,
        "error",
        "Gave up — the session keeps dropping right after connecting. See the hint above, then click Reconnect to try again.",
      );
    }
  }, [session.status, autoReconnect, reopenSession, session.id, logSession]);

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
          {canPaste && (
            <button
              className="btn-subtle p-1.5"
              onClick={() => void pasteClipboard()}
              title="Paste clipboard into session"
            >
              <Clipboard size={14} />
            </button>
          )}
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
        {/* The viewer mounts as soon as a bridge URL exists so it can drive the
            connection; the overlay below reports status until it's live. */}
        {session.kind === "files"
          ? session.sftpId && <FileBrowser session={session} />
          : session.wsUrl &&
            (session.protocol === "ssh" || session.protocol === "telnet" ? (
              <SshTerminal
                wsUrl={session.wsUrl}
                sessionId={session.id}
                onStatus={onStatus}
              />
            ) : session.protocol === "rdp" ? (
              <RdpViewer
                wsUrl={session.wsUrl}
                sessionId={session.id}
                onStatus={onStatus}
              />
            ) : (
              <VncViewer
                wsUrl={session.wsUrl}
                password={session.password}
                username={session.username}
                sessionId={session.id}
                onStatus={onStatus}
                onLog={onLog}
              />
            ))}

        {session.status !== "open" && !logDismissed && (
          <ConnectionState
            session={session}
            onReconnect={() => void reconnect()}
            onDismiss={
              session.status === "connecting"
                ? undefined
                : () => setLogDismissed(true)
            }
          />
        )}
      </div>
    </div>
  );
}

/** Two-digit `HH:MM:SS` for a log timestamp. */
function fmtLogTime(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/**
 * Overlay shown while a session is not live (connecting / disconnected /
 * errored). It surfaces the current status, any error, and the full connection
 * log so the user can see exactly what happened instead of a silent flap.
 */
function ConnectionState({
  session,
  onReconnect,
  onDismiss,
}: {
  session: SessionTab;
  onReconnect: () => void;
  onDismiss?: () => void;
}) {
  const connecting = session.status === "connecting";
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-ink-950/92 p-6 text-center backdrop-blur-sm">
      {onDismiss && (
        <button
          className="btn-subtle absolute right-2 top-2 p-1.5 text-slate-400"
          onClick={onDismiss}
          title="Hide this and show the session underneath"
        >
          <X size={15} />
        </button>
      )}
      <div className="flex items-center gap-2 text-sm">
        {connecting ? (
          <Loader2 size={18} className="animate-spin text-brand-400" />
        ) : session.status === "error" ? (
          <AlertTriangle size={18} className="text-red-400" />
        ) : (
          <Unplug size={18} className="text-slate-400" />
        )}
        <span className="font-medium text-slate-200">
          {STATUS_LABEL[session.status]}
        </span>
      </div>

      {session.status === "error" && session.error && (
        <p className="max-w-md whitespace-pre-line text-sm text-red-300">
          {session.error}
        </p>
      )}

      <div className="w-full max-w-md text-left">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Connection log
        </div>
        <div className="max-h-48 overflow-y-auto rounded-lg border border-ink-700 bg-ink-900/80 p-2 font-mono text-xs">
          {session.log.length === 0 ? (
            <p className="text-slate-500">No activity yet.</p>
          ) : (
            <ul className="space-y-0.5">
              {session.log.map((e, i) => (
                <li
                  key={i}
                  className={
                    e.level === "error" ? "text-red-300" : "text-slate-400"
                  }
                >
                  <span className="text-slate-600">{fmtLogTime(e.at)}</span>{" "}
                  {e.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {!connecting && (
        <button className="btn-ghost" onClick={onReconnect}>
          <RefreshCw size={15} /> Reconnect
        </button>
      )}
    </div>
  );
}
