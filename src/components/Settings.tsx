import { useState } from "react";
import {
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  KeyRound,
  Lock,
  LockOpen,
  Plus,
  RefreshCw,
  Terminal,
  Trash2,
  XCircle,
} from "lucide-react";

import { openUrl } from "@tauri-apps/plugin-opener";

import { resetKnownHosts } from "../lib/api";
import { relativeTime } from "../lib/devices";
import { LANGUAGES, useT } from "../lib/i18n";
import { useStore } from "../lib/store";
import type { DiscoveryMethod, Settings as SettingsType } from "../lib/types";
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
  const biometricLock = useStore((s) => s.settings.biometricLock);
  const history = useStore((s) => s.settings.history);
  const exportSettings = useStore((s) => s.exportSettings);
  const importSettings = useStore((s) => s.importSettings);
  const importCredentials = useStore((s) => s.importCredentials);
  const chooseSyncFile = useStore((s) => s.chooseSyncFile);
  const syncPush = useStore((s) => s.syncPush);
  const syncPull = useStore((s) => s.syncPull);
  const syncPath = useStore((s) => s.settings.syncPath);
  const language = useStore((s) => s.settings.language);
  const t = useT();

  const [gateOpen, setGateOpen] = useState(false);
  const isMobile = platform === "android" || platform === "ios";

  function setMethod(method: DiscoveryMethod) {
    void updateSettings({ discoveryMethod: method });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
      <section className="card p-5">
        <h2 className="text-sm font-semibold text-slate-100">
          {t("settings.language")}
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          {t("settings.language.desc")}
        </p>
        <select
          className="input mt-3"
          value={language}
          onChange={(e) =>
            void updateSettings({
              language: e.target.value as SettingsType["language"],
            })
          }
        >
          {LANGUAGES.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>
      </section>

      <section className="card p-5">
        <h2 className="text-sm font-semibold text-slate-100">
          {t("settings.discovery")}
        </h2>
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
        <h2 className="text-sm font-semibold text-slate-100">
          {t("settings.security")}
        </h2>
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

        {isMobile && (
          <label className="mt-4 flex cursor-pointer items-center justify-between rounded-lg border border-ink-700 bg-ink-800 px-4 py-3">
            <span className="text-sm text-slate-300">
              Biometric app lock
              <span className="ml-1 block text-xs text-slate-500">
                Require Touch ID / Face ID / Android biometrics to open the app.
                The vault still uses its master password.
              </span>
            </span>
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-ink-600 bg-ink-800 accent-brand-500"
              checked={biometricLock}
              onChange={(e) =>
                void updateSettings({ biometricLock: e.target.checked })
              }
            />
          </label>
        )}

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
          <Terminal size={15} /> {t("settings.clients")}
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
          {t("settings.backup")}
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

        <div className="mt-5 border-t border-ink-800 pt-4">
          <h3 className="inline-flex items-center gap-2 text-sm font-medium text-slate-200">
            <RefreshCw size={14} /> Settings sync
          </h3>
          <p className="mt-1 text-sm text-slate-400">
            Point this at a file inside a folder you already sync (Syncthing,
            Dropbox, iCloud Drive, …) to move your non-secret settings between
            devices. Secrets never leave the vault.
          </p>
          {syncPath ? (
            <p className="mt-2 truncate font-mono text-xs text-slate-500">
              {syncPath}
            </p>
          ) : (
            <p className="mt-2 text-xs text-slate-500">No sync file chosen.</p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn-ghost" onClick={() => void chooseSyncFile()}>
              {syncPath ? "Change file" : "Choose file"}
            </button>
            <button
              className="btn-ghost"
              disabled={!syncPath}
              onClick={() => void syncPush()}
            >
              Push now
            </button>
            <button
              className="btn-ghost"
              disabled={!syncPath}
              onClick={() => void syncPull()}
            >
              Pull now
            </button>
          </div>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-slate-100">
          <KeyRound size={15} /> {t("settings.importCreds")}
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          Bring in logins from a password manager. Each entry with a host
          becomes a manual machine and its username/password is stored in the
          encrypted vault. Supported exports: Bitwarden (JSON), KeePass /
          1Password / generic (CSV).
        </p>
        <div className="mt-3 flex items-center gap-3">
          <button
            className="btn-ghost"
            disabled={!vaultUnlocked}
            onClick={() => void importCredentials()}
          >
            Import from file…
          </button>
          {!vaultUnlocked && (
            <span className="text-xs text-amber-400">
              Unlock the vault first.
            </span>
          )}
        </div>
      </section>

      <SnippetsSection />

      {vaultUnlocked && <TotpPanel />}

      {history.length > 0 && (
        <section className="card p-5">
          <h2 className="text-sm font-semibold text-slate-100">
            {t("settings.recent")}
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

function SnippetsSection() {
  const snippets = useStore((s) => s.settings.snippets);
  const addSnippet = useStore((s) => s.addSnippet);
  const removeSnippet = useStore((s) => s.removeSnippet);

  const [label, setLabel] = useState("");
  const [text, setText] = useState("");

  function add() {
    if (!text.trim()) return;
    void addSnippet(label || text.trim().split("\n")[0], text);
    setLabel("");
    setText("");
  }

  return (
    <section className="card p-5">
      <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-slate-100">
        <ClipboardList size={15} /> Command snippets
      </h2>
      <p className="mt-1 text-sm text-slate-400">
        Reusable commands you can paste as keystrokes into an SSH or Telnet
        session from the snippet button in its toolbar.
      </p>

      {snippets.length > 0 && (
        <ul className="mt-3 divide-y divide-ink-800">
          {snippets.map((sn) => (
            <li
              key={sn.id}
              className="flex items-start justify-between gap-3 py-2"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-200">
                  {sn.label}
                </div>
                <pre className="mt-0.5 truncate font-mono text-xs text-slate-500">
                  {sn.text}
                </pre>
              </div>
              <button
                className="btn-subtle p-1.5 text-slate-400 hover:text-red-300"
                onClick={() => void removeSnippet(sn.id)}
                aria-label="Delete snippet"
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 space-y-2">
        <input
          className="input"
          placeholder="Label (e.g. Tail nginx log)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <textarea
          className="input font-mono"
          rows={2}
          placeholder="Command text, e.g. sudo journalctl -u nginx -f"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button className="btn-ghost" disabled={!text.trim()} onClick={add}>
          <Plus size={15} /> Add snippet
        </button>
      </div>
    </section>
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
