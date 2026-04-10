import { ApiClient, NotImplementedError } from "../api/client.js";
import { handleIfSessionExpired } from "./handle-session-expired.js";
import { MockApiClient } from "../api/mock-client.js";
import { getApiKey, getConfig, getJwt } from "../config/store.js";
import { error, success, p, handleCancel } from "../ui/format.js";
import chalk from "chalk";

export async function toggleCommand(
  abilityArg?: string,
  opts: { mock?: boolean; enable?: boolean; disable?: boolean } = {},
): Promise<void> {
  p.intro("⚡ Enable / Disable ability");

  let client: ApiClient | MockApiClient;

  if (opts.mock) {
    client = new MockApiClient();
  } else {
    const apiKey = getApiKey() ?? "";
    const jwt = getJwt() ?? undefined;
    if (!apiKey) {
      error("Not authenticated. Run: openhome login");
      process.exit(1);
    }
    client = new ApiClient(apiKey, getConfig().api_base_url, jwt);
  }

  // Fetch abilities
  const s = p.spinner();
  s.start("Fetching abilities...");

  let abilities: Awaited<ReturnType<typeof client.listAbilities>>["abilities"];
  try {
    const result = await client.listAbilities();
    abilities = result.abilities;
    s.stop(`Found ${abilities.length} ability(s).`);
  } catch (err) {
    s.stop("Failed to fetch abilities.");
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  if (abilities.length === 0) {
    p.outro("No abilities found.");
    return;
  }

  // Resolve target
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

  // Resolve enable/disable
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

  s.start(`${enabled ? "Enabling" : "Disabling"} "${targetName}"...`);
  try {
    const result = await client.toggleCapability(targetId, enabled);
    s.stop("Done.");
    success(
      result.message ??
        `"${targetName}" ${enabled ? "enabled" : "disabled"} successfully.`,
    );
    p.outro("Done.");
  } catch (err) {
    s.stop("Failed.");

    if (err instanceof NotImplementedError) {
      p.note("Toggle endpoint not yet implemented.", "API Not Available Yet");
      return;
    }

    if (await handleIfSessionExpired(err)) return;
    error(`Toggle failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
