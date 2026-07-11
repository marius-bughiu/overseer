import { useState } from "react";
import { Activity, Copy, Laptop, MonitorPlay, Star, Trash2 } from "lucide-react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";

import { tcpPing } from "../lib/api";
import {
  osLabel,
  primaryAddress,
  recommendedProtocol,
  relativeTime,
} from "../lib/devices";
import { useStore } from "../lib/store";
import type { Device, Protocol } from "../lib/types";
import { OsIcon } from "./OsIcon";

const DEFAULT_PORT: Record<Protocol, number> = {
  rdp: 3389,
  vnc: 5900,
  ssh: 22,
  telnet: 23,
};

export function DeviceCard({
  device,
  onConnect,
  onRemove,
}: {
  device: Device;
  onConnect: (device: Device) => void;
  onRemove?: (deviceId: string) => void;
}) {
  const favorites = useStore((s) => s.settings.favorites);
  const toggleFavorite = useStore((s) => s.toggleFavorite);
  const pushToast = useStore((s) => s.pushToast);
  const isFavorite = favorites.includes(device.id);

  const address = primaryAddress(device);
  const seen = relativeTime(device.lastSeen);
  // Probe the port the recommended protocol for this machine's OS uses, so the
  // check matches what "Connect" would default to (e.g. VNC 5900 for a Mac).
  const probeProtocol = recommendedProtocol(device.os);
  const probePort = DEFAULT_PORT[probeProtocol];

  const [ping, setPing] = useState<"idle" | "pinging" | number | "down">(
    "idle",
  );

  async function copyAddress() {
    try {
      await writeText(address);
      pushToast("success", `Copied ${address}`);
    } catch (e) {
      pushToast("error", String(e));
    }
  }

  async function doPing() {
    setPing("pinging");
    try {
      const ms = await tcpPing(address, probePort);
      setPing(ms === null ? "down" : ms);
    } catch {
      setPing("down");
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
        <div className="flex shrink-0 items-center">
          <button
            className={`btn-subtle p-1.5 ${
              isFavorite ? "text-amber-400" : "text-slate-500"
            }`}
            onClick={() => void toggleFavorite(device.id)}
            aria-label={isFavorite ? "Remove favorite" : "Add favorite"}
            aria-pressed={isFavorite}
          >
            <Star size={16} fill={isFavorite ? "currentColor" : "none"} />
          </button>
          {device.source === "manual" && onRemove && (
            <button
              className="btn-subtle p-1.5 text-slate-500 hover:text-red-400"
              onClick={() => onRemove(device.id)}
              aria-label="Remove host"
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 rounded-lg bg-ink-900/60 px-2.5 py-1.5">
        <code className="truncate font-mono text-xs text-slate-400">
          {address}
        </code>
        <div className="flex shrink-0 items-center gap-1">
          {ping !== "idle" && (
            <span
              className={`text-[11px] tabular-nums ${
                ping === "down"
                  ? "text-red-400"
                  : ping === "pinging"
                    ? "text-slate-500"
                    : "text-emerald-400"
              }`}
              title={
                ping === "pinging"
                  ? `Checking ${probeProtocol.toUpperCase()} port ${probePort}…`
                  : ping === "down"
                    ? `${probeProtocol.toUpperCase()} port ${probePort} is not reachable`
                    : `${probeProtocol.toUpperCase()} port ${probePort} reachable in ${ping}ms`
              }
            >
              {ping === "pinging"
                ? "…"
                : ping === "down"
                  ? `${probePort} down`
                  : `${ping}ms`}
            </span>
          )}
          <button
            className="btn-subtle p-1 text-slate-500"
            onClick={() => void doPing()}
            aria-label="Ping device"
            title={`Check ${probeProtocol.toUpperCase()} port ${probePort} is reachable`}
          >
            <Activity size={14} />
          </button>
          <button
            className="btn-subtle p-1 text-slate-500"
            onClick={() => void copyAddress()}
            aria-label="Copy address"
          >
            <Copy size={14} />
          </button>
        </div>
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

      {device.isSelf ? (
        <button
          className="btn-ghost mt-auto w-full cursor-default text-slate-400"
          disabled
          title="You're connected from this machine"
        >
          <Laptop size={16} />
          This machine
        </button>
      ) : (
        <button
          className="btn-primary mt-auto w-full"
          onClick={() => onConnect(device)}
        >
          <MonitorPlay size={16} />
          Connect
        </button>
      )}
    </div>
  );
}
