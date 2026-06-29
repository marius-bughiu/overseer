import type { Device, ManualHost } from "./types";

/** Convert user-added manual hosts into Device records for the list. */
export function manualToDevices(hosts: ManualHost[]): Device[] {
  return hosts.map((h) => ({
    id: `manual-${h.id}`,
    name: h.name || h.host,
    dnsName: h.host,
    addresses: [h.host],
    os: "",
    online: true,
    lastSeen: null,
    tags: [],
    user: null,
    source: "manual",
  }));
}

const IPV4 = /^(\d{1,3}\.){3}\d{1,3}$/;

/** Mirror of `Device::primary_address` on the Rust side. */
export function primaryAddress(device: Device): string {
  const v4 = device.addresses.find((a) => IPV4.test(a));
  if (v4) return v4;
  if (device.addresses.length > 0) return device.addresses[0];
  return device.dnsName;
}

/** A short, human-friendly OS label. */
export function osLabel(os: string): string {
  const map: Record<string, string> = {
    macos: "macOS",
    ios: "iOS",
    windows: "Windows",
    linux: "Linux",
    android: "Android",
  };
  return map[os.toLowerCase()] ?? (os || "Unknown");
}

/** "3 minutes ago" style relative time from an RFC 3339 timestamp. */
export function relativeTime(iso: string | null): string | null {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}
