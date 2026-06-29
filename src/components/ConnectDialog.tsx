import { FormEvent, useEffect, useState } from "react";
import {
  ExternalLink,
  FolderOpen,
  Loader2,
  MonitorPlay,
  Power,
  Save,
} from "lucide-react";

import { launchConnection, portScan } from "../lib/api";
import { primaryAddress } from "../lib/devices";
import { useStore } from "../lib/store";
import type { Device, Protocol } from "../lib/types";
import { vault } from "../lib/vault";
import { Modal } from "./Modal";
import { VaultGate } from "./VaultGate";

const DEFAULT_PORT: Record<Protocol, number> = {
  rdp: 3389,
  vnc: 5900,
  ssh: 22,
  telnet: 23,
};

/** All protocols can now render in an embedded, in-app tab. */
const EMBEDDABLE: Protocol[] = ["rdp", "vnc", "ssh", "telnet"];

/** Selectable RDP desktop resolutions for embedded sessions. */
const RESOLUTIONS: { label: string; width: number; height: number }[] = [
  { label: "1280 × 800", width: 1280, height: 800 },
  { label: "1366 × 768", width: 1366, height: 768 },
  { label: "1600 × 900", width: 1600, height: 900 },
  { label: "1920 × 1080", width: 1920, height: 1080 },
  { label: "2560 × 1440", width: 2560, height: 1440 },
];

const DEFAULT_RES = RESOLUTIONS[0];

type Mode = "app" | "external";

