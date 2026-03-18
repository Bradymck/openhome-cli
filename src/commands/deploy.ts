import { resolve, join, basename } from "node:path";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { validateAbility } from "../validation/validator.js";
import { createAbilityZip } from "../util/zip.js";
import { ApiClient, NotImplementedError } from "../api/client.js";
import { MockApiClient } from "../api/mock-client.js";
import { getApiKey, getConfig, getTrackedAbilities } from "../config/store.js";
import type {
  AbilityCategory,
  UploadAbilityMetadata,
} from "../api/contracts.js";
import { error, warn, info, p, handleCancel } from "../ui/format.js";

interface AbilityConfig {
  unique_name: string;
  description?: string;
  category?: string;
  matching_hotwords?: string[];
  [key: string]: unknown;
}

const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg"];
const ICON_NAMES = IMAGE_EXTENSIONS.flatMap((ext) => [
  `icon.${ext}`,
  `image.${ext}`,
  `logo.${ext}`,
]);

/** Find an icon image in the ability directory, or return null. */
function findIcon(dir: string): string | null {
  for (const name of ICON_NAMES) {
    const p = join(dir, name);
    if (existsSync(p)) return p;
  }
  return null;
}

/** Resolve ability dir: use arg, pick from tracked, detect cwd, or prompt. */
async function resolveAbilityDir(pathArg?: string): Promise<string> {
  // Explicit path provided (CLI arg)
  if (pathArg && pathArg !== ".") {
    return resolve(pathArg);
  }

  const tracked = getTrackedAbilities();
  const cwd = process.cwd();
  const cwdIsAbility = existsSync(resolve(cwd, "config.json"));

  // If we're inside an ability dir, just use it
  if (cwdIsAbility) {
    info(`Detected ability in current directory`);
    return cwd;
  }

  // Build picker options from tracked abilities
  const options: { value: string; label: string; hint?: string }[] = [];

  for (const a of tracked) {
    const home = homedir();
    options.push({
      value: a.path,
      label: a.name,
      hint: a.path.startsWith(home) ? `~${a.path.slice(home.length)}` : a.path,
    });
  }

  // One tracked ability → auto-select
  if (options.length === 1) {
    info(`Using ability: ${options[0].label} (${options[0].hint})`);
    return options[0].value;
  }

  // Multiple → show picker
  if (options.length > 0) {
    options.push({
      value: "__custom__",
      label: "Other...",
      hint: "Enter a path manually",
    });

    const selected = await p.select({
      message: "Which ability do you want to deploy?",
      options,
    });
    handleCancel(selected);

    if (selected !== "__custom__") {
      return selected as string;
    }
  }

  // Fallback: manual path entry
  const pathInput = await p.text({
    message: "Path to ability directory",
    placeholder: "./my-ability",
    validate: (val) => {
      if (!val || !val.trim()) return "Path is required";
      if (!existsSync(resolve(val.trim(), "config.json"))) {
        return `No config.json found in "${val.trim()}"`;
      }
    },
  });
  handleCancel(pathInput);
  return resolve((pathInput as string).trim());
}

export async function deployCommand(
  pathArg?: string,
  opts: { dryRun?: boolean; mock?: boolean; personality?: string } = {},
): Promise<void> {
  p.intro("🚀 Deploy ability");
  const targetDir = await resolveAbilityDir(pathArg);

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
  const hotwords = abilityConfig.matching_hotwords ?? [];

  // Step 3: Resolve description (from config or prompt)
  let description = abilityConfig.description?.trim();
  if (!description) {
    const descInput = await p.text({
      message: "Ability description (required for marketplace)",
      placeholder: "A fun ability that does something cool",
      validate: (val) => {
        if (!val || !val.trim()) return "Description is required";
      },
    });
    handleCancel(descInput);
    description = (descInput as string).trim();
  }

  // Step 4: Resolve category (from config or prompt)
  let category = abilityConfig.category as AbilityCategory | undefined;
  if (!category || !["skill", "brain", "daemon"].includes(category)) {
    const catChoice = await p.select({
      message: "Ability category",
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
    handleCancel(catChoice);
    category = catChoice as AbilityCategory;
  }

  // Step 5: Resolve image (auto-detect or prompt)
  let imagePath = findIcon(targetDir);
  if (imagePath) {
    info(`Found icon: ${basename(imagePath)}`);
  } else {
    const imgInput = await p.text({
      message: "Path to ability icon image (PNG or JPG, required)",
      placeholder: "./icon.png",
      validate: (val) => {
        if (!val || !val.trim())
          return "An icon image is required for deployment";
        const resolved = resolve(val.trim());
        if (!existsSync(resolved)) return `File not found: ${val.trim()}`;
        const ext = resolved.split(".").pop()?.toLowerCase();
        if (!ext || !IMAGE_EXTENSIONS.includes(ext))
          return "Image must be PNG or JPG";
      },
    });
    handleCancel(imgInput);
    imagePath = resolve((imgInput as string).trim());
  }

  const imageBuffer = readFileSync(imagePath);
  const imageName = basename(imagePath);

  const personalityId = opts.personality ?? getConfig().default_personality_id;

  const metadata: UploadAbilityMetadata = {
    name: uniqueName,
    description,
    category,
    matching_hotwords: hotwords,
    personality_id: personalityId,
  };

  // Step 6: Dry run
  if (opts.dryRun) {
    p.note(
      [
        `Directory:   ${targetDir}`,
        `Name:        ${uniqueName}`,
        `Description: ${description}`,
        `Category:    ${category}`,
        `Image:       ${imageName}`,
        `Hotwords:    ${hotwords.join(", ")}`,
        `Agent:       ${personalityId ?? "(none set)"}`,
      ].join("\n"),
      "Dry Run — would deploy",
    );
    p.outro("No changes made.");
    return;
  }

  // Step 7: Create zip
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

  // Step 8: Deploy
  if (opts.mock) {
    s.start("Uploading ability (mock)...");
    const mockClient = new MockApiClient();
    const result = await mockClient.uploadAbility(
      zipBuffer,
      imageBuffer,
      imageName,
      metadata,
    );
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
    const result = await client.uploadAbility(
      zipBuffer,
      imageBuffer,
      imageName,
      metadata,
    );
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
