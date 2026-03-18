# PRD: OpenHome CLI Tool

## Introduction

The OpenHome CLI (`openhome`) lets developers manage voice AI abilities entirely from the terminal. No dashboard, no manual zipping, no browser tab switching. Create, validate, deploy, and monitor abilities with one tool.

This PRD covers what exists today (v0.1.0 MVP), what needs server-side support, and a proposed browser-based authentication system to replace manual API key entry.

**Target users:** OpenHome ability developers (internal team + community)
**Platform:** Node.js 18+, macOS primary, Linux/Windows supported

---

## Goals

- Replace the dashboard-driven dev loop (zip, delete, upload, toggle, wait) with a single CLI command
- Match the UX quality of GitHub CLI, Vercel CLI, and Claude Code
- Define API contracts the backend team can implement
- Ship an auth flow that works without copy-pasting API keys
- Validate abilities locally before upload to catch errors early

---

## Current State (v0.1.0)

### What Works Today

| Command | Status | Notes |
|---------|--------|-------|
| `openhome` (interactive menu) | Working | Arrow-key navigable, loops after each command |
| `openhome init [name]` | Working | Scaffolds ability with templates, validates on create |
| `openhome validate [path]` | Working | 12 blocked patterns, 5 required patterns, config checks |
| `openhome login` | Working | Manual API key paste, verifies via `get_personalities` |
| `openhome deploy [path]` | Partial | Validates + zips. Upload endpoint not yet live on server. `--dry-run` and `--mock` work. |
| `openhome list` | Stubbed | Returns mock data. Server endpoint not yet live. |
| `openhome status [name]` | Stubbed | Returns mock data. Server endpoint not yet live. |

### What Does Not Exist Yet

| Feature | Blocked By |
|---------|-----------|
| Browser-based auth | Server OAuth support needed |
| Ability upload | `POST /api/sdk/abilities` not implemented |
| Ability listing | `GET /api/sdk/abilities` not implemented |
| Ability detail/history | `GET /api/sdk/abilities/:id` not implemented |
| Log streaming | WebSocket endpoint not implemented |
| Ability deletion | `DELETE /api/sdk/abilities/:id` not implemented |
| Local testing | No mock CapabilityWorker runtime exists |

---

## User Stories

### US-001: Interactive Menu Navigation
**Description:** As a developer, I want to run `openhome` and navigate commands with arrow keys so I do not need to memorize subcommands.

**Acceptance Criteria:**
- [x] Running `openhome` with no args shows scrollable menu
- [x] Arrow keys navigate, Enter selects
- [x] Menu loops after each command
- [x] Ctrl+C exits cleanly
- [x] Direct subcommands (`openhome deploy ./path`) still work

---

### US-002: Scaffold New Ability
**Description:** As a developer, I want to scaffold a new ability with one command so I start with valid boilerplate.

**Acceptance Criteria:**
- [x] `openhome init my-ability` creates directory with `main.py`, `config.json`, `__init__.py`, `README.md`
- [x] Prompts for ability type (Skill, Brain Skill, Background Daemon)
- [x] Prompts for template (Basic, API)
- [x] Prompts for trigger words
- [x] Auto-validates after generation
- [x] Generated code passes all validation rules

---

### US-003: Validate Ability Locally
**Description:** As a developer, I want to check my ability for errors before deploying so I do not waste time uploading broken code.

**Acceptance Criteria:**
- [x] `openhome validate` checks current directory
- [x] `openhome validate ./path` checks specific directory
- [x] Reports all errors (red) and warnings (yellow)
- [x] Blocks on errors, passes with warnings
- [x] Checks: required files, config schema, Python patterns, blocked imports

---

### US-004: Deploy Ability
**Description:** As a developer, I want to deploy an ability with one command so I do not need to manually zip and upload.

**Acceptance Criteria:**
- [x] `openhome deploy` validates, zips, and uploads
- [x] `--dry-run` shows what would deploy without uploading
- [x] `--mock` uses fake API for testing
- [x] `--personality <id>` overrides default agent
- [x] Confirmation prompt before real deploy
- [ ] Real upload works (blocked: server endpoint)
- [x] Graceful fallback when endpoint returns NOT_IMPLEMENTED (saves zip, shows manual instructions)

---

### US-005: Manual API Key Login
**Description:** As a developer, I want to authenticate with my API key so the CLI can make authenticated requests.

