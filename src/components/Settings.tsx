import { useState } from "react";
import {
  CheckCircle2,
  ExternalLink,
  Lock,
  LockOpen,
  Terminal,
  XCircle,
} from "lucide-react";

import { openUrl } from "@tauri-apps/plugin-opener";

import { resetKnownHosts } from "../lib/api";
import { relativeTime } from "../lib/devices";
import { useStore } from "../lib/store";
import type { DiscoveryMethod } from "../lib/types";
import { TotpPanel } from "./TotpPanel";
import { VaultGate } from "./VaultGate";

export function Settings() {
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const cliAvailable = useStore((s) => s.cliAvailable);
  const platform = useStore((s) => s.platform);
  const vaultUnlocked = useStore((s) => s.vaultUnlocked);
  const lockVault = useStore((s) => s.lockVault);
  const apiToken = useStore((s) => s.apiToken);
  const setApiToken = useStore((s) => s.setApiToken);
  const pushToast = useStore((s) => s.pushToast);
  const autoLockMinutes = useStore((s) => s.settings.autoLockMinutes);
  const autoReconnect = useStore((s) => s.settings.autoReconnect);
  const history = useStore((s) => s.settings.history);
  const exportSettings = useStore((s) => s.exportSettings);
  const importSettings = useStore((s) => s.importSettings);

  const [gateOpen, setGateOpen] = useState(false);
  const isMobile = platform === "android" || platform === "ios";

  function setMethod(method: DiscoveryMethod) {
    void updateSettings({ discoveryMethod: method });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
      <section className="card p-5">
        <h2 className="text-sm font-semibold text-slate-100">Discovery</h2>
        <p className="mt-1 text-sm text-slate-400">
          How Overseer finds the machines on your tailnet.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <MethodCard
            active={settings.discoveryMethod === "api"}
            onClick={() => setMethod("api")}
            title="Tailscale API"
            desc="Works on every platform. Needs an access token."
          />
          <MethodCard
            active={settings.discoveryMethod === "cli"}
            onClick={() => setMethod("cli")}
            disabled={isMobile}
            title="Local CLI"
            desc={
              isMobile
                ? "Not available on mobile."
                : "Uses the installed tailscale client. No token needed."
            }
          />
        </div>

        {settings.discoveryMethod === "cli" && !isMobile && (
          <div className="mt-3 flex items-center gap-2 text-sm">
            {cliAvailable ? (
              <span className="inline-flex items-center gap-1.5 text-emerald-400">
                <CheckCircle2 size={15} /> tailscale CLI detected
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-amber-400">
                <XCircle size={15} /> tailscale CLI not found on PATH
              </span>
            )}
          </div>
        )}

        {settings.discoveryMethod === "api" && (
          <div className="mt-4 space-y-4">
            <div>
              <label className="label" htmlFor="tailnet">
                Tailnet
              </label>
              <input
                id="tailnet"
                className="input font-mono"
                value={settings.tailnet}
                onChange={(e) =>
                  void updateSettings({ tailnet: e.target.value })
                }
                placeholder="- (default for this token)"
              />
              <p className="mt-1.5 text-xs text-slate-500">
                Use <code>-</code> for the token's default tailnet, or your org
                name like <code>example.com</code>.
              </p>
            </div>

            <div>
              <label className="label" htmlFor="token">
                API access token
              </label>
              {vaultUnlocked ? (
                <input
                  id="token"
                  type="password"
                  className="input font-mono"
                  value={apiToken}
                  onChange={(e) => void setApiToken(e.target.value)}
                  placeholder="tskey-api-…"
                  autoComplete="off"
                />
              ) : (
                <button
                  className="btn-ghost w-full"
                  onClick={() => setGateOpen(true)}
                >
                  <LockOpen size={15} /> Unlock vault to set token
                </button>
              )}
              <button
                className="mt-2 inline-flex items-center gap-1 text-xs text-brand-400 hover:underline"
                onClick={() =>
                  openUrl("https://login.tailscale.com/admin/settings/keys")
                }
              >
                Create an access token <ExternalLink size={12} />
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="card p-5">
        <h2 className="text-sm font-semibold text-slate-100">Security</h2>
        <p className="mt-1 text-sm text-slate-400">
          Your API token and per-machine credentials live in an encrypted vault.
        </p>
        <div className="mt-4 flex items-center justify-between rounded-lg border border-ink-700 bg-ink-800 px-4 py-3">
          <span className="inline-flex items-center gap-2 text-sm">
            {vaultUnlocked ? (
              <>
                <LockOpen size={16} className="text-emerald-400" /> Vault
                unlocked
              </>
            ) : (
              <>
                <Lock size={16} className="text-slate-400" /> Vault locked
              </>
            )}
          </span>
          {vaultUnlocked ? (
            <button
              className="btn-ghost"
              onClick={() => {
                lockVault();
                pushToast("info", "Vault locked.");
              }}
            >
              <Lock size={15} /> Lock now
            </button>
          ) : (
            <button className="btn-primary" onClick={() => setGateOpen(true)}>
              <LockOpen size={15} /> Unlock
            </button>
          )}
        </div>

        <div className="mt-4">
          <label className="label" htmlFor="autolock">
            Auto-lock after inactivity
          </label>
          <select
            id="autolock"
            className="input"
            value={autoLockMinutes}
            onChange={(e) =>
              void updateSettings({ autoLockMinutes: Number(e.target.value) })
            }
          >
            <option value={0}>Never</option>
            <option value={5}>5 minutes</option>
            <option value={15}>15 minutes</option>
            <option value={30}>30 minutes</option>
            <option value={60}>1 hour</option>
          </select>
        </div>

        <label className="mt-4 flex cursor-pointer items-center justify-between rounded-lg border border-ink-700 bg-ink-800 px-4 py-3">
          <span className="text-sm text-slate-300">
            Auto-reconnect dropped sessions
            <span className="ml-1 block text-xs text-slate-500">
              Retry an embedded session a few times if it drops.
            </span>
          </span>
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-ink-600 bg-ink-800 accent-brand-500"
            checked={autoReconnect}
            onChange={(e) =>
              void updateSettings({ autoReconnect: e.target.checked })
            }
          />
        </label>

        <div className="mt-4 flex items-center justify-between rounded-lg border border-ink-700 bg-ink-800 px-4 py-3">
          <span className="text-sm text-slate-300">
            Trusted SSH host keys
            <span className="ml-1 block text-xs text-slate-500">
              Reset after a legitimate server key rotation.
            </span>
          </span>
          <button
            className="btn-ghost"
            onClick={() => {
              void resetKnownHosts().then(() =>
                pushToast("info", "Trusted host keys cleared."),
              );
            }}
          >
            Reset
          </button>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-slate-100">
          <Terminal size={15} /> Remote desktop clients
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          Overseer hands sessions to your platform's RDP/VNC client. Make sure
          one is installed:
        </p>
        <ul className="mt-3 space-y-1.5 text-sm text-slate-400">
          <li>
            <strong className="text-slate-300">Windows:</strong> Remote Desktop
            Connection (built in) · any VNC viewer
          </li>
          <li>
            <strong className="text-slate-300">macOS:</strong> Windows App (RDP)
            · Screen Sharing (VNC, built in)
          </li>
          <li>
            <strong className="text-slate-300">iOS / Android:</strong> Windows
            App / RD Client · RealVNC Viewer
          </li>
        </ul>
      </section>

      <section className="card p-5">
        <h2 className="text-sm font-semibold text-slate-100">
          Backup &amp; restore
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          Export or import your non-secret settings (discovery, folders,
          profiles, favorites). Secrets stay in the encrypted vault.
        </p>
        <div className="mt-3 flex gap-2">
          <button className="btn-ghost" onClick={() => void exportSettings()}>
            Export settings
          </button>
          <button className="btn-ghost" onClick={() => void importSettings()}>
            Import settings
          </button>
        </div>
      </section>

      {vaultUnlocked && <TotpPanel />}

      {history.length > 0 && (
        <section className="card p-5">
          <h2 className="text-sm font-semibold text-slate-100">
            Recent connections
          </h2>
          <ul className="mt-3 divide-y divide-ink-800 text-sm">
            {history.slice(0, 10).map((h) => (
              <li
                key={`${h.deviceId}-${h.protocol}-${h.at}`}
                className="flex items-center justify-between py-2"
              >
                <span className="text-slate-200">
                  {h.deviceName}
                  <span className="ml-2 text-xs uppercase text-slate-500">
                    {h.protocol}
                  </span>
                </span>
                <span className="text-xs text-slate-500">
                  {relativeTime(new Date(h.at).toISOString()) ?? ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {gateOpen && <VaultGate onClose={() => setGateOpen(false)} />}
    </div>
  );
}

function MethodCard({
  active,
  onClick,
  title,
  desc,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  desc: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg border p-3 text-left transition-colors ${
        active
          ? "border-brand-600 bg-brand-600/10"
          : "border-ink-700 bg-ink-800 hover:border-ink-600"
      } disabled:cursor-not-allowed disabled:opacity-50`}
    >
      <div className="text-sm font-medium text-slate-100">{title}</div>
      <div className="mt-0.5 text-xs text-slate-400">{desc}</div>
    </button>
  );
}
