// Existing endpoints

export interface GetPersonalitiesRequest {
  api_key: string;
  with_image?: boolean;
}

export interface Personality {
  id: string;
  name: string;
  description?: string;
}

export interface GetPersonalitiesResponse {
  personalities: Personality[];
}

// Upload request metadata
export type AbilityCategory = "skill" | "brain" | "daemon";

export interface UploadAbilityMetadata {
  name: string;
  description: string;
  category: AbilityCategory;
  matching_hotwords: string[];
  personality_id?: string;
}

// Proposed endpoints (not yet implemented on server)

export interface UploadAbilityResponse {
  ability_id: string;
  unique_name: string;
  version: number;
  status: "processing" | "active" | "failed";
  validation_errors: string[];
  created_at: string;
  message: string;
}

export interface AbilitySummary {
  ability_id: string;
  unique_name: string;
  display_name: string;
  version: number;
  status: "processing" | "active" | "failed" | "disabled";
  personality_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface ListAbilitiesResponse {
  abilities: AbilitySummary[];
}

export interface GetAbilityResponse extends AbilitySummary {
  validation_errors: string[];
  deploy_history: DeployEvent[];
}

export interface DeployEvent {
  version: number;
  status: "success" | "failed";
  timestamp: string;
  message: string;
}

export interface ApiErrorResponse {
  error: {
    code:
      | "UNAUTHORIZED"
      | "VALIDATION_FAILED"
      | "NOT_FOUND"
      | "NOT_IMPLEMENTED";
    message: string;
    details?: Record<string, unknown>;
  };
}
