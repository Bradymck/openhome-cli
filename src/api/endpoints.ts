export const API_BASE = "https://app.openhome.com";

export const WS_BASE = "wss://app.openhome.com";

export const ENDPOINTS = {
  getPersonalities: "/api/sdk/get_personalities",
  uploadCapability: "/api/capabilities/add-capability/",
  listCapabilities: "/api/capabilities/get-all-capability/",
  getCapability: (id: string) => `/api/capabilities/get-capability/${id}/`,
  voiceStream: (apiKey: string, agentId: string) =>
    `/websocket/voice-stream/${apiKey}/${agentId}`,
} as const;
