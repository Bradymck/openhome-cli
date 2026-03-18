import { ApiClient, NotImplementedError } from "../api/client.js";
import { MockApiClient } from "../api/mock-client.js";
import { getApiKey, getConfig } from "../config/store.js";
import { error, warn, info, header, table } from "../ui/format.js";
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
  header("Abilities");

  let client: ApiClient | MockApiClient;

  if (opts.mock) {
    client = new MockApiClient();
  } else {
    const apiKey = getApiKey();
    if (!apiKey) {
      error("Not authenticated. Run: openhome login");
      process.exit(1);
    }
    client = new ApiClient(apiKey, getConfig().api_base_url);
  }

  try {
    const { abilities } = await client.listAbilities();

    if (abilities.length === 0) {
      info("No abilities found. Run: openhome deploy");
      return;
    }

    const rows: TableRow[] = abilities.map((a) => ({
      Name: a.unique_name,
      Display: a.display_name,
      Version: a.version,
      Status: statusColor(a.status),
      Updated: new Date(a.updated_at).toLocaleDateString(),
    }));

    table(rows);
    console.log(`\n${abilities.length} ability(s) total.`);
  } catch (err) {
    if (err instanceof NotImplementedError) {
      warn("The list endpoint is not yet available on the OpenHome server.");
      warn("Use --mock to see example output.");
      return;
    }
    error(
      `Failed to list abilities: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  }
}
