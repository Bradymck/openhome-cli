import { SessionExpiredError } from "../api/client.js";
import { setupJwt } from "./login.js";
import { jsonOut, p } from "../ui/format.js";
import chalk from "chalk";

const REAUTH_HINT = [
  "Your session token was revoked — this happens when you open the OpenHome",
  "web app (browser gets a fresh token, old CLI token dies immediately).",
  "",
  "Get a fresh token (30 seconds):",
  "  1. Go to https://app.openhome.com  (if already open, just switch to it)",
  "  2. Open browser console: Cmd+Option+J  (Mac)  or  F12 (Windows)",
  "  3. Run: copy(localStorage.getItem('access_token'))",
  "  4. Run: openhome set-jwt <paste_token_here>",
  "",
  "Tip: grab the token AFTER you're done in the web app so it stays valid.",
  "For CI/agents use the env var (avoids keychain writes):",
  "  export OPENHOME_JWT=<token>",
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
