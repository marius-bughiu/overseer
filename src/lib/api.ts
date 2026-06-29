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
  cols: number;
  rows: number;
}): Promise<string> {
  return invoke<string>("open_ssh_session", args);
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
