import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  readdirSync,
} from "node:fs";
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
  default_agent_id?: string;
  api_key?: string;
  jwt?: string;
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
  const tracked = (config.abilities ?? []).filter((a) => {
    try {
      return existsSync(join(a.path, "config.json"));
    } catch {
      return false;
    }
  });

  // Auto-discover abilities in ./abilities/ that aren't tracked yet
  const abilitiesDir = join(process.cwd(), "abilities");
  if (existsSync(abilitiesDir)) {
    try {
      const dirs = readdirSync(abilitiesDir, { withFileTypes: true });
      for (const d of dirs) {
        if (!d.isDirectory()) continue;
        const dirPath = join(abilitiesDir, d.name);
        const configPath = join(dirPath, "config.json");
        if (!existsSync(configPath)) continue;
        if (tracked.some((a) => a.path === dirPath)) continue;

        // Read name from config.json
        try {
          const abilityConfig = JSON.parse(
            readFileSync(configPath, "utf8"),
          ) as { unique_name?: string };
          tracked.push({
            name: abilityConfig.unique_name ?? d.name,
            path: dirPath,
            created_at: new Date().toISOString(),
          });
        } catch {
          // skip unreadable configs
        }
      }
    } catch {
      // skip if abilities/ can't be read
    }
  }

  return tracked;
}

export function saveApiKey(key: string): void {
  const saved = keychainSet(key);
  if (!saved) {
    const config = getConfig();
    config.api_key = key;
    saveConfig(config);
  }
}

export function getJwt(): string | null {
  return getConfig().jwt ?? null;
}

export function saveJwt(jwt: string): void {
  const config = getConfig();
  config.jwt = jwt;
  saveConfig(config);
}
