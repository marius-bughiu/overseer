import { create } from "zustand";

import {
  open as openDialog,
  save as saveDialog,
} from "@tauri-apps/plugin-dialog";

import {
  discoverDevices,
  exportSettingsFile,
  hostPlatform,
  importSettingsFile,
  loadSettings,
  openRdpSession,
  openSshSession,
  openVncSession,
  saveSettings,
  sftp,
  tailscaleCliAvailable,
  wakeOnLan,
} from "./api";
import { vault } from "./vault";
import {
  DEFAULT_SETTINGS,
  type ConnectionProfile,
  type Device,
  type Protocol,
  type SessionTab,
  type Settings,
  type Theme,
} from "./types";

/** Apply the theme by toggling the root `light` class (see index.css). */
export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("light", theme === "light");
}

const TOKEN_SECRET = "tailscale_api_token";

export type Platform = "android" | "ios" | "windows" | "macos" | "linux";
export type View = "devices" | "settings" | "about";
export type DeviceFilter = "all" | "online" | "favorites";

/** Parameters for opening an embedded (in-app) session. */
export interface OpenSessionArgs {
  title: string;
  protocol: Protocol;
  host: string;
  port: number;
  username?: string | null;
  password?: string | null;
}

export interface Toast {
  id: number;
  kind: "info" | "error" | "success";
  message: string;
}

interface AppStore {
  // --- data ---
  devices: Device[];
  loading: boolean;
  error: string | null;
  lastRefreshed: number | null;

  // --- environment ---
  platform: Platform;
  cliAvailable: boolean;

  // --- settings + secrets ---
  settings: Settings;
  apiToken: string; // in-memory only; the source of truth is the vault
  vaultUnlocked: boolean;

  // --- ui ---
  view: View;
  search: string;
  filter: DeviceFilter;
  toasts: Toast[];

  // --- embedded sessions ---
  sessions: SessionTab[];
  /** "devices" (home) or a session id. */
  activeTab: string;

  // --- ui: connect dialog + command palette ---
  /** Device the connect dialog is open for (null = closed). */
  connectTarget: Device | null;
  /** Whether the command palette is open. */
  paletteOpen: boolean;

  // --- actions ---
  init: () => Promise<void>;
  refresh: () => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  unlockVault: (password: string) => Promise<void>;
  lockVault: () => void;
  setApiToken: (token: string) => Promise<void>;
  toggleFavorite: (deviceId: string) => Promise<void>;
  setView: (view: View) => void;
  setSearch: (search: string) => void;
  setFilter: (filter: DeviceFilter) => void;
  setTheme: (theme: Theme) => Promise<void>;
  setConnectTarget: (device: Device | null) => void;
  setPaletteOpen: (open: boolean) => void;
  exportSettings: () => Promise<void>;
  importSettings: () => Promise<void>;
  pushToast: (kind: Toast["kind"], message: string) => void;
  dismissToast: (id: number) => void;

  // embedded sessions
  openSession: (args: OpenSessionArgs) => Promise<void>;
  openFiles: (args: OpenSessionArgs) => Promise<void>;
  closeSession: (id: string) => void;
  setActiveTab: (id: string) => void;
  updateSession: (id: string, patch: Partial<SessionTab>) => void;

  // per-device settings & extras
  setDeviceMac: (deviceId: string, mac: string) => Promise<void>;
  setProfile: (deviceId: string, profile: ConnectionProfile) => Promise<void>;
  setGroup: (deviceId: string, group: string) => Promise<void>;
  recordHistory: (device: Device, protocol: Protocol) => Promise<void>;
  wake: (deviceId: string, mac: string, broadcast?: string) => Promise<void>;
}

let sessionSeq = 0;

let toastSeq = 0;

