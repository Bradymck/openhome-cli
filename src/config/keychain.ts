/**
 * Cross-platform credential storage.
 *
 * macOS   — macOS Keychain via `security` binary
 * Windows — DPAPI via PowerShell (per-user encryption; secret passed via env var, never on command line)
 * Linux   — libsecret via `secret-tool` CLI; falls back to 0o600 config file
 *
 * All functions return null / false on failure — callers fall back to config file.
 */

import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { homedir } from "node:os";
import {
  writeFileSync,
  readFileSync,
  existsSync,
  mkdirSync,
  unlinkSync,
} from "node:fs";

const PLATFORM = process.platform;

// ── macOS ─────────────────────────────────────────────────────────

function macGet(service: string, account: string): string | null {
  try {
    const result = execFileSync(
      "security",
      ["find-generic-password", "-a", account, "-s", service, "-w"],
      { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
    );
    return result.trim() || null;
  } catch {
    return null;
  }
}

function macSet(password: string, service: string, account: string): boolean {
  try {
    execFileSync(
      "security",
      [
        "add-generic-password",
        "-a",
        account,
        "-s",
        service,
        "-w",
        password,
        "-U",
      ],
      { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
    );
    return true;
  } catch {
    return false;
  }
}

function macDelete(service: string, account: string): boolean {
  try {
    execFileSync(
      "security",
      ["delete-generic-password", "-a", account, "-s", service],
      { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
    );
    return true;
  } catch {
    return false;
  }
}

// ── Windows (DPAPI via PowerShell) ────────────────────────────────
//
// The secret is passed as env var OPENHOME_CRED_VAL — never interpolated
// into the command string. DPAPI encrypts with the current user's Windows
// credentials; the resulting blob is useless if copied to another machine
// or another user account.

function winCredPath(service: string, account: string): string {
  const dir = join(homedir(), ".openhome");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  // account may contain colons (e.g. "jwt") — sanitize for filename
  const safe = `${service}-${account}`.replace(/[^a-zA-Z0-9-]/g, "_");
  return join(dir, `${safe}.dpapi`);
}

function winGet(service: string, account: string): string | null {
  const credPath = winCredPath(service, account);
  if (!existsSync(credPath)) return null;
  try {
    const b64 = readFileSync(credPath, "utf8").trim();
    // b64 is safe (only A-Za-z0-9+/= chars) but still passed via env var for consistency
    const result = execFileSync(
      "powershell",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        // Reads ciphertext from env var, decrypts with DPAPI, outputs plaintext
        "[System.Text.Encoding]::UTF8.GetString(" +
          "[System.Security.Cryptography.ProtectedData]::Unprotect(" +
          "[Convert]::FromBase64String($env:OPENHOME_CRED_CIPHER)," +
          "[System.Text.Encoding]::UTF8.GetBytes('openhome-cli')," +
          "[System.Security.Cryptography.DataProtectionScope]::CurrentUser))",
      ],
      {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, OPENHOME_CRED_CIPHER: b64 },
      },
    );
    return (result as string).trim() || null;
  } catch {
    return null;
  }
}

function winSet(password: string, service: string, account: string): boolean {
  try {
    // Secret passed via env var — never touches the command string
    const b64 = execFileSync(
      "powershell",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "[Convert]::ToBase64String(" +
          "[System.Security.Cryptography.ProtectedData]::Protect(" +
          "[System.Text.Encoding]::UTF8.GetBytes($env:OPENHOME_CRED_VAL)," +
          "[System.Text.Encoding]::UTF8.GetBytes('openhome-cli')," +
          "[System.Security.Cryptography.DataProtectionScope]::CurrentUser))",
      ],
      {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, OPENHOME_CRED_VAL: password },
      },
    ) as string;

    const credPath = winCredPath(service, account);
    writeFileSync(credPath, b64.trim(), { encoding: "utf8", mode: 0o600 });

    // Lock ACL to current user only (best-effort — requires elevated perms on some configs)
    try {
      const username = process.env.USERNAME ?? process.env.USERDOMAIN ?? "";
      if (username) {
        execFileSync(
          "icacls",
          [credPath, "/inheritance:r", "/grant:r", `${username}:F`],
          { stdio: ["pipe", "pipe", "pipe"] },
        );
      }
    } catch {
      // best-effort — file still has 0o600 mode as fallback
    }

    return true;
  } catch {
    return false;
  }
}

function winDelete(service: string, account: string): boolean {
  const credPath = winCredPath(service, account);
  if (!existsSync(credPath)) return true;
  try {
    unlinkSync(credPath);
    return true;
  } catch {
    return false;
  }
}

// ── Linux (secret-tool / libsecret) ──────────────────────────────
//
// secret-tool is part of libsecret-tools (Ubuntu: `apt install libsecret-tools`).
// Requires an active GNOME Keyring session — works on desktop Linux, not on
// headless servers. Falls back to 0o600 config file on failure.

function linuxGet(service: string, account: string): string | null {
  try {
    const result = execFileSync(
      "secret-tool",
      ["lookup", "service", service, "account", account],
      { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
    );
    return result.trim() || null;
  } catch {
    return null;
  }
}

function linuxSet(password: string, service: string, account: string): boolean {
  try {
    // secret-tool reads the secret from stdin — no injection risk
    execFileSync(
      "secret-tool",
      [
        "store",
        "--label",
        `${service}:${account}`,
        "service",
        service,
        "account",
        account,
      ],
      {
        encoding: "utf8",
        input: password,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    return true;
  } catch {
    return false;
  }
}

function linuxDelete(service: string, account: string): boolean {
  try {
    execFileSync(
      "secret-tool",
      ["clear", "service", service, "account", account],
      { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
    );
    return true;
  } catch {
    return false;
  }
}

// ── Public API ────────────────────────────────────────────────────

const DEFAULT_SERVICE = "openhome-cli";
const DEFAULT_ACCOUNT = "api-key";

export function keychainGet(
  service = DEFAULT_SERVICE,
  account = DEFAULT_ACCOUNT,
): string | null {
  if (PLATFORM === "darwin") return macGet(service, account);
  if (PLATFORM === "win32") return winGet(service, account);
  return linuxGet(service, account);
}

export function keychainSet(
  password: string,
  service = DEFAULT_SERVICE,
  account = DEFAULT_ACCOUNT,
): boolean {
  if (PLATFORM === "darwin") return macSet(password, service, account);
  if (PLATFORM === "win32") return winSet(password, service, account);
  return linuxSet(password, service, account);
}

export function keychainDelete(
  service = DEFAULT_SERVICE,
  account = DEFAULT_ACCOUNT,
): boolean {
  if (PLATFORM === "darwin") return macDelete(service, account);
  if (PLATFORM === "win32") return winDelete(service, account);
  return linuxDelete(service, account);
}
