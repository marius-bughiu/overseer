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

export type Protocol = "rdp" | "vnc";

export type DiscoveryMethod = "cli" | "api";

export interface LaunchParams {
  protocol: Protocol;
  host: string;
  port: number;
  username?: string | null;
  label: string;
}

/** Non-secret settings, persisted to disk via the backend. */
export interface Settings {
  discoveryMethod: DiscoveryMethod;
  tailnet: string;
  /** Last protocol the user connected with, used as the dialog default. */
  preferredProtocol: Protocol;
  /** Remember which devices the user starred. */
  favorites: string[];
}

export const DEFAULT_SETTINGS: Settings = {
  discoveryMethod: "api",
  tailnet: "-",
  preferredProtocol: "rdp",
  favorites: [],
};

/** A credential entry as stored in the Stronghold vault. */
export interface Credential {
  username: string;
  password: string;
  /** Optional default port override for this device. */
  port?: number | null;
  domain?: string | null;
}
