import { Command } from "commander";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";

import { loginCommand } from "./commands/login.js";
import { initCommand } from "./commands/init.js";
import { validateCommand } from "./commands/validate.js";
import { deployCommand } from "./commands/deploy.js";
import { listCommand } from "./commands/list.js";
import { statusCommand } from "./commands/status.js";
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

async function interactiveMenu(): Promise<void> {
  p.intro(`🏠 OpenHome CLI v${version}`);

  let running = true;
  while (running) {
    const choice = await p.select({
      message: "What would you like to do?",
      options: [
        {
          value: "login",
          label: "🔑  Login",
          hint: "Authenticate with your API key",
        },
        {
          value: "init",
          label: "✨  Create Ability",
          hint: "Scaffold a new ability",
        },
        {
          value: "validate",
          label: "🔎  Validate",
          hint: "Check ability structure",
        },
        {
          value: "deploy",
          label: "🚀  Deploy",
          hint: "Upload ability to OpenHome",
        },
        {
          value: "list",
          label: "📋  My Abilities",
          hint: "List deployed abilities",
        },
        { value: "status", label: "🔍  Status", hint: "Check ability status" },
        { value: "exit", label: "👋  Exit", hint: "Quit" },
      ],
    });
    handleCancel(choice);

    switch (choice) {
      case "login":
        await loginCommand();
        break;
      case "init":
        await initCommand();
        break;
      case "validate": {
        const path = await p.text({
          message: "Path to ability directory",
          placeholder: ".",
          defaultValue: ".",
        });
        handleCancel(path);
        await validateCommand(path as string);
        break;
      }
      case "deploy": {
        const path = await p.text({
          message: "Path to ability directory",
          placeholder: ".",
          defaultValue: ".",
        });
        handleCancel(path);
        await deployCommand(path as string);
        break;
      }
      case "list":
        await listCommand();
        break;
      case "status": {
        const ability = await p.text({
          message: "Ability name (leave empty to read from config.json)",
          placeholder: "my-ability",
        });
        handleCancel(ability);
        await statusCommand((ability as string) || undefined);
        break;
      }
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
  .command("init [name]")
  .description("Scaffold a new ability in a new directory")
  .action(async (name?: string) => {
    await initCommand(name);
  });

program
  .command("validate [path]")
  .description("Validate an ability directory (default: current directory)")
  .action(async (path?: string) => {
    await validateCommand(path ?? ".");
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
  .command("list")
  .description("List all deployed abilities")
  .option("--mock", "Use mock API client")
  .action(async (opts: { mock?: boolean }) => {
    await listCommand(opts);
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
