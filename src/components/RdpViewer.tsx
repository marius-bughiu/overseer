import { useEffect, useRef } from "react";

import type { SessionStatus } from "../lib/types";

const FRAME_RESIZE = 0x01;
const FRAME_IMAGE = 0x02;
const FRAME_ERROR = 0x03;

// Browser KeyboardEvent.code -> PC/AT set-1 scancode. Extended keys carry the
// 0xE000 prefix; the backend's Scancode::from_u16 decodes that bit.
const SCANCODES: Record<string, number> = {
  Escape: 0x01,
  Digit1: 0x02,
  Digit2: 0x03,
  Digit3: 0x04,
  Digit4: 0x05,
  Digit5: 0x06,
  Digit6: 0x07,
  Digit7: 0x08,
  Digit8: 0x09,
  Digit9: 0x0a,
  Digit0: 0x0b,
  Minus: 0x0c,
  Equal: 0x0d,
  Backspace: 0x0e,
  Tab: 0x0f,
  KeyQ: 0x10,
  KeyW: 0x11,
  KeyE: 0x12,
  KeyR: 0x13,
  KeyT: 0x14,
  KeyY: 0x15,
  KeyU: 0x16,
  KeyI: 0x17,
  KeyO: 0x18,
  KeyP: 0x19,
  BracketLeft: 0x1a,
  BracketRight: 0x1b,
  Enter: 0x1c,
  ControlLeft: 0x1d,
  KeyA: 0x1e,
  KeyS: 0x1f,
  KeyD: 0x20,
  KeyF: 0x21,
  KeyG: 0x22,
  KeyH: 0x23,
  KeyJ: 0x24,
  KeyK: 0x25,
  KeyL: 0x26,
  Semicolon: 0x27,
  Quote: 0x28,
  Backquote: 0x29,
  ShiftLeft: 0x2a,
  Backslash: 0x2b,
  KeyZ: 0x2c,
  KeyX: 0x2d,
  KeyC: 0x2e,
  KeyV: 0x2f,
  KeyB: 0x30,
  KeyN: 0x31,
  KeyM: 0x32,
  Comma: 0x33,
  Period: 0x34,
  Slash: 0x35,
  ShiftRight: 0x36,
  NumpadMultiply: 0x37,
  AltLeft: 0x38,
  Space: 0x39,
  CapsLock: 0x3a,
  F1: 0x3b,
  F2: 0x3c,
  F3: 0x3d,
  F4: 0x3e,
  F5: 0x3f,
  F6: 0x40,
  F7: 0x41,
  F8: 0x42,
  F9: 0x43,
  F10: 0x44,
  NumLock: 0x45,
  ScrollLock: 0x46,
  F11: 0x57,
  F12: 0x58,
  // Extended keys
  ControlRight: 0xe01d,
  AltRight: 0xe038,
  NumpadDivide: 0xe035,
  NumpadEnter: 0xe01c,
  Home: 0xe047,
  ArrowUp: 0xe048,
  PageUp: 0xe049,
  ArrowLeft: 0xe04b,
  ArrowRight: 0xe04d,
  End: 0xe04f,
  ArrowDown: 0xe050,
  PageDown: 0xe051,
  Insert: 0xe052,
  Delete: 0xe053,
  MetaLeft: 0xe05b,
  MetaRight: 0xe05c,
};

/**
 * Embedded RDP viewer. The Rust IronRDP client streams framebuffer regions over
 * the loopback WebSocket; we paint them to a canvas and send input back as JSON.
 */
export function RdpViewer({
  wsUrl,
  onStatus,
}: {
  wsUrl: string;
  onStatus?: (status: SessionStatus) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const ws = new WebSocket(wsUrl);
    ws.binaryType = "arraybuffer";

    const send = (obj: unknown) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
    };

    // Map a pointer event to RDP desktop coordinates.
    const toDesktop = (e: PointerEvent | WheelEvent) => {
      const rect = canvas.getBoundingClientRect();
      const sx = canvas.width / rect.width;
      const sy = canvas.height / rect.height;
      return {
        x: Math.max(0, Math.round((e.clientX - rect.left) * sx)),
        y: Math.max(0, Math.round((e.clientY - rect.top) * sy)),
      };
    };

    ws.onopen = () => onStatus?.("open");
    ws.onerror = () => onStatus?.("error");
    ws.onclose = () => onStatus?.("closed");
    ws.onmessage = (ev) => {
      const view = new DataView(ev.data as ArrayBuffer);
      const type = view.getUint8(0);
      if (type === FRAME_RESIZE) {
        canvas.width = view.getUint16(1);
        canvas.height = view.getUint16(3);
        ctx.fillStyle = "#0a0e14";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      } else if (type === FRAME_IMAGE) {
        const x = view.getUint16(1);
        const y = view.getUint16(3);
        const w = view.getUint16(5);
        const h = view.getUint16(7);
        const pixels = new Uint8ClampedArray(
          ev.data as ArrayBuffer,
          9,
          w * h * 4,
        );
        ctx.putImageData(new ImageData(pixels, w, h), x, y);
      } else if (type === FRAME_ERROR) {
        const msg = new TextDecoder().decode(
          new Uint8Array(ev.data as ArrayBuffer, 1),
        );
        onStatus?.("error");
        ctx.fillStyle = "#fca5a5";
        ctx.font = "14px ui-monospace, monospace";
        ctx.fillText(`RDP error: ${msg}`, 16, 28);
      }
    };

    const onMove = (e: PointerEvent) => send({ t: "m", ...toDesktop(e) });
    const onDown = (e: PointerEvent) => {
      canvas.focus();
      send({ t: "mb", b: e.button, down: true });
    };
    const onUp = (e: PointerEvent) =>
      send({ t: "mb", b: e.button, down: false });
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const units = e.deltaY > 0 ? -120 : 120;
      send({ t: "w", v: true, d: units });
    };
    const onContext = (e: Event) => e.preventDefault();

    const onKey = (down: boolean) => (e: KeyboardEvent) => {
      const code = SCANCODES[e.code];
      if (code !== undefined) {
        e.preventDefault();
        send({ t: "sc", code, down });
      } else if (e.key.length === 1) {
        e.preventDefault();
        send({ t: "uc", ch: e.key, down });
      }
    };
    const onKeyDown = onKey(true);
    const onKeyUp = onKey(false);

    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("contextmenu", onContext);
    canvas.addEventListener("keydown", onKeyDown);
    canvas.addEventListener("keyup", onKeyUp);

    return () => {
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("contextmenu", onContext);
      canvas.removeEventListener("keydown", onKeyDown);
      canvas.removeEventListener("keyup", onKeyUp);
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    };
  }, [wsUrl, onStatus]);

  return (
    <div className="flex h-full w-full items-center justify-center bg-ink-950">
      <canvas
        ref={canvasRef}
        tabIndex={0}
        width={1280}
        height={800}
        className="max-h-full max-w-full outline-none"
      />
    </div>
  );
}