export const useStore = create<AppStore>((set, get) => ({
  devices: [],
  loading: false,
  error: null,
  lastRefreshed: null,

  platform: "linux",
  cliAvailable: false,

  settings: DEFAULT_SETTINGS,
  apiToken: "",
  vaultUnlocked: false,

  view: "devices",
  search: "",
  filter: "all",
  toasts: [],

  sessions: [],
  activeTab: "devices",
  connectTarget: null,
  paletteOpen: false,

  async init() {
    try {
      const [platform, cliAvailable, persisted] = await Promise.all([
        hostPlatform(),
        tailscaleCliAvailable(),
        loadSettings(),
      ]);
      const settings = { ...DEFAULT_SETTINGS, ...(persisted ?? {}) };
      applyTheme(settings.theme);
      set({ platform, cliAvailable, settings });
    } catch (e) {
      get().pushToast("error", `Startup failed: ${String(e)}`);
    }
  },

  async setTheme(theme) {
    applyTheme(theme);
    await get().updateSettings({ theme });
  },

  async refresh() {
    const { settings, apiToken } = get();
    set({ loading: true, error: null });
    try {
      const devices = await discoverDevices({
        method: settings.discoveryMethod,
        token: apiToken || null,
        tailnet: settings.tailnet,
      });
      set({ devices, loading: false, lastRefreshed: Date.now() });
    } catch (e) {
      set({ loading: false, error: String(e) });
      get().pushToast("error", String(e));
    }
  },

  async updateSettings(patch) {
    const next = { ...get().settings, ...patch };
    set({ settings: next });
    try {
      await saveSettings(next);
    } catch (e) {
      get().pushToast("error", `Could not save settings: ${String(e)}`);
    }
  },

  async unlockVault(password) {
    await vault.unlock(password);
    const token = (await vault.getSecret(TOKEN_SECRET)) ?? "";
    set({ vaultUnlocked: true, apiToken: token });
  },

  lockVault() {
    vault.lock();
    set({ vaultUnlocked: false, apiToken: "" });
  },

  async setApiToken(token) {
    set({ apiToken: token });
    if (get().vaultUnlocked) {
      await vault.setSecret(TOKEN_SECRET, token);
    }
  },

  async toggleFavorite(deviceId) {
    const favorites = get().settings.favorites;
    const next = favorites.includes(deviceId)
      ? favorites.filter((id) => id !== deviceId)
      : [...favorites, deviceId];
    await get().updateSettings({ favorites: next });
  },

  setView: (view) => set({ view }),
  setSearch: (search) => set({ search }),
  setFilter: (filter) => set({ filter }),
  setConnectTarget: (connectTarget) => set({ connectTarget }),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),

  async exportSettings() {
    try {
      const path = await saveDialog({ defaultPath: "overseer-settings.json" });
      if (!path) return;
      await exportSettingsFile(path, JSON.stringify(get().settings, null, 2));
      get().pushToast("success", "Settings exported.");
    } catch (e) {
      get().pushToast("error", `Export failed: ${String(e)}`);
    }
  },

  async importSettings() {
    try {
      const path = await openDialog({ multiple: false });
      if (!path || typeof path !== "string") return;
      const json = await importSettingsFile(path);
      const incoming = JSON.parse(json) as Partial<Settings>;
      const next = { ...DEFAULT_SETTINGS, ...get().settings, ...incoming };
      applyTheme(next.theme);
      set({ settings: next });
      await saveSettings(next);
      get().pushToast("success", "Settings imported.");
    } catch (e) {
      get().pushToast("error", `Import failed: ${String(e)}`);
    }
  },

  pushToast(kind, message) {
    const toast: Toast = { id: ++toastSeq, kind, message };
    set({ toasts: [...get().toasts, toast] });
    // Auto-dismiss after a few seconds.
    setTimeout(() => get().dismissToast(toast.id), 5000);
  },

  dismissToast(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  },

  async openSession(args) {
    const id = `session-${++sessionSeq}`;
    const tab: SessionTab = {
      id,
      title: args.title,
      protocol: args.protocol,
      kind: "screen",
      host: args.host,
      port: args.port,
      username: args.username ?? null,
      password: args.password ?? null,
      status: "connecting",
    };
    set({ sessions: [...get().sessions, tab], activeTab: id });

    try {
      let wsUrl: string;
      if (args.protocol === "vnc") {
        wsUrl = await openVncSession(args.host, args.port);
      } else if (args.protocol === "ssh") {
        wsUrl = await openSshSession({
          host: args.host,
          port: args.port,
          username: args.username ?? "",
          password: args.password ?? "",
          cols: 80,
          rows: 24,
        });
      } else if (args.protocol === "rdp") {
        wsUrl = await openRdpSession({
          host: args.host,
          port: args.port,
          username: args.username ?? "",
          password: args.password ?? "",
          width: 1280,
          height: 800,
        });
      } else {
        throw new Error(`${args.protocol} cannot be embedded yet`);
      }
      get().updateSession(id, { wsUrl, status: "open" });
    } catch (e) {
      get().updateSession(id, { status: "error", error: String(e) });
      get().pushToast("error", `Could not open session: ${String(e)}`);
    }
  },

  async openFiles(args) {
    const id = `session-${++sessionSeq}`;
    const tab: SessionTab = {
      id,
      title: `${args.title} · files`,
      protocol: "ssh",
      kind: "files",
      host: args.host,
      port: args.port,
      username: args.username ?? null,
      password: args.password ?? null,
      status: "connecting",
    };
    set({ sessions: [...get().sessions, tab], activeTab: id });
    try {
      const sftpId = await sftp.connect({
        host: args.host,
        port: args.port,
        username: args.username ?? "",
        password: args.password ?? "",
      });
      get().updateSession(id, { sftpId, status: "open" });
    } catch (e) {
      get().updateSession(id, { status: "error", error: String(e) });
      get().pushToast("error", `Could not open files: ${String(e)}`);
    }
  },

  closeSession(id) {
    const session = get().sessions.find((s) => s.id === id);
    if (session?.sftpId) void sftp.disconnect(session.sftpId);
    const remaining = get().sessions.filter((s) => s.id !== id);
    const wasActive = get().activeTab === id;
    set({
      sessions: remaining,
      activeTab: wasActive
        ? (remaining[remaining.length - 1]?.id ?? "devices")
        : get().activeTab,
    });
  },

  setActiveTab: (id) => set({ activeTab: id }),

  updateSession(id, patch) {
    set({
      sessions: get().sessions.map((s) =>
        s.id === id ? { ...s, ...patch } : s,
      ),
    });
  },

  async setDeviceMac(deviceId, mac) {
    const deviceMacs = { ...get().settings.deviceMacs };
    if (mac.trim()) deviceMacs[deviceId] = mac.trim();
    else delete deviceMacs[deviceId];
    await get().updateSettings({ deviceMacs });
  },

  async setProfile(deviceId, profile) {
    await get().updateSettings({
      profiles: { ...get().settings.profiles, [deviceId]: profile },
    });
  },

  async setGroup(deviceId, group) {
    const groups = { ...get().settings.groups };
    if (group.trim()) groups[deviceId] = group.trim();
    else delete groups[deviceId];
    await get().updateSettings({ groups });
  },

  async recordHistory(device, protocol) {
    const entry = {
      deviceId: device.id,
      deviceName: device.name,
      protocol,
      at: Date.now(),
    };
    const history = [
      entry,
      ...get().settings.history.filter(
        (h) => !(h.deviceId === device.id && h.protocol === protocol),
      ),
    ].slice(0, 25);
    await get().updateSettings({ history });
  },

  async wake(_deviceId, mac, broadcast) {
    try {
      await wakeOnLan(mac, broadcast ?? null);
      get().pushToast("success", `Sent wake packet to ${mac}`);
    } catch (e) {
      get().pushToast("error", `Wake failed: ${String(e)}`);
    }
  },
}));

/**
 * Devices after applying the active search + filter, sorted online-first.
 *
 * This is a plain pure function (not a Zustand selector) — call it inside a
 * `useMemo` in the component. Returning a fresh array directly from a store
 * selector would break `useSyncExternalStore` (a new reference every render
 * triggers an infinite update loop).
 */
export function filterDevices(
  devices: Device[],
  search: string,
  filter: DeviceFilter,
  favorites: string[],
): Device[] {
  const q = search.trim().toLowerCase();
  return devices
    .filter((d) => {
      if (filter === "online" && !d.online) return false;
      if (filter === "favorites" && !favorites.includes(d.id)) return false;
      if (!q) return true;
      return (
        d.name.toLowerCase().includes(q) ||
        d.dnsName.toLowerCase().includes(q) ||
        d.addresses.some((a) => a.includes(q)) ||
        d.os.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => Number(b.online) - Number(a.online));
}
