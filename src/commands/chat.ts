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
}

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
          hint: a.description ?? a.id,
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

  // Connect WebSocket
  const wsUrl = `${WS_BASE}${ENDPOINTS.voiceStream(apiKey, agentId)}`;
  info(`Connecting to agent ${chalk.bold(agentId)}...`);

  const ws = new WebSocket(wsUrl);

  let connected = false;
  let currentResponse = "";

  ws.on("open", () => {
    connected = true;
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
          if (data.content) {
            if (data.live) {
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
              promptUser();
            }
          }
          break;
        }
        case "audio-init":
          // Agent is about to send audio — we can't play it in terminal
          break;
        case "audio":
          // Audio data — skip in text-only mode
          break;
        case "audio-end":
          // Audio finished
          if (currentResponse === "") {
            // If we got audio but no text, prompt again
            console.log(
              chalk.gray("  (Agent sent audio — not playable in terminal)"),
            );
            console.log("");
            promptUser();
          }
          break;
        case "interrupt":
          // Agent was interrupted
          if (currentResponse !== "") {
            console.log(""); // newline
            currentResponse = "";
          }
          break;
        default:
          // Unknown message type — ignore
          break;
      }
    } catch {
      // Not JSON — ignore
    }
  });

  ws.on("error", (err: Error) => {
    console.error("");
    error(`WebSocket error: ${err.message}`);
    process.exit(1);
  });

  ws.on("close", (code: number) => {
    console.log("");
    if (code === 1000) {
      info("Disconnected.");
    } else {
      error(`Connection closed (code: ${code})`);
    }
    process.exit(0);
  });

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

      // Send text message to agent
      ws.send(
        JSON.stringify({
          type: "transcribed",
          data: trimmed,
        }),
      );
    });
  }

  // Handle Ctrl+C
  rl.on("close", () => {
    if (connected) {
      ws.close(1000);
    }
    process.exit(0);
  });
}
