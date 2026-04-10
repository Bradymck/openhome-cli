import { ApiClient, NotImplementedError } from "../api/client.js";
import { handleIfSessionExpired } from "./handle-session-expired.js";
import { MockApiClient } from "../api/mock-client.js";
import { getApiKey, getConfig, getJwt } from "../config/store.js";
import { error, warn, info, table, p } from "../ui/format.js";
import type { TableRow } from "../ui/format.js";
import chalk from "chalk";

function statusColor(status: string): string {
  switch (status) {
    case "active":
      return chalk.green(status);
    case "processing":
      return chalk.yellow(status);
    case "failed":
      return chalk.red(status);
    case "disabled":
      return chalk.gray(status);
    default:
      return status;
  }
}

export async function listCommand(
  opts: { mock?: boolean } = {},
): Promise<void> {
  p.intro("📋 Your abilities");

  let client: ApiClient | MockApiClient;

  if (opts.mock) {
    client = new MockApiClient();
  } else {
    const apiKey = getApiKey() ?? "";
    const jwt = getJwt() ?? undefined;
    if (!apiKey && !jwt) {
      error("Not authenticated. Run: openhome login");
      process.exit(1);
    }
    if (!jwt) {
      error(
        "This command requires a session token.\nGet it from app.openhome.com → DevTools → Application → Local Storage → token\nThen run: openhome set-jwt <token>",
      );
      process.exit(1);
    }
    client = new ApiClient(apiKey, getConfig().api_base_url, jwt);
  }

  const s = p.spinner();
  s.start("Fetching abilities...");

  try {
    const { abilities } = await client.listAbilities();
    s.stop(`Found ${abilities.length} ability(s).`);

    if (abilities.length === 0) {
      info("No abilities found. Run: openhome init");
      p.outro("Deploy your first ability with: openhome deploy");
      return;
    }

    const rows: TableRow[] = abilities.map((a) => ({
      Name: a.unique_name,
      Display: a.display_name,
      Version: a.version,
      Status: statusColor(a.status),
      Updated: new Date(a.updated_at).toLocaleDateString(),
    }));

    console.log("");
    table(rows);
    p.outro(`${abilities.length} ability(s) total.`);
  } catch (err) {
    s.stop("Failed.");

    if (err instanceof NotImplementedError) {
      p.note("Use --mock to see example output.", "API Not Available Yet");
      p.outro("List endpoint not yet implemented.");
      return;
    }
    if (await handleIfSessionExpired(err)) return;
    error(
      `Failed to list abilities: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  }
}
