import { useMemo, useState } from "react";
import {
  Loader2,
  Plus,
  RefreshCw,
  Search,
  ServerCrash,
  SignalHigh,
} from "lucide-react";

import { manualToDevices } from "../lib/devices";
import { filterDevices, useStore, type DeviceFilter } from "../lib/store";
import type { Device } from "../lib/types";
import { DeviceCard } from "./DeviceCard";
import { Modal } from "./Modal";

const FILTERS: { id: DeviceFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "online", label: "Online" },
  { id: "favorites", label: "Favorites" },
];

export function DeviceList() {
  const loading = useStore((s) => s.loading);
  const error = useStore((s) => s.error);
  const search = useStore((s) => s.search);
  const filter = useStore((s) => s.filter);
  const setSearch = useStore((s) => s.setSearch);
  const setFilter = useStore((s) => s.setFilter);
  const refresh = useStore((s) => s.refresh);
  const discovered = useStore((s) => s.devices);
  const manualHosts = useStore((s) => s.settings.manualHosts);
  const favorites = useStore((s) => s.settings.favorites);
  const groups = useStore((s) => s.settings.groups);

  const devices = useMemo(
    () => [...manualToDevices(manualHosts), ...discovered],
    [manualHosts, discovered],
  );
  const total = devices.length;
  const onlineCount = useMemo(
    () => devices.filter((d) => d.online).length,
    [devices],
  );
  const visible = useMemo(
    () => filterDevices(devices, search, filter, favorites),
    [devices, search, filter, favorites],
  );

  // Group visible devices into folders when any folders are defined.
  const setConnectTarget = useStore((s) => s.setConnectTarget);
  const addManualHost = useStore((s) => s.addManualHost);
  const removeManualHost = useStore((s) => s.removeManualHost);

  const [addOpen, setAddOpen] = useState(false);
  const [hostName, setHostName] = useState("");
  const [hostAddr, setHostAddr] = useState("");

  async function submitHost() {
    if (!hostAddr.trim()) return;
    await addManualHost(hostName, hostAddr);
    setHostName("");
    setHostAddr("");
    setAddOpen(false);
  }

  const grouped = useMemo(() => {
    const hasGroups = Object.keys(groups).length > 0;
    if (!hasGroups) return null;
    const map = new Map<string, Device[]>();
    for (const d of visible) {
      const key = groups[d.id] ?? "Ungrouped";
      (map.get(key) ?? map.set(key, []).get(key)!).push(d);
    }
    return [...map.entries()].sort(([a], [b]) => {
      if (a === "Ungrouped") return 1;
      if (b === "Ungrouped") return -1;
      return a.localeCompare(b);
    });
  }, [visible, groups]);

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 border-b border-ink-800 p-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
          />
          <input
            className="input pl-9"
            placeholder="Search machines, IPs, tags…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-ink-700 bg-ink-850 p-0.5">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                  filter === f.id
                    ? "bg-brand-600 text-white"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <button
            className="btn-ghost"
            onClick={() => setAddOpen(true)}
            aria-label="Add host"
          >
            <Plus size={16} />
            <span className="hidden sm:inline">Add host</span>
          </button>
          <button
            className="btn-ghost"
            onClick={() => void refresh()}
            disabled={loading}
            aria-label="Refresh devices"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* Status strip */}
      <div className="flex items-center gap-3 px-4 py-2 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <SignalHigh size={13} className="text-emerald-400" />
          {onlineCount} online
        </span>
        <span>·</span>
        <span>{total} total</span>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 pt-0">
        {loading && total === 0 ? (
          <CenteredState>
            <Loader2 size={28} className="animate-spin text-brand-400" />
            <p className="mt-3 text-sm text-slate-400">Discovering machines…</p>
          </CenteredState>
        ) : error && total === 0 ? (
          <CenteredState>
            <ServerCrash size={30} className="text-red-400" />
            <p className="mt-3 max-w-sm text-sm text-slate-400">{error}</p>
            <button className="btn-ghost mt-4" onClick={() => void refresh()}>
              <RefreshCw size={16} /> Try again
            </button>
          </CenteredState>
        ) : visible.length === 0 ? (
          <CenteredState>
            <p className="text-sm text-slate-400">
              {total === 0
                ? "No machines found yet. Configure discovery in Settings, then refresh."
                : "No machines match your search or filter."}
            </p>
          </CenteredState>
        ) : grouped ? (
          <div className="space-y-6">
            {grouped.map(([name, items]) => (
              <section key={name}>
                <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {name}
                  <span className="text-slate-600">({items.length})</span>
                </h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {items.map((device) => (
                    <DeviceCard
                      key={device.id}
                      device={device}
                      onConnect={setConnectTarget}
                      onRemove={removeManualHost}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visible.map((device) => (
              <DeviceCard
                key={device.id}
                device={device}
                onConnect={setConnectTarget}
                onRemove={removeManualHost}
              />
            ))}
          </div>
        )}
      </div>

      {addOpen && (
        <Modal
          title="Add a host"
          subtitle="Connect to a machine that isn't on your tailnet."
          onClose={() => setAddOpen(false)}
          footer={
            <>
              <button className="btn-ghost" onClick={() => setAddOpen(false)}>
                Cancel
              </button>
              <button className="btn-primary" onClick={() => void submitHost()}>
                Add host
              </button>
            </>
          }
        >
          <div className="space-y-3">
            <div>
              <label className="label" htmlFor="hn">
                Name <span className="text-slate-500">(optional)</span>
              </label>
              <input
                id="hn"
                className="input"
                value={hostName}
                onChange={(e) => setHostName(e.target.value)}
                placeholder="My server"
              />
            </div>
            <div>
              <label className="label" htmlFor="ha">
                Host / IP
              </label>
              <input
                id="ha"
                className="input font-mono"
                value={hostAddr}
                onChange={(e) => setHostAddr(e.target.value)}
                placeholder="192.168.1.50 or host.example.com"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submitHost();
                }}
              />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function CenteredState({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-[40vh] flex-col items-center justify-center text-center">
      {children}
    </div>
  );
}
