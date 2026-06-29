import { invoke } from "@tauri-apps/api/core";

import type { Device, DiscoveryMethod, LaunchParams, Settings } from "./types";

/** Discover Tailscale devices via the chosen backend. */
export function discoverDevices(args: {
  method: DiscoveryMethod;
  token?: string | null;
  tailnet?: string | null;
}): Promise<Device[]> {
  return invoke<Device[]>("discover_devices", {
    method: args.method,
    token: args.token ?? null,
    tailnet: args.tailnet ?? null,
  });
}

/** Whether the local `tailscale` CLI is available on this machine. */
export function tailscaleCliAvailable(): Promise<boolean> {
  return invoke<boolean>("tailscale_cli_available");
}

/** Launch an RDP/VNC/SSH session in an external client. Returns a status string. */
export function launchConnection(params: LaunchParams): Promise<string> {
  return invoke<string>("launch_connection", { params });
}

/** Open an embedded VNC bridge; returns the loopback WebSocket URL for noVNC. */
export function openVncSession(host: string, port: number): Promise<string> {
  return invoke<string>("open_vnc_session", { host, port });
}

/** Open an embedded SSH bridge; returns the loopback WebSocket URL for xterm. */
export function openSshSession(args: {
  host: string;
  port: number;
  username: string;
  password: string;
  keyPath?: string | null;
  cols: number;
  rows: number;
}): Promise<string> {
  return invoke<string>("open_ssh_session", {
    ...args,
    keyPath: args.keyPath ?? null,
  });
}

/** Open an embedded Telnet bridge; returns the loopback WebSocket URL for xterm. */
export function openTelnetSession(host: string, port: number): Promise<string> {
  return invoke<string>("open_telnet_session", { host, port });
}

/** Open an embedded RDP bridge; returns the loopback WebSocket URL for canvas. */
export function openRdpSession(args: {
  host: string;
  port: number;
  username: string;
  password: string;
  domain?: string | null;
  width: number;
  height: number;
}): Promise<string> {
  return invoke<string>("open_rdp_session", {
    ...args,
    domain: args.domain ?? null,
  });
}

/** Send a Wake-on-LAN magic packet. */
export function wakeOnLan(
  mac: string,
  broadcast?: string | null,
): Promise<void> {
  return invoke("wake_on_lan", { mac, broadcast: broadcast ?? null });
}

/** Measure TCP connect latency (ms) to a host:port, or null if unreachable. */
export function tcpPing(host: string, port: number): Promise<number | null> {
  return invoke("tcp_ping", { host, port });
}

/** Scan a host for open TCP ports (common ports if none given). */
export function portScan(
  host: string,
  ports: number[] = [],
): Promise<number[]> {
  return invoke("port_scan", { host, ports });
}

/** Forget all trusted SSH host keys (TOFU reset). */
export function resetKnownHosts(): Promise<void> {
  return invoke("reset_known_hosts");
}

/** Write settings JSON to a file path. */
export function exportSettingsFile(path: string, json: string): Promise<void> {
  return invoke("export_settings", { path, json });
}

/** Read a settings JSON file path, returning its contents. */
export function importSettingsFile(path: string): Promise<string> {
  return invoke("import_settings", { path });
}

/** Supported password-manager export formats. */
export type CredentialFormat =
  "auto" | "bitwarden" | "keepass" | "onePassword" | "csv";

/** A credential parsed from a password-manager export. */
export interface ImportedEntry {
  name: string;
  host: string | null;
  username: string;
  password: string;
}

/**
 * Parse a password-manager export file into credential entries. The plaintext
 * is read in the backend and returned here; the caller stores secrets only in
 * the encrypted vault.
 */
export function importCredentialsFile(
  path: string,
  format: CredentialFormat = "auto",
): Promise<ImportedEntry[]> {
  return invoke("import_credentials", { path, format });
}

// --- SFTP file transfer ---

export interface SftpFile {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  modified: number | null;
}

export const sftp = {
  connect(args: {
    host: string;
    port: number;
    username: string;
    password: string;
    keyPath?: string | null;
  }): Promise<string> {
    return invoke("sftp_connect", { ...args, keyPath: args.keyPath ?? null });
  },
  list(id: string, path: string): Promise<SftpFile[]> {
    return invoke("sftp_list", { id, path });
  },
  home(id: string): Promise<string> {
    return invoke("sftp_home", { id });
  },
  download(id: string, remote: string, local: string): Promise<void> {
    return invoke("sftp_download", { id, remote, local });
  },
  upload(id: string, local: string, remote: string): Promise<void> {
    return invoke("sftp_upload", { id, local, remote });
  },
  mkdir(id: string, path: string): Promise<void> {
    return invoke("sftp_mkdir", { id, path });
  },
  remove(id: string, path: string, isDir: boolean): Promise<void> {
    return invoke("sftp_remove", { id, path, isDir });
  },
  rename(id: string, from: string, to: string): Promise<void> {
    return invoke("sftp_rename", { id, from, to });
  },
  disconnect(id: string): Promise<void> {
    return invoke("sftp_disconnect", { id });
  },
};

/** The OS family Overseer is running on. */
export function hostPlatform(): Promise<
  "android" | "ios" | "windows" | "macos" | "linux"
> {
  return invoke("host_platform");
}

export async function saveSettings(settings: Settings): Promise<void> {
  await invoke("save_settings", { json: JSON.stringify(settings) });
}

export async function loadSettings(): Promise<Settings | null> {
  const json = await invoke<string | null>("load_settings");
  if (!json) return null;
  try {
    return JSON.parse(json) as Settings;
  } catch {
    return null;
  }
}
