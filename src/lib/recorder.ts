/**
 * In-memory capture of terminal output for session recording. The live
 * terminal feeds output here via {@link recordOutput}; when the user stops
 * recording, the accumulated events are serialized to an asciicast file by the
 * Rust backend (see {@link saveRecording}).
 */
import { saveRecording } from "./api";

export interface CastEvent {
  time: number;
  data: string;
}

interface Recording {
  startedAt: number;
  width: number;
  height: number;
  events: CastEvent[];
}

const active = new Map<string, Recording>();

/** Begin recording a session's output. No-op if already recording. */
export function startRecording(
  sessionId: string,
  width: number,
  height: number,
): void {
  if (active.has(sessionId)) return;
  active.set(sessionId, { startedAt: Date.now(), width, height, events: [] });
}

/** Whether a session is currently being recorded. */
export function isRecording(sessionId: string): boolean {
  return active.has(sessionId);
}

/** Update the recorded terminal dimensions (e.g. after a resize). */
export function setRecordingDims(
  sessionId: string,
  width: number,
  height: number,
): void {
  const rec = active.get(sessionId);
  if (rec) {
    rec.width = width;
    rec.height = height;
  }
}

/** Append an output event if the session is being recorded. */
export function recordOutput(sessionId: string, data: string): void {
  const rec = active.get(sessionId);
  if (!rec) return;
  rec.events.push({ time: (Date.now() - rec.startedAt) / 1000, data });
}

/**
 * Stop recording and write the asciicast to `path`. Returns the number of
 * captured events, or null if the session was not being recorded.
 */
export async function stopRecording(
  sessionId: string,
  path: string,
  title?: string,
): Promise<number | null> {
  const rec = active.get(sessionId);
  if (!rec) return null;
  active.delete(sessionId);
  await saveRecording({
    path,
    width: rec.width,
    height: rec.height,
    title: title ?? null,
    events: rec.events,
  });
  return rec.events.length;
}

/** Discard a recording without saving (e.g. when the session closes). */
export function cancelRecording(sessionId: string): void {
  active.delete(sessionId);
}
