// Mirrors `overseer_core::tailscale::Device` (serde camelCase).
// "manual" is a frontend-only source for user-added non-Tailscale hosts.
export type DiscoverySource = "api" | "localcli" | "manual";

/** A user-added host that is not discovered via Tailscale. */
export interface ManualHost {
  id: string;
  name: string;
  host: string;
}

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

export type Protocol = "rdp" | "vnc" | "ssh" | "telnet";

export type DiscoveryMethod = "cli" | "api";

export interface LaunchParams {
  protocol: Protocol;
  host: string;
  port: number;
  username?: string | null;
  label: string;
}

export type ConnectMode = "app" | "external";

export type Theme = "dark" | "light";

/** A remembered per-machine connection profile (non-secret). */
export interface ConnectionProfile {
  protocol: Protocol;
  mode: ConnectMode;
  port?: number | null;
  /** Preferred RDP desktop width (embedded sessions). */
  width?: number | null;
  /** Preferred RDP desktop height (embedded sessions). */
  height?: number | null;
}

/** A reusable command snippet that can be pasted as keystrokes into a terminal. */
export interface Snippet {
  id: string;
  label: string;
  text: string;
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
  /** UI theme. */
  theme: Theme;
  /** Auto-lock the vault after this many minutes idle (0 = never). */
  autoLockMinutes: number;
  /** Automatically try to reconnect a dropped session. */
  autoReconnect: boolean;
  /** Per-device MAC addresses for Wake-on-LAN. */
  deviceMacs: Record<string, string>;
  /** Per-device remembered connection profiles. */
  profiles: Record<string, ConnectionProfile>;
  /** Folder/group label per device. */
  groups: Record<string, string>;
  /** Recently-used connections, newest first. */
  history: HistoryEntry[];
  /** User-added non-Tailscale hosts. */
  manualHosts: ManualHost[];
  /** Reusable command snippets for terminal sessions. */
  snippets: Snippet[];
}

export const DEFAULT_SETTINGS: Settings = {
  discoveryMethod: "api",
  tailnet: "-",
  preferredProtocol: "rdp",
  favorites: [],
  theme: "dark",
  autoLockMinutes: 15,
  autoReconnect: true,
  deviceMacs: {},
  profiles: {},
  groups: {},
  history: [],
  manualHosts: [],
  snippets: [],
};

/** A TOTP (2FA) account stored in the vault. */
export interface TotpAccount {
  id: string;
  label: string;
  /** base32 secret. */
  secret: string;
}

/** A credential entry as stored in the Stronghold vault. */
export interface Credential {
  username: string;
  password: string;
  /** Optional default port override for this device. */
  port?: number | null;
  domain?: string | null;
}

export type SessionStatus = "connecting" | "open" | "error" | "closed";

/** What kind of view a session tab renders. */
export type SessionKind = "screen" | "files";

/** An open, embedded (in-app) session tab. */
export interface SessionTab {
  id: string;
  title: string;
  protocol: Protocol; // "rdp" | "vnc" | "ssh" | "telnet"
  kind: SessionKind;
  host: string;
  port: number;
  username?: string | null;
  password?: string | null;
  keyPath?: string | null;
  /** RDP desktop dimensions for this session (embedded). */
  width?: number | null;
  height?: number | null;
  wsUrl?: string;
  /** For kind === "files": the SFTP session id. */
  sftpId?: string;
  status: SessionStatus;
  error?: string;
}
