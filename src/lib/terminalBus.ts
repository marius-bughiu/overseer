/**
 * A tiny registry that lets the UI inject input into a live embedded terminal
 * (SSH / Telnet) without threading the WebSocket through React state.
 *
 * Each open terminal registers a sender keyed by its session id while mounted;
 * `sendToTerminal` looks the sender up and writes the bytes. Used by the
 * snippet / "paste as keystrokes" feature.
 */
type Sender = (data: string) => void;

const senders = new Map<string, Sender>();

/** Register (or replace) the input sender for a session. Returns an unregister fn. */
export function registerTerminal(sessionId: string, send: Sender): () => void {
  senders.set(sessionId, send);
  return () => {
    if (senders.get(sessionId) === send) senders.delete(sessionId);
  };
}

/** Whether a live terminal is currently registered for this session. */
export function hasTerminal(sessionId: string): boolean {
  return senders.has(sessionId);
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
  const send = senders.get(sessionId);
  if (!send) return false;
  send(data);
  return true;
}
