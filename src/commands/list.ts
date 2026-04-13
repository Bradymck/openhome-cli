import { ApiClient, NotImplementedError } from "../api/client.js";
import { handleIfSessionExpired } from "./handle-session-expired.js";
import { MockApiClient } from "../api/mock-client.js";
import { getApiKey, getApiBase, getJwt } from "../config/store.js";
import { error, info, table, p, jsonOut, jsonError } from "../ui/format.js";
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
  opts: { mock?: boolean; json?: boolean } = {},
): Promise<void> {
  if (!opts.json) p.intro("📋 Your abilities");

  let client: ApiClient | MockApiClient;

  if (opts.mock) {
    client = new MockApiClient();
  } else {
    const apiKey = getApiKey() ?? "";
    const jwt = getJwt() ?? undefined;
    if (!apiKey && !jwt) {
      if (opts.json)
        jsonError(
          "UNAUTHENTICATED",
          "Not authenticated. Set OPENHOME_API_KEY and OPENHOME_JWT env vars.",
          2,
        );
      error("Not authenticated. Run: openhome login");
      process.exit(1);
    }
    if (!jwt) {
      if (opts.json)
        jsonError(
          "NO_JWT",
          "Session token required. Set OPENHOME_JWT env var or run: openhome set-jwt <token>",
          2,
        );
      error("Session token required. Run: openhome set-jwt <token>");
      process.exit(1);
    }
    client = new ApiClient(apiKey, getApiBase(), jwt);
  }

  const s = opts.json ? null : p.spinner();
  s?.start("Fetching abilities...");

  try {
    const { abilities } = await client.listAbilities();
    s?.stop(`Found ${abilities.length} ability(s).`);

    if (opts.json) {
      jsonOut({
        ok: true,
        abilities: abilities.map((a) => ({
          id: a.ability_id,
          name: a.unique_name,
          display_name: a.display_name,
          version: a.version,
          status: a.status,
          category: (a as { category?: string }).category,
          trigger_words:
            (a as { trigger_words?: string[] }).trigger_words ?? [],
          updated_at: a.updated_at,
        })),
        count: abilities.length,
      });
      return;
    }

    if (abilities.length === 0) {
      info("No abilities found. Run: openhome deploy");
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
    s?.stop("Failed.");

    if (err instanceof NotImplementedError) {
      if (opts.json)
        jsonError("NOT_IMPLEMENTED", "List endpoint not yet implemented.");
      p.note("Use --mock to see example output.", "API Not Available Yet");
      p.outro("List endpoint not yet implemented.");
      return;
    }
    if (await handleIfSessionExpired(err, opts)) return;
    const msg = err instanceof Error ? err.message : String(err);
    if (opts.json) jsonError("ERROR", msg);
    error(`Failed to list abilities: ${msg}`);
    process.exit(1);
  }
}
