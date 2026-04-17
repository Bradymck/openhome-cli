import { ApiClient, NotImplementedError } from "../api/client.js";
import { MockApiClient } from "../api/mock-client.js";
import {
  getApiKey,
  getApiBase,
  getConfig,
  saveConfig,
} from "../config/store.js";
import { NO_API_KEY_MSG } from "./auth-messages.js";
import {
  error,
  success,
  info,
  p,
  handleCancel,
  jsonOut,
  jsonError,
} from "../ui/format.js";
import chalk from "chalk";

export async function agentsCommand(
  opts: { mock?: boolean; json?: boolean } = {},
): Promise<void> {
  if (!opts.json) p.intro("🤖 Your Agents");

  let client: ApiClient | MockApiClient;

  if (opts.mock) {
    client = new MockApiClient();
  } else {
    const apiKey = getApiKey();
    if (!apiKey) {
      if (opts.json) jsonError("UNAUTHENTICATED", NO_API_KEY_MSG, 2);
      error("Not authenticated. Run: openhome login");
      process.exit(1);
    }
    client = new ApiClient(apiKey, getApiBase());
  }

  const s = opts.json ? null : p.spinner();
  s?.start("Fetching agents...");

  try {
    const personalities = await client.getPersonalities();
    s?.stop(`Found ${personalities.length} agent(s).`);

    if (opts.json) {
      const config = getConfig();
      jsonOut({
        ok: true,
        agents: personalities.map((ag) => ({
          id: String(ag.id),
          name: ag.name,
        })),
        default_agent_id: config.default_personality_id ?? null,
        count: personalities.length,
      });
      return;
    }

    if (personalities.length === 0) {
      info("No agents found. Create one at https://app.openhome.com");
      p.outro("Done.");
      return;
    }

    p.note(
      personalities
        .map((ag) => `${chalk.bold(ag.name)}  ${chalk.gray(ag.id)}`)
        .join("\n"),
      "Agents",
    );

    const config = getConfig();
    const currentDefault = config.default_personality_id;
    if (currentDefault) {
      const match = personalities.find((ag) => ag.id === currentDefault);
      info(`Default agent: ${match ? match.name : currentDefault}`);
    }

    // Skip interactive prompt if no TTY
    if (!process.stdout.isTTY) {
      p.outro("Done.");
      return;
    }

    const setDefault = await p.confirm({
      message: "Set or change your default agent?",
    });
    handleCancel(setDefault);

    if (setDefault) {
      const selected = await p.select({
        message: "Choose default agent",
        options: personalities.map((ag) => ({
          value: ag.id,
          label: ag.name,
          hint: String(ag.id),
        })),
      });
      handleCancel(selected);
      config.default_personality_id = selected as string;
      saveConfig(config);
      success(`Default agent set: ${String(selected)}`);
    }

    p.outro("Done.");
  } catch (err) {
    s?.stop("Failed.");

    if (err instanceof NotImplementedError) {
      if (opts.json)
        jsonError("NOT_IMPLEMENTED", "Agents endpoint not yet implemented.");
      p.note("Use --mock to see example output.", "API Not Available Yet");
      p.outro("Agents endpoint not yet implemented.");
      return;
    }
    const msg = `Failed to fetch agents: ${err instanceof Error ? err.message : String(err)}`;
    if (opts.json) jsonError("ERROR", msg);
    error(msg);
    process.exit(1);
  }
}
