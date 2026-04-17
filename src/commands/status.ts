import { join, resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { ApiClient, NotImplementedError } from "../api/client.js";
import { MockApiClient } from "../api/mock-client.js";
import {
  getApiKey,
  getApiBase,
  getJwt,
  getTrackedAbilities,
} from "../config/store.js";
import { NO_API_KEY_MSG } from "./auth-messages.js";
import {
  error,
  info,
  p,
  handleCancel,
  jsonOut,
  jsonError,
} from "../ui/format.js";
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

function readAbilityName(dir: string): string | null {
  const configPath = join(dir, "config.json");
  if (!existsSync(configPath)) return null;
  try {
    const cfg = JSON.parse(readFileSync(configPath, "utf8")) as {
      unique_name?: string;
    };
    return cfg.unique_name ?? null;
  } catch {
    return null;
  }
}

async function resolveAbilityName(): Promise<string | undefined> {
  const cwdName = readAbilityName(resolve("."));
  if (cwdName) {
    info(`Detected ability: ${cwdName}`);
    return cwdName;
  }

  const tracked = getTrackedAbilities();
  const home = homedir();
  const options: { value: string; label: string; hint?: string }[] = [];

  for (const a of tracked) {
    const name = readAbilityName(a.path);
    if (name) {
      options.push({
        value: name,
        label: a.name,
        hint: a.path.startsWith(home)
          ? `~${a.path.slice(home.length)}`
          : a.path,
      });
    }
  }

  if (options.length === 1) {
    info(`Using ability: ${options[0].label}`);
    return options[0].value;
  }

  if (options.length > 0) {
    const selected = await p.select({
      message: "Which ability do you want to check?",
      options,
    });
    handleCancel(selected);
    return selected as string;
  }

  return undefined;
}

export async function statusCommand(
  abilityArg?: string,
  opts: { mock?: boolean; json?: boolean } = {},
): Promise<void> {
  let abilityId = abilityArg;

  if (!abilityId) {
    abilityId = await resolveAbilityName();
  }

  if (!abilityId) {
    if (opts.json)
      jsonError(
        "NO_ABILITY",
        "No ability found. Pass a name or run from an ability directory.",
      );
    error(
      "No ability found. Pass a name, run from an ability directory, or create one with: openhome init",
    );
    process.exit(1);
  }

  if (!opts.json) p.intro(`🔍 Status: ${abilityId}`);

  let client: ApiClient | MockApiClient;

  if (opts.mock) {
    client = new MockApiClient();
  } else {
    const apiKey = getApiKey() ?? "";
    const jwt = getJwt() ?? undefined;
    if (!apiKey && !jwt) {
      if (opts.json) jsonError("UNAUTHENTICATED", NO_API_KEY_MSG, 2);
      error("Not authenticated. Run: openhome login");
      process.exit(1);
    }
    client = new ApiClient(apiKey, getApiBase(), jwt);
  }

  const s = opts.json ? null : p.spinner();
  s?.start("Fetching status...");

  try {
    const ability = await client.getAbility(abilityId);
    s?.stop("Status loaded.");

    if (opts.json) {
      jsonOut({ ok: true, ability });
      return;
    }

    p.note(
      [
        `Name:       ${ability.unique_name}`,
        `Display:    ${ability.display_name}`,
        `Status:     ${statusBadge(ability.status)}`,
        `Version:    v${ability.version}`,
        `Updated:    ${new Date(ability.updated_at).toLocaleString()}`,
        `Created:    ${new Date(ability.created_at).toLocaleString()}`,
        ability.personality_ids.length > 0
          ? `Linked to:  ${ability.personality_ids.join(", ")}`
          : null,
      ]
        .filter(Boolean)
        .join("\n"),
      "Ability Details",
    );

    if (ability.validation_errors.length > 0) {
      p.note(
        ability.validation_errors.map((e) => chalk.red(`✗ ${e}`)).join("\n"),
        "Validation Errors",
      );
    }

    if (ability.deploy_history.length > 0) {
      const historyLines = ability.deploy_history.map((event) => {
        const icon =
          event.status === "success" ? chalk.green("✓") : chalk.red("✗");
        return `${icon}  v${event.version}  ${event.message}  ${chalk.gray(new Date(event.timestamp).toLocaleString())}`;
      });
      p.note(historyLines.join("\n"), "Deploy History");
    }

    p.outro("Done.");
  } catch (err) {
    s?.stop("Failed.");

    if (err instanceof NotImplementedError) {
      if (opts.json)
        jsonError("NOT_IMPLEMENTED", "Status endpoint not yet implemented.");
      p.note("Use --mock to see example output.", "API Not Available Yet");
      p.outro("Status endpoint not yet implemented.");
      return;
    }
    const msg = `Failed to get status: ${err instanceof Error ? err.message : String(err)}`;
    if (opts.json) jsonError("ERROR", msg);
    error(msg);
    process.exit(1);
  }
}
