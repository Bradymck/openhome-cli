import { setupJwt, openBrowser } from "./login.js";
import { saveJwt } from "../config/store.js";
import { success, error, p, handleCancel } from "../ui/format.js";
import chalk from "chalk";

const OPENHOME_APP_URL = "https://app.openhome.com";

export async function setJwtCommand(token?: string): Promise<void> {
  p.intro("🔑 Enable Management Features");

  // Direct usage: openhome set-jwt eyJ...
  if (token) {
    try {
      saveJwt(token.trim());
      success("Session token saved.");
      p.outro(
        "Management commands (list, delete, toggle, assign) are now unlocked.",
      );
    } catch (err) {
      error(
        `Failed to save token: ${err instanceof Error ? err.message : String(err)}`,
      );
      process.exit(1);
    }
    return;
  }

  // Guided flow — show instructions first, then open browser
  p.note(
    [
      "Here's what you'll do:",
      "",
      `${chalk.bold("1.")}  We'll open ${chalk.bold("app.openhome.com")} — make sure you're logged in`,
      "",
      `${chalk.bold("2.")}  Open the browser console:`,
      `     Mac → ${chalk.cyan("Cmd + Option + J")}`,
      `     Windows / Linux → ${chalk.cyan("F12")} then click ${chalk.cyan("Console")}`,
      "",
      `${chalk.bold("3.")}  Chrome may show this warning — it's expected:`,
      `     ${chalk.yellow("\"Don't paste code you don't understand...\"")}`,
      `     Type ${chalk.cyan("allow pasting")} and press Enter to dismiss it.`,
      "",
      `${chalk.bold("4.")}  Paste this command and press Enter:`,
      "",
      `     ${chalk.green("copy(localStorage.getItem('access_token')), '✓ Token copied to clipboard!'")}`,
      "",
      `${chalk.bold("5.")}  Your token is copied to clipboard — paste it back here.`,
    ].join("\n"),
    "Enable management features (one-time setup)",
  );

  const ready = await p.confirm({
    message:
      "Ready? Press Enter to open your browser and follow the steps above",
    initialValue: true,
    active: "Open browser",
    inactive: "Cancel",
  });
  handleCancel(ready);

  if (!ready) {
    p.cancel("Cancelled.");
    return;
  }

  await setupJwt();
  p.outro("Management features are now unlocked.");
}
