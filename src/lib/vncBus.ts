/**
 * Registry for pushing the local clipboard into a live VNC session. The
 * embedded VNC viewer registers a paste function while mounted; the UI calls
 * {@link pasteToVnc} to send clipboard text to the remote server's clipboard.
 */
type Paste = (text: string) => void;

const pasters = new Map<string, Paste>();

/** Register a session's VNC clipboard-paste function while its viewer is mounted. */
export function registerVnc(sessionId: string, paste: Paste): () => void {
  pasters.set(sessionId, paste);
  return () => {
    if (pasters.get(sessionId) === paste) pasters.delete(sessionId);
  };
}

/** Send clipboard text to a VNC session. Returns false if none is registered. */
export function pasteToVnc(sessionId: string, text: string): boolean {
  const paste = pasters.get(sessionId);
  if (!paste) return false;
  paste(text);
  return true;
}
