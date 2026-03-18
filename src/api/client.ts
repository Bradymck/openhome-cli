import type {
  GetPersonalitiesResponse,
  Personality,
  UploadAbilityResponse,
  ListAbilitiesResponse,
  GetAbilityResponse,
  ApiErrorResponse,
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

export interface IApiClient {
  getPersonalities(): Promise<Personality[]>;
  uploadAbility(
    zipBuffer: Buffer,
    personalityId?: string,
  ): Promise<UploadAbilityResponse>;
  listAbilities(): Promise<ListAbilitiesResponse>;
  getAbility(id: string): Promise<GetAbilityResponse>;
}

export class ApiClient implements IApiClient {
  private readonly baseUrl: string;

  constructor(
    private readonly apiKey: string,
    baseUrl?: string,
  ) {
    this.baseUrl = baseUrl ?? API_BASE;
  }

  private async request<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        ...(options.headers ?? {}),
      },
    });

    if (!response.ok) {
      let body: ApiErrorResponse | null = null;
      try {
        body = (await response.json()) as ApiErrorResponse;
      } catch {
        // ignore parse errors
      }

      if (body?.error?.code === "NOT_IMPLEMENTED") {
        throw new NotImplementedError(path);
      }

      throw new ApiError(
        body?.error?.code ?? String(response.status),
        body?.error?.message ?? response.statusText,
        body?.error?.details,
      );
    }

    return response.json() as Promise<T>;
  }

  async getPersonalities(): Promise<Personality[]> {
    const data = await this.request<GetPersonalitiesResponse>(
      ENDPOINTS.getPersonalities,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: this.apiKey }),
      },
    );
    return data.personalities;
  }

  async uploadAbility(
    zipBuffer: Buffer,
    personalityId?: string,
  ): Promise<UploadAbilityResponse> {
    const form = new FormData();
    form.append(
      "ability",
      new Blob([zipBuffer as unknown as ArrayBuffer], {
        type: "application/zip",
      }),
      "ability.zip",
    );
    if (personalityId) {
      form.append("personality_id", personalityId);
    }

    return this.request<UploadAbilityResponse>(ENDPOINTS.abilities, {
      method: "POST",
      body: form,
    });
  }

  async listAbilities(): Promise<ListAbilitiesResponse> {
    return this.request<ListAbilitiesResponse>(ENDPOINTS.abilities, {
      method: "GET",
    });
  }

  async getAbility(id: string): Promise<GetAbilityResponse> {
    return this.request<GetAbilityResponse>(ENDPOINTS.abilityDetail(id), {
      method: "GET",
    });
  }
}
