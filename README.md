# OpenHome CLI

Command-line tool for managing OpenHome voice AI abilities. Create, validate, and deploy abilities without leaving your terminal.

**Status:** v0.1.0 (MVP)
**Node:** 18+
**Platform:** macOS (primary), Linux/Windows (config-file fallback for keychain)

---

## Install

```bash
# Clone and link globally
git clone https://github.com/Bradymck/openhome-cli.git
cd openhome-cli
npm install
npm run build
npm link

# Now available everywhere
openhome
```

---

## Quick Start

```bash
# 1. Log in with your API key
openhome login

# 2. Create a new ability
openhome init my-ability

# 3. Edit main.py in your editor

# 4. Check your work
openhome validate ./my-ability

# 5. Deploy
openhome deploy ./my-ability
```

Or just run `openhome` with no arguments for the interactive menu.

---

## Commands

### `openhome` (no arguments)

Opens an interactive menu. Use arrow keys to navigate, Enter to select. The menu loops after each command — pick another or choose Exit.

```
┌  OpenHome CLI v0.1.0
│
◆  What would you like to do?
│  ● Login
│  ○ Create Ability
│  ○ Validate
│  ○ Deploy
│  ○ My Abilities
│  ○ Status
│  ○ Exit
└
```

All commands below also work directly from the terminal.

---

### `openhome login`

Authenticate with your OpenHome API key.

1. Prompts for your API key (masked input)
2. Verifies the key against the OpenHome API
3. Stores the key securely (macOS Keychain, or `~/.openhome/config.json` fallback)
4. Lists your agents and lets you set a default

```bash
openhome login
```

---

### `openhome init [name]`

Scaffold a new ability with all required files.

```bash
# Interactive (prompts for name)
openhome init

# Direct
openhome init my-weather-bot
```

**Prompts:**
1. **Name** — lowercase, numbers, hyphens only (e.g. `my-ability`)
2. **Ability type** — Skill (user-triggered), Brain Skill (auto-triggered), or Background Daemon
3. **Template** — Basic (speak + response) or API (external API with secrets)
4. **Trigger words** — comma-separated phrases that activate the ability

**Generated files:**

| File | Purpose |
|------|---------|
| `main.py` | Your ability code (Python) |
| `config.json` | Name + trigger words |
| `__init__.py` | Required by OpenHome (empty) |
| `README.md` | Description of your ability |

The generated code auto-validates after creation.

---

### `openhome validate [path]`

Check an ability directory for errors before deploying.

```bash
# Current directory
openhome validate

# Specific path
openhome validate ./my-ability
```

