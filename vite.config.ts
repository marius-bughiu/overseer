import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// @tauri-apps/cli sets TAURI_DEV_HOST when running on a physical mobile device.
const host = process.env.TAURI_DEV_HOST;

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  // Prevent Vite from obscuring Rust errors.
  clearScreen: false,
  server: {
    // Tauri expects a fixed port; fail if it is taken.
    port: 5173,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 5183,
        }
      : undefined,
    watch: {
      // Don't watch the Rust source tree.
      ignored: ["**/src-tauri/**"],
    },
  },

  // Produce a build compatible with the webviews Tauri targets. Modern targets
  // are required for top-level await (used by noVNC). These map to WebView2
  // (Windows), WKWebView (macOS/iOS 15+) and recent WebKitGTK (Linux).
  build: {
    target:
      process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari15",
    minify: process.env.TAURI_ENV_DEBUG ? false : "esbuild",
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
});
