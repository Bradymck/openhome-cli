import { resolve } from "node:path";
import { validateAbility } from "../validation/validator.js";
import { success, error, warn, info, header } from "../ui/format.js";
import chalk from "chalk";

export async function validateCommand(pathArg: string = "."): Promise<void> {
  const targetDir = resolve(pathArg);
  header(`Validating: ${targetDir}`);

  const result = validateAbility(targetDir);

  if (result.errors.length === 0 && result.warnings.length === 0) {
    success("All checks passed — ability is ready to deploy.");
    return;
  }

  if (result.errors.length > 0) {
    info(`${chalk.red.bold(String(result.errors.length))} error(s) found:\n`);
    for (const issue of result.errors) {
      error(
        `${issue.file ? chalk.bold(`[${issue.file}]`) + " " : ""}${issue.message}`,
      );
    }
  }

  if (result.warnings.length > 0) {
    console.log("");
    info(`${chalk.yellow.bold(String(result.warnings.length))} warning(s):\n`);
    for (const w of result.warnings) {
      warn(`${w.file ? chalk.bold(`[${w.file}]`) + " " : ""}${w.message}`);
    }
  }

  if (result.passed) {
    console.log("");
    success("Validation passed (with warnings).");
    process.exit(0);
  } else {
    console.log("");
    error("Validation failed. Fix errors before deploying.");
    process.exit(1);
  }
}
