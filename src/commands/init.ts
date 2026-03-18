import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { validateAbility } from "../validation/validator.js";
import { success, error, warn, info, header } from "../ui/format.js";

type TemplateType = "basic" | "api";

function toClassName(name: string): string {
  return name
    .split("-")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("");
}

function readTemplate(templateType: TemplateType, file: string): string {
  // Templates live adjacent to this file in the repo but are embedded here
  // to avoid runtime file resolution issues when installed globally.
  const templates: Record<TemplateType, Record<string, string>> = {
    basic: {
      "main.py": `from src.agent.capability import MatchingCapability
from src.main import AgentWorker
from src.agent.capability_worker import CapabilityWorker


class {{CLASS_NAME}}(MatchingCapability):
    worker: AgentWorker = None
    capability_worker: CapabilityWorker = None

    @classmethod
    def register_capability(cls) -> "MatchingCapability":
        # {{register_capability}}
        pass

    def call(self, worker: AgentWorker):
        self.worker = worker
        self.capability_worker = CapabilityWorker(self.worker)
        self.worker.session_tasks.create(self.run())

    async def run(self):
        await self.capability_worker.speak("Hello! This ability is working.")
        self.capability_worker.resume_normal_flow()
`,
      "__init__.py": "",
      "README.md": `# {{DISPLAY_NAME}}

A custom OpenHome ability.

## Trigger Words

{{HOTWORD_LIST}}
`,
      "config.json": `{
  "unique_name": "{{UNIQUE_NAME}}",
  "matching_hotwords": {{HOTWORDS}}
}
`,
    },
    api: {
      "main.py": `import requests
from src.agent.capability import MatchingCapability
from src.main import AgentWorker
from src.agent.capability_worker import CapabilityWorker


class {{CLASS_NAME}}(MatchingCapability):
    worker: AgentWorker = None
    capability_worker: CapabilityWorker = None

    @classmethod
    def register_capability(cls) -> "MatchingCapability":
        # {{register_capability}}
        pass

    def call(self, worker: AgentWorker):
        self.worker = worker
        self.capability_worker = CapabilityWorker(self.worker)
        self.worker.session_tasks.create(self.run())

    async def run(self):
        api_key = self.capability_worker.get_single_key("api_key")
        response = requests.get(
            "https://api.example.com/data",
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=10,
        )
        data = response.json()
        await self.capability_worker.speak(f"Here's what I found: {data.get('result', 'nothing')}")
        self.capability_worker.resume_normal_flow()
`,
      "__init__.py": "",
      "README.md": `# {{DISPLAY_NAME}}

A custom OpenHome ability that calls an external API.

## Trigger Words

{{HOTWORD_LIST}}

## Configuration

This ability requires an \`api_key\` secret configured in your OpenHome personality settings.
`,
      "config.json": `{
  "unique_name": "{{UNIQUE_NAME}}",
  "matching_hotwords": {{HOTWORDS}}
}
`,
    },
  };

  return templates[templateType][file] ?? "";
}

function applyTemplate(content: string, vars: Record<string, string>): string {
  let result = content;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
}

export async function initCommand(nameArg?: string): Promise<void> {
  header("Initialize New Ability");

  const rl = createInterface({ input, output });

  let name: string;
  try {
    if (nameArg) {
      name = nameArg.trim();
    } else {
      name = (
        await rl.question("Ability name (lowercase, hyphens only): ")
      ).trim();
    }

    if (!name || !/^[a-z][a-z0-9-]*$/.test(name)) {
      error(
        "Invalid name. Use lowercase letters, numbers, and hyphens only. Must start with a letter.",
      );
      process.exit(1);
    }

    const templateAnswer = (
      await rl.question("Template type — [b]asic or [a]pi? (default: basic): ")
    )
      .trim()
      .toLowerCase();

    const templateType: TemplateType =
      templateAnswer === "a" || templateAnswer === "api" ? "api" : "basic";

    const hotwordInput = (
      await rl.question(
        'Trigger hotwords (comma-separated, e.g. "check weather, weather please"): ',
      )
    ).trim();

    const hotwords = hotwordInput
      ? hotwordInput
          .split(",")
          .map((h) => h.trim())
          .filter(Boolean)
      : [name.replace(/-/g, " ")];

    const targetDir = resolve(name);

    if (existsSync(targetDir)) {
      error(`Directory "${name}" already exists. Aborted.`);
      process.exit(1);
    }

    mkdirSync(targetDir, { recursive: true });

    const className = toClassName(name);
    const displayName = name
      .split("-")
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(" ");

    const vars: Record<string, string> = {
      CLASS_NAME: className,
      UNIQUE_NAME: name,
      DISPLAY_NAME: displayName,
      HOTWORDS: JSON.stringify(hotwords),
      HOTWORD_LIST: hotwords.map((h) => `- "${h}"`).join("\n"),
    };

    const files = ["main.py", "__init__.py", "README.md", "config.json"];
    for (const file of files) {
      const content = applyTemplate(readTemplate(templateType, file), vars);
      writeFileSync(join(targetDir, file), content, "utf8");
    }

    info(`Created ability in ./${name}/`);
    info("Running validation...\n");

    const result = validateAbility(targetDir);
    if (result.passed) {
      success("Validation passed.");
    } else {
      for (const issue of result.errors) {
        error(`${issue.file ? `[${issue.file}] ` : ""}${issue.message}`);
      }
    }
    for (const w of result.warnings) {
      warn(`${w.file ? `[${w.file}] ` : ""}${w.message}`);
    }

    success(`\nAbility "${name}" initialized. Next steps:`);
    info(`  cd ${name}`);
    info("  openhome validate");
    info("  openhome deploy");
  } finally {
    rl.close();
  }
}