**Acceptance Criteria:**
- [x] `openhome login` prompts for API key (masked input)
- [x] Verifies key against `get_personalities` endpoint
- [x] Stores key in macOS Keychain (config file fallback)
- [x] Lists agents and lets user set a default
- [x] Clear error on invalid key

---

### US-006: Browser-Based Login (Proposed)
**Description:** As a developer, I want to log in by clicking a link and confirming in my browser so I do not need to find and paste API keys.

**Acceptance Criteria:**
- [ ] `openhome login` opens browser to OpenHome auth page
- [ ] User clicks "Authorize" in browser
- [ ] CLI receives token automatically (no paste)
- [ ] Fallback: display URL + code if browser cannot open
- [ ] Manual key paste available via `openhome login --token`
- [ ] Token stored securely (Keychain primary, file fallback with 0600 permissions)
- [ ] Auth session expires and can be refreshed
- [ ] Works in SSH/headless environments (device flow)

---

### US-007: List Abilities
**Description:** As a developer, I want to see all my deployed abilities so I know what is live.

**Acceptance Criteria:**
- [x] `openhome list` shows table with name, version, status, last update
- [x] Status is color-coded (green=active, yellow=processing, red=failed)
- [x] `--mock` works for testing
- [ ] Real data from API (blocked: server endpoint)

---

### US-008: Ability Status and History
**Description:** As a developer, I want to check one ability's status and deploy history so I can debug failed deployments.

**Acceptance Criteria:**
- [x] `openhome status my-ability` shows detail panel
- [x] Shows: name, status badge, version, timestamps, linked agents
- [x] Shows validation errors if any
- [x] Shows deploy history with version, status, message, timestamp
- [x] Reads from local `config.json` if no name given
- [x] `--mock` works for testing
- [ ] Real data from API (blocked: server endpoint)

---

### US-009: Log Streaming (Planned)
**Description:** As a developer, I want to stream my ability's logs in real-time so I can debug issues without using the dashboard.

**Acceptance Criteria:**
- [ ] `openhome logs my-ability` streams logs to terminal
- [ ] `--follow` keeps connection open for new logs
- [ ] `--tail 100` shows last N lines
- [ ] Color-coded log levels (error=red, warn=yellow, info=white)
- [ ] Ctrl+C cleanly disconnects

---

### US-010: Ability Deletion (Planned)
**Description:** As a developer, I want to delete a deployed ability from the CLI so I do not need to use the dashboard.

**Acceptance Criteria:**
- [ ] `openhome delete my-ability` removes the ability
- [ ] Confirmation prompt before deletion
- [ ] Clear success/error message

---

## Functional Requirements

### FR-1: Authentication (Current)
The CLI stores an API key via `openhome login`. Key is verified against `POST /api/sdk/get_personalities`. Stored in macOS Keychain (service: `openhome-cli`, account: `api-key`) with plaintext config file fallback.

