/**
 * Biometric authentication (Touch ID / Face ID / Android biometric).
 *
 * This is a **mobile-only** capability; the plugin is not compiled into desktop
 * builds, so callers must guard on the platform (see {@link biometricPlatform}).
 * The plugin is imported lazily so desktop bundles never load it eagerly.
 *
 * Biometrics gate access to the app; they do not replace the vault master
 * password, which stays the only key to the encrypted vault.
 */
import type { Platform } from "./store";

/** Whether biometric auth can exist on this platform (mobile only). */
export function biometricPlatform(platform: Platform): boolean {
  return platform === "android" || platform === "ios";
}

/** Whether the device actually has biometrics available and enrolled. */
export async function biometricAvailable(): Promise<boolean> {
  try {
    const { checkStatus } = await import("@tauri-apps/plugin-biometric");
    return (await checkStatus()).isAvailable;
  } catch {
    return false;
  }
}

/** Prompt for biometric authentication; resolves true on success. */
export async function requestBiometric(reason: string): Promise<boolean> {
  try {
    const { authenticate } = await import("@tauri-apps/plugin-biometric");
    await authenticate(reason, {
      allowDeviceCredential: true,
      title: "Unlock Overseer",
    });
    return true;
  } catch {
    return false;
  }
}
