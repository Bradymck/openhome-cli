import { join, resolve } from "node:path";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { getTrackedAbilities } from "../config/store.js";
import { error, success, info, p, handleCancel } from "../ui/format.js";
import chalk from "chalk";

interface AbilityConfig {
  unique_name: string;
  description: string;
  category: string;
  matching_hotwords: string[];
  [key: string]: unknown;
}

/** Resolve an ability directory from tracked abilities or cwd. */
async function resolveDir(): Promise<string | undefined> {
  const cwd = resolve(".");
  if (existsSync(join(cwd, "config.json"))) {
    info("Detected ability in current directory");
    return cwd;
  }

  const tracked = getTrackedAbilities();
  const home = homedir();
  const options = tracked.map((a) => ({
    value: a.path,
    label: a.name,
    hint: a.path.startsWith(home) ? `~${a.path.slice(home.length)}` : a.path,
  }));

  if (options.length === 1) {
    info(`Using ability: ${options[0].label}`);
    return options[0].value;
  }

  if (options.length > 0) {
    const selected = await p.select({
      message: "Which ability do you want to edit?",
      options,
    });
    handleCancel(selected);
    return selected as string;
  }

  return undefined;
}

export async function configEditCommand(pathArg?: string): Promise<void> {
  p.intro("⚙️  Edit ability config");

  const dir = pathArg ? resolve(pathArg) : await resolveDir();
  if (!dir) {
    error(
      "No ability found. Run from an ability directory or create one with: openhome init",
    );
    process.exit(1);
  }

  const configPath = join(dir, "config.json");
  if (!existsSync(configPath)) {
    error(`No config.json found in ${dir}`);
    process.exit(1);
  }

  let config: AbilityConfig;
  try {
    config = JSON.parse(readFileSync(configPath, "utf8")) as AbilityConfig;
  } catch {
    error("Failed to parse config.json");
    process.exit(1);
  }

  // Show current config
  p.note(
    [
      `Name:        ${config.unique_name}`,
      `Description: ${config.description}`,
      `Category:    ${config.category}`,
      `Triggers:    ${config.matching_hotwords.join(", ")}`,
    ].join("\n"),
    "Current config",
  );

  // What to edit?
  const field = await p.select({
    message: "What do you want to change?",
    options: [
      { value: "description", label: "Description" },
      { value: "hotwords", label: "Trigger words" },
      { value: "category", label: "Category" },
      { value: "name", label: "Unique name" },
    ],
  });
  handleCancel(field);

  switch (field) {
    case "description": {
      const input = await p.text({
        message: "New description",
        initialValue: config.description,
        validate: (val) => {
          if (!val || !val.trim()) return "Description is required";
        },
      });
      handleCancel(input);
      config.description = (input as string).trim();
      break;
    }
    case "hotwords": {
      const input = await p.text({
        message: "Trigger words (comma-separated)",
        initialValue: config.matching_hotwords.join(", "),
        validate: (val) => {
          if (!val || !val.trim())
            return "At least one trigger word is required";
        },
      });
      handleCancel(input);
      config.matching_hotwords = (input as string)
        .split(",")
        .map((h) => h.trim())
        .filter(Boolean);
      break;
    }
    case "category": {
      const selected = await p.select({
        message: "New category",
        options: [
          { value: "skill", label: "Skill", hint: "User-triggered" },
          { value: "brain", label: "Brain Skill", hint: "Auto-triggered" },
          {
            value: "daemon",
            label: "Background Daemon",
            hint: "Runs continuously",
          },
        ],
      });
      handleCancel(selected);
      config.category = selected as string;
      break;
    }
    case "name": {
      const input = await p.text({
        message: "New unique name",
        initialValue: config.unique_name,
        validate: (val) => {
          if (!val || !val.trim()) return "Name is required";
          if (!/^[a-z][a-z0-9-]*$/.test(val.trim()))
            return "Use lowercase letters, numbers, and hyphens only.";
        },
      });
      handleCancel(input);
      config.unique_name = (input as string).trim();
      break;
    }
  }

  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf8");
  success(`Updated ${field as string} in config.json`);

  p.outro("Done.");
}
