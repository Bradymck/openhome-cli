import { resolve, join, basename } from "node:path";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { ApiClient } from "../api/client.js";
import { handleIfSessionExpired } from "./handle-session-expired.js";
import { MockApiClient } from "../api/mock-client.js";
import { getApiKey, getConfig, getJwt } from "../config/store.js";
import type {
  AbilityCategory,
  UploadAbilityMetadata,
} from "../api/contracts.js";
import { error, p, handleCancel } from "../ui/format.js";

function expandPath(p: string): string {
  if (p.startsWith("~/") || p === "~") {
    return join(homedir(), p.slice(2));
  }
  return resolve(p);
}

function scanForZips(
  dir: string,
  depth = 0,
): { path: string; label: string }[] {
  const found: { path: string; label: string }[] = [];
  if (!existsSync(dir)) return found;
  const home = homedir();
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isFile() && entry.name.endsWith(".zip")) {
        const shortDir = dir.startsWith(home)
          ? `~${dir.slice(home.length)}`
          : dir;
        found.push({ path: full, label: `${entry.name}  (${shortDir})` });
      } else if (
        entry.isDirectory() &&
        depth < 2 &&
        !entry.name.startsWith(".")
      ) {
        found.push(...scanForZips(full, depth + 1));
      }
    }
  } catch {
    // skip unreadable dirs
  }
  return found;
}

export async function deployCommand(
  pathArg?: string,
  opts: { mock?: boolean; personality?: string } = {},
): Promise<void> {
  p.intro("🚀 Upload Ability");

  let zipPath: string;

  if (pathArg) {
    const resolved = expandPath(pathArg);
    if (!existsSync(resolved)) {
      error(`File not found: ${pathArg}`);
      process.exit(1);
    }
    zipPath = resolved;
  } else {
    const home = homedir();
    const foundZips = [
      process.cwd(),
      join(home, "Desktop"),
      join(home, "Downloads"),
      join(home, "Documents"),
    ].flatMap((d) => scanForZips(d));

    // Deduplicate by path
    const seen = new Set<string>();
    const uniqueZips = foundZips.filter(
      (z) => !seen.has(z.path) && seen.add(z.path),
    );

    if (uniqueZips.length > 0) {
      const options = [
        ...uniqueZips.map((z) => ({ value: z.path, label: z.label })),
        {
          value: "__custom__",
          label: "Other...",
          hint: "Enter a path manually",
        },
      ];
      const selected = await p.select({
        message: "Select your zip file",
        options,
      });
      handleCancel(selected);

      if (selected === "__custom__") {
        const input = await p.text({
          message: "Path to zip file",
          placeholder: "~/path/to/ability.zip",
          validate: (val) => {
            if (!val?.trim()) return "Path is required";
            if (!existsSync(expandPath(val.trim())))
              return `File not found: ${val.trim()}`;
          },
        });
        handleCancel(input);
        zipPath = expandPath((input as string).trim());
      } else {
        zipPath = selected as string;
      }
    } else {
      const input = await p.text({
        message: "Path to zip file",
        placeholder: "~/Desktop/my-ability.zip",
        validate: (val) => {
          if (!val?.trim()) return "Path is required";
          if (!existsSync(expandPath(val.trim())))
            return `File not found: ${val.trim()}`;
        },
      });
      handleCancel(input);
      zipPath = expandPath((input as string).trim());
    }
  }

  // Metadata prompts
  const zipName = basename(zipPath, ".zip");

  const nameInput = await p.text({
    message: "Ability name",
    placeholder: zipName.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
    validate: (val) => {
      if (!val?.trim()) return "Name is required";
      if (!/^[a-z0-9-]+$/.test(val.trim()))
        return "Lowercase letters, numbers, hyphens only";
    },
  });
  handleCancel(nameInput);

  const descInput = await p.text({
    message: "Description",
    placeholder: "What does this ability do?",
    validate: (val) => {
      if (!val?.trim()) return "Description is required";
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
    placeholder: "hey openhome, activate skill",
    validate: (val) => {
      if (!val?.trim()) return "At least one trigger word is required";
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

  if (opts.mock) {
    const s = p.spinner();
    s.start("Uploading (mock)...");
    const mockClient = new MockApiClient();
    await mockClient.uploadAbility(zipBuffer, null, null, metadata);
    s.stop("Mock upload complete.");
    p.outro("Mock deploy complete.");
    return;
  }

  const apiKey = getApiKey() ?? "";
  const jwt = getJwt() ?? undefined;
  if (!apiKey) {
    error("Not authenticated. Run: openhome login");
    process.exit(1);
  }

  const s = p.spinner();
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
    p.outro("Deployed successfully!");
  } catch (err) {
    s.stop("Upload failed.");
    if (await handleIfSessionExpired(err)) return;
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes("same name")) {
      error(
        `An ability named "${name}" already exists. Delete it first: openhome delete`,
      );
    } else {
      error(`Deploy failed: ${msg}`);
    }
    process.exit(1);
  }
}
