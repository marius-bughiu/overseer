import { useEffect } from "react";
import {
  Info,
  Lock,
  LockOpen,
  Monitor,
  Settings as SettingsIcon,
} from "lucide-react";

import { About } from "./components/About";
import { DeviceList } from "./components/DeviceList";
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
              onClick={() => setView(id)}
              className={`btn-subtle px-2.5 ${
                view === id ? "bg-ink-800 text-brand-400" : ""
              }`}
              aria-current={view === id ? "page" : undefined}
            >
              <Icon size={16} />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
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

      <main className="min-h-0 flex-1">
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
      </main>

      <Toasts />
    </div>
  );
}
