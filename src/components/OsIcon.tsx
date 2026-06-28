import {
  Apple,
  HardDrive,
  Laptop,
  MonitorSmartphone,
  Smartphone,
  Terminal,
} from "lucide-react";

/** Map a Tailscale OS string to a representative icon. */
export function OsIcon({ os, size = 18 }: { os: string; size?: number }) {
  const o = os.toLowerCase();
  if (o.includes("macos") || o.includes("ios") || o === "tvos")
    return <Apple size={size} />;
  if (o.includes("windows")) return <MonitorSmartphone size={size} />;
  if (o.includes("android")) return <Smartphone size={size} />;
  if (o.includes("linux")) return <Terminal size={size} />;
  if (o.includes("freebsd") || o.includes("openbsd"))
    return <HardDrive size={size} />;
  return <Laptop size={size} />;
}
