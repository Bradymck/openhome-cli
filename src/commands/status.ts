import { join, resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { ApiClient, NotImplementedError } from "../api/client.js";
import { MockApiClient } from "../api/mock-client.js";
import { getApiKey, getConfig } from "../config/store.js";
import { success, error, warn, info, header } from "../ui/format.js";
import chalk from "chalk";

function statusBadge(status: string): string {
  switch (status) {
    case "active":
      return chalk.bgGreen.black(` ${status.toUpperCase()} `);
    case "processing":
      return chalk.bgYellow.black(` ${status.toUpperCase()} `);
    case "failed":
      return chalk.bgRed.white(` ${status.toUpperCase()} `);
    case "disabled":
      return chalk.bgGray.white(` ${status.toUpperCase()} `);
    default:
      return chalk.bgWhite.black(` ${status.toUpperCase()} `);
  }
}

export async function statusCommand(
  abilityArg?: string,
  opts: { mock?: boolean } = {},
): Promise<void> {
  let abilityId = abilityArg;

  // If no arg, try to read from local config.json
  if (!abilityId) {
    const localConfig = join(resolve("."), "config.json");
    if (existsSync(localConfig)) {
      try {
        const cfg = JSON.parse(readFileSync(localConfig, "utf8")) as {
          unique_name?: string;
        };
        abilityId = cfg.unique_name;
      } catch {
        // ignore
      }
    }
  }

  if (!abilityId) {
    error(
      "No ability name specified. Pass a name or run from an ability directory.",
    );
    process.exit(1);
  }

  header(`Status: ${abilityId}`);

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
    const ability = await client.getAbility(abilityId);

    info(`Name:       ${ability.unique_name}`);
    info(`Display:    ${ability.display_name}`);
    info(`Status:     ${statusBadge(ability.status)}`);
    info(`Version:    v${ability.version}`);
    info(`Updated:    ${new Date(ability.updated_at).toLocaleString()}`);
    info(`Created:    ${new Date(ability.created_at).toLocaleString()}`);

    if (ability.personality_ids.length > 0) {
      info(`Linked to:  ${ability.personality_ids.join(", ")}`);
    }

    if (ability.validation_errors.length > 0) {
      console.log("");
      warn("Validation errors:");
      for (const e of ability.validation_errors) {
        error(`  ${e}`);
      }
    }

    if (ability.deploy_history.length > 0) {
      console.log("");
      info("Deploy history:");
      for (const event of ability.deploy_history) {
        const icon =
          event.status === "success" ? chalk.green("✓") : chalk.red("✗");
        console.log(
          `  ${icon}  v${event.version}  ${event.message}  ${chalk.gray(new Date(event.timestamp).toLocaleString())}`,
        );
      }
    }
  } catch (err) {
    if (err instanceof NotImplementedError) {
      warn("The status endpoint is not yet available on the OpenHome server.");
      warn("Use --mock to see example output.");
      return;
    }
    error(
      `Failed to get status: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  }
}
