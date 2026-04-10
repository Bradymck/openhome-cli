import { SessionExpiredError } from "../api/client.js";
import { setupJwt } from "./login.js";
import { error, p } from "../ui/format.js";
import chalk from "chalk";

export async function handleIfSessionExpired(err: unknown): Promise<boolean> {
  if (!(err instanceof SessionExpiredError)) return false;

  console.log("");
  p.note(
    [
      "Your session token has expired or been invalidated.",
      "This happens when you log into the OpenHome website again.",
      "",
      `You need to grab a fresh token — it only takes 30 seconds.`,
    ].join("\n"),
    chalk.yellow("Session expired"),
  );

  await setupJwt();
  p.note("Token updated. Run the command again to continue.", "Ready");
  return true;
}
