import {
  mkdirSync,
  writeFileSync,
  copyFileSync,
  existsSync,
  readdirSync,
} from "node:fs";
import { join, resolve, extname, basename } from "node:path";
import { homedir } from "node:os";
import { validateAbility } from "../validation/validator.js";
import { registerAbility } from "../config/store.js";
import { success, error, warn, info, p, handleCancel } from "../ui/format.js";

type TemplateType =
  | "basic"
  | "api"
  | "loop"
  | "email"
  | "background"
  | "alarm"
  | "readwrite"
  | "local"
  | "openclaw";

// Templates that require a background.py file (in addition to or instead of main.py)
const DAEMON_TEMPLATES = new Set<TemplateType>(["background", "alarm"]);

function toClassName(name: string): string {
  return name
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

// Shared static file templates reused across all types
const SHARED_INIT = "";

function sharedConfig(): string {
  return `{
  "unique_name": "{{UNIQUE_NAME}}",
  "description": "{{DESCRIPTION}}",
  "category": "{{CATEGORY}}",
  "matching_hotwords": {{HOTWORDS}}
}
`;
}

function skillReadme(): string {
  return `# {{DISPLAY_NAME}}

A custom OpenHome ability.

## Trigger Words

{{HOTWORD_LIST}}
`;
}

function daemonReadme(): string {
  return `# {{DISPLAY_NAME}}

A background OpenHome daemon. Runs automatically on session start — no trigger words required.

## Trigger Words

{{HOTWORD_LIST}}
`;
}

function getTemplate(templateType: TemplateType, file: string): string {
  // config.json and __init__.py are identical for every template
  if (file === "config.json") return sharedConfig();
  if (file === "__init__.py") return SHARED_INIT;

  // README differs only between skill/brain types and daemon types
  if (file === "README.md") {
    return DAEMON_TEMPLATES.has(templateType) ? daemonReadme() : skillReadme();
  }

  const templates: Record<TemplateType, Partial<Record<string, string>>> = {
    // ── BASIC ────────────────────────────────────────────────────────────
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
    },

    // ── API ──────────────────────────────────────────────────────────────
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
    },

    // ── LOOP ─────────────────────────────────────────────────────────────
    loop: {
      "main.py": `import asyncio
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
        await self.capability_worker.speak("I'll listen and check in periodically.")

        while True:
            self.capability_worker.start_audio_recording()
            await self.worker.session_tasks.sleep(90)
            self.capability_worker.stop_audio_recording()

            recording = self.capability_worker.get_audio_recording()
            length = self.capability_worker.get_audio_recording_length()
            self.capability_worker.flush_audio_recording()

            if length > 2:
                response = self.capability_worker.text_to_text_response(
                    f"The user has been speaking for {length:.0f} seconds. "
                    "Summarize what you heard and respond helpfully.",
                    self.capability_worker.get_full_message_history(),
                )
                await self.capability_worker.speak(response)

        self.capability_worker.resume_normal_flow()
`,
    },

    // ── EMAIL ────────────────────────────────────────────────────────────
    email: {
      "main.py": `import json
import smtplib
from email.mime.text import MIMEText
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
        creds = self.capability_worker.get_single_key("email_config")
        if not creds:
            await self.capability_worker.speak("Email is not configured yet.")
            self.capability_worker.resume_normal_flow()
            return

        config = json.loads(creds) if isinstance(creds, str) else creds

        reply = await self.capability_worker.run_io_loop(
            "Who should I send the email to?"
        )
        to_addr = reply.strip()

        subject = await self.capability_worker.run_io_loop("What's the subject?")
        body = await self.capability_worker.run_io_loop("What should the email say?")

        confirmed = await self.capability_worker.run_confirmation_loop(
            f"Send email to {to_addr} with subject '{subject}'?"
        )

        if confirmed:
            msg = MIMEText(body)
            msg["Subject"] = subject
            msg["From"] = config["from"]
            msg["To"] = to_addr

            try:
                with smtplib.SMTP(config["smtp_host"], config.get("smtp_port", 587)) as server:
                    server.starttls()
                    server.login(config["from"], config["password"])
                    server.send_message(msg)
                await self.capability_worker.speak("Email sent!")
            except Exception as e:
                self.worker.editor_logging_handler.error(f"Email failed: {e}")
                await self.capability_worker.speak("Sorry, the email failed to send.")
        else:
            await self.capability_worker.speak("Email cancelled.")

        self.capability_worker.resume_normal_flow()
`,
    },

    // ── BACKGROUND (daemon) ───────────────────────────────────────────────
    // background.py holds the active logic; main.py is a minimal no-op stub
    background: {
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
        self.capability_worker.resume_normal_flow()
`,
      "background.py": `import asyncio
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
        while True:
            # Your background logic here
            self.worker.editor_logging_handler.info("Background tick")

            # Example: check something and notify
            # await self.capability_worker.speak("Heads up!")

            await self.worker.session_tasks.sleep(60)
`,
    },

    // ── ALARM (skill + daemon combo) ──────────────────────────────────────
    alarm: {
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
        reply = await self.capability_worker.run_io_loop(
            "What should I remind you about?"
        )
        minutes = await self.capability_worker.run_io_loop(
            "In how many minutes?"
        )

        try:
            mins = int(minutes.strip())
        except ValueError:
            await self.capability_worker.speak("I didn't understand the time. Try again.")
            self.capability_worker.resume_normal_flow()
            return

        self.capability_worker.write_file(
            "pending_alarm.json",
            f'{{"message": "{reply}", "minutes": {mins}}}',
            temp=True,
        )
        await self.capability_worker.speak(f"Got it! I'll remind you in {mins} minutes.")
        self.capability_worker.resume_normal_flow()
`,
      "background.py": `import json
from src.agent.capability import MatchingCapability
from src.main import AgentWorker
from src.agent.capability_worker import CapabilityWorker


class {{CLASS_NAME}}Background(MatchingCapability):
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
        while True:
            if self.capability_worker.check_if_file_exists("pending_alarm.json", temp=True):
                raw = self.capability_worker.read_file("pending_alarm.json", temp=True)
                alarm = json.loads(raw)
                await self.worker.session_tasks.sleep(alarm["minutes"] * 60)
                await self.capability_worker.speak(f"Reminder: {alarm['message']}")
                self.capability_worker.delete_file("pending_alarm.json", temp=True)
            await self.worker.session_tasks.sleep(10)
`,
    },

    // ── READWRITE ────────────────────────────────────────────────────────
    readwrite: {
      "main.py": `import json
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
        reply = await self.capability_worker.run_io_loop(
            "What would you like me to remember?"
        )

        # Read existing notes or start fresh
        if self.capability_worker.check_if_file_exists("notes.json", temp=False):
            raw = self.capability_worker.read_file("notes.json", temp=False)
            notes = json.loads(raw)
        else:
            notes = []

        notes.append(reply.strip())
        self.capability_worker.write_file(
            "notes.json",
            json.dumps(notes, indent=2),
            temp=False,
            mode="w",
        )

        await self.capability_worker.speak(
            f"Got it! I now have {len(notes)} note{'s' if len(notes) != 1 else ''} saved."
        )
        self.capability_worker.resume_normal_flow()
`,
    },

    // ── LOCAL ────────────────────────────────────────────────────────────
    local: {
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
        reply = await self.capability_worker.run_io_loop(
            "What would you like me to do on your device?"
        )

        # Use text_to_text to interpret the command
        response = self.capability_worker.text_to_text_response(
            f"The user wants to: {reply}. Generate a helpful response.",
            self.capability_worker.get_full_message_history(),
        )

        # Send action to DevKit hardware if connected
        self.capability_worker.send_devkit_action({
            "type": "command",
            "payload": reply.strip(),
        })

        await self.capability_worker.speak(response)
        self.capability_worker.resume_normal_flow()
`,
    },

    // ── OPENCLAW ─────────────────────────────────────────────────────────
    openclaw: {
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
        reply = await self.capability_worker.run_io_loop(
            "What would you like me to handle?"
        )

        gateway_url = self.capability_worker.get_single_key("openclaw_gateway_url")
        gateway_token = self.capability_worker.get_single_key("openclaw_gateway_token")

        if not gateway_url or not gateway_token:
            await self.capability_worker.speak(
                "OpenClaw gateway is not configured. Add openclaw_gateway_url and openclaw_gateway_token as secrets."
            )
            self.capability_worker.resume_normal_flow()
            return

        try:
            resp = requests.post(
                f"{gateway_url}/v1/chat",
                headers={
                    "Authorization": f"Bearer {gateway_token}",
                    "Content-Type": "application/json",
                },
                json={"message": reply.strip()},
                timeout=30,
            )
            data = resp.json()
            answer = data.get("reply", data.get("response", "No response from OpenClaw."))
            await self.capability_worker.speak(answer)
        except Exception as e:
            self.worker.editor_logging_handler.error(f"OpenClaw error: {e}")
            await self.capability_worker.speak("Sorry, I couldn't reach OpenClaw.")

        self.capability_worker.resume_normal_flow()
`,
    },
  };

  return templates[templateType]?.[file] ?? "";
}

