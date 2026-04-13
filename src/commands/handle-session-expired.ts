import { SessionExpiredError } from "../api/client.js";
import { setupJwt } from "./login.js";
import { jsonOut, p } from "../ui/format.js";
import chalk from "chalk";

const REAUTH_HINT = [
  "Your session token has expired. Tokens last ~24 hours.",
  "",
  "To get a fresh token (30 seconds):",
  "  1. Open: https://app.openhome.com",
  "  2. Open browser console (Cmd+Option+J on Mac, F12 on Windows)",
  "  3. Run: copy(localStorage.getItem('access_token'))",
  "  4. Run: openhome set-jwt <paste_token_here>",
  "",
  "For CI/agents, set the env var instead (no disk write):",
  "  export OPENHOME_JWT=<new_token>",
].join("\n");

export async function handleIfSessionExpired(
  err: unknown,
  opts: { json?: boolean } = {},
): Promise<boolean> {
  if (!(err instanceof SessionExpiredError)) return false;

  if (opts.json) {
    jsonOut({
      ok: false,
      error: {
        code: "SESSION_EXPIRED",
        message:
          "JWT expired. Set a fresh token: export OPENHOME_JWT=<token>  or run: openhome set-jwt <token>",
      },
    });
    process.exit(2); // exit 2 = auth error, needs human intervention
  }

  console.log("");
  p.note(REAUTH_HINT, chalk.yellow("Session expired"));

  await setupJwt();
  p.note("Token updated. Run the command again to continue.", "Ready");
  return true;
}
