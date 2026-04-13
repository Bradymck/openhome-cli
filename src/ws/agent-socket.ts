/**
 * Shared WebSocket helper for all agent connections.
 * Handles: connection setup, keepalive pings, audio protocol handshake,
 * error events, and cleanup — so command files only contain their own logic.
 */
import WebSocket from "ws";
import { WS_BASE, ENDPOINTS } from "../api/endpoints.js";

const PING_INTERVAL = 30_000;

const WS_HEADERS = {
  Origin: "https://app.openhome.com",
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
};

export interface TextMessageOpts {
  live: boolean;
  final: boolean;
}

export interface AgentSocketOptions {
  apiKey: string;
  agentId: string;
  baseUrl?: string;
  /** Called when the WebSocket connection is open and ready. */
  onConnect?: () => void;
  /**
   * Called for assistant/user text messages. Convenience wrapper over onEvent
   * for the common case — chat and trigger both need this.
   */
  onTextMessage?: (
    content: string,
    role: string,
    opts: TextMessageOpts,
  ) => void;
  /**
   * Called for every message type (including "message" ones above).
   * Use for logging/observing all traffic — logs command uses this.
   */
  onEvent?: (type: string, data: unknown) => void;
  /** Called on server error-event messages and WebSocket errors. */
  onError?: (err: Error) => void;
  /** Called when the connection closes. */
  onClose?: (code: number) => void;
}

export interface AgentSocket {
  /** Send a typed message to the agent. */
  send: (type: string, data: unknown) => void;
  /** Close the connection cleanly. */
  close: (code?: number) => void;
  /** Resolves when the connection closes (either way). Await this to keep the process alive. */
  done: Promise<void>;
}

export function createAgentSocket(options: AgentSocketOptions): AgentSocket {
  const base = options.baseUrl ?? WS_BASE;
  const url = `${base}${ENDPOINTS.voiceStream(options.apiKey, options.agentId)}`;

  let resolveDone!: () => void;
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });

  const ws = new WebSocket(url, {
    perMessageDeflate: false,
    headers: WS_HEADERS,
  });

  let pingInterval: ReturnType<typeof setInterval> | null = null;

  function cleanup(): void {
    if (pingInterval) {
      clearInterval(pingInterval);
      pingInterval = null;
    }
  }

  ws.on("open", () => {
    pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "ping" }));
      }
    }, PING_INTERVAL);

    options.onConnect?.();
  });

  ws.on("message", (raw: WebSocket.Data) => {
    let msg: { type: string; data: unknown };
    try {
      msg = JSON.parse(raw.toString()) as typeof msg;
    } catch {
      return; // ignore non-JSON frames
    }

    switch (msg.type) {
      case "message": {
        const data = msg.data as {
          content?: string;
          role?: string;
          live?: boolean;
          final?: boolean;
        };
        if (data.content && options.onTextMessage) {
          options.onTextMessage(data.content, data.role ?? "assistant", {
            live: !!data.live,
            final: !!data.final,
          });
        }
        options.onEvent?.(msg.type, msg.data);
        break;
      }

      case "text": {
        // Audio lifecycle handshake — required by the OpenHome protocol.
        const textData = msg.data as string;
        if (textData === "audio-init") {
          ws.send(JSON.stringify({ type: "text", data: "bot-speaking" }));
        } else if (textData === "audio-end") {
          ws.send(JSON.stringify({ type: "text", data: "bot-speak-end" }));
        }
        options.onEvent?.(msg.type, msg.data);
        break;
      }

      case "audio":
        // Acknowledge audio receipt — protocol requirement even in text-only mode.
        ws.send(JSON.stringify({ type: "ack", data: "audio-received" }));
        break;

      case "error-event": {
        const errData = msg.data as { message?: string; title?: string };
        const msg_ =
          errData?.message ?? errData?.title ?? "Unknown server error";
        options.onError?.(new Error(msg_));
        options.onEvent?.(msg.type, msg.data);
        break;
      }

      default:
        options.onEvent?.(msg.type, msg.data);
        break;
    }
  });

  ws.on("error", (err: Error) => {
    cleanup();
    options.onError?.(err);
    resolveDone();
  });

  ws.on("close", (code: number) => {
    cleanup();
    options.onClose?.(code);
    resolveDone();
  });

  return {
    send(type: string, data: unknown) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type, data }));
      }
    },
    close(code = 1000) {
      if (
        ws.readyState === WebSocket.OPEN ||
        ws.readyState === WebSocket.CONNECTING
      ) {
        ws.close(code);
      }
    },
    done,
  };
}
