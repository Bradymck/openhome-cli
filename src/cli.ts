import { Command } from "commander";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";

import { loginCommand } from "./commands/login.js";
import { initCommand } from "./commands/init.js";
import { deployCommand } from "./commands/deploy.js";
import { listCommand } from "./commands/list.js";
import { statusCommand } from "./commands/status.js";
import { agentsCommand } from "./commands/agents.js";
import { logoutCommand } from "./commands/logout.js";
import { chatCommand } from "./commands/chat.js";
import { triggerCommand } from "./commands/trigger.js";
import { whoamiCommand } from "./commands/whoami.js";
import { configEditCommand } from "./commands/config-edit.js";
import { logsCommand } from "./commands/logs.js";
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
          value: "init",
          label: "✨  Create Ability",
          hint: "Scaffold a new ability from templates",
        },
        {
          value: "deploy",
          label: "🚀  Deploy",
          hint: "Upload ability to OpenHome",
        },
        {
          value: "chat",
          label: "💬  Chat",
          hint: "Talk to your agent",
        },
        {
          value: "trigger",
          label: "⚡  Trigger",
          hint: "Fire an ability remotely with a phrase",
        },
        {
          value: "list",
          label: "📋  My Abilities",
          hint: "List deployed abilities",
        },
        {
          value: "agents",
          label: "🤖  My Agents",
          hint: "View agents and set default",
        },
        {
          value: "status",
          label: "🔍  Status",
          hint: "Check ability status",
        },
        {
          value: "config",
          label: "⚙️   Edit Config",
          hint: "Update trigger words, description, category",
        },
        {
          value: "logs",
          label: "📡  Logs",
          hint: "Stream live agent messages",
        },
        {
          value: "whoami",
          label: "👤  Who Am I",
          hint: "Show auth, default agent, tracked abilities",
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
      case "init":
        await initCommand();
        break;
      case "deploy":
        await deployCommand();
        break;
      case "chat":
        await chatCommand();
        break;
      case "trigger":
        await triggerCommand();
        break;
      case "list":
        await listCommand();
        break;
      case "agents":
        await agentsCommand();
        break;
      case "status":
        await statusCommand();
        break;
      case "config":
        await configEditCommand();
        break;
      case "logs":
        await logsCommand();
        break;
      case "whoami":
        await whoamiCommand();
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

// ── Entry point: menu if no args, subcommand otherwise ───────────

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
