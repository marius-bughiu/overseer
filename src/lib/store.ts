import { create } from "zustand";

import {
  discoverDevices,
  hostPlatform,
  loadSettings,
  saveSettings,
  tailscaleCliAvailable,
} from "./api";
import { vault } from "./vault";
import { DEFAULT_SETTINGS, type Device, type Settings } from "./types";

const TOKEN_SECRET = "tailscale_api_token";

export type Platform = "android" | "ios" | "windows" | "macos" | "linux";
export type View = "devices" | "settings" | "about";
export type DeviceFilter = "all" | "online" | "favorites";

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
  pushToast: (kind: Toast["kind"], message: string) => void;
  dismissToast: (id: number) => void;
}

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

  async init() {
    try {
      const [platform, cliAvailable, persisted] = await Promise.all([
        hostPlatform(),
        tailscaleCliAvailable(),
        loadSettings(),
      ]);
      set({
        platform,
        cliAvailable,
        settings: { ...DEFAULT_SETTINGS, ...(persisted ?? {}) },
      });
    } catch (e) {
      get().pushToast("error", `Startup failed: ${String(e)}`);
    }
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

  pushToast(kind, message) {
    const toast: Toast = { id: ++toastSeq, kind, message };
    set({ toasts: [...get().toasts, toast] });
    // Auto-dismiss after a few seconds.
    setTimeout(() => get().dismissToast(toast.id), 5000);
  },

  dismissToast(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
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
