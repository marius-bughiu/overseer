import { useCallback, useEffect, useState } from "react";
import { Fingerprint, Loader2 } from "lucide-react";

import { requestBiometric } from "../lib/biometric";

/**
 * Full-screen biometric gate shown on mobile when "Biometric app lock" is on.
 * It prompts on mount and offers a retry; on success it calls `onUnlock`.
 * This gates app access — the vault still needs its master password.
 */
export function BiometricLock({ onUnlock }: { onUnlock: () => void }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const prompt = useCallback(async () => {
    setBusy(true);
    setFailed(false);
    const ok = await requestBiometric("Unlock Overseer");
    setBusy(false);
    if (ok) onUnlock();
    else setFailed(true);
  }, [onUnlock]);

  useEffect(() => {
    void prompt();
  }, [prompt]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-ink-950 p-6 text-center">
      <div className="grid h-16 w-16 place-items-center rounded-2xl bg-brand-600/15 text-brand-400">
        <Fingerprint size={32} />
      </div>
      <div>
        <h1 className="text-base font-semibold text-slate-100">
          Overseer is locked
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          {failed
            ? "Authentication was cancelled or failed."
            : "Authenticate to continue."}
        </p>
      </div>
      <button
        className="btn-primary"
        disabled={busy}
        onClick={() => void prompt()}
      >
        {busy ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <Fingerprint size={16} />
        )}
        Unlock
      </button>
    </div>
  );
}