Checks for required files, Python patterns, blocked imports, and config structure. See [Validation Rules](#validation-rules) below.

---

### `openhome deploy [path]`

Validate, zip, and upload an ability to OpenHome.

```bash
# Deploy from current directory
openhome deploy

# Deploy specific ability
openhome deploy ./my-ability

# Preview without uploading
openhome deploy ./my-ability --dry-run

# Test with fake API
openhome deploy ./my-ability --mock

# Attach to specific agent
openhome deploy ./my-ability --personality pers_alice
```

| Flag | What it does |
|------|-------------|
| `--dry-run` | Show what would deploy. No zip, no upload. |
| `--mock` | Use fake API responses for testing |
| `--personality <id>` | Override default agent for this deploy |

**What happens on deploy:**
1. Validates ability (blocks if errors)
2. Creates ZIP (excludes `__pycache__`, `.pyc`, `.git`)
3. Asks for confirmation
4. Uploads to OpenHome

> **Note:** The upload endpoint is not yet live on the server. When it returns "Not Implemented", the CLI saves your zip to `~/.openhome/last-deploy.zip` for manual upload at [app.openhome.com](https://app.openhome.com).

---

### `openhome list`

List all your deployed abilities.

```bash
openhome list

# Test with fake data
openhome list --mock
```

Shows a table with name, version, status, and last update date.

Status colors: green = active, yellow = processing, red = failed, gray = disabled.

> **Note:** This endpoint is not yet live. Use `--mock` to preview the output format.

---

### `openhome status [ability]`

Show detailed info for one ability.

```bash
# By name
openhome status my-weather-bot

# Read name from local config.json
openhome status

# Test with fake data
openhome status my-weather-bot --mock
```

Shows: name, display name, status, version, timestamps, linked agents, validation errors, and deploy history.

> **Note:** This endpoint is not yet live. Use `--mock` to preview the output format.

---

## Validation Rules

The `validate` command checks these rules. Errors block deployment. Warnings do not.

### Required Files

Every ability must have:
- `main.py`
- `__init__.py`
- `config.json`
- `README.md`

### config.json

Must contain:
- `unique_name` — non-empty string
- `matching_hotwords` — array of strings

### main.py Required Patterns

Your main Python file must include:

| What | Why |
|------|-----|
| Class extending `MatchingCapability` | OpenHome ability base class |
| `call(self, ...)` method | Entry point OpenHome calls |
| `worker: AgentWorker = None` | Required field declaration |
| `capability_worker: CapabilityWorker = None` | Required field declaration |
| `resume_normal_flow()` call | Returns control to user after ability runs |
| `# {{register_capability}}` comment | Template marker used by OpenHome |

### Blocked Patterns (Errors)

These are not allowed in any `.py` file:

| Pattern | Use Instead |
|---------|-------------|
| `print()` | `self.worker.editor_logging_handler` |
| `asyncio.sleep()` | `self.worker.session_tasks.sleep()` |
| `asyncio.create_task()` | `self.worker.session_tasks.create()` |
| `open()` | `capability_worker` file helpers |
| `exec()` | Not allowed |
| `eval()` | Not allowed |
| `pickle` / `dill` / `shelve` / `marshal` | Not allowed (security) |
| `assert` | Not allowed |
| `hashlib.md5()` | Not allowed |

### Blocked Imports (Errors)

| Import | Why |
|--------|-----|
| `redis` | Not available in sandbox |
| `from src.utils.db_handler` | Internal, not for abilities |
| `connection_manager` | Internal, not for abilities |
| `user_config` | Internal, not for abilities |

### Warnings (Do Not Block)

| Check | Message |
|-------|---------|
| Hardcoded API keys (`sk_...`, `key_...`) | Use `capability_worker.get_single_key()` instead |
| Multiple class definitions | Only one `MatchingCapability` class expected per ability |

---

## Configuration

### Storage Location

```
~/.openhome/
  config.json    # Settings + fallback API key
  last-deploy.zip  # Saved when upload endpoint unavailable
```

### Config Fields

| Field | Purpose | Default |
|-------|---------|---------|
| `api_base_url` | Override API endpoint | `https://app.openhome.com` |
| `default_personality_id` | Default agent for deploys | (none) |
| `api_key` | Fallback key storage | (none — prefers Keychain) |

### API Key Storage

On macOS, your API key is stored in the system Keychain (service: `openhome-cli`, account: `api-key`). On other platforms, it falls back to `~/.openhome/config.json`.

---

## Project Structure

```
openhome-cli/
├── bin/openhome.js           # Entry point shim
├── src/
│   ├── cli.ts                # Menu + Commander setup
│   ├── commands/
│   │   ├── login.ts          # API key auth + agent selection
│   │   ├── init.ts           # Scaffold new ability
│   │   ├── validate.ts       # Run validation checks
│   │   ├── deploy.ts         # Validate + zip + upload
│   │   ├── list.ts           # List abilities table
│   │   └── status.ts         # Ability detail view
│   ├── api/
│   │   ├── client.ts         # HTTP client + error handling
│   │   ├── mock-client.ts    # Fake responses for testing
│   │   ├── contracts.ts      # TypeScript interfaces
│   │   └── endpoints.ts      # URL constants
│   ├── validation/
│   │   ├── rules.ts          # All validation rules
│   │   └── validator.ts      # Rule runner
│   ├── config/
│   │   ├── store.ts          # Config file + Keychain
│   │   └── keychain.ts       # macOS Keychain helpers
│   ├── ui/
│   │   └── format.ts         # Colors, tables, prompts
│   └── util/
│       └── zip.ts            # ZIP creation (archiver)
└── templates/
    ├── basic/                # Simple ability template
    └── api/                  # API-calling ability template
```

---

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run without building (dev mode)
npm run dev

# Type check
npm run lint

# Run tests
npm run test
```

### Tech Stack

| Package | Version | Purpose |
|---------|---------|---------|
| commander | 12.x | CLI argument parsing |
| @clack/prompts | 1.x | Interactive menus, spinners, prompts |
| chalk | 5.x | Terminal colors |
| archiver | 7.x | ZIP file creation |
| typescript | 5.x | Type safety |
| tsup | 8.x | Build tool |
| vitest | 2.x | Testing |

---

## API Status

| Endpoint | Method | Status |
|----------|--------|--------|
| `/api/sdk/get_personalities` | POST | Live |
| `/api/sdk/abilities` | POST (upload) | Not yet implemented |
| `/api/sdk/abilities` | GET (list) | Not yet implemented |
| `/api/sdk/abilities/:id` | GET (detail) | Not yet implemented |

The CLI handles "Not Implemented" responses gracefully. When an endpoint is unavailable:
- **Deploy**: Saves zip to `~/.openhome/last-deploy.zip` and shows manual upload instructions
- **List/Status**: Suggests using `--mock` flag to preview the output format

Use `--mock` on any command to test with fake data while endpoints are being built.

---

## What This Tool Does NOT Do

- **No local ability testing** — There is no local mock of the OpenHome runtime (`CapabilityWorker`, `AgentWorker`). You must deploy to test.
- **No log streaming** — `openhome logs` is not yet implemented.
- **No ability deletion** — Must be done through the web dashboard.
- **No ability editing** — The CLI does not modify deployed abilities. Edit locally, then re-deploy.
- **No multi-agent deploy** — One ability deploys to one agent at a time.
- **No Windows Keychain** — API key stored in plaintext config on non-macOS platforms.

---

## Roadmap

### Planned

- [ ] `openhome logs [ability]` — Stream ability logs in real-time
- [ ] `openhome delete [ability]` — Remove a deployed ability
- [ ] `openhome update` — Re-deploy an existing ability (shortcut for deploy)
- [ ] Local testing framework with mock `CapabilityWorker`
- [ ] `openhome watch` — Auto-deploy on file changes
- [ ] Background Daemon and Brain Skill templates
- [ ] Cross-platform secure key storage (Windows Credential Manager, Linux Secret Service)

### Needs Server-Side Work

- [ ] Upload endpoint (`POST /api/sdk/abilities`)
- [ ] List endpoint (`GET /api/sdk/abilities`)
- [ ] Detail endpoint (`GET /api/sdk/abilities/:id`)
- [ ] Log streaming endpoint (WebSocket)
- [ ] Delete endpoint (`DELETE /api/sdk/abilities/:id`)

---

## Terminology

| Term | Meaning |
|------|---------|
| **Ability** | A Python plugin that adds a feature to an OpenHome agent |
| **Agent** | A voice AI personality that can have multiple abilities (called "personality" in the API) |
| **Trigger words** | Spoken phrases that activate an ability (called `matching_hotwords` in config.json) |
| **Skill** | An ability type that runs when the user triggers it |
| **Brain Skill** | An ability type that the agent triggers automatically |
| **Background Daemon** | An ability type that runs continuously from session start |
| **CapabilityWorker** | The runtime helper object for speaking, listening, file I/O, and secrets |
| **AgentWorker** | The runtime object for logging and session management |

---

## License

MIT
