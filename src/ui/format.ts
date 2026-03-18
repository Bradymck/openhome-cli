import chalk from "chalk";
import * as p from "@clack/prompts";

// Re-export clack for direct use in commands
export { p };

export function success(msg: string): void {
  console.log(chalk.green(`✓ ${msg}`));
}

export function error(msg: string): void {
  console.error(chalk.red(`✗ ${msg}`));
}

export function warn(msg: string): void {
  console.warn(chalk.yellow(`⚠ ${msg}`));
}

export function info(msg: string): void {
  console.log(chalk.cyan(`ℹ ${msg}`));
}

export function header(msg: string): void {
  console.log("");
  console.log(chalk.bold(msg));
  console.log(chalk.bold("─".repeat(msg.length)));
}

export interface TableRow {
  [key: string]: string | number;
}

export function table(rows: TableRow[]): void {
  if (rows.length === 0) {
    info("No items to display.");
    return;
  }

  const keys = Object.keys(rows[0]);

  // Calculate column widths
  const widths: Record<string, number> = {};
  for (const key of keys) {
    widths[key] = key.length;
  }
  for (const row of rows) {
    for (const key of keys) {
      const val = String(row[key] ?? "");
      if (val.length > widths[key]) {
        widths[key] = val.length;
      }
    }
  }

  // Header row
  const headerLine = keys
    .map((k) => chalk.bold(k.padEnd(widths[k])))
    .join("  ");
  console.log(headerLine);
  console.log(keys.map((k) => "─".repeat(widths[k])).join("  "));

  // Data rows
  for (const row of rows) {
    const line = keys
      .map((k) => String(row[k] ?? "").padEnd(widths[k]))
      .join("  ");
    console.log(line);
  }
}

export function spinner(msg: string): { stop: (finalMsg?: string) => void } {
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let i = 0;
  const interval = setInterval(() => {
    process.stdout.write(`\r${chalk.cyan(frames[i++ % frames.length])} ${msg}`);
  }, 80);

  return {
    stop(finalMsg?: string) {
      clearInterval(interval);
      process.stdout.write("\r" + " ".repeat(msg.length + 4) + "\r");
      if (finalMsg) {
        console.log(finalMsg);
      }
    },
  };
}

/** Check if user cancelled a clack prompt (Ctrl+C) */
export function handleCancel(value: unknown): void {
  if (p.isCancel(value)) {
    p.cancel("Operation cancelled.");
    process.exit(0);
  }
}
