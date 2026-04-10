import { resolve, join, basename, extname } from "node:path";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  readdirSync,
} from "node:fs";
import { homedir } from "node:os";
import { validateAbility } from "../validation/validator.js";
import { createAbilityZip } from "../util/zip.js";
import { ApiClient, NotImplementedError } from "../api/client.js";
import { handleIfSessionExpired } from "./handle-session-expired.js";
import { MockApiClient } from "../api/mock-client.js";
import {
  getApiKey,
  getConfig,
  getJwt,
  getTrackedAbilities,
} from "../config/store.js";
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

function expandPath(p: string): string {
  if (p.startsWith("~/") || p === "~") {
    return join(homedir(), p.slice(2));
  }
  return resolve(p);
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
  return expandPath((pathInput as string).trim());
}

export async function deployCommand(
  pathArg?: string,
  opts: { dryRun?: boolean; mock?: boolean; personality?: string } = {},
): Promise<void> {
  p.intro("🚀 Upload Ability");

  // Explicit zip file passed
  if (pathArg && pathArg.endsWith(".zip") && existsSync(resolve(pathArg))) {
    await deployZip(resolve(pathArg), opts);
    return;
  }

  // No arg — ask whether they have a zip or a folder
  if (!pathArg) {
    const mode = await p.select({
      message: "What do you want to upload?",
      options: [
        {
          value: "zip",
          label: "📦  Upload a zip file",
          hint: "I already have a .zip ready",
        },
        {
          value: "folder",
          label: "📁  Upload from a folder",
          hint: "Point me to an ability directory",
        },
      ],
    });
    handleCancel(mode);

    if (mode === "zip") {
      const home = homedir();
      const scanDirs = [
        process.cwd(),
        join(home, "Desktop"),
        join(home, "Downloads"),
        join(home, "Documents"),
      ];

      const foundZips: { path: string; label: string }[] = [];
      const seen = new Set<string>();

      function scanForZips(dir: string, depth = 0): void {
        if (!existsSync(dir)) return;
        try {
          const entries = readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            const full = join(dir, entry.name);
            if (
              entry.isFile() &&
              entry.name.endsWith(".zip") &&
              !seen.has(full)
            ) {
              seen.add(full);
              const shortDir = dir.startsWith(home)
                ? `~${dir.slice(home.length)}`
                : dir;
              foundZips.push({
                path: full,
                label: `${entry.name}  (${shortDir})`,
              });
            } else if (
              entry.isDirectory() &&
              depth < 2 &&
              !entry.name.startsWith(".")
            ) {
              scanForZips(full, depth + 1);
            }
          }
        } catch {
          // skip unreadable dirs
        }
      }

      for (const dir of scanDirs) {
        scanForZips(dir);
      }

      let zipPath: string;

      if (foundZips.length > 0) {
        const zipOptions = [
          ...foundZips.map((z) => ({ value: z.path, label: z.label })),
          {
            value: "__custom__",
            label: "Other...",
            hint: "Enter a path manually",
          },
        ];
        const selected = await p.select({
          message: "Select your zip file",
          options: zipOptions,
        });
        handleCancel(selected);

        if (selected === "__custom__") {
          const zipInput = await p.text({
            message: "Path to your zip file",
            placeholder: "~/path/to/ability.zip",
            validate: (val) => {
              if (!val || !val.trim()) return "Path is required";
              if (!existsSync(expandPath(val.trim())))
                return `File not found: ${val.trim()}`;
              if (!val.trim().endsWith(".zip")) return "Must be a .zip file";
            },
          });
          handleCancel(zipInput);
          zipPath = expandPath((zipInput as string).trim());
        } else {
          zipPath = selected as string;
        }
      } else {
        const zipInput = await p.text({
          message: "Path to your zip file",
          placeholder: "~/Downloads/my-ability.zip",
          validate: (val) => {
            if (!val || !val.trim()) return "Path is required";
            if (!existsSync(expandPath(val.trim())))
              return `File not found: ${val.trim()}`;
            if (!val.trim().endsWith(".zip")) return "Must be a .zip file";
          },
        });
        handleCancel(zipInput);
        zipPath = expandPath((zipInput as string).trim());
      }

      await deployZip(zipPath, opts);
      return;
    }
  }

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

  // Step 5: Resolve image (auto-detect or prompt with picker)
  let imagePath = findIcon(targetDir);
  if (imagePath) {
    info(`Found icon: ${basename(imagePath)}`);
  } else {
    // Scan common folders for images
    const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg"]);
    const home = homedir();
    const scanDirs = [
      ...new Set([
        process.cwd(),
        targetDir,
        join(home, "Desktop"),
        join(home, "Downloads"),
        join(home, "Pictures"),
        join(home, "Images"),
        join(home, ".openhome", "icons"),
      ]),
    ];

    const foundImages: { path: string; label: string }[] = [];
    for (const dir of scanDirs) {
      if (!existsSync(dir)) continue;
      try {
        for (const file of readdirSync(dir)) {
          if (IMAGE_EXTS.has(extname(file).toLowerCase())) {
            const full = join(dir, file);
            const shortDir = dir.startsWith(home)
              ? `~${dir.slice(home.length)}`
              : dir;
            foundImages.push({
              path: full,
              label: `${file}  (${shortDir})`,
            });
          }
        }
      } catch {
        // skip unreadable dirs
      }
    }

    if (foundImages.length > 0) {
      const imageOptions = [
        ...foundImages.map((img) => ({ value: img.path, label: img.label })),
        {
          value: "__custom__",
          label: "Other...",
          hint: "Enter a path manually",
        },
        {
          value: "__skip__",
          label: "Skip",
          hint: "Upload without an icon (optional)",
        },
      ];

      const selected = await p.select({
        message: "Select an icon image (optional)",
        options: imageOptions,
      });
      handleCancel(selected);

      if (selected === "__custom__") {
        const imgInput = await p.text({
          message: "Path to icon image",
          placeholder: "./icon.png",
          validate: (val) => {
            if (!val || !val.trim()) return undefined;
            const resolved = expandPath(val.trim());
            if (!existsSync(resolved)) return `File not found: ${val.trim()}`;
            if (!IMAGE_EXTS.has(extname(resolved).toLowerCase()))
              return "Image must be PNG or JPG";
          },
        });
        handleCancel(imgInput);
        const trimmed = (imgInput as string).trim();
        if (trimmed) imagePath = expandPath(trimmed);
      } else if (selected !== "__skip__") {
        imagePath = selected as string;
      }
    } else {
      const imgInput = await p.text({
        message:
          "Path to ability icon image (PNG or JPG, optional — press Enter to skip)",
        placeholder: "./icon.png",
        validate: (val) => {
          if (!val || !val.trim()) return undefined;
          const resolved = expandPath(val.trim());
          if (!existsSync(resolved)) return `File not found: ${val.trim()}`;
          if (!IMAGE_EXTS.has(extname(resolved).toLowerCase()))
            return "Image must be PNG or JPG";
        },
      });
      handleCancel(imgInput);
      const trimmed = (imgInput as string).trim();
      if (trimmed) imagePath = expandPath(trimmed);
    }
  }

  const imageBuffer = imagePath ? readFileSync(imagePath) : null;
  const imageName = imagePath ? basename(imagePath) : null;

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
        `Image:       ${imageName ?? "(none)"}`,
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

  const apiKey = getApiKey() ?? "";
  const jwt = getJwt() ?? undefined;
  if (!apiKey && !jwt) {
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
    const client = new ApiClient(apiKey, getConfig().api_base_url, jwt);
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

    if (await handleIfSessionExpired(err)) return;
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes("same name")) {
      error(`An ability named "${uniqueName}" already exists.`);
      warn(
        `To update it, delete it first with: openhome delete\nOr rename it in config.json and redeploy.`,
      );
    } else {
      error(`Deploy failed: ${msg}`);
    }
    process.exit(1);
  }
}

