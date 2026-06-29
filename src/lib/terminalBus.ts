/**
 * A tiny registry that lets the UI inject input into a live embedded terminal
 * (SSH / Telnet) without threading the WebSocket through React state.
 *
 * Each open terminal registers a sender keyed by its session id while mounted;
 * `sendToTerminal` looks the sender up and writes the bytes. Used by the
 * snippet / "paste as keystrokes" feature.
 */
type Sender = (data: string) => void;

interface TerminalHandle {
  send: Sender;
  /** Live terminal dimensions (columns × rows). */
  dims: () => { cols: number; rows: number };
}

const terminals = new Map<string, TerminalHandle>();

/** Register (or replace) the handle for a session. Returns an unregister fn. */
export function registerTerminal(
  sessionId: string,
  handle: TerminalHandle,
): () => void {
  terminals.set(sessionId, handle);
  return () => {
    if (terminals.get(sessionId) === handle) terminals.delete(sessionId);
  };
}

/** Whether a live terminal is currently registered for this session. */
export function hasTerminal(sessionId: string): boolean {
  return terminals.has(sessionId);
}

/** Current dimensions of a session's terminal, or null if none is registered. */
export function getTerminalDims(
  sessionId: string,
): { cols: number; rows: number } | null {
  return terminals.get(sessionId)?.dims() ?? null;
}

/**
 * Convert snippet text into keystrokes a shell will accept: normalize CRLF/CR
 * to a single `\r` so each line is "entered". Lone trailing newlines are kept
 * so the final line executes.
 */
export function toKeystrokes(text: string): string {
  return text.replace(/\r\n?|\n/g, "\r");
}

/** Send raw text to a session's terminal. Returns false if none is registered. */
export function sendToTerminal(sessionId: string, data: string): boolean {
  const handle = terminals.get(sessionId);
  if (!handle) return false;
  handle.send(data);
  return true;
}
