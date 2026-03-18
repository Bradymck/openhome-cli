import { resolve, join } from "node:path";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { validateAbility } from "../validation/validator.js";
import { createAbilityZip } from "../util/zip.js";
import { ApiClient, NotImplementedError } from "../api/client.js";
import { MockApiClient } from "../api/mock-client.js";
import { getApiKey, getConfig } from "../config/store.js";
import { success, error, warn, info, header, spinner } from "../ui/format.js";

interface AbilityConfig {
  unique_name: string;
  [key: string]: unknown;
}

export async function deployCommand(
  pathArg: string = ".",
  opts: { dryRun?: boolean; mock?: boolean; personality?: string } = {},
): Promise<void> {
  const targetDir = resolve(pathArg);
  header(`Deploying: ${targetDir}`);

  // Step 1: Validate
  info("Running validation...");
  const validation = validateAbility(targetDir);
  if (!validation.passed) {
    error("Validation failed. Fix errors before deploying:");
    for (const issue of validation.errors) {
      error(`  ${issue.file ? `[${issue.file}] ` : ""}${issue.message}`);
    }
    process.exit(1);
  }
  success("Validation passed.");
  if (validation.warnings.length > 0) {
    for (const w of validation.warnings) {
      warn(`  ${w.file ? `[${w.file}] ` : ""}${w.message}`);
    }
  }

  // Step 2: Read config.json for unique_name
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
  info(`Ability name: ${uniqueName}`);

  // Step 3: Dry run
  if (opts.dryRun) {
    info("\n[DRY RUN] Would deploy:");
    info(`  Directory: ${targetDir}`);
    info(`  Unique name: ${uniqueName}`);
    info(
      `  Personality: ${opts.personality ?? getConfig().default_personality_id ?? "(none set)"}`,
    );
    info("\nNo changes made.");
    return;
  }

  // Step 4: Create zip
  const spin = spinner("Creating ability zip...");
  let zipBuffer: Buffer;
  try {
    zipBuffer = await createAbilityZip(targetDir);
    spin.stop();
  } catch (err) {
    spin.stop();
    error(
      `Failed to create zip: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  }
  success(`Zip created (${(zipBuffer.length / 1024).toFixed(1)} KB)`);

  // Step 5: Deploy
  const personalityId = opts.personality ?? getConfig().default_personality_id;

  if (opts.mock) {
    info("[MOCK] Using mock client...");
    const mockClient = new MockApiClient();
    const result = await mockClient.uploadAbility(zipBuffer, personalityId);
    success(`[MOCK] ${result.message}`);
    info(`  Ability ID: ${result.ability_id}`);
    info(`  Status: ${result.status}`);
    return;
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    error("Not authenticated. Run: openhome login");
    process.exit(1);
  }

  const uploadSpin = spinner("Uploading ability...");
  try {
    const client = new ApiClient(apiKey, getConfig().api_base_url);
    const result = await client.uploadAbility(zipBuffer, personalityId);
    uploadSpin.stop();
    success(`Deployed successfully!`);
    info(`  Ability ID: ${result.ability_id}`);
    info(`  Version: ${result.version}`);
    info(`  Status: ${result.status}`);
    if (result.message) info(`  Message: ${result.message}`);
  } catch (err) {
    uploadSpin.stop();

    if (err instanceof NotImplementedError) {
      warn("This API endpoint is not yet available on the OpenHome server.");
      warn("Your ability zip was validated and is ready.");

      // Save the zip for manual upload
      const outDir = join(homedir(), ".openhome");
      mkdirSync(outDir, { recursive: true });
      const outPath = join(outDir, "last-deploy.zip");
      writeFileSync(outPath, zipBuffer);
      info(`Zip saved to: ${outPath}`);
      info("You can manually upload it once the API is available.");
      return;
    }

    error(`Deploy failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
