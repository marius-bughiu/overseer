import {
  FolderOpen,
  LayoutGrid,
  Monitor,
  TerminalSquare,
  X,
} from "lucide-react";

import { useT } from "../lib/i18n";
import { useStore } from "../lib/store";
import type { SessionTab } from "../lib/types";

function statusDot(status: SessionTab["status"]): string {
  switch (status) {
    case "open":
      return "bg-emerald-400";
    case "connecting":
      return "bg-amber-400";
    case "error":
      return "bg-red-400";
    default:
      return "bg-slate-500";
  }
}

export function SessionTabs() {
  const sessions = useStore((s) => s.sessions);
  const activeTab = useStore((s) => s.activeTab);
  const setActiveTab = useStore((s) => s.setActiveTab);
  const closeSession = useStore((s) => s.closeSession);
  const t = useT();

  if (sessions.length === 0) return null;

  return (
    <div className="flex items-center gap-1 overflow-x-auto border-b border-ink-800 bg-ink-900/40 px-2 py-1">
      <button
        onClick={() => setActiveTab("devices")}
        className={`flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-xs ${
          activeTab === "devices"
            ? "bg-ink-800 text-brand-400"
            : "text-slate-400 hover:text-slate-200"
        }`}
      >
        <Monitor size={13} /> {t("nav.machines")}
      </button>

      <button
        onClick={() => setActiveTab("overview")}
        className={`flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-xs ${
          activeTab === "overview"
            ? "bg-ink-800 text-brand-400"
            : "text-slate-400 hover:text-slate-200"
        }`}
        title="Session overview"
      >
        <LayoutGrid size={13} /> {t("nav.overview")}
      </button>

      {sessions.map((s) => (
        <div
          key={s.id}
          className={`group flex shrink-0 items-center gap-1.5 rounded-md py-1 pl-2.5 pr-1 text-xs ${
            activeTab === s.id
              ? "bg-ink-800 text-slate-100"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <button
            onClick={() => setActiveTab(s.id)}
            className="flex items-center gap-1.5"
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${statusDot(s.status)}`}
            />
            {s.kind === "files" ? (
              <FolderOpen size={13} />
            ) : s.protocol === "ssh" || s.protocol === "telnet" ? (
              <TerminalSquare size={13} />
            ) : (
              <Monitor size={13} />
            )}
            <span className="max-w-[10rem] truncate">{s.title}</span>
          </button>
          <button
            onClick={() => closeSession(s.id)}
            className="rounded p-0.5 text-slate-500 opacity-60 hover:bg-ink-700 hover:text-slate-200 group-hover:opacity-100"
            aria-label="Close session"
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
