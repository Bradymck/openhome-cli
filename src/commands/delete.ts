import { ApiClient, NotImplementedError } from "../api/client.js";
import { handleIfSessionExpired } from "./handle-session-expired.js";
import { MockApiClient } from "../api/mock-client.js";
import { getApiKey, getConfig, getJwt } from "../config/store.js";
import { error, success, p, handleCancel } from "../ui/format.js";
import chalk from "chalk";

export async function deleteCommand(
  abilityArg?: string,
  opts: { mock?: boolean } = {},
): Promise<void> {
  p.intro("🗑️  Delete ability");

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

  // Fetch abilities to let user pick
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
    p.outro("No abilities to delete.");
    return;
  }

  // Resolve target: arg → match by name, or prompt
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
      message: "Which ability do you want to delete?",
      options: abilities.map((a) => ({
        value: a.ability_id,
        label: a.unique_name,
        hint: `${chalk.gray(a.status)}  v${a.version}`,
      })),
    });
    handleCancel(selected);
    targetId = selected as string;
    targetName =
      abilities.find((a) => a.ability_id === targetId)?.unique_name ?? targetId;
  }

  // Confirm
  const confirmed = await p.confirm({
    message: `Delete "${targetName}"? This cannot be undone.`,
    initialValue: false,
  });
  handleCancel(confirmed);

  if (!confirmed) {
    p.cancel("Aborted.");
    return;
  }

  s.start(`Deleting "${targetName}"...`);
  try {
    const result = await client.deleteCapability(targetId);
    s.stop("Deleted.");
    success(result.message ?? `"${targetName}" deleted successfully.`);
    p.outro("Done.");
  } catch (err) {
    s.stop("Delete failed.");

    if (err instanceof NotImplementedError) {
      p.note("API Not Available Yet", "Delete endpoint not yet implemented.");
      return;
    }

    if (await handleIfSessionExpired(err)) return;
    error(`Delete failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
