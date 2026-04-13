import { Command } from "commander";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";

import { loginCommand } from "./commands/login.js";
import { deployCommand } from "./commands/deploy.js";
import { deleteCommand } from "./commands/delete.js";
import { toggleCommand } from "./commands/toggle.js";
import { assignCommand } from "./commands/assign.js";
import { listCommand } from "./commands/list.js";
import { statusCommand } from "./commands/status.js";
import { agentsCommand } from "./commands/agents.js";
import { agentsEditCommand } from "./commands/agents-edit.js";
import { logoutCommand } from "./commands/logout.js";
import { chatCommand } from "./commands/chat.js";
import { triggerCommand } from "./commands/trigger.js";
import { whoamiCommand } from "./commands/whoami.js";
import { configEditCommand } from "./commands/config-edit.js";
import { logsCommand } from "./commands/logs.js";
import { setJwtCommand } from "./commands/set-jwt.js";
import { validateCommand } from "./commands/validate.js";
import { p, handleCancel } from "./ui/format.js";
import { getConfig, saveConfig } from "./config/store.js";

// Read version from package.json
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
let version = "0.1.0";
try {
  const pkg = JSON.parse(
    readFileSync(join(__dirname, "..", "package.json"), "utf8"),
  ) as { version?: string };
  version = pkg.version ?? version;
} catch {
  // fallback to default
}

// ── Auto-update check ────────────────────────────────────────────
const UPDATE_CHECK_INTERVAL = 24 * 60 * 60 * 1000; // once per day

async function checkForUpdates(): Promise<void> {
  // Skip if disabled, re-execing, or in JSON mode (would corrupt piped output)
  if (process.env.OPENHOME_NO_UPDATE === "1") return;
  if (process.argv.includes("--json")) return;

  try {
    // Use cached result if checked within the last 24h
    const config = getConfig();
    const lastCheck = config.last_version_check ?? 0;
    const cached = config.latest_version_cache ?? null;
    const now = Date.now();

    let latest: string | undefined;

    if (now - lastCheck < UPDATE_CHECK_INTERVAL && cached) {
      latest = cached;
    } else {
      const res = await fetch(
        "https://registry.npmjs.org/openhome-cli/latest",
        { signal: AbortSignal.timeout(2000) },
      );
      const data = (await res.json()) as { version?: string };
      latest = data.version;
      if (latest && /^\d+\.\d+\.\d+$/.test(latest)) {
        config.last_version_check = now;
        config.latest_version_cache = latest;
        saveConfig(config);
      }
    }
    // Validate semver format before using — guards against poisoned registry responses
    if (!latest || latest === version) return;
    if (!/^\d+\.\d+\.\d+$/.test(latest)) return;

    // Only act if npm version is strictly newer
    const toNum = (v: string) =>
      v
        .split(".")
        .map(Number)
        .reduce((a, n) => a * 1000 + n, 0);
    if (toNum(latest) <= toNum(version)) return;

    // Detect npx: argv[1] contains _npx or npm_execpath points to npx
    const arg1 = process.argv[1] ?? "";
    const isNpx =
      arg1.includes("_npx") ||
      arg1.includes(".npm/") ||
      (process.env.npm_execpath ?? "").includes("npx");

    if (isNpx) {
      // Re-exec with latest — user gets the new version transparently
      const { execFileSync } = await import("node:child_process");
      execFileSync(
        "npx",
        [`openhome-cli@${latest}`, ...process.argv.slice(2)],
        { stdio: "inherit", env: { ...process.env, OPENHOME_NO_UPDATE: "1" } },
      );
      process.exit(0);
    } else {
      // Global install — show one-line notice, don't block
      const { default: chalk } = await import("chalk");
      console.log(
        chalk.yellow(
          `  Update available: v${version} → v${latest}   Run: npm install -g openhome-cli@latest\n`,
        ),
      );
    }
  } catch {
    // Network timeout or error — continue silently
  }
}

// ── Interactive menu (bare `openhome` with no args) ──────────────

