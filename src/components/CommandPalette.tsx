import { useEffect, useMemo, useRef, useState } from "react";
import {
  Info,
  Lock,
  Monitor,
  MonitorPlay,
  Moon,
  RefreshCw,
  Search,
  Settings as SettingsIcon,
  Sun,
} from "lucide-react";

import { useStore } from "../lib/store";

interface Command {
  id: string;
  label: string;
  hint?: string;
  icon: typeof Monitor;
  run: () => void;
}

export function CommandPalette() {
  const open = useStore((s) => s.paletteOpen);
  const setOpen = useStore((s) => s.setPaletteOpen);
  const devices = useStore((s) => s.devices);
  const setView = useStore((s) => s.setView);
  const setActiveTab = useStore((s) => s.setActiveTab);
  const setConnectTarget = useStore((s) => s.setConnectTarget);
  const setTheme = useStore((s) => s.setTheme);
  const theme = useStore((s) => s.settings.theme);
  const lockVault = useStore((s) => s.lockVault);
  const refresh = useStore((s) => s.refresh);

  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands = useMemo<Command[]>(() => {
    const go = (view: "devices" | "settings" | "about") => () => {
      setView(view);
      setActiveTab("devices");
      setOpen(false);
    };
    const actions: Command[] = [
      {
        id: "machines",
        label: "Go to Machines",
        icon: Monitor,
        run: go("devices"),
      },
      {
        id: "settings",
        label: "Open Settings",
        icon: SettingsIcon,
        run: go("settings"),
      },
      { id: "about", label: "Open About", icon: Info, run: go("about") },
      {
        id: "theme",
        label:
          theme === "dark" ? "Switch to light theme" : "Switch to dark theme",
        icon: theme === "dark" ? Sun : Moon,
        run: () => {
          void setTheme(theme === "dark" ? "light" : "dark");
          setOpen(false);
        },
      },
      {
        id: "refresh",
        label: "Refresh devices",
        icon: RefreshCw,
        run: () => {
          void refresh();
          setOpen(false);
        },
      },
      {
        id: "lock",
        label: "Lock vault",
        icon: Lock,
        run: () => {
          lockVault();
          setOpen(false);
        },
      },
    ];
    const deviceCmds: Command[] = devices.map((d) => ({
      id: `dev-${d.id}`,
      label: `Connect to ${d.name}`,
      hint: d.dnsName,
      icon: MonitorPlay,
      run: () => {
        setView("devices");
        setActiveTab("devices");
        setConnectTarget(d);
        setOpen(false);
      },
    }));
    return [...actions, ...deviceCmds];
  }, [
    devices,
    theme,
    setView,
    setActiveTab,
    setConnectTarget,
    setTheme,
    lockVault,
    refresh,
    setOpen,
  ]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter(
      (c) =>
        c.label.toLowerCase().includes(q) || c.hint?.toLowerCase().includes(q),
    );
  }, [commands, query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setIndex(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => setIndex(0), [query]);

  if (!open) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") setOpen(false);
    else if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      filtered[index]?.run();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center bg-black/50 p-4 pt-[12vh] backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className="card w-full max-w-lg overflow-hidden shadow-glow"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-2 border-b border-ink-700 px-3">
          <Search size={16} className="text-slate-500" />
          <input
            ref={inputRef}
            className="w-full bg-transparent py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
            placeholder="Search commands and machines…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <ul className="max-h-[50vh] overflow-y-auto py-1">
          {filtered.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-slate-500">
              No matches
            </li>
          )}
          {filtered.map((c, i) => {
            const Icon = c.icon;
            return (
              <li key={c.id}>
                <button
                  className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm ${
                    i === index ? "bg-ink-800 text-brand-400" : "text-slate-200"
                  }`}
                  onMouseEnter={() => setIndex(i)}
                  onClick={() => c.run()}
                >
                  <Icon size={15} className="shrink-0" />
                  <span className="flex-1 truncate">{c.label}</span>
                  {c.hint && (
                    <span className="truncate text-xs text-slate-500">
                      {c.hint}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
