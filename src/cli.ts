import { Command } from "commander";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";

import { loginCommand } from "./commands/login.js";
import { initCommand } from "./commands/init.js";
import { deployCommand } from "./commands/deploy.js";
import { deleteCommand } from "./commands/delete.js";
import { toggleCommand } from "./commands/toggle.js";
import { assignCommand } from "./commands/assign.js";
import { listCommand } from "./commands/list.js";
import { statusCommand } from "./commands/status.js";
import { agentsCommand } from "./commands/agents.js";
import { logoutCommand } from "./commands/logout.js";
import { chatCommand } from "./commands/chat.js";
import { triggerCommand } from "./commands/trigger.js";
import { whoamiCommand } from "./commands/whoami.js";
import { configEditCommand } from "./commands/config-edit.js";
import { logsCommand } from "./commands/logs.js";
import { setJwtCommand } from "./commands/set-jwt.js";
import { validateCommand } from "./commands/validate.js";
import { p, handleCancel } from "./ui/format.js";

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
async function checkForUpdates(): Promise<void> {
  // Skip if explicitly disabled or already running via auto-update re-exec
  if (process.env.OPENHOME_NO_UPDATE === "1") return;

  try {
    const res = await fetch("https://registry.npmjs.org/openhome-cli/latest", {
      signal: AbortSignal.timeout(2000),
    });
    const data = (await res.json()) as { version?: string };
    const latest = data.version;
    if (!latest || latest === version) return;

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
          value: "init",
          label: "✨  Scaffold Ability",
          hint: "Generate a new ability from a template",
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
      case "init":
        await initCommand();
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
  .action(async () => {
    await loginCommand();
  });

program
  .command("logout")
  .description("Log out and clear stored credentials")
  .action(async () => {
    await logoutCommand();
  });

program
  .command("init [name]")
  .description("Scaffold a new ability from templates")
  .action(async (name?: string) => {
    await initCommand(name);
  });

program
  .command("deploy [path]")
  .description("Validate and deploy an ability to OpenHome")
  .option("--dry-run", "Show what would be deployed without sending")
  .option("--mock", "Use mock API client (no real network calls)")
  .option("--personality <id>", "Agent ID to attach the ability to")
  .action(
    async (
      path: string | undefined,
      opts: { dryRun?: boolean; mock?: boolean; personality?: string },
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
  .option("--mock", "Use mock API client")
  .action(async (opts: { mock?: boolean }) => {
    await listCommand(opts);
  });

program
  .command("delete [ability]")
  .description("Delete a deployed ability")
  .option("--mock", "Use mock API client")
  .action(async (ability: string | undefined, opts: { mock?: boolean }) => {
    await deleteCommand(ability, opts);
  });

program
  .command("toggle [ability]")
  .description("Enable or disable a deployed ability")
  .option("--enable", "Enable the ability")
  .option("--disable", "Disable the ability")
  .option("--mock", "Use mock API client")
  .action(
    async (
      ability: string | undefined,
      opts: { mock?: boolean; enable?: boolean; disable?: boolean },
    ) => {
      await toggleCommand(ability, opts);
    },
  );

program
  .command("assign")
  .description("Assign abilities to an agent")
  .option("--mock", "Use mock API client")
  .action(async (opts: { mock?: boolean }) => {
    await assignCommand(opts);
  });

program
  .command("agents")
  .description("View your agents and set a default")
  .option("--mock", "Use mock API client")
  .action(async (opts: { mock?: boolean }) => {
    await agentsCommand(opts);
  });

program
  .command("status [ability]")
  .description("Show detailed status of an ability")
  .option("--mock", "Use mock API client")
  .action(async (ability: string | undefined, opts: { mock?: boolean }) => {
    await statusCommand(ability, opts);
  });

program
  .command("config [path]")
  .description("Edit trigger words, description, or category in config.json")
  .action(async (path?: string) => {
    await configEditCommand(path);
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
  .action(async () => {
    await whoamiCommand();
  });

program
  .command("validate [path]")
  .description("Check an ability for errors before deploying")
  .action(async (path?: string) => {
    await validateCommand(path);
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
