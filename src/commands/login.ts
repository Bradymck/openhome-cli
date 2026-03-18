import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { ApiClient } from "../api/client.js";
import { getConfig, saveConfig, saveApiKey } from "../config/store.js";
import { success, error, info, header, spinner } from "../ui/format.js";

export async function loginCommand(): Promise<void> {
  header("OpenHome Login");
  info("Get your API key from https://app.openhome.com/settings");

  const rl = createInterface({ input, output, terminal: true });

  let apiKey: string;
  try {
    // Prompt without echoing (write directly to avoid readline echoing)
    process.stdout.write("Enter your OpenHome API key: ");
    apiKey = (await rl.question("")).trim();
  } finally {
    rl.close();
  }

  if (!apiKey) {
    error("No API key provided. Aborted.");
    process.exit(1);
  }

  const spin = spinner("Verifying API key...");

  let personalities: Awaited<ReturnType<ApiClient["getPersonalities"]>>;
  try {
    const client = new ApiClient(apiKey);
    personalities = await client.getPersonalities();
    spin.stop();
  } catch (err) {
    spin.stop();
    error(
      `Verification failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  }

  saveApiKey(apiKey);
  success(`API key verified. Found ${personalities.length} personality(s):`);

  for (const p of personalities) {
    info(`  ${p.id}  ${p.name}${p.description ? ` — ${p.description}` : ""}`);
  }

  if (personalities.length === 0) {
    info(
      "No personalities found. You can create one at https://app.openhome.com",
    );
    return;
  }

  const rl2 = createInterface({ input, output });
  let defaultId: string;
  try {
    defaultId = (
      await rl2.question(`\nSet default personality ID (leave blank to skip): `)
    ).trim();
  } finally {
    rl2.close();
  }

  if (defaultId) {
    const config = getConfig();
    config.default_personality_id = defaultId;
    saveConfig(config);
    success(`Default personality set to: ${defaultId}`);
  }

  success("Login complete. You are ready to deploy abilities.");
}
