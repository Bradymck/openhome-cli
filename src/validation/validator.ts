import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  REQUIRED_FILES,
  BLOCKED_IMPORTS,
  BLOCKED_PATTERNS,
  REQUIRED_PATTERNS,
  REGISTER_CAPABILITY_PATTERN,
  HARDCODED_KEY_PATTERN,
  MULTIPLE_CLASSES_PATTERN,
} from "./rules.js";

export interface ValidationIssue {
  severity: "error" | "warning";
  message: string;
  file?: string;
}

export interface ValidationResult {
  passed: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

function readFile(filePath: string): string | null {
  try {
    return readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

export function validateAbility(dirPath: string): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  // 1. Check required files exist
  for (const required of REQUIRED_FILES) {
    const fullPath = join(dirPath, required);
    if (!existsSync(fullPath)) {
      errors.push({
        severity: "error",
        message: `Missing required file: ${required}`,
        file: required,
      });
    }
  }

  // 2. Validate config.json
  const configPath = join(dirPath, "config.json");
  if (existsSync(configPath)) {
    const configContent = readFile(configPath);
    if (configContent) {
      try {
        const config = JSON.parse(configContent) as Record<string, unknown>;
        if (typeof config.unique_name !== "string" || !config.unique_name) {
          errors.push({
            severity: "error",
            message: "config.json: unique_name must be a non-empty string",
            file: "config.json",
          });
        }
        if (
          !Array.isArray(config.matching_hotwords) ||
          !(config.matching_hotwords as unknown[]).every(
            (h) => typeof h === "string",
          )
        ) {
          errors.push({
            severity: "error",
            message:
              "config.json: matching_hotwords must be an array of strings",
            file: "config.json",
          });
        }
      } catch {
        errors.push({
          severity: "error",
          message: "config.json: invalid JSON",
          file: "config.json",
        });
      }
    }
  } else {
    errors.push({
      severity: "error",
      message: "Missing required file: config.json",
      file: "config.json",
    });
  }

  // 3. Validate main.py in detail
  const mainPath = join(dirPath, "main.py");
  const mainContent = readFile(mainPath);

  if (mainContent) {
    const lines = mainContent.split("\n");

    // Check blocked imports — only match actual import/from statements, not substrings in strings
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      // Skip lines that are clearly string content (inside quotes)
      if (
        !line.startsWith("import ") &&
        !line.startsWith("from ") &&
        !line.includes("import ")
      )
        continue;
      for (const blocked of BLOCKED_IMPORTS) {
        if (line.includes(blocked)) {
          errors.push({
            severity: "error",
            message: `Blocked import "${blocked}" on line ${i + 1}`,
            file: "main.py",
          });
        }
      }
    }

    // Check blocked patterns (line by line)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const { regex, message } of BLOCKED_PATTERNS) {
        if (regex.test(line)) {
          errors.push({
            severity: "error",
            message: `${message} (line ${i + 1})`,
            file: "main.py",
          });
        }
      }
    }

    // Check required patterns (whole file)
    for (const { regex, message } of REQUIRED_PATTERNS) {
      if (!regex.test(mainContent)) {
        errors.push({ severity: "error", message, file: "main.py" });
      }
    }

    // Check register_capability tag
    if (!REGISTER_CAPABILITY_PATTERN.test(mainContent)) {
      errors.push({
        severity: "error",
        message: "Missing #{{register_capability}} tag in main.py",
        file: "main.py",
      });
    }

    // Check for hardcoded keys (warning)
    const keyMatches = mainContent.match(HARDCODED_KEY_PATTERN);
    if (keyMatches) {
      warnings.push({
        severity: "warning",
        message: `Possible hardcoded API key detected in main.py — use capability_worker.get_single_key() instead`,
        file: "main.py",
      });
    }

    // Check for multiple classes (warning)
    const classMatches = mainContent.match(MULTIPLE_CLASSES_PATTERN);
    if (classMatches && classMatches.length > 1) {
      warnings.push({
        severity: "warning",
        message: `Multiple class definitions found (${classMatches.length}). Only one MatchingCapability class is expected.`,
        file: "main.py",
      });
    }
  }

  // 4. Scan all .py files for blocked patterns
  let pyFiles: string[] = [];
  try {
    pyFiles = readdirSync(dirPath).filter(
      (f) => f.endsWith(".py") && f !== "main.py",
    );
  } catch {
    // ignore
  }

  for (const pyFile of pyFiles) {
    const content = readFile(join(dirPath, pyFile));
    if (!content) continue;
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const { regex, message } of BLOCKED_PATTERNS) {
        if (regex.test(line)) {
          errors.push({
            severity: "error",
            message: `${message} (line ${i + 1})`,
            file: pyFile,
          });
        }
      }
    }
  }

  return {
    passed: errors.length === 0,
    errors,
    warnings,
  };
}
