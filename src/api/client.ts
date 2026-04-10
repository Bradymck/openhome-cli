import FormDataLib from "form-data";
import type {
  GetPersonalitiesResponse,
  Personality,
  UploadAbilityResponse,
  UploadAbilityMetadata,
  ListAbilitiesResponse,
  GetAbilityResponse,
  ApiErrorResponse,
  VerifyApiKeyResponse,
  DeleteCapabilityResponse,
  ToggleCapabilityResponse,
  AssignCapabilitiesResponse,
  InstalledCapability,
  AbilitySummaryWithExtras,
} from "./contracts.js";
import { API_BASE, ENDPOINTS } from "./endpoints.js";

export class NotImplementedError extends Error {
  constructor(endpoint: string) {
    super(`API endpoint not yet implemented: ${endpoint}`);
    this.name = "NotImplementedError";
  }
}

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class SessionExpiredError extends Error {
  constructor() {
    super("Session token expired or invalid");
    this.name = "SessionExpiredError";
  }
}

export interface IApiClient {
  getPersonalities(): Promise<Personality[]>;
  verifyApiKey(apiKey: string): Promise<VerifyApiKeyResponse>;
  uploadAbility(
    zipBuffer: Buffer,
    imageBuffer: Buffer | null,
    imageName: string | null,
    metadata: UploadAbilityMetadata,
  ): Promise<UploadAbilityResponse>;
  listAbilities(): Promise<ListAbilitiesResponse>;
  getAbility(id: string): Promise<GetAbilityResponse>;
  deleteCapability(id: string): Promise<DeleteCapabilityResponse>;
  toggleCapability(
    id: string,
    enabled: boolean,
  ): Promise<ToggleCapabilityResponse>;
  assignCapabilities(
    personalityId: string,
    capabilityIds: number[],
  ): Promise<AssignCapabilitiesResponse>;
}

type AuthMode = "apikey" | "jwt" | "xapikey";

export class ApiClient implements IApiClient {
  private readonly baseUrl: string;

  constructor(
    private readonly apiKey: string,
    baseUrl?: string,
    private readonly jwt?: string,
  ) {
    this.baseUrl = baseUrl ?? API_BASE;
    if (!this.baseUrl.startsWith("https://")) {
      throw new Error("API base URL must use HTTPS. Got: " + this.baseUrl);
    }
  }

