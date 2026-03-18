import { mkdirSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { join, resolve, extname } from "node:path";
import { validateAbility } from "../validation/validator.js";
import { registerAbility } from "../config/store.js";
import { success, error, warn, info, p, handleCancel } from "../ui/format.js";

type TemplateType = "basic" | "api";

function toClassName(name: string): string {
  return name
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function getTemplate(templateType: TemplateType, file: string): string {
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
  "description": "{{DESCRIPTION}}",
  "category": "{{CATEGORY}}",
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
  "description": "{{DESCRIPTION}}",
  "category": "{{CATEGORY}}",
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
  p.intro("✨ Create a new OpenHome ability");

  // Step 1: Name
  let name: string;
  if (nameArg) {
    name = nameArg.trim();
    if (!/^[a-z][a-z0-9-]*$/.test(name)) {
      error(
        "Invalid name. Use lowercase letters, numbers, and hyphens only. Must start with a letter.",
      );
      process.exit(1);
    }
  } else {
    const nameInput = await p.text({
      message: "What should your ability be called?",
      placeholder: "my-cool-ability",
      validate: (val) => {
        if (!val || !val.trim()) return "Name is required";
        if (!/^[a-z][a-z0-9-]*$/.test(val.trim()))
          return "Use lowercase letters, numbers, and hyphens only. Must start with a letter.";
      },
    });
    handleCancel(nameInput);
    name = (nameInput as string).trim();
  }

  // Step 2: Ability category
  const category = await p.select({
    message: "What type of ability?",
    options: [
      {
        value: "skill",
        label: "Skill",
        hint: "User-triggered, runs on demand (most common)",
      },
      {
        value: "brain",
        label: "Brain Skill",
        hint: "Auto-triggered by the agent's intelligence",
      },
      {
        value: "daemon",
        label: "Background Daemon",
        hint: "Runs continuously from session start",
      },
    ],
  });
  handleCancel(category);

  // Step 3: Description
  const descInput = await p.text({
    message: "Short description for the marketplace",
    placeholder: "A fun ability that checks the weather",
    validate: (val) => {
      if (!val || !val.trim()) return "Description is required";
    },
  });
  handleCancel(descInput);
  const description = (descInput as string).trim();

  // Step 4: Template
  const templateType = await p.select({
    message: "Choose a template",
    options: [
      {
        value: "basic",
        label: "Basic",
        hint: "Simple ability with speak + user_response",
      },
      {
        value: "api",
        label: "API",
        hint: "Ability that calls an external API with secrets",
      },
    ],
  });
  handleCancel(templateType);

  // Step 5: Hotwords
  const hotwordInput = await p.text({
    message: "Trigger words (comma-separated)",
    placeholder: "check weather, weather please",
    validate: (val) => {
      if (!val || !val.trim()) return "At least one trigger word is required";
    },
  });
  handleCancel(hotwordInput);

  const hotwords = (hotwordInput as string)
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean);

  // Step 6: Icon image
  const iconInput = await p.text({
    message: "Path to icon image (PNG or JPG for marketplace)",
    placeholder: "./icon.png",
    validate: (val) => {
      if (!val || !val.trim()) return "An icon image is required";
      const resolved = resolve(val.trim());
      if (!existsSync(resolved)) return `File not found: ${val.trim()}`;
      const ext = extname(resolved).toLowerCase();
      if (![".png", ".jpg", ".jpeg"].includes(ext))
        return "Image must be PNG or JPG";
    },
  });
  handleCancel(iconInput);
  const iconSourcePath = resolve((iconInput as string).trim());
  const iconExt = extname(iconSourcePath).toLowerCase();
  const iconFileName = iconExt === ".jpeg" ? "icon.jpg" : `icon${iconExt}`;

  // Step 7: Confirm
  const targetDir = resolve(name);

  if (existsSync(targetDir)) {
    error(`Directory "${name}" already exists.`);
    process.exit(1);
  }

  const confirmed = await p.confirm({
    message: `Create ability "${name}" with ${hotwords.length} trigger word(s)?`,
  });
  handleCancel(confirmed);

  if (!confirmed) {
    p.cancel("Aborted.");
    process.exit(0);
  }

  // Step 7: Generate files
  const s = p.spinner();
  s.start("Generating ability files...");

  mkdirSync(targetDir, { recursive: true });

  const className = toClassName(name);
  const displayName = name
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

  const vars: Record<string, string> = {
    CLASS_NAME: className,
    UNIQUE_NAME: name,
    DISPLAY_NAME: displayName,
    DESCRIPTION: description,
    CATEGORY: category as string,
    HOTWORDS: JSON.stringify(hotwords),
    HOTWORD_LIST: hotwords.map((h) => `- "${h}"`).join("\n"),
  };

  const files = ["main.py", "__init__.py", "README.md", "config.json"];
  for (const file of files) {
    const content = applyTemplate(
      getTemplate(templateType as TemplateType, file),
      vars,
    );
    writeFileSync(join(targetDir, file), content, "utf8");
  }

  // Copy icon into ability directory
  copyFileSync(iconSourcePath, join(targetDir, iconFileName));

  s.stop("Files generated.");

  // Track ability in config for deploy picker
  registerAbility(name, targetDir);

  // Step 6: Auto-validate
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

  p.note(`cd ${name}\nopenhome deploy`, "Next steps");

  p.outro(`Ability "${name}" is ready! 🎉`);
}
