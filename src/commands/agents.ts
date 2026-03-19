import { ApiClient, NotImplementedError } from "../api/client.js";
import { MockApiClient } from "../api/mock-client.js";
import { getApiKey, getConfig, saveConfig } from "../config/store.js";
import { error, success, info, p, handleCancel } from "../ui/format.js";
import chalk from "chalk";

export async function agentsCommand(
  opts: { mock?: boolean } = {},
): Promise<void> {
  p.intro("🤖 Your Agents");

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

  const s = p.spinner();
  s.start("Fetching agents...");

  try {
    const personalities = await client.getPersonalities();
    s.stop(`Found ${personalities.length} agent(s).`);

    if (personalities.length === 0) {
      info("No agents found. Create one at https://app.openhome.com");
      p.outro("Done.");
      return;
    }

    p.note(
      personalities
        .map((pers) => `${chalk.bold(pers.name)}  ${chalk.gray(pers.id)}`)
        .join("\n"),
      "Agents",
    );

    const config = getConfig();
    const currentDefault = config.default_personality_id;

    if (currentDefault) {
      const match = personalities.find((p) => p.id === currentDefault);
      info(`Default agent: ${match ? match.name : currentDefault}`);
    }

    const setDefault = await p.confirm({
      message: "Set or change your default agent?",
    });
    handleCancel(setDefault);

    if (setDefault) {
      const selected = await p.select({
        message: "Choose default agent",
        options: personalities.map((pers) => ({
          value: pers.id,
          label: pers.name,
          hint: pers.id,
        })),
      });
      handleCancel(selected);

      config.default_personality_id = selected as string;
      saveConfig(config);
      success(`Default agent set: ${String(selected)}`);
    }

    p.outro("Done.");
  } catch (err) {
    s.stop("Failed.");

    if (err instanceof NotImplementedError) {
      p.note("Use --mock to see example output.", "API Not Available Yet");
      p.outro("Agents endpoint not yet implemented.");
      return;
    }
    error(
      `Failed to fetch agents: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  }
}
