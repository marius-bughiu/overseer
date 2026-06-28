import { FormEvent, useState } from "react";
import { KeyRound, Loader2, ShieldCheck } from "lucide-react";

import { useStore } from "../lib/store";
import { Modal } from "./Modal";

/**
 * Prompts the user for their master password and unlocks the encrypted vault.
 * Shown whenever an action needs a secret (the API token or a stored
 * credential) but the vault is still locked.
 */
export function VaultGate({
  reason,
  onClose,
}: {
  reason?: string;
  onClose: () => void;
}) {
  const unlockVault = useStore((s) => s.unlockVault);
  const pushToast = useStore((s) => s.pushToast);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!password) return;
    setBusy(true);
    try {
      await unlockVault(password);
      pushToast("success", "Vault unlocked.");
      onClose();
    } catch (err) {
      pushToast("error", `Could not unlock vault: ${String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Unlock your vault"
      subtitle={
        reason ?? "Enter your master password to access stored secrets."
      }
      onClose={onClose}
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="flex items-start gap-3 rounded-lg border border-ink-700 bg-ink-800 p-3 text-sm text-slate-400">
          <ShieldCheck size={18} className="mt-0.5 shrink-0 text-brand-400" />
          <p>
            Secrets are encrypted at rest with a key derived from this password.
            The password is never stored — if you forget it, the vault must be
            reset.
          </p>
        </div>
        <div>
          <label className="label" htmlFor="master-password">
            Master password
          </label>
          <div className="relative">
            <KeyRound
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
            />
            <input
              id="master-password"
              type="password"
              autoFocus
              className="input pl-9"
              placeholder="••••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        </div>
        <button
          type="submit"
          className="btn-primary w-full"
          disabled={busy || !password}
        >
          {busy ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <KeyRound size={16} />
          )}
          Unlock vault
        </button>
      </form>
    </Modal>
  );
}
