// WebSocket message types from OpenHome voice stream protocol
export interface WsMessage {
  type: string;
  [key: string]: unknown;
}

export interface WsTextMessage extends WsMessage {
  type: "text";
  text: string;
  role?: "assistant" | "user";
}

export interface WsAudioMessage extends WsMessage {
  type: "audio";
  data: string; // base64 audio
  format?: string;
}

export interface WsLogMessage extends WsMessage {
  type: "log";
  message: string;
  level?: "info" | "warn" | "error";
}

export interface WsActionMessage extends WsMessage {
  type: "action";
  action: string;
  payload?: unknown;
}

export interface WsProgressMessage extends WsMessage {
  type: "progress";
  progress: number;
  message?: string;
}

export interface WsErrorMessage extends WsMessage {
  type: "error";
  message: string;
}

export type AnyWsMessage =
  | WsTextMessage
  | WsAudioMessage
  | WsLogMessage
  | WsActionMessage
  | WsProgressMessage
  | WsErrorMessage
  | WsMessage;

export interface BufferedResponse {
  text: string;
  logs: string[];
  actions: string[];
  receivedAt: number;
}

export interface BridgeStatus {
  connected: boolean;
  agentId: string | null;
  lastActivity: number | null;
  error: string | null;
}
