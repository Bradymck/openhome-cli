export const API_BASE = "https://app.openhome.com";

export const ENDPOINTS = {
  getPersonalities: "/api/sdk/get_personalities",
  abilities: "/api/sdk/abilities",
  abilityDetail: (id: string) => `/api/sdk/abilities/${id}`,
} as const;
