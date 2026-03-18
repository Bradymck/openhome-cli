import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { keychainGet, keychainSet } from "./keychain.js";

export interface CliConfig {
  api_base_url?: string;
  default_personality_id?: string;
  api_key?: string;
}

const CONFIG_DIR = join(homedir(), ".openhome");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

export function getConfig(): CliConfig {
  ensureConfigDir();
  if (!existsSync(CONFIG_FILE)) {
    return {};
  }
  try {
    const raw = readFileSync(CONFIG_FILE, "utf8");
    return JSON.parse(raw) as CliConfig;
  } catch {
    return {};
  }
}

export function saveConfig(config: CliConfig): void {
  ensureConfigDir();
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf8");
}

export function getApiKey(): string | null {
  // Try keychain first
  const fromKeychain = keychainGet();
  if (fromKeychain) return fromKeychain;

  // Fallback to config file
  const config = getConfig();
  return config.api_key ?? null;
}

export function saveApiKey(key: string): void {
  const saved = keychainSet(key);
  if (!saved) {
    // Fallback: save in config file (less secure)
    const config = getConfig();
    config.api_key = key;
    saveConfig(config);
  }
}
