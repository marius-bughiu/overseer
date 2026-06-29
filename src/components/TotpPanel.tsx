import { useCallback, useEffect, useState } from "react";
import { Check, Copy, KeyRound, Plus, Trash2 } from "lucide-react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";

import { generateTotp, isValidSecret } from "../lib/totp";
import { useStore } from "../lib/store";
import type { TotpAccount } from "../lib/types";
import { vault } from "../lib/vault";

interface LiveCode {
  code: string;
  secondsRemaining: number;
}

export function TotpPanel() {
  const pushToast = useStore((s) => s.pushToast);
  const [accounts, setAccounts] = useState<TotpAccount[]>([]);
  const [codes, setCodes] = useState<Record<string, LiveCode>>({});
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [secret, setSecret] = useState("");

  const refreshCodes = useCallback(async (list: TotpAccount[]) => {
    const next: Record<string, LiveCode> = {};
    await Promise.all(
      list.map(async (a) => {
        try {
          next[a.id] = await generateTotp(a.secret);
        } catch {
          next[a.id] = { code: "------", secondsRemaining: 0 };
        }
      }),
    );
    setCodes(next);
  }, []);

  useEffect(() => {
    let active = true;
    vault.getTotpAccounts().then((list) => {
      if (!active) return;
      setAccounts(list);
      void refreshCodes(list);
    });
    return () => {
      active = false;
    };
  }, [refreshCodes]);

  // Tick every second to refresh codes + countdown.
  useEffect(() => {
    const t = setInterval(() => void refreshCodes(accounts), 1000);
    return () => clearInterval(t);
  }, [accounts, refreshCodes]);

  async function persist(list: TotpAccount[]) {
    setAccounts(list);
    await vault.setTotpAccounts(list);
    await refreshCodes(list);
  }

  async function add() {
    if (!label.trim() || !isValidSecret(secret)) {
      pushToast("error", "Enter a label and a valid base32 secret.");
      return;
    }
    const account: TotpAccount = {
      id: crypto.randomUUID(),
      label: label.trim(),
      secret: secret.replace(/\s/g, ""),
    };
    await persist([...accounts, account]);
    setLabel("");
    setSecret("");
    setAdding(false);
  }

  async function remove(id: string) {
    await persist(accounts.filter((a) => a.id !== id));
  }

  async function copy(code: string) {
    try {
      await writeText(code);
      pushToast("success", "Code copied");
    } catch (e) {
      pushToast("error", String(e));
    }
  }

  return (
    <section className="card p-5">
      <div className="flex items-center justify-between">
        <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-slate-100">
          <KeyRound size={15} /> Authenticator (TOTP)
        </h2>
        <button className="btn-ghost" onClick={() => setAdding((a) => !a)}>
          <Plus size={15} /> Add
        </button>
      </div>
      <p className="mt-1 text-sm text-slate-400">
        Time-based 2FA codes, stored in your encrypted vault.
      </p>

      {adding && (
        <div className="mt-3 space-y-2 rounded-lg border border-ink-700 bg-ink-800 p-3">
          <input
            className="input"
            placeholder="Label (e.g. GitHub)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <input
            className="input font-mono"
            placeholder="Secret (base32)"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => setAdding(false)}>
              Cancel
            </button>
            <button className="btn-primary" onClick={() => void add()}>
              <Check size={15} /> Save
            </button>
          </div>
        </div>
      )}

      <ul className="mt-3 divide-y divide-ink-800">
        {accounts.length === 0 && !adding && (
          <li className="py-3 text-sm text-slate-500">No accounts yet.</li>
        )}
        {accounts.map((a) => {
          const live = codes[a.id];
          return (
            <li key={a.id} className="flex items-center justify-between py-2.5">
              <div className="min-w-0">
                <div className="truncate text-sm text-slate-200">{a.label}</div>
                <div className="font-mono text-lg tracking-widest text-brand-400">
                  {live
                    ? `${live.code.slice(0, 3)} ${live.code.slice(3)}`
                    : "···"}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {live && (
                  <span className="text-xs tabular-nums text-slate-500">
                    {live.secondsRemaining}s
                  </span>
                )}
                <button
                  className="btn-subtle p-1.5 text-slate-400"
                  onClick={() => live && void copy(live.code)}
                  title="Copy"
                >
                  <Copy size={14} />
                </button>
                <button
                  className="btn-subtle p-1.5 text-slate-400 hover:text-red-400"
                  onClick={() => void remove(a.id)}
                  title="Remove"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