export function ConnectDialog({
  device,
  onClose,
}: {
  device: Device;
  onClose: () => void;
}) {
  const preferred = useStore((s) => s.settings.preferredProtocol);
  const profile = useStore((s) => s.settings.profiles[device.id]);
  const savedMac = useStore((s) => s.settings.deviceMacs[device.id] ?? "");
  const savedGroup = useStore((s) => s.settings.groups[device.id] ?? "");
  const updateSettings = useStore((s) => s.updateSettings);
  const vaultUnlocked = useStore((s) => s.vaultUnlocked);
  const pushToast = useStore((s) => s.pushToast);
  const openSession = useStore((s) => s.openSession);
  const openFiles = useStore((s) => s.openFiles);
  const setProfile = useStore((s) => s.setProfile);
  const setDeviceMac = useStore((s) => s.setDeviceMac);
  const setGroup = useStore((s) => s.setGroup);
  const recordHistory = useStore((s) => s.recordHistory);
  const wake = useStore((s) => s.wake);

  const initialProtocol = profile?.protocol ?? preferred;
  const [protocol, setProtocol] = useState<Protocol>(initialProtocol);
  const [host, setHost] = useState(primaryAddress(device));
  const [port, setPort] = useState<number>(
    profile?.port ?? DEFAULT_PORT[initialProtocol],
  );
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [saveCreds, setSaveCreds] = useState(false);
  const [busy, setBusy] = useState(false);
  const [gateOpen, setGateOpen] = useState(false);
  const [mode, setMode] = useState<Mode>(profile?.mode ?? "app");
  const [mac, setMac] = useState(savedMac);
  const [group, setGroupValue] = useState(savedGroup);
  const [scanning, setScanning] = useState(false);
  const [openPorts, setOpenPorts] = useState<number[]>([]);
  const [keyPath, setKeyPath] = useState("");
  const [width, setWidth] = useState<number>(
    profile?.width ?? DEFAULT_RES.width,
  );
  const [height, setHeight] = useState<number>(
    profile?.height ?? DEFAULT_RES.height,
  );

  async function pickKey() {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const picked = await open({ multiple: false });
    if (typeof picked === "string") setKeyPath(picked);
  }

  async function scanPorts() {
    setScanning(true);
    try {
      setOpenPorts(await portScan(host.trim()));
    } catch (err) {
      pushToast("error", String(err));
    } finally {
      setScanning(false);
    }
  }

  const embeddable = EMBEDDABLE.includes(protocol);
  const effectiveMode: Mode = embeddable ? mode : "external";

  // Prefill from a stored credential when the vault is open.
  useEffect(() => {
    let cancelled = false;
    if (!vaultUnlocked) return;
    vault.getCredential(device.id).then((cred) => {
      if (cancelled || !cred) return;
      setUsername(cred.username ?? "");
      setPassword(cred.password ?? "");
      if (cred.port) setPort(cred.port);
      setSaveCreds(true);
    });
    return () => {
      cancelled = true;
    };
  }, [device.id, vaultUnlocked]);

  function changeProtocol(p: Protocol) {
    // Only reset the port if it was still on the previous protocol default.
    setPort((prev) =>
      prev === DEFAULT_PORT[protocol] ? DEFAULT_PORT[p] : prev,
    );
    setProtocol(p);
  }

  async function doConnect() {
    setBusy(true);
    try {
      if (saveCreds && username) {
        if (!vaultUnlocked) {
          setGateOpen(true);
          setBusy(false);
          return;
        }
        await vault.setCredential(device.id, { username, password, port });
      }
      await updateSettings({ preferredProtocol: protocol });
      // Remember this device's connection profile, folder and history.
      await setProfile(device.id, {
        protocol,
        mode: effectiveMode,
        port,
        width: protocol === "rdp" ? width : (profile?.width ?? null),
        height: protocol === "rdp" ? height : (profile?.height ?? null),
      });
      if (group !== savedGroup) await setGroup(device.id, group);
      await recordHistory(device, protocol);

      if (effectiveMode === "app") {
        // Embedded, in-app session (tabbed).
        await openSession({
          title: device.name,
          protocol,
          host: host.trim(),
          port,
          username: username.trim() || null,
          password: password || null,
          keyPath: protocol === "ssh" ? keyPath || null : null,
          width: protocol === "rdp" ? width : null,
          height: protocol === "rdp" ? height : null,
        });
        onClose();
        return;
      }

      // External client launch.
      const status = await launchConnection({
        protocol,
        host: host.trim(),
        port,
        username: username.trim() || null,
        label: `${device.name}-${protocol}`,
      });
      pushToast("success", status);
      onClose();
    } catch (err) {
      pushToast("error", String(err));
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void doConnect();
  }

  async function browseFiles() {
    setBusy(true);
    try {
      await openFiles({
        title: device.name,
        protocol: "ssh",
        host: host.trim(),
        port: protocol === "ssh" ? port : 22,
        username: username.trim() || null,
        password: password || null,
        keyPath: keyPath || null,
      });
      onClose();
    } catch (err) {
      pushToast("error", String(err));
    } finally {
      setBusy(false);
    }
  }

  if (gateOpen) {
    return (
      <VaultGate
        reason="Unlock your vault to save these credentials securely."
        onClose={() => {
          setGateOpen(false);
          // Retry the connect now that the vault may be unlocked.
          void doConnect();
        }}
      />
    );
  }

  return (
    <Modal
      title={`Connect to ${device.name}`}
      subtitle={device.dnsName || device.id}
      onClose={onClose}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          {protocol === "ssh" && (
            <button
              className="btn-ghost"
              onClick={() => void browseFiles()}
              disabled={busy}
              title="Open an SFTP file browser"
            >
              <FolderOpen size={15} /> Files
            </button>
          )}
          <button
            className="btn-primary"
            onClick={() => void doConnect()}
            disabled={busy}
          >
            {busy ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <MonitorPlay size={16} />
            )}
            Connect
          </button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <span className="label">Protocol</span>
          <div className="grid grid-cols-4 gap-2">
            {(["rdp", "vnc", "ssh", "telnet"] as Protocol[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => changeProtocol(p)}
                className={`btn ${
                  protocol === p
                    ? "bg-brand-600 text-white"
                    : "bg-ink-800 text-slate-300 border border-ink-700 hover:bg-ink-700"
                }`}
              >
                {p.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="label">Open</span>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={!embeddable}
              onClick={() => setMode("app")}
              className={`btn ${
                effectiveMode === "app"
                  ? "bg-accent-600 text-white"
                  : "bg-ink-800 text-slate-300 border border-ink-700 hover:bg-ink-700"
              } disabled:cursor-not-allowed disabled:opacity-50`}
            >
              <MonitorPlay size={15} /> In app
            </button>
            <button
              type="button"
              onClick={() => setMode("external")}
              className={`btn ${
                effectiveMode === "external"
                  ? "bg-accent-600 text-white"
                  : "bg-ink-800 text-slate-300 border border-ink-700 hover:bg-ink-700"
              }`}
            >
              <ExternalLink size={15} /> External
            </button>
          </div>
          <p className="mt-1.5 text-xs text-slate-500">
            In app renders the session inside Overseer in a tab. External hands
            it to your system client.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2">
            <label className="label" htmlFor="host">
              Host / IP
            </label>
            <input
              id="host"
              className="input font-mono"
              value={host}
              onChange={(e) => setHost(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="port">
              Port
            </label>
            <input
              id="port"
              type="number"
              min={1}
              max={65535}
              className="input"
              value={port}
              onChange={(e) => setPort(Number(e.target.value))}
            />
          </div>
        </div>

        <div>
          <button
            type="button"
            className="text-xs text-brand-400 hover:underline disabled:opacity-50"
            disabled={scanning}
            onClick={() => void scanPorts()}
          >
            {scanning ? "Scanning…" : "Scan open ports"}
          </button>
          {openPorts.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {openPorts.map((p) => (
                <button
                  key={p}
                  type="button"
                  className="chip hover:border-brand-600"
                  onClick={() => setPort(p)}
                >
                  {p}
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className="label" htmlFor="username">
            Username <span className="text-slate-500">(optional)</span>
          </label>
          <input
            id="username"
            className="input"
            autoComplete="off"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder={protocol === "rdp" ? "Administrator" : "user"}
          />
        </div>

        <div>
          <label className="label" htmlFor="password">
            Password <span className="text-slate-500">(stored encrypted)</span>
          </label>
          <input
            id="password"
            type="password"
            className="input"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
          <p className="mt-1.5 text-xs text-slate-500">
            Passwords are saved only in your encrypted vault. They are never put
            in the launched URI or <code>.rdp</code> file — your remote desktop
            client will prompt for them.
          </p>
        </div>

        {protocol === "rdp" && effectiveMode === "app" && (
          <div>
            <label className="label" htmlFor="resolution">
              Resolution
            </label>
            <select
              id="resolution"
              className="input"
              value={`${width}x${height}`}
              onChange={(e) => {
                const [w, h] = e.target.value.split("x").map(Number);
                setWidth(w);
                setHeight(h);
              }}
            >
              {RESOLUTIONS.map((r) => (
                <option key={r.label} value={`${r.width}x${r.height}`}>
                  {r.label}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-slate-500">
              The remote desktop is negotiated at this size and scaled to fit
              the session tab.
            </p>
          </div>
        )}

        {protocol === "ssh" && effectiveMode === "app" && (
          <div>
            <label className="label" htmlFor="keypath">
              SSH private key <span className="text-slate-500">(optional)</span>
            </label>
            <div className="flex gap-2">
              <input
                id="keypath"
                className="input font-mono"
                value={keyPath}
                onChange={(e) => setKeyPath(e.target.value)}
                placeholder="~/.ssh/id_ed25519"
              />
              <button
                type="button"
                className="btn-ghost shrink-0"
                onClick={() => void pickKey()}
              >
                Browse
              </button>
            </div>
            <p className="mt-1.5 text-xs text-slate-500">
              If set, key auth is used; the password field becomes the key
              passphrase.
            </p>
          </div>
        )}

        <label className="flex cursor-pointer items-center gap-2.5 text-sm text-slate-300">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-ink-600 bg-ink-800 accent-brand-500"
            checked={saveCreds}
            onChange={(e) => setSaveCreds(e.target.checked)}
          />
          <Save size={15} className="text-slate-400" />
          Remember these credentials for {device.name}
        </label>

        <div>
          <label className="label" htmlFor="folder">
            Folder <span className="text-slate-500">(optional)</span>
          </label>
          <input
            id="folder"
            className="input"
            value={group}
            onChange={(e) => setGroupValue(e.target.value)}
            placeholder="e.g. Work, Home lab"
          />
        </div>

        <div>
          <label className="label" htmlFor="mac">
            Wake-on-LAN
          </label>
          <div className="flex gap-2">
            <input
              id="mac"
              className="input font-mono"
              value={mac}
              onChange={(e) => setMac(e.target.value)}
              placeholder="AA:BB:CC:DD:EE:FF"
            />
            <button
              type="button"
              className="btn-ghost shrink-0"
              disabled={!mac.trim()}
              onClick={() => {
                void setDeviceMac(device.id, mac);
                void wake(device.id, mac.trim());
              }}
            >
              <Power size={15} /> Wake
            </button>
          </div>
          <p className="mt-1.5 text-xs text-slate-500">
            Sent over your network (and any tailnet subnet router) to power on a
            sleeping machine.
          </p>
        </div>
      </form>
    </Modal>
  );
}
