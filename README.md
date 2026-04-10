# OpenHome CLI

Command-line tool for managing OpenHome voice AI abilities. Create and deploy abilities without leaving your terminal.

**Version:** v0.1.2
**Node:** 18+
**Platform:** macOS (primary), Linux/Windows (config-file fallback for keychain)

---

## Install

```bash
# Use directly without installing
npx openhome-cli

# Or install globally
npm install -g openhome-cli
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

# 4. Deploy
openhome deploy ./my-ability
```

Or just run `openhome` with no arguments for the interactive menu.

---

## Commands

### `openhome` (no arguments)

Opens an interactive menu. Use arrow keys to navigate, Enter to select. The menu loops after each command — pick another or choose Exit.

If you are not logged in, the CLI prompts for login before showing the menu.

All commands below also work directly from the terminal.

---

### `openhome login`

Authenticate with your OpenHome API key.

1. Prompts for your API key (masked input)
2. Verifies the key against the OpenHome API
3. Stores the key securely (macOS Keychain, or `~/.openhome/config.json` fallback)

```bash
openhome login
```

---

### `openhome set-jwt [token]`

Save a session token to unlock management commands (`list`, `delete`, `toggle`, `assign`).

```bash
openhome set-jwt eyJ...
```

These management commands use OpenHome's web session API, which requires a JWT rather than the SDK API key. To get your token: open [app.openhome.com](https://app.openhome.com), open DevTools then Application then Local Storage then `token`, copy the value, and run `openhome set-jwt <token>`.

The token is saved to `~/.openhome/config.json`. You only need to do this once (until your session expires).

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

The generated code auto-validates after creation. You're prompted to deploy immediately.

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

> **Note:** There is no update/overwrite endpoint yet. Re-deploying with the same name will fail with a naming conflict. Delete the old version first with `openhome delete`.

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

> **Requires session token.** Run `openhome set-jwt <token>` first. See [set-jwt](#openhome-set-jwt-token) above.

---

### `openhome delete [ability]`

Delete a deployed ability.

```bash
# Pick from a list interactively
openhome delete

# Delete by name directly
openhome delete my-weather-bot

# Test with fake data
openhome delete --mock
```

Prompts for confirmation before deleting.

> **Requires session token.** Run `openhome set-jwt <token>` first.

---

### `openhome toggle [ability]`

Enable or disable a deployed ability.

```bash
# Interactive
openhome toggle

# By name with flag
openhome toggle my-weather-bot --enable
openhome toggle my-weather-bot --disable
```

| Flag | What it does |
|------|-------------|
| `--enable` | Enable the ability |
| `--disable` | Disable the ability |

> **Requires session token.** Run `openhome set-jwt <token>` first.

---

### `openhome assign`

Assign abilities to an agent (multiselect).

```bash
openhome assign
```

Fetches your agents and abilities, lets you pick an agent, then multiselect which abilities to assign to it.

> **Requires session token.** Run `openhome set-jwt <token>` first.

---

### `openhome agents`

View your agents and set a default for deploys.

```bash
openhome agents
```

Shows all agents on your account with names and IDs. Optionally set or change your default agent (used by `deploy` when `--personality` is not specified).

---

### `openhome chat [agent]`

Chat with an agent via WebSocket. Send text messages and trigger abilities with keywords.

```bash
# Pick an agent interactively
openhome chat

# Chat with a specific agent
openhome chat pers_abc123
```

Once connected, type messages and press Enter. The agent responds in real-time.

Commands inside chat: `/quit`, `/exit`, or `/q` to disconnect. Ctrl+C also works.

> **Note:** Audio responses from the agent are not playable in the terminal. Text responses display normally.

---

### `openhome trigger [phrase]`

Send a trigger phrase to fire an ability remotely.

```bash
openhome trigger "play aquaprime"
openhome trigger --agent pers_abc123 "check weather"
```

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

> **Requires session token** (uses the same list endpoint internally). Run `openhome set-jwt <token>` first.

---

### `openhome logs`

Stream live agent messages and logs.

```bash
openhome logs
openhome logs --agent pers_abc123
```

---

### `openhome whoami`

Show auth status, default agent, and tracked abilities.

```bash
openhome whoami
```

---

### `openhome config [path]`

Edit trigger words, description, or category in a local `config.json`.

```bash
openhome config
openhome config ./my-ability
```

---

### `openhome logout`

Clear stored credentials and log out.

```bash
openhome logout
```

Removes the API key from macOS Keychain and clears the default agent from config.

---

## Validation Rules

Deploy automatically checks these rules before uploading. Errors block deployment. Warnings do not.

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

| What | Why |
|------|-----|
| Class extending `MatchingCapability` | OpenHome ability base class |
| `call(self, ...)` method | Entry point OpenHome calls |
| `worker: AgentWorker = None` | Required field declaration |
| `capability_worker: CapabilityWorker = None` | Required field declaration |
| `resume_normal_flow()` call | Returns control to user after ability runs |
| `# {{register_capability}}` comment | Template marker used by OpenHome |

### Blocked Patterns (Errors)

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
  config.json    # Settings, fallback API key, session token
```

### Config Fields

| Field | Purpose | Default |
|-------|---------|---------|
| `api_base_url` | Override API endpoint | `https://app.openhome.com` |
| `default_personality_id` | Default agent for deploys | (none) |
| `api_key` | Fallback key storage | (none — prefers Keychain) |
| `jwt` | Session token for management commands | (none — set via `set-jwt`) |

### API Key Storage

On macOS, your API key is stored in the system Keychain (service: `openhome-cli`, account: `api-key`). On other platforms, it falls back to `~/.openhome/config.json`.

---

## What This Tool Does NOT Do

- **No local ability testing** — Abilities run on the OpenHome platform. Deploy and use "Start Live Test" in the web editor to test.
- **No ability editing** — The CLI does not modify deployed abilities. Edit locally, then re-deploy.
- **No update/redeploy** — There is no endpoint to overwrite an existing ability version. Deploy creates a new entry; delete the old one via `openhome delete`.
- **No Windows Keychain** — API key stored in plaintext config on non-macOS platforms.

---

## API Status

| Command | Endpoint | Auth | Status |
|---------|----------|------|--------|
| `login` | `POST /api/sdk/verify_apikey/` | API key | Live |
| `agents` | `POST /api/sdk/get_personalities/` | API key | Live |
| `chat` | WebSocket `/websocket/voice-stream/` | API key | Live |
| `deploy` | `POST /api/capabilities/add-capability/` | API key | Live |
| `list` | `GET /api/capabilities/get-installed-capabilities/` | JWT | Live |
| `delete` | `POST /api/capabilities/delete-capability/` | JWT | Live |
| `toggle` | `PUT /api/capabilities/edit-installed-capability/:id/` | JWT | Live |
| `assign` | `PUT /api/personalities/edit-personality/` | JWT | Live |

Commands marked **JWT** require `openhome set-jwt <token>` first. OpenHome currently uses separate auth for SDK operations (API key) vs. account management (web session JWT). Once OpenHome adds API key support to management endpoints, the `set-jwt` step will no longer be needed.

---

## Roadmap

- [ ] `openhome watch` — Auto-deploy on file changes
- [ ] `openhome update` — Re-deploy/overwrite an existing ability (pending server-side update endpoint)
- [ ] Background Daemon and Brain Skill templates
- [ ] Cross-platform secure key storage (Windows Credential Manager, Linux Secret Service)
- [ ] Management commands without JWT (pending OpenHome API update)

---

## Development

```bash
npm install
npm run build      # Build
npm run dev        # Run without building
npm run lint       # Type check
npm run test       # Run tests
```

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
