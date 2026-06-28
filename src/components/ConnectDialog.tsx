import { FormEvent, useEffect, useState } from "react";
import { Loader2, MonitorPlay, Save } from "lucide-react";

import { launchConnection } from "../lib/api";
import { primaryAddress } from "../lib/devices";
import { useStore } from "../lib/store";
import type { Device, Protocol } from "../lib/types";
import { vault } from "../lib/vault";
import { Modal } from "./Modal";
import { VaultGate } from "./VaultGate";

const DEFAULT_PORT: Record<Protocol, number> = { rdp: 3389, vnc: 5900 };

export function ConnectDialog({
  device,
  onClose,
}: {
  device: Device;
  onClose: () => void;
}) {
  const preferred = useStore((s) => s.settings.preferredProtocol);
  const updateSettings = useStore((s) => s.updateSettings);
  const vaultUnlocked = useStore((s) => s.vaultUnlocked);
  const pushToast = useStore((s) => s.pushToast);

  const [protocol, setProtocol] = useState<Protocol>(preferred);
  const [host, setHost] = useState(primaryAddress(device));
  const [port, setPort] = useState<number>(DEFAULT_PORT[preferred]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [saveCreds, setSaveCreds] = useState(false);
  const [busy, setBusy] = useState(false);
  const [gateOpen, setGateOpen] = useState(false);

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
          <div className="grid grid-cols-2 gap-2">
            {(["rdp", "vnc"] as Protocol[]).map((p) => (
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
      </form>
    </Modal>
  );
}
