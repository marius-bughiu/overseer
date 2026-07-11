import ReactDOM from "react-dom/client";

import App from "./App";
import "./index.css";

// NOTE: React.StrictMode is intentionally NOT used. Embedded sessions (VNC, SSH,
// RDP, Telnet) connect to a single-use, token-gated loopback WebSocket bridge
// that accepts exactly one connection. StrictMode's dev-only double-mount opens
// a throwaway connection that consumes the bridge, so the real one is refused
// and the session can never establish. Production builds don't double-mount, so
// this only bites in `tauri dev` — dropping StrictMode makes dev match prod.
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <App />,
);
