import { ApiClient, NotImplementedError } from "../api/client.js";
import { handleIfSessionExpired } from "./handle-session-expired.js";
import { MockApiClient } from "../api/mock-client.js";
import { getApiKey, getApiBase, getJwt } from "../config/store.js";
import { NO_API_KEY_MSG } from "./auth-messages.js";
import {
  error,
  success,
  p,
  handleCancel,
  jsonOut,
  jsonError,
} from "../ui/format.js";
import chalk from "chalk";

export async function toggleCommand(
  abilityArg?: string,
  opts: {
    mock?: boolean;
    enable?: boolean;
    disable?: boolean;
    json?: boolean;
  } = {},
): Promise<void> {
  if (!opts.json) p.intro("⚡ Enable / Disable ability");

  let client: ApiClient | MockApiClient;

  if (opts.mock) {
    client = new MockApiClient();
  } else {
    const apiKey = getApiKey() ?? "";
    const jwt = getJwt() ?? undefined;
    if (!apiKey) {
      if (opts.json) jsonError("UNAUTHENTICATED", NO_API_KEY_MSG, 2);
      error("Not authenticated. Run: openhome login");
      process.exit(1);
    }
    client = new ApiClient(apiKey, getApiBase(), jwt);
  }

  const s = opts.json ? null : p.spinner();
  s?.start("Fetching abilities...");

  let abilities: Awaited<ReturnType<typeof client.listAbilities>>["abilities"];
  try {
    const result = await client.listAbilities();
    abilities = result.abilities;
    s?.stop(`Found ${abilities.length} ability(s).`);
  } catch (err) {
    s?.stop("Failed to fetch abilities.");
    const msg = err instanceof Error ? err.message : String(err);
    if (opts.json) jsonError("ERROR", msg);
    error(msg);
    process.exit(1);
  }

  if (abilities.length === 0) {
    if (opts.json)
      jsonOut({
        ok: false,
        error: { code: "NO_ABILITIES", message: "No abilities found." },
      });
    else p.outro("No abilities found.");
    return;
  }

  let targetId: string;
  let targetName: string;

  if (abilityArg) {
    const match = abilities.find(
      (a) =>
        a.unique_name === abilityArg ||
        a.display_name === abilityArg ||
        a.ability_id === abilityArg,
    );
    if (!match) {
      if (opts.json)
        jsonError("NOT_FOUND", `No ability found matching "${abilityArg}".`);
      error(`No ability found matching "${abilityArg}".`);
      process.exit(1);
    }
    targetId = match.ability_id;
    targetName = match.unique_name;
  } else {
    const selected = await p.select({
      message: "Which ability do you want to toggle?",
      options: abilities.map((a) => ({
        value: a.ability_id,
        label: a.unique_name,
        hint: `${a.status === "disabled" ? chalk.gray("disabled") : chalk.green("enabled")}  v${a.version}`,
      })),
    });
    handleCancel(selected);
    targetId = selected as string;
    targetName =
      abilities.find((a) => a.ability_id === targetId)?.unique_name ?? targetId;
  }

  let enabled: boolean;

  if (opts.enable) {
    enabled = true;
  } else if (opts.disable) {
    enabled = false;
  } else {
    const current = abilities.find((a) => a.ability_id === targetId);
    const action = await p.select({
      message: `"${targetName}" is currently ${current?.status ?? "unknown"}. What do you want to do?`,
      options: [
        { value: "enable", label: "Enable" },
        { value: "disable", label: "Disable" },
      ],
    });
    handleCancel(action);
    enabled = action === "enable";
  }

  s?.start(`${enabled ? "Enabling" : "Disabling"} "${targetName}"...`);
  try {
    const result = await client.toggleCapability(targetId, enabled);
    s?.stop("Done.");

    if (opts.json) {
      jsonOut({
        ok: true,
        id: targetId,
        name: targetName,
        enabled,
        message:
          result.message ?? `${enabled ? "Enabled" : "Disabled"} successfully.`,
      });
      return;
    }

    success(
      result.message ??
        `"${targetName}" ${enabled ? "enabled" : "disabled"} successfully.`,
    );
    p.outro("Done.");
  } catch (err) {
    s?.stop("Failed.");

    if (err instanceof NotImplementedError) {
      if (opts.json)
        jsonError("NOT_IMPLEMENTED", "Toggle endpoint not yet implemented.");
      p.note("Toggle endpoint not yet implemented.", "API Not Available Yet");
      return;
    }

    if (await handleIfSessionExpired(err, opts)) return;
    const msg = `Toggle failed: ${err instanceof Error ? err.message : String(err)}`;
    if (opts.json) jsonError("ERROR", msg);
    error(msg);
    process.exit(1);
  }
}
