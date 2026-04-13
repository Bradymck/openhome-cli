import WebSocket from "ws";
import { WS_BASE, ENDPOINTS } from "../api/endpoints.js";
import type {
  AnyWsMessage,
  BufferedResponse,
  BridgeStatus,
  WsTextMessage,
  WsLogMessage,
  WsActionMessage,
} from "./types.js";

const PING_INTERVAL_MS = 25_000;
const CONNECT_TIMEOUT_MS = 10_000;
const RESPONSE_TIMEOUT_MS = 30_000;

export class WsBridge {
  private ws: WebSocket | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private status: BridgeStatus = {
    connected: false,
    agentId: null,
    lastActivity: null,
    error: null,
  };

  constructor(
    private readonly apiKey: string,
    private readonly agentId: string,
  ) {
    this.status.agentId = agentId;
  }

  getStatus(): BridgeStatus {
    return { ...this.status };
  }

  async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    const path = ENDPOINTS.voiceStream(this.apiKey, this.agentId);
    const url = `${WS_BASE}${path}`;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("WebSocket connection timed out"));
      }, CONNECT_TIMEOUT_MS);

      this.ws = new WebSocket(url);

      this.ws.once("open", () => {
        clearTimeout(timeout);
        this.status.connected = true;
        this.status.error = null;
        this.status.lastActivity = Date.now();
        this.startPing();
        resolve();
      });

      this.ws.once("error", (err) => {
        clearTimeout(timeout);
        this.status.connected = false;
        this.status.error = err.message;
        reject(err);
      });

      this.ws.on("close", () => {
        this.status.connected = false;
        this.stopPing();
      });
    });
  }

  disconnect(): void {
    this.stopPing();
    if (this.ws) {
      this.ws.terminate();
      this.ws = null;
    }
    this.status.connected = false;
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.ping();
      }
    }, PING_INTERVAL_MS);
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  /**
   * Send a text message and collect the full response.
   * Waits for the assistant to finish speaking (text + logs + actions).
   */
  async sendMessage(text: string): Promise<BufferedResponse> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      await this.connect();
    }

    const ws = this.ws!;

    return new Promise((resolve, reject) => {
      const buffer: BufferedResponse = {
        text: "",
        logs: [],
        actions: [],
        receivedAt: Date.now(),
      };

      let settled = false;
      let silenceTimer: ReturnType<typeof setTimeout> | null = null;

      const settle = (): void => {
        if (settled) return;
        settled = true;
        if (silenceTimer) clearTimeout(silenceTimer);
        ws.removeListener("message", onMessage);
        ws.removeListener("error", onError);
        ws.removeListener("close", onClose);
        buffer.receivedAt = Date.now();
        resolve(buffer);
      };

      // Collect response for 2s after last message (speaker is streaming)
      const resetSilenceTimer = (): void => {
        if (silenceTimer) clearTimeout(silenceTimer);
        silenceTimer = setTimeout(settle, 2000);
      };

      const hardTimeout = setTimeout(() => {
        reject(new Error("Response timed out"));
      }, RESPONSE_TIMEOUT_MS);

      const onMessage = (raw: WebSocket.RawData): void => {
        clearTimeout(hardTimeout);
        this.status.lastActivity = Date.now();

        let msg: AnyWsMessage;
        try {
          msg = JSON.parse(raw.toString()) as AnyWsMessage;
        } catch {
          return;
        }

        if (msg.type === "text") {
          buffer.text += (msg as WsTextMessage).text ?? "";
          resetSilenceTimer();
        } else if (msg.type === "log") {
          buffer.logs.push((msg as WsLogMessage).message ?? "");
          resetSilenceTimer();
        } else if (msg.type === "action") {
          buffer.actions.push(
            JSON.stringify((msg as WsActionMessage).action ?? msg),
          );
          resetSilenceTimer();
        } else if (msg.type === "audio" || msg.type === "progress") {
          resetSilenceTimer();
        }
      };

      const onError = (err: Error): void => {
        clearTimeout(hardTimeout);
        if (!settled) {
          settled = true;
          reject(err);
        }
      };

      const onClose = (): void => {
        clearTimeout(hardTimeout);
        if (!settled) {
          settled = true;
          resolve(buffer); // return what we have
        }
      };

      ws.on("message", onMessage);
      ws.once("error", onError);
      ws.once("close", onClose);

      // Send the message
      ws.send(JSON.stringify({ type: "message", content: text, role: "user" }));

      // Start silence timer immediately (handles empty responses)
      resetSilenceTimer();
    });
  }
}
