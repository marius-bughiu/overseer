// Mirrors `overseer_core::tailscale::Device` (serde camelCase).
export type DiscoverySource = "api" | "localcli";

export interface Device {
  id: string;
  name: string;
  dnsName: string;
  addresses: string[];
  os: string;
  online: boolean;
  lastSeen: string | null;
  tags: string[];
  user: string | null;
  source: DiscoverySource;
}

export type Protocol = "rdp" | "vnc" | "ssh";

export type DiscoveryMethod = "cli" | "api";

export interface LaunchParams {
  protocol: Protocol;
  host: string;
  port: number;
  username?: string | null;
  label: string;
}

export type ConnectMode = "app" | "external";

/** A remembered per-machine connection profile (non-secret). */
export interface ConnectionProfile {
  protocol: Protocol;
  mode: ConnectMode;
  port?: number | null;
}

/** A connection-history entry. */
export interface HistoryEntry {
  deviceId: string;
  deviceName: string;
  protocol: Protocol;
  at: number;
}

/** Non-secret settings, persisted to disk via the backend. */
export interface Settings {
  discoveryMethod: DiscoveryMethod;
  tailnet: string;
  /** Last protocol the user connected with, used as the dialog default. */
  preferredProtocol: Protocol;
  /** Remember which devices the user starred. */
  favorites: string[];
  /** Auto-lock the vault after this many minutes idle (0 = never). */
  autoLockMinutes: number;
  /** Per-device MAC addresses for Wake-on-LAN. */
  deviceMacs: Record<string, string>;
  /** Per-device remembered connection profiles. */
  profiles: Record<string, ConnectionProfile>;
  /** Folder/group label per device. */
  groups: Record<string, string>;
  /** Recently-used connections, newest first. */
  history: HistoryEntry[];
}

export const DEFAULT_SETTINGS: Settings = {
  discoveryMethod: "api",
  tailnet: "-",
  preferredProtocol: "rdp",
  favorites: [],
  autoLockMinutes: 15,
  deviceMacs: {},
  profiles: {},
  groups: {},
  history: [],
};

/** A credential entry as stored in the Stronghold vault. */
export interface Credential {
  username: string;
  password: string;
  /** Optional default port override for this device. */
  port?: number | null;
  domain?: string | null;
}

export type SessionStatus = "connecting" | "open" | "error" | "closed";

/** An open, embedded (in-app) session tab. */
export interface SessionTab {
  id: string;
  title: string;
  protocol: Protocol; // "vnc" | "ssh" — embedded protocols
  host: string;
  port: number;
  username?: string | null;
  password?: string | null;
  wsUrl?: string;
  status: SessionStatus;
  error?: string;
}
