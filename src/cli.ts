import { Command } from "commander";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { readFileSync } from "node:fs";

import { existsSync } from "node:fs";
import { resolve, basename } from "node:path";

import { loginCommand } from "./commands/login.js";
import { initCommand } from "./commands/init.js";
import { deployCommand } from "./commands/deploy.js";
import { listCommand } from "./commands/list.js";
import { statusCommand } from "./commands/status.js";
import { agentsCommand } from "./commands/agents.js";
import { logoutCommand } from "./commands/logout.js";
import { chatCommand } from "./commands/chat.js";
import { p, handleCancel, info } from "./ui/format.js";

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

/** Check if a directory looks like an ability (has config.json). */
function detectAbility(dir: string): boolean {
  return existsSync(resolve(dir, "config.json"));
}

/** Resolve the ability directory — pick from tracked abilities, detect cwd, or prompt. */
async function resolveAbilityDir(): Promise<string> {
  const { getTrackedAbilities } = await import("./config/store.js");
  const tracked = getTrackedAbilities();
  const cwd = process.cwd();
  const cwdIsAbility = detectAbility(cwd);

  // Build options from tracked abilities + cwd if it's an ability not already tracked
  const options: { value: string; label: string; hint?: string }[] = [];

  for (const a of tracked) {
    options.push({
      value: a.path,
      label: a.name,
      hint: a.path.startsWith(homedir())
        ? `~${a.path.slice(homedir().length)}`
        : a.path,
    });
  }

  if (cwdIsAbility && !tracked.some((a) => a.path === cwd)) {
    options.push({
      value: cwd,
      label: basename(cwd),
      hint: "(current directory)",
    });
  }

  // If we have exactly one option, auto-select it
  if (options.length === 1) {
    info(`Using ability: ${options[0].label} (${options[0].hint})`);
    return options[0].value;
  }

  // If we have multiple options, let user pick
  if (options.length > 0) {
    options.push({
      value: "__custom__",
      label: "Other...",
      hint: "Enter a path manually",
    });

    const selected = await p.select({
      message: "Which ability do you want to deploy?",
      options,
    });
    handleCancel(selected);

    if (selected !== "__custom__") {
      return selected as string;
    }
  }

  // Fallback: manual path entry
  const path = await p.text({
    message: "Path to ability directory",
    placeholder: "./my-ability",
    validate: (val) => {
      if (!val || !val.trim()) return "Path is required";
      if (!existsSync(resolve(val.trim(), "config.json"))) {
        return `No config.json found in "${val.trim()}"`;
      }
    },
  });
  handleCancel(path);
  return resolve((path as string).trim());
}

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
          value: "logout",
          label: "🔓  Log Out",
          hint: "Clear credentials and re-authenticate",
        },
        {
          value: "init",
          label: "✨  Create Ability",
          hint: "Scaffold a new ability",
        },
        {
          value: "deploy",
          label: "🚀  Deploy",
          hint: "Upload ability to OpenHome",
        },
        {
          value: "chat",
          label: "💬  Chat",
          hint: "Talk to your agent (trigger abilities with keywords)",
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
        { value: "exit", label: "👋  Exit", hint: "Quit" },
      ],
    });
    handleCancel(choice);

    switch (choice) {
      case "logout":
        await logoutCommand();
        await ensureLoggedIn();
        break;
      case "init":
        await initCommand();
        break;
      case "deploy": {
        const dir = await resolveAbilityDir();
        await deployCommand(dir);
        break;
      }
      case "chat":
        await chatCommand();
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
  .description("Scaffold a new ability in a new directory")
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
      await deployCommand(path ?? ".", opts);
    },
  );

program
  .command("chat [agent]")
  .description(
    "Chat with an agent via WebSocket (send trigger words to activate abilities)",
  )
  .action(async (agent?: string) => {
    await chatCommand(agent);
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
  .description(
    "Show detailed status of an ability (by name or from config.json)",
  )
  .option("--mock", "Use mock API client")
  .action(async (ability: string | undefined, opts: { mock?: boolean }) => {
    await statusCommand(ability, opts);
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
