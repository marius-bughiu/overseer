import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";

import { useStore } from "../lib/store";

const ICONS = {
  info: Info,
  error: AlertTriangle,
  success: CheckCircle2,
} as const;

const STYLES = {
  info: "border-brand-700 bg-ink-800 text-slate-200",
  error: "border-red-700/60 bg-red-950/40 text-red-200",
  success: "border-emerald-700/60 bg-emerald-950/40 text-emerald-200",
} as const;

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4">
      {toasts.map((t) => {
        const Icon = ICONS[t.kind];
        return (
          <div
            key={t.id}
            className={`pointer-events-auto flex w-full max-w-md items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm shadow-glow ${STYLES[t.kind]}`}
          >
            <Icon size={16} className="mt-0.5 shrink-0" />
            <span className="flex-1 break-words">{t.message}</span>
            <button
              className="shrink-0 opacity-70 hover:opacity-100"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
            >
              <X size={15} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
