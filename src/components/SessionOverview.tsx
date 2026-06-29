import { useEffect, useState } from "react";
import { FolderOpen, Monitor, TerminalSquare, X } from "lucide-react";

import { snapshotScreen } from "../lib/screenRegistry";
import { useStore } from "../lib/store";
import type { SessionTab } from "../lib/types";

const STATUS_COLOR: Record<SessionTab["status"], string> = {
  open: "bg-emerald-400",
  connecting: "bg-amber-400",
  error: "bg-red-400",
  closed: "bg-slate-500",
};

function SessionIcon({ session }: { session: SessionTab }) {
  if (session.kind === "files") return <FolderOpen size={16} />;
  if (session.protocol === "ssh" || session.protocol === "telnet")
    return <TerminalSquare size={16} />;
  return <Monitor size={16} />;
}

/**
 * A grid of all open sessions with a live thumbnail of each graphical screen.
 * Thumbnails refresh on a slow interval; click a card to focus that session.
 */
export function SessionOverview() {
  const sessions = useStore((s) => s.sessions);
  const setActiveTab = useStore((s) => s.setActiveTab);
  const closeSession = useStore((s) => s.closeSession);

  const [shots, setShots] = useState<Record<string, string>>({});

  useEffect(() => {
    const capture = () => {
      const next: Record<string, string> = {};
      for (const s of sessions) {
        const shot = snapshotScreen(s.id);
        if (shot) next[s.id] = shot;
      }
      setShots(next);
    };
    capture();
    const t = setInterval(capture, 2000);
    return () => clearInterval(t);
  }, [sessions]);

  if (sessions.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-500">
        No open sessions.
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6">
      <h2 className="mb-4 text-sm font-semibold text-slate-100">
        Open sessions ({sessions.length})
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sessions.map((s) => (
          <div
            key={s.id}
            className="card group overflow-hidden transition-colors hover:border-brand-600"
          >
            <button
              className="block w-full text-left"
              onClick={() => setActiveTab(s.id)}
            >
              <div className="relative flex aspect-video items-center justify-center bg-ink-950">
                {shots[s.id] ? (
                  <img
                    src={shots[s.id]}
                    alt={s.title}
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <div className="text-slate-600">
                    <SessionIcon session={s} />
                  </div>
                )}
              </div>
            </button>
            <div className="flex items-center justify-between gap-2 px-3 py-2">
              <div className="flex min-w-0 items-center gap-2 text-slate-200">
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_COLOR[s.status]}`}
                />
                <SessionIcon session={s} />
                <span className="truncate text-sm">{s.title}</span>
              </div>
              <button
                className="btn-subtle p-1 text-slate-500 opacity-0 hover:text-red-300 group-hover:opacity-100"
                onClick={() => closeSession(s.id)}
                aria-label="Close session"
              >
                <X size={14} />
              </button>
            </div>
            <div className="px-3 pb-2 text-xs text-slate-500">
              {s.protocol.toUpperCase()} · {s.host}:{s.port}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
