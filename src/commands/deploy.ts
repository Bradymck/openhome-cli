import { resolve, join } from "node:path";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { validateAbility } from "../validation/validator.js";
import { createAbilityZip } from "../util/zip.js";
import { ApiClient, NotImplementedError } from "../api/client.js";
import { MockApiClient } from "../api/mock-client.js";
import { getApiKey, getConfig } from "../config/store.js";
import { error, warn, p, handleCancel } from "../ui/format.js";

interface AbilityConfig {
  unique_name: string;
  [key: string]: unknown;
}

export async function deployCommand(
  pathArg: string = ".",
  opts: { dryRun?: boolean; mock?: boolean; personality?: string } = {},
): Promise<void> {
  const targetDir = resolve(pathArg);
  p.intro("🚀 Deploy ability");

  // Step 1: Validate
  const s = p.spinner();
  s.start("Validating ability...");

  const validation = validateAbility(targetDir);
  if (!validation.passed) {
    s.stop("Validation failed.");
    for (const issue of validation.errors) {
      error(`  ${issue.file ? `[${issue.file}] ` : ""}${issue.message}`);
    }
    process.exit(1);
  }
  s.stop("Validation passed.");

  if (validation.warnings.length > 0) {
    for (const w of validation.warnings) {
      warn(`  ${w.file ? `[${w.file}] ` : ""}${w.message}`);
    }
  }

  // Step 2: Read config
  const configPath = join(targetDir, "config.json");
  let abilityConfig: AbilityConfig;
  try {
    abilityConfig = JSON.parse(
      readFileSync(configPath, "utf8"),
    ) as AbilityConfig;
  } catch {
    error("Could not read config.json");
    process.exit(1);
  }

  const uniqueName = abilityConfig.unique_name;

  // Step 3: Dry run
  if (opts.dryRun) {
    p.note(
      [
        `Directory:   ${targetDir}`,
        `Unique name: ${uniqueName}`,
        `Personality: ${opts.personality ?? getConfig().default_personality_id ?? "(none set)"}`,
      ].join("\n"),
      "Dry Run — would deploy",
    );
    p.outro("No changes made.");
    return;
  }

  // Step 4: Create zip
  s.start("Creating ability zip...");
  let zipBuffer: Buffer;
  try {
    zipBuffer = await createAbilityZip(targetDir);
    s.stop(`Zip created (${(zipBuffer.length / 1024).toFixed(1)} KB)`);
  } catch (err) {
    s.stop("Failed to create zip.");
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  // Step 5: Deploy
  const personalityId = opts.personality ?? getConfig().default_personality_id;

  if (opts.mock) {
    s.start("Uploading ability (mock)...");
    const mockClient = new MockApiClient();
    const result = await mockClient.uploadAbility(zipBuffer, personalityId);
    s.stop("Upload complete.");

    p.note(
      [
        `Ability ID: ${result.ability_id}`,
        `Status:     ${result.status}`,
        `Message:    ${result.message}`,
      ].join("\n"),
      "Mock Deploy Result",
    );
    p.outro("Mock deploy complete.");
    return;
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    error("Not authenticated. Run: openhome login");
    process.exit(1);
  }

  // Confirm before deploying
  const confirmed = await p.confirm({
    message: `Deploy "${uniqueName}" to OpenHome?`,
  });
  handleCancel(confirmed);

  if (!confirmed) {
    p.cancel("Aborted.");
    process.exit(0);
  }

  s.start("Uploading ability...");
  try {
    const client = new ApiClient(apiKey, getConfig().api_base_url);
    const result = await client.uploadAbility(zipBuffer, personalityId);
    s.stop("Upload complete.");

    p.note(
      [
        `Ability ID: ${result.ability_id}`,
        `Version:    ${result.version}`,
        `Status:     ${result.status}`,
        result.message ? `Message:    ${result.message}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      "Deploy Result",
    );
    p.outro("Deployed successfully! 🎉");
  } catch (err) {
    s.stop("Upload failed.");

    if (err instanceof NotImplementedError) {
      warn("This API endpoint is not yet available on the OpenHome server.");

      const outDir = join(homedir(), ".openhome");
      mkdirSync(outDir, { recursive: true });
      const outPath = join(outDir, "last-deploy.zip");
      writeFileSync(outPath, zipBuffer);

      p.note(
        [
          `Your ability was validated and zipped successfully.`,
          `Zip saved to: ${outPath}`,
          ``,
          `Upload manually at https://app.openhome.com`,
        ].join("\n"),
        "API Not Available Yet",
      );
      p.outro("Zip ready for manual upload.");
      return;
    }

    error(`Deploy failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
