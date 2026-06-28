import {
  Stronghold,
  type Client,
  type Store,
} from "@tauri-apps/plugin-stronghold";
import { appDataDir } from "@tauri-apps/api/path";

import type { Credential } from "./types";

/**
 * Encrypted credential vault, backed by the Tauri Stronghold plugin (IOTA
 * Stronghold). The vault is an encrypted blob on disk; its contents are only
 * decryptable with the user's master password, which is never persisted.
 *
 * Credentials are stored one entry per device id. A small index entry tracks
 * which device ids have credentials, since Stronghold's store is not
 * enumerable.
 */
const CLIENT_NAME = "overseer.credentials";
const INDEX_KEY = "__device_index__";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function encode(value: string): number[] {
  return Array.from(encoder.encode(value));
}

function decode(bytes: Uint8Array | number[] | null): string | null {
  if (!bytes) return null;
  return decoder.decode(Uint8Array.from(bytes));
}

class Vault {
  private stronghold: Stronghold | null = null;
  private store: Store | null = null;

  get unlocked(): boolean {
    return this.store !== null;
  }

  /** Unlock (or create) the vault with the master password. */
  async unlock(password: string): Promise<void> {
    const vaultPath = `${await appDataDir()}/overseer.vault`;
    const stronghold = await Stronghold.load(vaultPath, password);

    let client: Client;
    try {
      client = await stronghold.loadClient(CLIENT_NAME);
    } catch {
      client = await stronghold.createClient(CLIENT_NAME);
    }

    this.stronghold = stronghold;
    this.store = client.getStore();
  }

  /** Forget the in-memory keys. The on-disk vault stays encrypted. */
  lock(): void {
    this.stronghold = null;
    this.store = null;
  }

  private requireStore(): Store {
    if (!this.store) {
      throw new Error("Vault is locked. Unlock it with your master password.");
    }
    return this.store;
  }

  private async persist(): Promise<void> {
    if (this.stronghold) await this.stronghold.save();
  }

  private async readIndex(): Promise<string[]> {
    const store = this.requireStore();
    const raw = decode(await store.get(INDEX_KEY));
    if (!raw) return [];
    try {
      return JSON.parse(raw) as string[];
    } catch {
      return [];
    }
  }

  private async writeIndex(ids: string[]): Promise<void> {
    const store = this.requireStore();
    await store.insert(INDEX_KEY, encode(JSON.stringify([...new Set(ids)])));
  }

  async listDeviceIds(): Promise<string[]> {
    return this.readIndex();
  }

  /** Read an arbitrary named secret (e.g. the Tailscale API token). */
  async getSecret(name: string): Promise<string | null> {
    const store = this.requireStore();
    return decode(await store.get(`secret:${name}`));
  }

  /** Store an arbitrary named secret. Pass an empty string to clear it. */
  async setSecret(name: string, value: string): Promise<void> {
    const store = this.requireStore();
    if (value) {
      await store.insert(`secret:${name}`, encode(value));
    } else {
      await store.remove(`secret:${name}`);
    }
    await this.persist();
  }

  async getCredential(deviceId: string): Promise<Credential | null> {
    const store = this.requireStore();
    const raw = decode(await store.get(`cred:${deviceId}`));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as Credential;
    } catch {
      return null;
    }
  }

  async setCredential(deviceId: string, cred: Credential): Promise<void> {
    const store = this.requireStore();
    await store.insert(`cred:${deviceId}`, encode(JSON.stringify(cred)));
    const index = await this.readIndex();
    if (!index.includes(deviceId)) {
      await this.writeIndex([...index, deviceId]);
    }
    await this.persist();
  }

  async deleteCredential(deviceId: string): Promise<void> {
    const store = this.requireStore();
    await store.remove(`cred:${deviceId}`);
    const index = await this.readIndex();
    await this.writeIndex(index.filter((id) => id !== deviceId));
    await this.persist();
  }
}

/** Process-wide singleton vault. */
export const vault = new Vault();