async function ensureLoggedIn(): Promise<void> {
  const { getApiKey } = await import("./config/store.js");
  const key = getApiKey();
  if (!key) {
    await loginCommand();
    console.log("");
  }
}

async function interactiveMenu(): Promise<void> {
  p.intro(`🏠 OpenHome CLI v${version}`);

  // Login first if not authenticated
  await ensureLoggedIn();

  let running = true;
  while (running) {
    const choice = await p.select({
      message: "What would you like to do?",
      options: [
        {
          value: "deploy",
          label: "⬆️   Upload Ability",
          hint: "Upload a zip file to OpenHome",
        },
        {
          value: "list",
          label: "📋  My Abilities",
          hint: "List deployed abilities",
        },
        {
          value: "delete",
          label: "🗑️   Delete Ability",
          hint: "Remove a deployed ability",
        },
        {
          value: "toggle",
          label: "⚡  Enable / Disable",
          hint: "Toggle an ability on or off",
        },
        {
          value: "assign",
          label: "🔗  Assign to Agent",
          hint: "Link abilities to an agent",
        },
        {
          value: "agents",
          label: "🤖  My Agents",
          hint: "View agents and set default",
        },
        {
          value: "chat",
          label: "💬  Chat",
          hint: "Talk to your agent",
        },
        {
          value: "logs",
          label: "📡  Logs",
          hint: "Stream live agent messages",
        },
        {
          value: "logout",
          label: "🔓  Log Out",
          hint: "Clear credentials and re-authenticate",
        },
        { value: "exit", label: "👋  Exit", hint: "Quit" },
      ],
    });
    handleCancel(choice);

    switch (choice) {
      case "deploy":
        await deployCommand();
        break;
      case "list":
        await listCommand();
        break;
      case "delete":
        await deleteCommand();
        break;
      case "toggle":
        await toggleCommand();
        break;
      case "assign":
        await assignCommand();
        break;
      case "agents":
        await agentsCommand();
        break;
      case "chat":
        await chatCommand();
        break;
      case "logs":
        await logsCommand();
        break;
      case "logout":
        await logoutCommand();
        await ensureLoggedIn();
        break;
      case "exit":
        running = false;
        break;
    }

    if (running) {
      console.log(""); // spacing between commands
    }
  }

  p.outro("See you next time!");
}

// ── Commander subcommands (direct usage) ─────────────────────────

const program = new Command();

program
  .name("openhome")
  .description("OpenHome CLI — manage abilities from your terminal")
  .version(version, "-v, --version", "Output the current version");

program
  .command("login")
  .description("Authenticate with your OpenHome API key")
  .option("--key <api_key>", "API key (skips prompts)")
  .option("--jwt <token>", "Session token (skips browser step)")
  .action(async (opts: { key?: string; jwt?: string }) => {
    await loginCommand(opts);
  });

program
  .command("logout")
  .description("Log out and clear stored credentials")
  .action(async () => {
    await logoutCommand();
  });

program
  .command("deploy [path]")
  .description("Upload an ability zip to OpenHome")
  .option("--name <name>", "Ability name (skips prompt)")
  .option("--description <desc>", "Description (skips prompt)")
  .option(
    "--category <cat>",
    "Category: skill | brain_skill | background_daemon | local",
  )
  .option("--triggers <words>", "Comma-separated trigger words (skips prompt)")
  .option("--personality <id>", "Agent ID to attach the ability to")
  .option(
    "--timeout <seconds>",
    "Upload timeout in seconds (default: 120)",
    "120",
  )
  .option("--json", "Output machine-readable JSON")
  .option("--mock", "Use mock API client (no real network calls)")
  .action(
    async (
      path: string | undefined,
      opts: {
        mock?: boolean;
        personality?: string;
        name?: string;
        description?: string;
        category?: string;
        triggers?: string;
        timeout?: string;
        json?: boolean;
      },
    ) => {
      await deployCommand(path, opts);
    },
  );

