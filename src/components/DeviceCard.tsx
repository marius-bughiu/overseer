import { Copy, MonitorPlay, Star } from "lucide-react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";

import { osLabel, primaryAddress, relativeTime } from "../lib/devices";
import { useStore } from "../lib/store";
import type { Device } from "../lib/types";
import { OsIcon } from "./OsIcon";

export function DeviceCard({
  device,
  onConnect,
}: {
  device: Device;
  onConnect: (device: Device) => void;
}) {
  const favorites = useStore((s) => s.settings.favorites);
  const toggleFavorite = useStore((s) => s.toggleFavorite);
  const pushToast = useStore((s) => s.pushToast);
  const isFavorite = favorites.includes(device.id);

  const address = primaryAddress(device);
  const seen = relativeTime(device.lastSeen);

  async function copyAddress() {
    try {
      await writeText(address);
      pushToast("success", `Copied ${address}`);
    } catch (e) {
      pushToast("error", String(e));
    }
  }

  return (
    <div className="card group flex flex-col gap-3 p-4 transition-colors hover:border-brand-700">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${
              device.online
                ? "bg-brand-600/15 text-brand-400"
                : "bg-ink-800 text-slate-500"
            }`}
          >
            <OsIcon os={device.os} />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="truncate font-medium text-slate-100">
                {device.name}
              </h3>
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${
                  device.online ? "bg-emerald-400" : "bg-slate-600"
                }`}
                title={device.online ? "Online" : "Offline"}
              />
            </div>
            <p className="truncate text-xs text-slate-500">
              {osLabel(device.os)}
              {seen && !device.online ? ` · seen ${seen}` : ""}
            </p>
          </div>
        </div>
        <button
          className={`btn-subtle shrink-0 p-1.5 ${
            isFavorite ? "text-amber-400" : "text-slate-500"
          }`}
          onClick={() => void toggleFavorite(device.id)}
          aria-label={isFavorite ? "Remove favorite" : "Add favorite"}
          aria-pressed={isFavorite}
        >
          <Star size={16} fill={isFavorite ? "currentColor" : "none"} />
        </button>
      </div>

      <div className="flex items-center justify-between gap-2 rounded-lg bg-ink-900/60 px-2.5 py-1.5">
        <code className="truncate font-mono text-xs text-slate-400">
          {address}
        </code>
        <button
          className="btn-subtle shrink-0 p-1 text-slate-500"
          onClick={() => void copyAddress()}
          aria-label="Copy address"
        >
          <Copy size={14} />
        </button>
      </div>

      {device.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {device.tags.map((tag) => (
            <span key={tag} className="chip">
              {tag.replace(/^tag:/, "")}
            </span>
          ))}
        </div>
      )}

      <button
        className="btn-primary mt-auto w-full"
        onClick={() => onConnect(device)}
      >
        <MonitorPlay size={16} />
        Connect
      </button>
    </div>
  );
}