function applyTemplate(content: string, vars: Record<string, string>): string {
  let result = content;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
}

// Returns the list of files to write for a given template type.
// config.json, __init__.py, README.md are always included.
function getFileList(templateType: TemplateType): string[] {
  const base = ["__init__.py", "README.md", "config.json"];

  if (templateType === "background") {
    // background.py holds the logic; main.py is a stub
    return ["main.py", "background.py", ...base];
  }
  if (templateType === "alarm") {
    // Both files have full logic
    return ["main.py", "background.py", ...base];
  }
  return ["main.py", ...base];
}

// Returns template options filtered by category
function getTemplateOptions(category: string) {
  if (category === "skill") {
    return [
      {
        value: "basic",
        label: "Basic",
        hint: "Simple ability with speak + user_response",
      },
      {
        value: "api",
        label: "API",
        hint: "Calls an external API using a stored secret",
      },
      {
        value: "loop",
        label: "Loop (ambient observer)",
        hint: "Records audio periodically and checks in",
      },
      {
        value: "email",
        label: "Email",
        hint: "Sends email via SMTP using stored credentials",
      },
      {
        value: "readwrite",
        label: "File Storage",
        hint: "Reads and writes persistent JSON files",
      },
      {
        value: "local",
        label: "Local (DevKit)",
        hint: "Executes commands on the local device via DevKit",
      },
      {
        value: "openclaw",
        label: "OpenClaw",
        hint: "Forwards requests to the OpenClaw gateway",
      },
    ];
  }
  if (category === "brain") {
    return [
      {
        value: "basic",
        label: "Basic",
        hint: "Simple ability with speak + user_response",
      },
      {
        value: "api",
        label: "API",
        hint: "Calls an external API using a stored secret",
      },
    ];
  }
  // daemon
  return [
    {
      value: "background",
      label: "Background (continuous)",
      hint: "Runs a loop from session start, no trigger",
    },
    {
      value: "alarm",
      label: "Alarm (skill + daemon combo)",
      hint: "Skill sets an alarm; background.py fires it",
    },
  ];
}

