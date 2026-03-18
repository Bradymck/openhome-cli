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
  .option("--personality <id>", "Personality ID to attach the ability to")
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

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
