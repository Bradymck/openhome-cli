# Feature Request: SDK API Endpoints for Ability Management

**From:** OpenHome CLI Team
**Date:** 2026-03-18
**Priority:** High
**Context:** Building an open-source CLI tool (`openhome-cli`) for developers to manage abilities from the terminal

---

## Summary

The OpenHome SDK currently exposes one endpoint (`POST /api/sdk/get_personalities`). To enable CLI-based ability deployment, we need CRUD endpoints for abilities.

The CLI is fully built and ready to call these endpoints — it currently falls back to saving a zip locally with instructions to upload via the web dashboard.

---

## Current State

| Capability | Web Dashboard | SDK/API | CLI Ready? |
|-----------|--------------|---------|------------|
| List agents | Yes | **Yes** (`get_personalities`) | Yes |
| Create ability | Yes | No | Yes (blocked) |
| List abilities | Yes | No | Yes (blocked) |
| Get ability detail | Yes | No | Yes (blocked) |
| Delete ability | Yes | No | Not yet |
| Update ability code | Yes (Live Editor) | No | Not yet |

---

## Requested Endpoints

### 1. `POST /api/sdk/abilities` — Create/Upload Ability

Upload a new ability with all metadata matching the web form.

**Request:** `multipart/form-data`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `api_key` | string | Yes | Authentication |
| `ability` | file (zip) | Yes | Ability code archive |
| `image` | file (png/jpg) | Yes | Marketplace icon |
| `name` | string | Yes | Unique ability name |
| `description` | string | Yes | Marketplace description |
| `category` | enum | Yes | `skill`, `brain_skill`, `background_daemon` |
| `matching_hotwords` | JSON string | Yes | Array of trigger words |
| `personality_id` | string | No | Agent to attach ability to |

**Response (200):**
```json
{
  "ability_id": "abl_abc123",
  "unique_name": "my-weather-bot",
  "version": 1,
  "status": "processing",
  "message": "Ability uploaded successfully"
}
```

**Errors:**
- `401` — Invalid API key
- `400 VALIDATION_FAILED` — Missing files, bad config, blocked imports
- `409` — Ability with this name already exists (use update endpoint instead)

---

### 2. `GET /api/sdk/abilities` — List User's Abilities

**Request:**
```
POST /api/sdk/abilities/list
Content-Type: application/json

{
  "api_key": "..."
}
```

(Using POST with `api_key` in body to match the existing `get_personalities` pattern.)

**Response (200):**
```json
{
  "abilities": [
    {
      "ability_id": "abl_abc123",
      "unique_name": "weather-check",
      "name": "Weather Check",
      "description": "Check the weather by city",
      "category": "skill",
      "version": 3,
      "status": "active",
      "personality_ids": ["pers_alice"],
      "created_at": "2026-01-10T12:00:00Z",
      "updated_at": "2026-03-01T09:30:00Z"
    }
  ]
}
```

---

### 3. `POST /api/sdk/abilities/get` — Get Ability Detail

**Request:**
```json
{
  "api_key": "...",
  "ability_id": "abl_abc123"
}
```

**Response:** Same as list item plus:
```json
{
  "matching_hotwords": ["check weather", "weather please"],
  "validation_errors": [],
  "deploy_history": [
    {
      "version": 3,
      "status": "success",
      "timestamp": "2026-03-01T09:30:00Z"
    }
  ]
}
```

---

### 4. `POST /api/sdk/abilities/delete` — Delete Ability

**Request:**
```json
{
  "api_key": "...",
  "ability_id": "abl_abc123"
}
```

**Response (200):**
```json
{
  "message": "Ability deleted",
  "ability_id": "abl_abc123"
}
```

---

## Authentication Pattern

Following the existing `get_personalities` pattern: `api_key` in the JSON body rather than Bearer header. This keeps the SDK consistent. (The CLI also sends a Bearer header for forward compatibility.)

---

## Why This Matters

1. **Developer experience** — Developers want to stay in their terminal during ability development: edit code → deploy → test → iterate
2. **CI/CD** — Teams can automate ability deployment in their pipelines
3. **Open source adoption** — A CLI lowers the barrier for the developer community
4. **Parity with modern platforms** — Vercel, Netlify, Cloudflare Workers, etc. all have CLI deploy tools

---

## What's Already Built

The CLI (`openhome-cli`) handles:
- Login/logout with API key (macOS Keychain + config fallback)
- Agent listing (using existing `get_personalities`)
- Ability scaffolding with templates (Skill, Brain Skill, Background Daemon)
- Validation (required files, Python patterns, blocked imports)
- ZIP creation with security exclusions
- Multipart form upload with name, description, image, category, trigger words
- Graceful fallback when endpoints return NOT_IMPLEMENTED
- Interactive arrow-key menu (bare `openhome` command)
- Direct subcommands (`openhome deploy ./my-ability --dry-run`)
- Mock mode for testing without network

**The CLI is ready to ship the moment these endpoints are live.**

---

## Category Enum Clarification

The web form uses three buttons: **Skill**, **Brain Skill**, **Background Daemon**. What string values should we send in the API?

Suggested: `"skill"`, `"brain_skill"`, `"background_daemon"`

Please confirm the exact enum values the backend expects.

---

## Open Questions

1. What are the exact category enum values? (`skill` / `brain_skill` / `background_daemon`?)
2. Is there a max file size for the zip upload?
3. Is there a max image size or required dimensions for the icon?
4. Should `name` be globally unique or scoped to the user's account?
5. Can an ability be updated (new version) via the same create endpoint, or is a separate update endpoint needed?
6. Are there rate limits on the upload endpoint?
7. Should the response include a URL to the ability in the web editor?
