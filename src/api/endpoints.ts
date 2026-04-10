export const API_BASE = "https://app.openhome.com";

export const WS_BASE = "wss://app.openhome.com";

export const ENDPOINTS = {
  getPersonalities: "/api/sdk/get_personalities",
  verifyApiKey: "/api/sdk/verify_apikey/",
  uploadCapability: "/api/capabilities/add-capability/",
  listCapabilities: "/api/capabilities/get-installed-capabilities/",
  deleteCapability: (id: string) =>
    `/api/capabilities/delete-capability/${id}/`,
  bulkDeleteCapabilities: "/api/capabilities/delete-capability/",
  editInstalledCapability: (id: string) =>
    `/api/capabilities/edit-installed-capability/${id}/`,
  editPersonality: "/api/personalities/edit-personality/",
  voiceStream: (apiKey: string, agentId: string) =>
    `/websocket/voice-stream/${apiKey}/${agentId}`,
} as const;
