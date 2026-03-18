import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { keychainGet, keychainSet } from "./keychain.js";

export interface TrackedAbility {
  name: string;
  path: string;
  created_at: string;
}

export interface CliConfig {
  api_base_url?: string;
  default_personality_id?: string;
  api_key?: string;
  abilities?: TrackedAbility[];
}

const CONFIG_DIR = join(homedir(), ".openhome");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
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
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });
}

export function getApiKey(): string | null {
  // Try keychain first
  const fromKeychain = keychainGet();
  if (fromKeychain) return fromKeychain;

  // Fallback to config file
  const config = getConfig();
  return config.api_key ?? null;
}

export function registerAbility(name: string, absPath: string): void {
  const config = getConfig();
  const abilities = config.abilities ?? [];

  // Update existing entry or add new one
  const idx = abilities.findIndex((a) => a.path === absPath);
  if (idx >= 0) {
    abilities[idx].name = name;
  } else {
    abilities.push({
      name,
      path: absPath,
      created_at: new Date().toISOString(),
    });
  }

  config.abilities = abilities;
  saveConfig(config);
}

export function getTrackedAbilities(): TrackedAbility[] {
  const config = getConfig();
  return (config.abilities ?? []).filter((a) => {
    // Only return abilities whose directories still exist
    try {
      return existsSync(join(a.path, "config.json"));
    } catch {
      return false;
    }
  });
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
