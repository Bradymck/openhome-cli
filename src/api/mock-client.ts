import type {
  Personality,
  UploadAbilityResponse,
  UploadAbilityMetadata,
  ListAbilitiesResponse,
  GetAbilityResponse,
  VerifyApiKeyResponse,
  DeleteCapabilityResponse,
  ToggleCapabilityResponse,
  AssignCapabilitiesResponse,
} from "./contracts.js";
import type { IApiClient } from "./client.js";

const MOCK_PERSONALITIES: Personality[] = [
  { id: "pers_alice", name: "Alice", description: "Friendly assistant" },
  { id: "pers_bob", name: "Bob", description: "Technical expert" },
  { id: "pers_cara", name: "Cara", description: "Creative companion" },
];

const MOCK_ABILITIES = [
  {
    ability_id: "abl_weather_001",
    unique_name: "weather-check",
    display_name: "Weather Check",
    version: 3,
    status: "active" as const,
    personality_ids: ["pers_alice", "pers_bob"],
    created_at: "2026-01-10T12:00:00Z",
    updated_at: "2026-03-01T09:30:00Z",
  },
  {
    ability_id: "abl_timer_002",
    unique_name: "pomodoro-timer",
    display_name: "Pomodoro Timer",
    version: 1,
    status: "processing" as const,
    personality_ids: ["pers_cara"],
    created_at: "2026-03-18T08:00:00Z",
    updated_at: "2026-03-18T08:05:00Z",
  },
  {
    ability_id: "abl_news_003",
    unique_name: "news-briefing",
    display_name: "News Briefing",
    version: 2,
    status: "failed" as const,
    personality_ids: [],
    created_at: "2026-02-20T14:00:00Z",
    updated_at: "2026-02-21T10:00:00Z",
  },
];

export class MockApiClient implements IApiClient {
  async getPersonalities(): Promise<Personality[]> {
    return Promise.resolve(MOCK_PERSONALITIES);
  }

  async uploadAbility(
    _zipBuffer: Buffer,
    _imageBuffer: Buffer | null,
    _imageName: string | null,
    _metadata: UploadAbilityMetadata,
  ): Promise<UploadAbilityResponse> {
    return Promise.resolve({
      ability_id: `abl_mock_${Date.now()}`,
      unique_name: "mock-ability",
      version: 1,
      status: "processing",
      validation_errors: [],
      created_at: new Date().toISOString(),
      message: "[MOCK] Ability uploaded successfully and is being processed.",
    });
  }

  async listAbilities(): Promise<ListAbilitiesResponse> {
    return Promise.resolve({ abilities: MOCK_ABILITIES });
  }

  async verifyApiKey(_apiKey: string): Promise<VerifyApiKeyResponse> {
    return Promise.resolve({
      valid: true,
      message: "[MOCK] API key is valid.",
    });
  }

  async deleteCapability(id: string): Promise<DeleteCapabilityResponse> {
    return Promise.resolve({
      message: `[MOCK] Capability ${id} deleted successfully.`,
    });
  }

  async toggleCapability(
    id: string,
    enabled: boolean,
  ): Promise<ToggleCapabilityResponse> {
    return Promise.resolve({
      enabled,
      message: `[MOCK] Capability ${id} ${enabled ? "enabled" : "disabled"}.`,
    });
  }

  async assignCapabilities(
    personalityId: string,
    capabilityIds: number[],
  ): Promise<AssignCapabilitiesResponse> {
    return Promise.resolve({
      message: `[MOCK] Agent ${personalityId} updated with ${capabilityIds.length} capability(s).`,
    });
  }

  async getAbility(id: string): Promise<GetAbilityResponse> {
    const found = MOCK_ABILITIES.find(
      (a) => a.ability_id === id || a.unique_name === id,
    );
    const base = found ?? MOCK_ABILITIES[0];
    return Promise.resolve({
      ...base,
      validation_errors:
        base.status === "failed"
          ? ["Missing resume_normal_flow() call in main.py"]
          : [],
      deploy_history: [
        {
          version: base.version,
          status: base.status === "active" ? "success" : "failed",
          timestamp: base.updated_at,
          message:
            base.status === "active"
              ? "Deployed successfully"
              : "Validation failed",
        },
        ...(base.version > 1
          ? [
              {
                version: base.version - 1,
                status: "success" as const,
                timestamp: base.created_at,
                message: "Deployed successfully",
              },
            ]
          : []),
      ],
    });
  }
}