### FR-2: Authentication (Proposed — Browser-Based)
See [Authentication Architecture](#authentication-architecture) section below.

### FR-3: Ability Scaffolding
`openhome init [name]` creates a directory with four files from templates. Supports two templates (Basic, API) and three ability categories (Skill, Brain Skill, Background Daemon). Auto-validates after creation.

### FR-4: Local Validation
`openhome validate [path]` runs all rules from `validation/rules.ts`. 12 blocked Python patterns, 4 blocked imports, 5 required patterns, config schema check, hardcoded key warning, multiple class warning. Returns structured `{passed, errors, warnings}`.

### FR-5: Deploy Pipeline
`openhome deploy [path]` runs: validate, read config, create ZIP (excludes `__pycache__`, `.pyc`, `.git`), confirm, upload. Supports `--dry-run` (no zip, no upload), `--mock` (fake API), `--personality <id>` (override agent).

### FR-6: Ability Listing
`openhome list` calls `GET /api/sdk/abilities` and renders a table. Supports `--mock`.

### FR-7: Ability Status
`openhome status [name]` calls `GET /api/sdk/abilities/:id` and renders detail panels. Falls back to local `config.json` for ability name. Supports `--mock`.

### FR-8: Interactive Menu
Bare `openhome` shows a `@clack/prompts` select menu with all commands. Loops after each command. Prompts for required arguments inline.

---

## Authentication Architecture

### Recommended: OAuth Device Flow (RFC 8628)

This is the same pattern GitHub CLI uses. It works everywhere: local machines, SSH sessions, containers, CI.

### How It Works

```
Developer                    CLI                         OpenHome Server
    |                         |                               |
    |   openhome login        |                               |
    |------------------------>|                               |
    |                         |  POST /oauth/device/code      |
    |                         |  {client_id}                  |
    |                         |------------------------------>|
    |                         |                               |
    |                         |  {device_code, user_code,     |
    |                         |   verification_uri,           |
    |                         |   interval, expires_in}       |
    |                         |<------------------------------|
    |                         |                               |
    |  "Open this URL and     |                               |
    |   enter code: ABCD-1234"|                               |
    |<------------------------|                               |
    |  (browser auto-opens)   |                               |
    |                         |                               |
    |  User visits URL -------|----> Enters code, clicks OK   |
    |                         |                               |
    |                         |  POST /oauth/token            |
    |                         |  {device_code, grant_type=    |
    |                         |   device_authorization}       |
    |                         |------------------------------>|
    |                         |  (polls every 5s)             |
    |                         |                               |
    |                         |  {access_token,               |
    |                         |   refresh_token, expires_in}  |
    |                         |<------------------------------|
    |                         |                               |
    |  "Logged in as Brady!"  |  Store in Keychain            |
    |<------------------------|                               |
```

### Server-Side Requirements

The OpenHome backend needs to implement these endpoints:

#### `POST /oauth/device/code`

Request:
```json
{
  "client_id": "openhome-cli"
}
```

Response (200):
```json
{
  "device_code": "random-uuid-device-code",
  "user_code": "ABCD-1234",
  "verification_uri": "https://app.openhome.com/device",
  "interval": 5,
  "expires_in": 900
}
```

- `device_code` — unique identifier for this auth session (server keeps it, CLI polls with it)
- `user_code` — short human-readable code the user types into the browser (8 chars, uppercase + digits)
- `verification_uri` — URL where user enters the code
- `interval` — seconds between poll attempts
- `expires_in` — seconds until the device code expires (15 minutes recommended)

#### `POST /oauth/token`

Request (polling):
```json
{
  "client_id": "openhome-cli",
  "device_code": "random-uuid-device-code",
  "grant_type": "urn:ietf:params:oauth:grant-type:device_code"
}
```

Response (pending — user has not authorized yet):
```json
{
  "error": "authorization_pending"
}
```

Response (success — user authorized):
```json
{
  "access_token": "oh_abc123...",
  "refresh_token": "oh_ref456...",
  "token_type": "Bearer",
  "expires_in": 86400
}
```

Response (expired — user took too long):
```json
{
  "error": "expired_token"
}
```

Response (denied — user clicked Deny):
```json
{
  "error": "access_denied"
}
```

#### `POST /oauth/token` (refresh)

Request:
```json
{
  "client_id": "openhome-cli",
  "grant_type": "refresh_token",
  "refresh_token": "oh_ref456..."
}
```

Response:
```json
{
  "access_token": "oh_new789...",
  "refresh_token": "oh_newref...",
  "token_type": "Bearer",
  "expires_in": 86400
}
```

#### Web Page: `https://app.openhome.com/device`

A simple page where the user:
1. Sees "Enter the code shown in your terminal"
2. Types the 8-character code
3. Sees their account info and what the CLI is requesting
4. Clicks "Authorize" or "Deny"

This page should work on mobile too (user might be SSHed from a phone).

### CLI-Side Implementation

```
openhome login
  |
  ├── Request device code from server
  ├── Display: "Open https://app.openhome.com/device"
  ├── Display: "Enter code: ABCD-1234"
  ├── Try to open browser (macOS: open, Linux: xdg-open)
  ├── Poll /oauth/token every 5s
  │     ├── "authorization_pending" → keep polling
  │     ├── "slow_down" → increase interval
  │     ├── "expired_token" → error, ask to retry
  │     ├── "access_denied" → error, exit
  │     └── success → store tokens
  ├── Store access_token in Keychain
  ├── Store refresh_token in Keychain
  ├── Fetch user info / personalities
  └── Display: "Logged in as [name]!"

openhome login --token
  |
  └── (fallback) Prompt for manual API key paste (current flow)
```

### Token Lifecycle

- Access token expires after 24 hours (configurable by server)
- Before each API call, check if token is expired
- If expired, use refresh token to get new access token
- If refresh fails, prompt user to `openhome login` again
- `openhome logout` clears all tokens from Keychain and config

### Why Device Flow Over PKCE

| Factor | Device Flow | PKCE + Localhost |
|--------|------------|-----------------|
| Works in SSH/containers | Yes | No |
| Needs local HTTP server | No | Yes |
| Port conflicts | None | Possible |
| Corporate firewalls | Works | May block localhost |
| Implementation complexity | Simpler | More complex |
| UX | Type short code | Click authorize (slightly easier) |

GitHub CLI chose device flow. It is battle-tested at scale. OpenHome developers often work via SSH or in constrained environments. Device flow works everywhere.

---

## API Contracts (Server-Side)

These endpoints need to be implemented by the OpenHome backend team.

### Existing (Working)

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/sdk/get_personalities` | POST | API key in body | List user's agents |

### Needed for CLI

| Endpoint | Method | Auth | Purpose | Priority |
|----------|--------|------|---------|----------|
| `POST /api/sdk/abilities` | POST | Bearer token | Upload ability ZIP | High |
| `GET /api/sdk/abilities` | GET | Bearer token | List user's abilities | High |
| `GET /api/sdk/abilities/:id` | GET | Bearer token | Ability detail + deploy history | Medium |
| `DELETE /api/sdk/abilities/:id` | DELETE | Bearer token | Remove ability | Medium |
| `POST /oauth/device/code` | POST | None (public) | Start device auth flow | High |
| `POST /oauth/token` | POST | None (public) | Exchange/refresh tokens | High |
| `GET /api/sdk/abilities/:id/logs` | WebSocket | Bearer token | Stream ability logs | Low |

### Upload Endpoint Detail

```
POST /api/sdk/abilities
Content-Type: multipart/form-data

Fields:
  ability: (binary ZIP file)
  personality_id: (optional string — agent to attach to)

Response 200:
{
  "ability_id": "abl_abc123",
  "unique_name": "my-weather-bot",
  "version": 3,
  "status": "processing",
  "validation_errors": [],
  "created_at": "2026-03-18T12:00:00Z",
  "message": "Upload received, processing..."
}

Response 400:
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Missing required file: main.py",
    "details": { "missing_files": ["main.py"] }
  }
}
```

### Error Format (All Endpoints)

```json
{
  "error": {
    "code": "UNAUTHORIZED | VALIDATION_FAILED | NOT_FOUND | NOT_IMPLEMENTED",
    "message": "Human-readable error message",
    "details": {}
  }
}
```

The CLI handles `NOT_IMPLEMENTED` gracefully — shows a helpful message and saves the request locally instead of crashing.

---

## Security Issues to Fix (Before Public Release)

### HIGH: Shell Injection in Keychain Storage

**File:** `src/config/keychain.ts`
**Problem:** API key is interpolated directly into a shell command string via `execSync`. A malicious key value could execute arbitrary commands.
**Fix:** Replace `execSync` with `execFileSync` using an argument array (bypasses shell entirely).

### HIGH: API Key Sent in Request Body

**File:** `src/api/client.ts` (`getPersonalities` method)
**Problem:** API key is sent both in the `Authorization` header AND in the POST body. Body values appear in server logs, proxy logs, and request inspection tools.
**Fix:** Remove `api_key` from request body. The header is sufficient.
**Server action needed:** Deprecate `api_key` body parameter in `get_personalities`, accept header-only auth.

### MEDIUM: Config File Permissions

**File:** `src/config/store.ts`
**Problem:** `~/.openhome/config.json` is created with default permissions (world-readable). If API key falls back to config file, any local user can read it.
**Fix:** Create directory with `mode: 0o700`, write file with `mode: 0o600`.

### MEDIUM: No HTTPS Enforcement

**File:** `src/api/client.ts`
**Problem:** Custom `api_base_url` accepts `http://`. All requests including auth headers would be sent unencrypted.
**Fix:** Validate that base URL starts with `https://` in the ApiClient constructor.

