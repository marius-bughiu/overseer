/**
 * Registry of the live <canvas> backing each embedded graphical session
 * (VNC / RDP). The overview grid uses it to grab a downscaled thumbnail of
 * what each session currently shows, without coupling to the viewers.
 */
type CanvasGetter = () => HTMLCanvasElement | null;

const screens = new Map<string, CanvasGetter>();

/** Register a session's canvas getter while its viewer is mounted. */
export function registerScreen(
  sessionId: string,
  getter: CanvasGetter,
): () => void {
  screens.set(sessionId, getter);
  return () => {
    if (screens.get(sessionId) === getter) screens.delete(sessionId);
  };
}

/**
 * Capture a downscaled PNG data URL of a session's current screen, or null if
 * no canvas is registered / it has no content yet.
 */
export function snapshotScreen(
  sessionId: string,
  maxWidth = 360,
): string | null {
  const canvas = screens.get(sessionId)?.();
  if (!canvas || !canvas.width || !canvas.height) return null;
  try {
    const scale = Math.min(1, maxWidth / canvas.width);
    const w = Math.max(1, Math.round(canvas.width * scale));
    const h = Math.max(1, Math.round(canvas.height * scale));
    const off = document.createElement("canvas");
    off.width = w;
    off.height = h;
    const ctx = off.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(canvas, 0, 0, w, h);
    return off.toDataURL("image/png");
  } catch {
    // toDataURL can throw on a tainted canvas; fall back to no thumbnail.
    return null;
  }
}
