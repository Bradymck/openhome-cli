import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  chmodSync,
  existsSync,
  readdirSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { keychainGet, keychainSet, keychainDelete } from "./keychain.js";

const SERVICE = "openhome-cli";

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
  last_version_check?: number;
  latest_version_cache?: string;
}

const CONFIG_DIR = join(homedir(), ".openhome");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  } else {
    // Tighten permissions if directory already existed with wrong mode (e.g. created by user manually)
    try {
      chmodSync(CONFIG_DIR, 0o700);
    } catch {
      // best-effort — Windows doesn't support Unix permissions
    }
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
  // 1. Environment variable — highest priority for CI/agent use
  if (process.env.OPENHOME_API_KEY) return process.env.OPENHOME_API_KEY;

  // 2. Keychain (macOS Keychain / system secret store)
  const fromKeychain = keychainGet();
  if (fromKeychain) return fromKeychain;

  // 3. Config file fallback
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
  // 1. Environment variable — highest priority for CI/agent use
  if (process.env.OPENHOME_JWT) return process.env.OPENHOME_JWT;

  // 2. Keychain (macOS — same store as API key, survives reboots)
  const fromKeychain = keychainGet(SERVICE, "jwt");
  if (fromKeychain) return fromKeychain;

  // 3. Config file fallback (Linux/Windows, or legacy)
  return getConfig().jwt ?? null;
}

export function saveJwt(jwt: string): void {
  const savedToKeychain = keychainSet(jwt, SERVICE, "jwt");
  if (savedToKeychain) {
    // Remove from config file if it was stored there previously (migration)
    const config = getConfig();
    if (config.jwt) {
      delete config.jwt;
      saveConfig(config);
    }
  } else {
    // Keychain write failed (permissions, or Linux/Windows without secret-tool).
    // Explicitly delete any stale keychain entry so it can't shadow the config file
    // on the next read (getJwt checks keychain before config file).
    keychainDelete(SERVICE, "jwt");
    const config = getConfig();
    config.jwt = jwt;
    saveConfig(config);
  }
}

// ── JWT expiry helpers ────────────────────────────────────────────

export type JwtStatus = "valid" | "expiring_soon" | "expired" | "unknown";

/** Decode JWT exp claim without verifying signature. */
export function getJwtExpiry(jwt: string): Date | null {
  try {
    const parts = jwt.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8"),
    ) as { exp?: number };
    if (typeof payload.exp !== "number") return null;
    return new Date(payload.exp * 1000);
  } catch {
    return null;
  }
}

export function getJwtStatus(jwt: string): JwtStatus {
  const expiry = getJwtExpiry(jwt);
  if (!expiry) return "unknown";
  const now = Date.now();
  const ms = expiry.getTime();
  if (now >= ms) return "expired";
  if (ms - now < 24 * 60 * 60 * 1000) return "expiring_soon"; // < 24h warning
  return "valid";
}

// ── API base URL (env var override for enterprise staging environments) ───

export function getApiBase(): string | undefined {
  if (process.env.OPENHOME_API_BASE) return process.env.OPENHOME_API_BASE;
  return getConfig().api_base_url;
}