### MEDIUM: ZIP Includes Sensitive Files

**File:** `src/util/zip.ts`
**Problem:** Only excludes `__pycache__`, `.pyc`, `.git`. Does not exclude `.env`, `secrets.json`, `*.key`, `*.pem`.
**Fix:** Add `.env`, `.env.*`, `secrets.*`, `*.key`, `*.pem` to exclusion list. Add a validator warning when these files exist.

### MEDIUM: Narrow Hardcoded Key Detection

**File:** `src/validation/rules.ts`
**Problem:** Only catches keys starting with `sk_`, `sk-`, `key_`. Misses AWS keys (`AKIA...`), GitHub PATs (`ghp_...`), and generic `API_KEY = "..."` patterns.
**Fix:** Expand pattern list to cover common credential formats.

---

## Non-Goals (Out of Scope)

- **Local ability testing runtime** — No mock CapabilityWorker. Too complex for MVP. Deploy to test.
- **GUI/TUI dashboard** — CLI only. No Ink/Blessed terminal UI.
- **Multi-language abilities** — Python only. OpenHome does not support other languages yet.
- **Marketplace publishing** — Not in CLI scope. Use dashboard.
- **Team/org management** — Not in CLI scope.
- **Ability versioning/rollback** — Server would need to support this first.

---