  private async request<T>(
    path: string,
    options: RequestInit = {},
    auth: AuthMode = "apikey",
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    // Build auth headers
    const authHeaders: Record<string, string> = {};
    if (auth === "jwt") {
      authHeaders["Authorization"] = `Bearer ${this.jwt}`;
    } else if (auth === "xapikey") {
      authHeaders["X-API-KEY"] = this.apiKey;
    } else {
      authHeaders["Authorization"] = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(url, {
      ...options,
      headers: {
        ...authHeaders,
        ...(options.headers ?? {}),
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new NotImplementedError(path);
      }

      let body: Record<string, unknown> | null = null;
      try {
        body = (await response.json()) as Record<string, unknown>;
      } catch {
        // ignore parse errors
      }

      if (
        (body as ApiErrorResponse | null)?.error?.code === "NOT_IMPLEMENTED"
      ) {
        throw new NotImplementedError(path);
      }

      const message =
        (body?.detail as string) ??
        (body as ApiErrorResponse | null)?.error?.message ??
        response.statusText;

      // Detect expired/invalid JWT
      if (
        auth === "jwt" &&
        (response.status === 401 ||
          message.toLowerCase().includes("token not valid") ||
          message.toLowerCase().includes("token is invalid") ||
          message.toLowerCase().includes("not valid for any token"))
      ) {
        throw new SessionExpiredError();
      }

      throw new ApiError(String(response.status), message);
    }

    return response.json() as Promise<T>;
  }

  async getPersonalities(): Promise<Personality[]> {
    const data = await this.request<GetPersonalitiesResponse>(
      ENDPOINTS.getPersonalities,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: this.apiKey, with_image: true }),
      },
    );
    return data.personalities;
  }

  async uploadAbility(
    zipBuffer: Buffer,
    imageBuffer: Buffer | null,
    imageName: string | null,
    metadata: UploadAbilityMetadata,
  ): Promise<UploadAbilityResponse> {
    // Use form-data package for reliable multipart uploads with correct MIME types
    const form = new FormDataLib();
    form.append("zip_file", zipBuffer, {
      filename: "ability.zip",
      contentType: "application/zip",
    });

    if (imageBuffer && imageName) {
      const imageExt = imageName.split(".").pop()?.toLowerCase() ?? "png";
      const imageMime =
        imageExt === "jpg" || imageExt === "jpeg" ? "image/jpeg" : "image/png";
      form.append("image_file", imageBuffer, {
        filename: imageName,
        contentType: imageMime,
      });
    }

    form.append("name", metadata.name);
    form.append("description", metadata.description);
    form.append("category", metadata.category);
    form.append("trigger_words", metadata.matching_hotwords.join(", "));
    if (metadata.personality_id) {
      form.append("personality_id", metadata.personality_id);
    }

    const url = `${this.baseUrl}${ENDPOINTS.uploadCapability}`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.jwt}`,
        ...form.getHeaders(),
      },
      body: form.getBuffer() as unknown as BodyInit,
    });

    if (!response.ok) {
      let body: Record<string, unknown> | null = null;
      try {
        body = (await response.json()) as Record<string, unknown>;
      } catch {
        // ignore
      }
      const message =
        (body?.detail as string) ??
        (body as ApiErrorResponse | null)?.error?.message ??
        response.statusText;

      if (
        response.status === 401 ||
        message.toLowerCase().includes("token not valid") ||
        message.toLowerCase().includes("token is invalid") ||
        message.toLowerCase().includes("not valid for any token")
      ) {
        throw new SessionExpiredError();
      }
      throw new ApiError(String(response.status), message);
    }

    return response.json() as Promise<UploadAbilityResponse>;
  }

  async listAbilities(): Promise<ListAbilitiesResponse> {
    // Now supports X-API-KEY auth — no JWT needed
    const data = await this.request<InstalledCapability[]>(
      ENDPOINTS.listCapabilities,
      { method: "GET" },
      "xapikey",
    );
    // Normalise to AbilitySummary shape
    return {
      abilities: data.map((c) => ({
        ability_id: String(c.id),
        unique_name: c.name,
        display_name: c.name,
        version: 1,
        status: c.enabled ? "active" : "disabled",
        personality_ids: [],
        created_at: c.last_updated ?? new Date().toISOString(),
        updated_at: c.last_updated ?? new Date().toISOString(),
        trigger_words: c.trigger_words,
        category: c.category,
      })),
    };
  }

  async getAbility(id: string): Promise<GetAbilityResponse> {
    // No single-get endpoint — fetch all and filter
    const { abilities } = await this.listAbilities();
    const found = abilities.find(
      (a) => a.ability_id === id || a.unique_name === id,
    );
    if (!found) {
      throw new ApiError("404", `Ability "${id}" not found.`);
    }
    return { ...found, validation_errors: [], deploy_history: [] };
  }

  async verifyApiKey(apiKey: string): Promise<VerifyApiKeyResponse> {
    return this.request<VerifyApiKeyResponse>(ENDPOINTS.verifyApiKey, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: apiKey }),
    });
  }

  async deleteCapability(id: string): Promise<DeleteCapabilityResponse> {
    // Try bulk POST endpoint first, fall back to legacy DELETE
    try {
      return await this.request<DeleteCapabilityResponse>(
        ENDPOINTS.bulkDeleteCapabilities,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ids: [Number.isNaN(Number(id)) ? id : Number(id)],
          }),
        },
        "xapikey",
      );
    } catch (err) {
      if (err instanceof NotImplementedError) {
        return this.request<DeleteCapabilityResponse>(
          ENDPOINTS.deleteCapability(id),
          { method: "DELETE" },
          "xapikey",
        );
      }
      throw err;
    }
  }

  async toggleCapability(
    id: string,
    enabled: boolean,
  ): Promise<ToggleCapabilityResponse> {
    // Fetch current state first so we can PUT back the full object
    const { abilities } = await this.listAbilities();
    const current = abilities.find((a) => a.ability_id === id);
    if (!current) {
      throw new ApiError("404", `Ability "${id}" not found.`);
    }
    return this.request<ToggleCapabilityResponse>(
      ENDPOINTS.editInstalledCapability(id),
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled,
          name: current.unique_name,
          category: (current as AbilitySummaryWithExtras).category ?? "skill",
          trigger_words:
            (current as AbilitySummaryWithExtras).trigger_words ?? [],
        }),
      },
      "xapikey",
    );
  }

  async assignCapabilities(
    personalityId: string,
    capabilityIds: number[],
  ): Promise<AssignCapabilitiesResponse> {
    // Uses multipart/form-data — JSON is rejected
    const form = new FormData();
    form.append("personality_id", personalityId);
    for (const capId of capabilityIds) {
      form.append("matching_capabilities", String(capId));
    }
    return this.request<AssignCapabilitiesResponse>(
      ENDPOINTS.editPersonality,
      { method: "PUT", body: form },
      "xapikey",
    );
  }
}
