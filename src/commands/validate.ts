import { resolve } from "node:path";
import { validateAbility } from "../validation/validator.js";
import { success, error, warn, p, jsonOut } from "../ui/format.js";
import chalk from "chalk";

export async function validateCommand(
  pathArg: string = ".",
  opts: { json?: boolean } = {},
): Promise<void> {
  const targetDir = resolve(pathArg);
  const result = validateAbility(targetDir);

  if (opts.json) {
    jsonOut({
      ok: result.passed,
      path: targetDir,
      errors: result.errors,
      warnings: result.warnings,
    });
    if (!result.passed) process.exit(1);
    return;
  }

  p.intro(`🔎 Validate ability`);

  const s = p.spinner();
  s.start("Running checks...");

  if (result.errors.length === 0 && result.warnings.length === 0) {
    s.stop("All checks passed.");
    p.outro("Ability is ready to deploy! 🎉");
    return;
  }

  s.stop("Checks complete.");

  if (result.errors.length > 0) {
    p.note(
      result.errors
        .map(
          (issue) =>
            `${chalk.red("✗")} ${issue.file ? chalk.bold(`[${issue.file}]`) + " " : ""}${issue.message}`,
        )
        .join("\n"),
      `${result.errors.length} Error(s)`,
    );
  }

  if (result.warnings.length > 0) {
    p.note(
      result.warnings
        .map(
          (w) =>
            `${chalk.yellow("⚠")} ${w.file ? chalk.bold(`[${w.file}]`) + " " : ""}${w.message}`,
        )
        .join("\n"),
      `${result.warnings.length} Warning(s)`,
    );
  }

  if (result.passed) {
    p.outro("Validation passed (with warnings).");
  } else {
    error("Fix errors before deploying.");
    process.exit(1);
  }
}
