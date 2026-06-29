import { useEffect } from "react";
import {
  Info,
  Lock,
  LockOpen,
  Monitor,
  Moon,
  Settings as SettingsIcon,
  Sun,
} from "lucide-react";

import { About } from "./components/About";
import { DeviceList } from "./components/DeviceList";
import { SessionHost } from "./components/SessionHost";
import { SessionTabs } from "./components/SessionTabs";
import { Settings } from "./components/Settings";
import { Toasts } from "./components/Toasts";
import { useStore, type View } from "./lib/store";

const NAV: { id: View; label: string; icon: typeof Monitor }[] = [
  { id: "devices", label: "Machines", icon: Monitor },
  { id: "settings", label: "Settings", icon: SettingsIcon },
  { id: "about", label: "About", icon: Info },
];

export default function App() {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const init = useStore((s) => s.init);
  const refresh = useStore((s) => s.refresh);
  const vaultUnlocked = useStore((s) => s.vaultUnlocked);
  const settings = useStore((s) => s.settings);
  const apiToken = useStore((s) => s.apiToken);
  const sessions = useStore((s) => s.sessions);
  const activeTab = useStore((s) => s.activeTab);
  const setActiveTab = useStore((s) => s.setActiveTab);
  const lockVault = useStore((s) => s.lockVault);
  const pushToast = useStore((s) => s.pushToast);
  const autoLockMinutes = useStore((s) => s.settings.autoLockMinutes);
  const theme = useStore((s) => s.settings.theme);
  const setTheme = useStore((s) => s.setTheme);

  const activeSession = sessions.find((s) => s.id === activeTab) ?? null;
  const showingSession = activeTab !== "devices" && activeSession !== null;

  function navTo(id: View) {
    setView(id);
    setActiveTab("devices");
  }

  // One-time startup: load environment + settings.
  useEffect(() => {
    void init();
  }, [init]);

  // Auto-refresh once we have what we need for the chosen discovery method.
  useEffect(() => {
    const ready =
      settings.discoveryMethod === "cli" ||
      (settings.discoveryMethod === "api" && apiToken.length > 0);
    if (ready) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.discoveryMethod, apiToken, refresh]);

  // Auto-lock the vault after a period of inactivity.
  useEffect(() => {
    if (!vaultUnlocked || autoLockMinutes <= 0) return;
    let timer: ReturnType<typeof setTimeout>;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        lockVault();
        pushToast("info", "Vault auto-locked after inactivity.");
      }, autoLockMinutes * 60_000);
    };
    const events = ["mousedown", "keydown", "touchstart", "mousemove"];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [vaultUnlocked, autoLockMinutes, lockVault, pushToast]);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-ink-950">
      <header className="flex items-center justify-between border-b border-ink-800 bg-ink-900/80 px-4 py-2.5 backdrop-blur">
        <div className="flex items-center gap-2.5">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white">
            <Monitor size={18} />
          </div>
          <div className="leading-tight">
            <h1 className="text-sm font-semibold text-slate-100">Overseer</h1>
            <p className="text-[11px] text-slate-500">
              Tailscale remote desktop
            </p>
          </div>
        </div>

        <nav className="flex items-center gap-1">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => navTo(id)}
              className={`btn-subtle px-2.5 ${
                view === id && !showingSession
                  ? "bg-ink-800 text-brand-400"
                  : ""
              }`}
              aria-current={view === id && !showingSession ? "page" : undefined}
            >
              <Icon size={16} />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
          <button
            className="btn-subtle px-2"
            onClick={() => void setTheme(theme === "dark" ? "light" : "dark")}
            title={theme === "dark" ? "Switch to light" : "Switch to dark"}
            aria-label="Toggle theme"
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <span
            className="ml-1 hidden items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-500 sm:inline-flex"
            title={vaultUnlocked ? "Vault unlocked" : "Vault locked"}
          >
            {vaultUnlocked ? (
              <LockOpen size={14} className="text-emerald-400" />
            ) : (
              <Lock size={14} />
            )}
          </span>
        </nav>
      </header>

      <main className="flex min-h-0 flex-1 flex-col">
        <SessionTabs />
        <div className="min-h-0 flex-1">
          {showingSession && activeSession ? (
            <SessionHost session={activeSession} />
          ) : (
            <>
              {view === "devices" && <DeviceList />}
              {view === "settings" && (
                <div className="h-full overflow-y-auto">
                  <Settings />
                </div>
              )}
              {view === "about" && (
                <div className="h-full overflow-y-auto">
                  <About />
                </div>
              )}
            </>
          )}
        </div>
      </main>

      <Toasts />
    </div>
  );
}
