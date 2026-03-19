import WebSocket from "ws";
import { getApiKey, getConfig } from "../config/store.js";
import { ApiClient } from "../api/client.js";
import { WS_BASE, ENDPOINTS } from "../api/endpoints.js";
import { error, success, info, p, handleCancel } from "../ui/format.js";
import chalk from "chalk";
import * as readline from "node:readline";

interface WsMessage {
  type: string;
  data: unknown;
}

interface WsTextData {
  content: string;
  role: string;
  live?: boolean;
  final?: boolean;
}

const PING_INTERVAL = 30_000;

export async function chatCommand(
  agentArg?: string,
  opts: { mock?: boolean } = {},
): Promise<void> {
  p.intro("💬 Chat with your agent");

  const apiKey = getApiKey();
  if (!apiKey) {
    error("Not authenticated. Run: openhome login");
    process.exit(1);
  }

  // Resolve agent ID
  let agentId = agentArg ?? getConfig().default_personality_id;

  if (!agentId) {
    // Fetch agents and let user pick
    const s = p.spinner();
    s.start("Fetching agents...");

    try {
      const client = new ApiClient(apiKey);
      const agents = await client.getPersonalities();
      s.stop(`Found ${agents.length} agent(s).`);

      if (agents.length === 0) {
        error("No agents found. Create one at https://app.openhome.com");
        process.exit(1);
      }

      const selected = await p.select({
        message: "Which agent do you want to chat with?",
        options: agents.map((a) => ({
          value: a.id,
          label: a.name,
          hint: a.id,
        })),
      });
      handleCancel(selected);
      agentId = selected as string;
    } catch (err) {
      s.stop("Failed.");
      error(
        `Could not fetch agents: ${err instanceof Error ? err.message : String(err)}`,
      );
      process.exit(1);
    }
  }

  // Connect WebSocket — wrap in a Promise so the menu waits for chat to end
  const wsUrl = `${WS_BASE}${ENDPOINTS.voiceStream(apiKey, agentId)}`;
  info(`Connecting to agent ${chalk.bold(agentId)}...`);

  await new Promise<void>((resolve) => {
    const ws = new WebSocket(wsUrl, {
      perMessageDeflate: false,
      headers: {
        Origin: "https://app.openhome.com",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      },
    });

    let connected = false;
    let currentResponse = "";

    // Readline for user input
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    function promptUser(): void {
      rl.question(chalk.green("You: "), (input) => {
        const trimmed = input.trim();

        if (!trimmed) {
          promptUser();
          return;
        }

        if (trimmed === "/quit" || trimmed === "/exit" || trimmed === "/q") {
          info("Closing connection...");
          ws.close(1000);
          rl.close();
          return;
        }

        if (!connected) {
          error("Not connected yet. Please wait...");
          promptUser();
          return;
        }

        // Send text message to agent (same as useOpenHomeVoice.sendText)
        ws.send(
          JSON.stringify({
            type: "transcribed",
            data: trimmed,
          }),
        );

        // Prompt again immediately for next input
        promptUser();
      });
    }

    // Keepalive ping every 30s (matches browser implementation)
    let pingInterval: ReturnType<typeof setInterval> | null = null;

    ws.on("open", () => {
      connected = true;

      // Keepalive ping — matches useOpenHomeVoice pattern
      pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "ping" }));
        }
      }, PING_INTERVAL);

      success("Connected! Type a message and press Enter. Type /quit to exit.");
      console.log(
        chalk.gray(
          "  Tip: Send trigger words to activate abilities (e.g. 'play aquaprime')",
        ),
      );
      console.log("");
      promptUser();
    });

    ws.on("message", (raw: WebSocket.Data) => {
      try {
        const msg = JSON.parse(raw.toString()) as WsMessage;

        switch (msg.type) {
          case "message": {
            const data = msg.data as WsTextData;
            if (data.content && data.role === "assistant") {
              if (data.live && !data.final) {
                // Streaming token — accumulate
                process.stdout.write(
                  currentResponse === ""
                    ? `${chalk.cyan("Agent:")} ${data.content}`
                    : data.content,
                );
                currentResponse += data.content;
              } else {
                // Final message
                if (currentResponse === "") {
                  // Non-streamed complete message
                  console.log(`${chalk.cyan("Agent:")} ${data.content}`);
                } else {
                  // End of stream
                  console.log(""); // newline after streaming
                }
                currentResponse = "";
                console.log("");
              }
            }
            break;
          }
          case "text": {
            // Control messages from server
            const textData = msg.data as string;
            if (textData === "audio-init") {
              // Server starting audio — tell it we're "playing"
              ws.send(JSON.stringify({ type: "text", data: "bot-speaking" }));
            } else if (textData === "audio-end") {
              // Server done with audio — tell it we finished
              ws.send(JSON.stringify({ type: "text", data: "bot-speak-end" }));
              // If no text was streamed, show a note
              if (currentResponse === "") {
                console.log(
                  chalk.gray("  (Agent sent audio — text-only mode)"),
                );
                console.log("");
              }
            }
            break;
          }
          case "audio":
            // Acknowledge audio receipt (protocol requirement)
            ws.send(JSON.stringify({ type: "ack", data: "audio-received" }));
            break;
          case "error-event": {
            const errData = msg.data as {
              message?: string;
              title?: string;
              close_connection?: boolean;
            };
            const errMsg =
              errData?.message || errData?.title || "Unknown error";
            error(`Server error: ${errMsg}`);
            break;
          }
          case "interrupt":
            // Agent was interrupted
            if (currentResponse !== "") {
              console.log(""); // newline
              currentResponse = "";
            }
            break;
          case "action":
          case "log":
          case "question":
          case "progress":
            // Informational — ignore in CLI
            break;
          default:
            break;
        }
      } catch {
        // Not JSON — ignore
      }
    });

    ws.on("error", (err: Error) => {
      console.error("");
      error(`WebSocket error: ${err.message}`);
      rl.close();
      resolve();
    });

    ws.on("close", (code: number) => {
      if (pingInterval) clearInterval(pingInterval);
      console.log("");
      if (code === 1000) {
        info("Disconnected.");
      } else {
        info(`Connection closed (code: ${code})`);
      }
      rl.close();
      resolve();
    });

    // Handle Ctrl+C
    rl.on("close", () => {
      if (connected) {
        ws.close(1000);
      }
    });
  });
}
