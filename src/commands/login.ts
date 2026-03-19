import { ApiClient } from "../api/client.js";
import type { Personality } from "../api/contracts.js";
import { saveApiKey } from "../config/store.js";
import { success, error, info, p, handleCancel } from "../ui/format.js";
import chalk from "chalk";

export async function loginCommand(): Promise<void> {
  p.intro("🔑 OpenHome Login");

  const apiKey = await p.password({
    message: "Enter your OpenHome API key",
    validate: (val) => {
      if (!val || !val.trim()) return "API key is required";
    },
  });
  handleCancel(apiKey);

  const s = p.spinner();
  s.start("Verifying API key...");

  let agents: Personality[];
  try {
    const client = new ApiClient(apiKey as string);
    agents = await client.getPersonalities();
    s.stop("API key verified.");
  } catch (err) {
    s.stop("Verification failed.");
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  saveApiKey(apiKey as string);
  success("API key saved.");

  // Show agents on this account
  if (agents.length > 0) {
    p.note(
      agents
        .map((a) => `${chalk.bold(a.name)}  ${chalk.gray(a.id)}`)
        .join("\n"),
      `${agents.length} agent(s) on this account`,
    );
  } else {
    info("No agents found. Create one at https://app.openhome.com");
  }

  p.outro("Logged in! You're ready to go.");
}
