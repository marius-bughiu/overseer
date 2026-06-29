import { useCallback, useRef } from "react";
import { Loader2, Maximize2, RefreshCw, X } from "lucide-react";

import { useStore } from "../lib/store";
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
  const openSession = useStore((s) => s.openSession);
  const openFiles = useStore((s) => s.openFiles);

  const hostRef = useRef<HTMLDivElement>(null);

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

  async function reconnect() {
    closeSession(session.id);
    const args = {
      title: session.title.replace(/ · files$/, ""),
      protocol: session.protocol,
      host: session.host,
      port: session.port,
      username: session.username,
      password: session.password,
    };
    if (session.kind === "files") await openFiles(args);
    else await openSession(args);
  }

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
            onClick={() => closeSession(session.id)}
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
        ) : session.protocol === "ssh" ? (
          <SshTerminal wsUrl={session.wsUrl} onStatus={onStatus} />
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
