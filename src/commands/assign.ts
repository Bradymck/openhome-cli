import { ApiClient, NotImplementedError } from "../api/client.js";
import { handleIfSessionExpired } from "./handle-session-expired.js";
import { MockApiClient } from "../api/mock-client.js";
import { getApiKey, getConfig, getJwt } from "../config/store.js";
import { error, success, info, p, handleCancel } from "../ui/format.js";
import chalk from "chalk";

export async function assignCommand(
  opts: { mock?: boolean } = {},
): Promise<void> {
  p.intro("🔗 Assign abilities to agent");

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

  const s = p.spinner();
  s.start("Fetching agents and abilities...");

  let personalities: Awaited<ReturnType<typeof client.getPersonalities>>;
  let abilities: Awaited<ReturnType<typeof client.listAbilities>>["abilities"];

  try {
    [personalities, { abilities }] = await Promise.all([
      client.getPersonalities(),
      client.listAbilities(),
    ]);
    s.stop(
      `Found ${personalities.length} agent(s), ${abilities.length} ability(s).`,
    );
  } catch (err) {
    s.stop("Failed to fetch data.");
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  if (personalities.length === 0) {
    p.outro("No agents found. Create one at https://app.openhome.com");
    return;
  }

  if (abilities.length === 0) {
    p.outro("No abilities found. Run: openhome deploy");
    return;
  }

  // Pick agent
  const agentId = await p.select({
    message: "Which agent do you want to update?",
    options: personalities.map((pers) => ({
      value: pers.id,
      label: pers.name,
      hint: chalk.gray(pers.id),
    })),
  });
  handleCancel(agentId);

  const agentName =
    personalities.find((p) => p.id === agentId)?.name ?? String(agentId);

  // Show current assignments and let user pick which abilities to assign
  info(
    `Select abilities to assign to "${agentName}". Deselecting all unassigns everything.`,
  );

  const selectedIds = await p.multiselect({
    message: `Abilities for "${agentName}"`,
    options: abilities.map((a) => ({
      value: a.ability_id,
      label: a.unique_name,
      hint: `${a.status}  v${a.version}`,
    })),
    required: false,
  });
  handleCancel(selectedIds);

  const chosenIds = selectedIds as string[];

  // Convert ability_ids to numbers for the API payload
  // The API expects numeric IDs; if the real API returns string IDs we send them as-is
  const numericIds = chosenIds
    .map((id) => Number(id))
    .filter((id) => !Number.isNaN(id));

  // If any ID couldn't be parsed as a number, fall back to the raw list
  // (lets the server validate — better than silently dropping)
  const capabilityIds =
    numericIds.length === chosenIds.length
      ? numericIds
      : (chosenIds as unknown as number[]);

  s.start(`Assigning ${chosenIds.length} ability(s) to "${agentName}"...`);
  try {
    const result = await client.assignCapabilities(
      agentId as string,
      capabilityIds,
    );
    s.stop("Done.");
    success(
      result.message ??
        `"${agentName}" updated with ${chosenIds.length} ability(s).`,
    );
    p.outro("Done.");
  } catch (err) {
    s.stop("Failed.");

    if (err instanceof NotImplementedError) {
      p.note("Assign endpoint not yet implemented.", "API Not Available Yet");
      return;
    }

    if (await handleIfSessionExpired(err)) return;
    error(`Assign failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