export async function initCommand(nameArg?: string): Promise<void> {
  p.intro("Create a new OpenHome ability");

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

  // Step 4: Template — filtered by category
  const templateOptions = getTemplateOptions(category as string);
  const templateType = await p.select({
    message: "Choose a template",
    options: templateOptions,
  });
  handleCancel(templateType);

  // Step 5: Hotwords (optional for daemons but kept for config completeness)
  const hotwordInput = await p.text({
    message: DAEMON_TEMPLATES.has(templateType as TemplateType)
      ? "Trigger words (comma-separated, or leave empty for daemons)"
      : "Trigger words (comma-separated)",
    placeholder: "check weather, weather please",
    validate: (val) => {
      if (!DAEMON_TEMPLATES.has(templateType as TemplateType)) {
        if (!val || !val.trim()) return "At least one trigger word is required";
      }
    },
  });
  handleCancel(hotwordInput);

  const hotwords = (hotwordInput as string)
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean);

  // Step 6: Icon image — scan common folders for images
  const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg"]);
  const home = homedir();

  const candidateDirs = [
    process.cwd(),
    join(home, "Desktop"),
    join(home, "Downloads"),
    join(home, "Pictures"),
    join(home, "Images"),
    join(home, ".openhome", "icons"),
  ];
  if (process.env.USERPROFILE) {
    candidateDirs.push(
      join(process.env.USERPROFILE, "Desktop"),
      join(process.env.USERPROFILE, "Downloads"),
      join(process.env.USERPROFILE, "Pictures"),
    );
  }
  const scanDirs = [...new Set(candidateDirs)];

  const foundImages: { path: string; label: string }[] = [];
  for (const dir of scanDirs) {
    if (!existsSync(dir)) continue;
    try {
      const files = readdirSync(dir);
      for (const file of files) {
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

  let iconSourcePath: string;

  if (foundImages.length > 0) {
    const imageOptions = [
      ...foundImages.map((img) => ({ value: img.path, label: img.label })),
      { value: "__custom__", label: "Other...", hint: "Enter a path manually" },
    ];

    const selected = await p.select({
      message: "Select an icon image (PNG or JPG for marketplace)",
      options: imageOptions,
    });
    handleCancel(selected);

    if (selected === "__custom__") {
      const iconInput = await p.text({
        message: "Path to icon image",
        placeholder: "./icon.png",
        validate: (val) => {
          if (!val || !val.trim()) return "An icon image is required";
          const resolved = resolve(val.trim());
          if (!existsSync(resolved)) return `File not found: ${val.trim()}`;
          const ext = extname(resolved).toLowerCase();
          if (!IMAGE_EXTS.has(ext)) return "Image must be PNG or JPG";
        },
      });
      handleCancel(iconInput);
      iconSourcePath = resolve((iconInput as string).trim());
    } else {
      iconSourcePath = selected as string;
    }
  } else {
    const iconInput = await p.text({
      message: "Path to icon image (PNG or JPG for marketplace)",
      placeholder: "./icon.png",
      validate: (val) => {
        if (!val || !val.trim()) return "An icon image is required";
        const resolved = resolve(val.trim());
        if (!existsSync(resolved)) return `File not found: ${val.trim()}`;
        const ext = extname(resolved).toLowerCase();
        if (!IMAGE_EXTS.has(ext)) return "Image must be PNG or JPG";
      },
    });
    handleCancel(iconInput);
    iconSourcePath = resolve((iconInput as string).trim());
  }

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

  // Step 8: Generate files
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
    HOTWORD_LIST:
      hotwords.length > 0
        ? hotwords.map((h) => `- "${h}"`).join("\n")
        : "_None (daemon)_",
  };

  const resolvedTemplate = templateType as TemplateType;
  const files = getFileList(resolvedTemplate);

  for (const file of files) {
    const content = applyTemplate(getTemplate(resolvedTemplate, file), vars);
    writeFileSync(join(targetDir, file), content, "utf8");
  }

  // Copy icon into ability directory
  copyFileSync(iconSourcePath, join(targetDir, iconFileName));

  s.stop("Files generated.");

  // Track ability in config for deploy picker
  registerAbility(name, targetDir);

  // Auto-validate
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

  p.outro(`Ability "${name}" is ready!`);
}
