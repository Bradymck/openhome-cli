import { execFile } from "node:child_process";
import { ApiClient } from "../api/client.js";
import type { Personality } from "../api/contracts.js";
import { saveApiKey } from "../config/store.js";
import { success, error, info, p, handleCancel } from "../ui/format.js";
import chalk from "chalk";

const SETTINGS_URL = "https://app.openhome.com/dashboard/settings";
const OPENHOME_APP_URL = "https://app.openhome.com";

export function openBrowser(url: string): void {
  try {
    if (process.platform === "darwin") {
      execFile("open", [url]);
    } else if (process.platform === "win32") {
      // Empty string is the window title — prevents 'start' misinterpreting URLs with special chars
      execFile("cmd", ["/c", "start", "", url]);
    } else {
      execFile("xdg-open", [url]);
    }
  } catch {
    // best-effort
  }
}

export async function loginCommand(
  opts: { key?: string; jwt?: string } = {},
): Promise<void> {
  // Non-interactive fast path: both key and jwt provided via flags
  if (opts.key) {
    const { saveApiKey, saveJwt } = await import("../config/store.js");
    const s = p.spinner();
    s.start("Verifying API key...");
    try {
      const client = new ApiClient(opts.key);
      await client.getPersonalities();
      s.stop("API key verified.");
    } catch (err) {
      s.stop("Verification failed.");
      error(
        err instanceof Error && err.message.includes("401")
          ? "Invalid API key."
          : err instanceof Error
            ? err.message
            : String(err),
      );
      process.exit(1);
    }
    saveApiKey(opts.key);
    if (opts.jwt) {
      saveJwt(opts.jwt.trim());
      success("API key and session token saved.");
    } else {
      success("API key saved.");
    }
    return;
  }

  p.intro("🔑 OpenHome Login");

  // Step 1: API key
  p.note(
    [
      "Your API key is a private password that lets this CLI talk to your",
      "OpenHome account. You can find it on your settings page.",
      "",
      `Press Enter and we'll open it for you — click the ${chalk.bold("API Keys")} tab.`,
    ].join("\n"),
    "Step 1 of 2 — Connect your account",
  );

  const openSettings = await p.confirm({
    message: "Ready? Press Enter to open your browser",
    initialValue: true,
    active: "Open browser",
    inactive: "Skip",
  });
  handleCancel(openSettings);

  if (openSettings) {
    openBrowser(SETTINGS_URL);
    console.log(
      `\n  ${chalk.dim(`Opened ${chalk.bold("app.openhome.com/dashboard/settings")} — click the ${chalk.bold("API Keys")} tab`)}\n`,
    );
  }

  const apiKey = await p.password({
    message: "Paste your API key here",
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
    error(
      err instanceof Error && err.message.includes("401")
        ? "Invalid API key — check the value and try again."
        : err instanceof Error
          ? err.message
          : String(err),
    );
    process.exit(1);
  }

  saveApiKey(apiKey as string);
  success("API key saved.");

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

  // Step 2: Session token for management features
  console.log("");
  p.note(
    [
      "To manage your abilities (list, delete, enable/disable) from the CLI,",
      "you need one more thing: a session token. This takes ~30 seconds",
      "and you only do it once.",
      "",
      `${chalk.bold("Here's what you'll do:")}`,
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

  const doJwt = await p.confirm({
    message:
      "Ready? Press Enter to open your browser and follow the steps above",
    initialValue: true,
    active: "Open browser",
    inactive: "Skip for now",
  });
  handleCancel(doJwt);

  if (doJwt) {
    await setupJwt();
  } else {
    p.outro(
      `All set! Run ${chalk.bold("openhome set-jwt")} anytime to enable management features.`,
    );
    return;
  }

  p.outro("You're fully set up. Run openhome to get started.");
}

export async function setupJwt(): Promise<void> {
  const { saveJwt } = await import("../config/store.js");

  openBrowser(OPENHOME_APP_URL);
  console.log(
    `\n  ${chalk.dim(`Opened ${chalk.bold("app.openhome.com")} — follow the steps above`)}\n`,
  );

  const token = await p.password({
    message: "Paste your session token here",
    validate: (val) => {
      if (!val || !val.trim()) return "Token is required";
      if (val.trim().length < 20)
        return "That doesn't look right — the token should be much longer";
    },
  });

  if (typeof token === "symbol") {
    p.cancel("Skipped.");
    return;
  }

  saveJwt((token as string).trim());
  success("Session token saved. Management features are now unlocked.");
}