## Technical Considerations

### Dependencies (Current)

| Package | Version | Purpose |
|---------|---------|---------|
| commander | 12.x | CLI argument parsing |
| @clack/prompts | 1.x | Interactive menus, spinners, prompts |
| chalk | 5.x | Terminal colors |
| archiver | 7.x | ZIP creation |

### Dependencies (Needed for Auth)

| Package | Purpose |
|---------|---------|
| `open` | Cross-platform browser opening |
| None for device flow | Just fetch + setInterval polling |

### Build

- TypeScript compiled via tsup (ESM output)
- Node.js 18+ required
- `npm link` for global install during development
- Eventually publish to npm as `openhome-cli`

### Compatibility

| Platform | Keychain | Browser Open | Status |
|----------|----------|-------------|--------|
| macOS | Yes (security CLI) | Yes (`open`) | Full support |
| Linux | No (config fallback) | Yes (`xdg-open`) | Works, less secure storage |
| Windows | No (config fallback) | Yes (`start`) | Works, less secure storage |
| SSH/headless | N/A | No | Device flow works, manual token fallback |

---

## Success Metrics

- Developer can go from `openhome init` to deployed ability in under 5 minutes
- Zero dashboard visits required for standard ability dev loop
- Auth flow completes in under 30 seconds (browser-based)
- All abilities pass validation before upload (no server-side validation failures for structure issues)
- CLI handles all API errors gracefully (no crashes, clear messages)

---

## Implementation Priority

### Phase 1: Security Fixes (Do First)
1. Fix shell injection in `keychain.ts`
2. Harden config file permissions
3. Add HTTPS enforcement
4. Expand ZIP exclusion list

### Phase 2: Server Endpoints (Backend Team)
5. `POST /api/sdk/abilities` (upload)
6. `GET /api/sdk/abilities` (list)
7. `GET /api/sdk/abilities/:id` (detail)
8. Wire CLI to real endpoints (remove mock fallback as default)

### Phase 3: Browser Auth (Requires Server + CLI)
9. Server: Implement `/oauth/device/code` and `/oauth/token`
10. Server: Build device authorization web page
11. CLI: Implement device flow in `openhome login`
12. CLI: Token refresh before API calls
13. CLI: `openhome logout` command

### Phase 4: Extended Features
14. `openhome logs` (WebSocket streaming)
15. `openhome delete` (ability removal)
16. `openhome watch` (auto-deploy on file changes)
17. Publish to npm

---

## Open Questions

1. **Token format:** What format will OpenHome access tokens use? JWT? Opaque? This affects whether the CLI can check expiry locally.
2. **Rate limits:** What are the API rate limits? The CLI should show clear messages when rate-limited.
3. **Ability size limit:** Is there a max ZIP size the server accepts? The CLI should enforce this client-side.
4. **Multi-agent deploy:** Can one ability be attached to multiple agents in a single deploy? Or does the user need to deploy once per agent?
5. **Versioning:** Does re-deploying the same `unique_name` auto-increment the version? Can the user roll back?
6. **WebSocket auth:** How will the log streaming endpoint authenticate? Bearer token in query param? Upgrade header?
7. **OAuth client registration:** Does the device flow need a registered OAuth client ID, or can it use a hardcoded public client ID (`openhome-cli`)?
