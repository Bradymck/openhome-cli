import { getApiKey, getConfig, getTrackedAbilities } from "../config/store.js";
import { p, info } from "../ui/format.js";
import chalk from "chalk";
import { homedir } from "node:os";

export async function whoamiCommand(): Promise<void> {
  p.intro("👤 OpenHome CLI Status");

  const apiKey = getApiKey();
  const config = getConfig();
  const tracked = getTrackedAbilities();
  const home = homedir();

  // Auth status
  if (apiKey) {
    const masked = apiKey.slice(0, 6) + "..." + apiKey.slice(-4);
    info(`Authenticated: ${chalk.green("yes")}  (key: ${chalk.gray(masked)})`);
  } else {
    info(
      `Authenticated: ${chalk.red("no")}  — run ${chalk.bold("openhome login")}`,
    );
  }

  // Default agent
  if (config.default_personality_id) {
    info(`Default agent: ${chalk.bold(config.default_personality_id)}`);
  } else {
    info(
      `Default agent: ${chalk.gray("not set")}  — run ${chalk.bold("openhome agents")}`,
    );
  }

  // API base
  if (config.api_base_url) {
    info(`API base: ${config.api_base_url}`);
  }

  // Tracked abilities
  if (tracked.length > 0) {
    const lines = tracked.map((a) => {
      const shortPath = a.path.startsWith(home)
        ? `~${a.path.slice(home.length)}`
        : a.path;
      return `  ${chalk.bold(a.name)}  ${chalk.gray(shortPath)}`;
    });
    p.note(lines.join("\n"), `${tracked.length} tracked ability(s)`);
  } else {
    info(
      `Tracked abilities: ${chalk.gray("none")}  — run ${chalk.bold("openhome init")}`,
    );
  }

  p.outro("Done.");
}
