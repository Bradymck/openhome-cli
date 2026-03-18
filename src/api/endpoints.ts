export const API_BASE = "https://app.openhome.com";

export const WS_BASE = "wss://app.openhome.com";

export const ENDPOINTS = {
  getPersonalities: "/api/sdk/get_personalities",
  abilities: "/api/sdk/abilities",
  abilityDetail: (id: string) => `/api/sdk/abilities/${id}`,
  voiceStream: (apiKey: string, agentId: string) =>
    `/websocket/voice-stream/${apiKey}/${agentId}`,
} as const;