async function deployZip(
  zipPath: string,
  opts: { dryRun?: boolean; mock?: boolean; personality?: string } = {},
): Promise<void> {
  const s = p.spinner();
  const zipName = basename(zipPath, ".zip");

  // Prompt for required metadata
  const nameInput = await p.text({
    message: "Ability name (unique, lowercase, hyphens only)",
    placeholder: zipName.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
    validate: (val) => {
      if (!val || !val.trim()) return "Name is required";
      if (!/^[a-z0-9-]+$/.test(val.trim()))
        return "Lowercase letters, numbers, and hyphens only";
    },
  });
  handleCancel(nameInput);

  const descInput = await p.text({
    message: "Description",
    placeholder: "What does this ability do?",
    validate: (val) => {
      if (!val || !val.trim()) return "Description is required";
    },
  });
  handleCancel(descInput);

  const catChoice = await p.select({
    message: "Category",
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

  const hotwordsInput = await p.text({
    message: "Trigger words (comma-separated)",
    placeholder: "hey openhome, start ability",
    validate: (val) => {
      if (!val || !val.trim()) return "At least one trigger word is required";
    },
  });
  handleCancel(hotwordsInput);

  const name = (nameInput as string).trim();
  const description = (descInput as string).trim();
  const category = catChoice as AbilityCategory;
  const hotwords = (hotwordsInput as string)
    .split(",")
    .map((w) => w.trim())
    .filter(Boolean);

  const personalityId = opts.personality ?? getConfig().default_personality_id;

  const metadata: UploadAbilityMetadata = {
    name,
    description,
    category,
    matching_hotwords: hotwords,
    personality_id: personalityId,
  };

  const zipBuffer = readFileSync(zipPath);

  if (opts.dryRun) {
    p.note(
      [
        `Zip:         ${zipPath}`,
        `Name:        ${name}`,
        `Description: ${description}`,
        `Category:    ${category}`,
        `Hotwords:    ${hotwords.join(", ")}`,
        `Agent:       ${personalityId ?? "(none set)"}`,
      ].join("\n"),
      "Dry Run — would deploy",
    );
    p.outro("No changes made.");
    return;
  }

  const confirmed = await p.confirm({
    message: `Deploy "${name}" to OpenHome?`,
  });
  handleCancel(confirmed);
  if (!confirmed) {
    p.cancel("Aborted.");
    return;
  }

  if (opts.mock) {
    s.start("Uploading (mock)...");
    const mockClient = new MockApiClient();
    await mockClient.uploadAbility(zipBuffer, null, null, metadata);
    s.stop("Mock upload complete.");
    p.outro("Mock deploy complete.");
    return;
  }

  const apiKey = getApiKey() ?? "";
  const jwt = getJwt() ?? undefined;
  if (!apiKey && !jwt) {
    error("Not authenticated. Run: openhome login");
    process.exit(1);
  }

  s.start("Uploading ability...");
  try {
    const client = new ApiClient(apiKey, getConfig().api_base_url, jwt);
    const result = await client.uploadAbility(zipBuffer, null, null, metadata);
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
    if (await handleIfSessionExpired(err)) return;
    error(`Deploy failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
