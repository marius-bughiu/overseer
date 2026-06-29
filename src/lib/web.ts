/**
 * Helpers for opening a device's web admin console in an in-app webview window.
 * Many appliances (NAS, routers, hypervisors) expose an HTTP(S) UI; this lets
 * users reach it without leaving Overseer.
 */

/** Build a web URL for a host/port, picking http for :80 and https otherwise. */
export function buildWebUrl(host: string, port: number): string {
  const h = host.trim();
  if (port === 80) return `http://${h}`;
  if (port === 443 || !port) return `https://${h}`;
  return `https://${h}:${port}`;
}

/** Open a URL in a new in-app webview window labelled for the device. */
export async function openWebConsole(
  title: string,
  url: string,
): Promise<void> {
  const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
  const safe = title.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 24);
  const suffix = Math.random().toString(36).slice(2, 8);
  new WebviewWindow(`web-${safe}-${suffix}`, { url, title });
}
