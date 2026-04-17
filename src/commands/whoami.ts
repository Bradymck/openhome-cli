import {
  getApiKey,
  getApiBase,
  getConfig,
  getTrackedAbilities,
  getJwt,
  getJwtStatus,
} from "../config/store.js";
import { p, info, jsonOut } from "../ui/format.js";
import chalk from "chalk";
import { homedir } from "node:os";

export async function whoamiCommand(
  opts: { json?: boolean } = {},
): Promise<void> {
  if (!opts.json) p.intro("👤 OpenHome CLI Status");

  const apiKey = getApiKey();
  const jwt = getJwt();
  const config = getConfig();
  const tracked = getTrackedAbilities();
  const home = homedir();

  const jwtStatus = jwt ? getJwtStatus(jwt) : "missing";
  const apiKeyMasked = apiKey
    ? apiKey.slice(0, 6) + "..." + apiKey.slice(-4)
    : null;

  if (opts.json) {
    jsonOut({
      ok: true,
      authenticated: !!apiKey,
      api_key_masked: apiKeyMasked,
      jwt_status: jwtStatus,
      default_agent_id: config.default_personality_id ?? null,
      api_base: getApiBase() ?? "https://app.openhome.com",
      tracked_abilities: tracked.map((a) => ({
        name: a.name,
        path: a.path.startsWith(home)
          ? `~${a.path.slice(home.length)}`
          : a.path,
      })),
    });
    return;
  }

  if (apiKey) {
    info(
      `Authenticated: ${chalk.green("yes")}  (key: ${chalk.gray(apiKeyMasked)})`,
    );
  } else {
    info(
      `Authenticated: ${chalk.red("no")}  — run ${chalk.bold("openhome login")}`,
    );
  }

  if (jwt) {
    const expColor =
      jwtStatus === "expired"
        ? chalk.red
        : jwtStatus === "expiring_soon"
          ? chalk.yellow
          : chalk.green;
    info(`Session token: ${expColor(jwtStatus)}`);
    if (jwtStatus === "expired" || jwtStatus === "expiring_soon") {
      info(`  → Run ${chalk.bold("openhome set-jwt <token>")} to refresh`);
    }
  } else {
    info(
      `Session token: ${chalk.red("missing")}  — run ${chalk.bold("openhome set-jwt <token>")}`,
    );
  }

  if (config.default_personality_id) {
    info(`Default agent: ${chalk.bold(config.default_personality_id)}`);
  } else {
    info(
      `Default agent: ${chalk.gray("not set")}  — run ${chalk.bold("openhome agents")}`,
    );
  }

  if (config.api_base_url) {
    info(`API base: ${config.api_base_url}`);
  }

  if (tracked.length > 0) {
    const lines = tracked.map((a) => {
      const shortPath = a.path.startsWith(home)
        ? `~${a.path.slice(home.length)}`
        : a.path;
      return `  ${chalk.bold(a.name)}  ${chalk.gray(shortPath)}`;
    });
    p.note(lines.join("\n"), `${tracked.length} tracked ability(s)`);
  } else {
    info(`Tracked abilities: ${chalk.gray("none")}`);
  }

  p.outro("Done.");
}