program
  .command("chat [agent]")
  .description("Chat with an agent via WebSocket")
  .action(async (agent?: string) => {
    await chatCommand(agent);
  });

program
  .command("trigger [phrase]")
  .description("Send a trigger phrase to fire an ability remotely")
  .option("--agent <id>", "Agent ID (uses default if not set)")
  .action(async (phrase?: string, opts?: { agent?: string }) => {
    await triggerCommand(phrase, opts);
  });

program
  .command("list")
  .description("List all deployed abilities")
  .option("--json", "Output machine-readable JSON")
  .option("--mock", "Use mock API client")
  .action(async (opts: { mock?: boolean; json?: boolean }) => {
    await listCommand(opts);
  });

program
  .command("delete [ability]")
  .description("Delete a deployed ability")
  .option("--yes", "Skip confirmation prompt")
  .option("--json", "Output machine-readable JSON")
  .option("--mock", "Use mock API client")
  .action(
    async (
      ability: string | undefined,
      opts: { mock?: boolean; yes?: boolean; json?: boolean },
    ) => {
      await deleteCommand(ability, opts);
    },
  );

program
  .command("toggle [ability]")
  .description("Enable or disable a deployed ability")
  .option("--enable", "Enable the ability")
  .option("--disable", "Disable the ability")
  .option("--json", "Output machine-readable JSON")
  .option("--mock", "Use mock API client")
  .action(
    async (
      ability: string | undefined,
      opts: {
        mock?: boolean;
        enable?: boolean;
        disable?: boolean;
        json?: boolean;
      },
    ) => {
      await toggleCommand(ability, opts);
    },
  );

program
  .command("assign")
  .description("Assign abilities to an agent")
  .option("--agent <id>", "Agent ID or name (skips prompt)")
  .option(
    "--capabilities <ids>",
    "Comma-separated ability IDs or names (skips prompt)",
  )
  .option("--json", "Output machine-readable JSON")
  .option("--mock", "Use mock API client")
  .action(
    async (opts: {
      mock?: boolean;
      agent?: string;
      capabilities?: string;
      json?: boolean;
    }) => {
      await assignCommand(opts);
    },
  );

const agentsCmd = program
  .command("agents")
  .description("View your agents and set a default")
  .option("--json", "Output machine-readable JSON")
  .option("--mock", "Use mock API client")
  .action(async (opts: { mock?: boolean; json?: boolean }) => {
    await agentsCommand(opts);
  });

agentsCmd
  .command("edit [agent]")
  .description("Edit an agent's name and prompt in $EDITOR")
  .action(async (agent?: string) => {
    await agentsEditCommand(agent);
  });

program
  .command("status [ability]")
  .description("Show detailed status of an ability")
  .option("--json", "Output machine-readable JSON")
  .option("--mock", "Use mock API client")
  .action(
    async (
      ability: string | undefined,
      opts: { mock?: boolean; json?: boolean },
    ) => {
      await statusCommand(ability, opts);
    },
  );

program
  .command("config [path]")
  .description("Edit trigger words, description, or category in config.json")
  .action(async (path?: string) => {
    await configEditCommand(path);
  });

program
  .command("validate [path]")
  .description("Validate an ability directory before deploying")
  .action(async (path?: string) => {
    await validateCommand(path);
  });

program
  .command("logs")
  .description("Stream live agent messages and logs")
  .option("--agent <id>", "Agent ID (uses default if not set)")
  .action(async (opts: { agent?: string }) => {
    await logsCommand(opts);
  });

program
  .command("whoami")
  .description("Show auth status, default agent, and tracked abilities")
  .option("--json", "Output machine-readable JSON")
  .action(async (opts: { json?: boolean }) => {
    await whoamiCommand(opts);
  });

program
  .command("set-jwt [token]")
  .description(
    "Save a session token to enable deploy (list, delete, toggle, assign now use API key)",
  )
  .action(async (token?: string) => {
    await setJwtCommand(token);
  });

program
  .command("mcp")
  .description(
    "Start the OpenHome MCP voice server for Claude Code integration",
  )
  .action(async () => {
    // Launch voice-server directly in-process
    await import("./mcp/voice-server.js");
  });

// ── Entry point: menu if no args, subcommand otherwise ───────────

checkForUpdates().then(() => {
  if (process.argv.length <= 2) {
    // No TTY (agent/pipe context) → print machine-readable reference instead of
    // crashing into @clack/prompts which requires an interactive terminal
    if (!process.stdout.isTTY) {
      console.log(`# OpenHome CLI — Agent Reference v${version}

OpenHome deploys Python "abilities" to AI voice agents. This CLI manages everything non-interactively.

## Auth

Option A — Environment variables (best for CI/agents, no disk writes):
  export OPENHOME_API_KEY=<your_api_key>
  export OPENHOME_JWT=<your_session_token>
  # Then just run commands — no login needed

Option B — Persistent login (run once, creds saved to ~/.openhome/config.json):
  openhome login --key <API_KEY> --jwt <SESSION_TOKEN>
  openhome whoami

API_KEY  → app.openhome.com/dashboard/settings → API Keys
JWT      → browser console on app.openhome.com: copy(localStorage.getItem('access_token'))

Env vars take precedence over stored credentials. Use OPENHOME_NO_UPDATE=1 to skip update checks.

## Commands (add --json to any for machine-readable output)

deploy   Upload an ability zip
  openhome deploy <path.zip> --name "Name" --description "Desc" --category skill --triggers "word1,word2" [--timeout 120] [--json]
  categories: skill | brain_skill | background_daemon | local

list     Show uploaded abilities
  openhome list [--json]

delete   Delete by ID or name — --yes skips confirmation
  openhome delete <id|name> --yes [--json]

toggle   Enable or disable
  openhome toggle <id|name> --enable [--json]
  openhome toggle <id|name> --disable [--json]

assign   Link abilities to an agent (IDs or names accepted)
  openhome assign --agent <agent_id|name> --capabilities <id1,id2,...> [--json]

agents   List agents
  openhome agents [--json]

status   Detailed status for one ability
  openhome status <id|name> [--json]

whoami   Auth status, JWT expiry, default agent
  openhome whoami [--json]

trigger  Fire a trigger phrase
  openhome trigger "phrase" --agent <agent_id>

logs     Stream live agent messages
  openhome logs --agent <agent_id>

chat     WebSocket chat with an agent
  openhome chat [agent_id]

set-jwt  Save or update session token (persisted to Keychain on macOS)
  openhome set-jwt <token>

mcp      Start OpenHome MCP voice server
  openhome mcp

## Typical agent workflow
  # Auth (once — creds stored in Keychain, survive reboots)
  openhome login --key $OPENHOME_API_KEY --jwt $OPENHOME_JWT

  # Or use env vars for stateless CI (no disk writes, no login step)
  export OPENHOME_API_KEY=... OPENHOME_JWT=...

  # Deploy, list, assign, clean up
  openhome deploy ./skill.zip --name "my-skill" --description "Does X" --category skill --triggers "activate" --json
  openhome list --json
  openhome assign --agent "My Agent" --capabilities <id_from_list> --json
  openhome delete <id> --yes --json

## Exit codes
  0 = success
  1 = error
  2 = auth error (expired JWT, invalid key — needs human intervention)

## Notes
- All commands fully non-interactive when flags supplied — no TTY required
- Ability IDs are numeric (e.g. 3501); names also accepted everywhere
- Agent IDs are UUIDs; names also work in --agent
- JWT stored in macOS Keychain — survives reboots, no re-login each session
- whoami --json shows jwt_status: valid | expiring_soon | expired | missing
- OPENHOME_API_BASE overrides the API endpoint (for enterprise staging environments)
- OPENHOME_NO_UPDATE=1 disables auto-update check`);
      process.exit(0);
    }
    interactiveMenu().catch((err: unknown) => {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    });
  } else {
    program.parseAsync(process.argv).catch((err: unknown) => {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    });
  }
});
