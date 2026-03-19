import WebSocket from "ws";
import { getApiKey, getConfig } from "../config/store.js";
import { ApiClient } from "../api/client.js";
import { WS_BASE, ENDPOINTS } from "../api/endpoints.js";
import { error, success, info, p, handleCancel } from "../ui/format.js";
import chalk from "chalk";

const PING_INTERVAL = 30_000;

export async function logsCommand(
  opts: { agent?: string } = {},
): Promise<void> {
  p.intro("📡 Stream agent logs");

  const apiKey = getApiKey();
  if (!apiKey) {
    error("Not authenticated. Run: openhome login");
    process.exit(1);
  }

  let agentId = opts.agent ?? getConfig().default_personality_id;

  if (!agentId) {
    const s = p.spinner();
    s.start("Fetching agents...");
    try {
      const client = new ApiClient(apiKey);
      const agents = await client.getPersonalities();
      s.stop(`Found ${agents.length} agent(s).`);

      if (agents.length === 0) {
        error("No agents found.");
        process.exit(1);
      }

      const selected = await p.select({
        message: "Which agent?",
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

  const wsUrl = `${WS_BASE}${ENDPOINTS.voiceStream(apiKey, agentId)}`;
  info(`Streaming logs from agent ${chalk.bold(agentId)}...`);
  info(`Press ${chalk.bold("Ctrl+C")} to stop.\n`);

  await new Promise<void>((resolve) => {
    const ws = new WebSocket(wsUrl, {
      perMessageDeflate: false,
      headers: {
        Origin: "https://app.openhome.com",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      },
    });

    let pingInterval: ReturnType<typeof setInterval> | null = null;

    ws.on("open", () => {
      success("Connected. Waiting for messages...\n");

      pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "ping" }));
        }
      }, PING_INTERVAL);
    });

    ws.on("message", (raw: WebSocket.Data) => {
      try {
        const msg = JSON.parse(raw.toString()) as {
          type: string;
          data: unknown;
        };
        const ts = chalk.gray(new Date().toLocaleTimeString());

        switch (msg.type) {
          case "log":
            console.log(
              `${ts} ${chalk.blue("[LOG]")} ${JSON.stringify(msg.data)}`,
            );
            break;
          case "action":
            console.log(
              `${ts} ${chalk.magenta("[ACTION]")} ${JSON.stringify(msg.data)}`,
            );
            break;
          case "progress":
            console.log(
              `${ts} ${chalk.yellow("[PROGRESS]")} ${JSON.stringify(msg.data)}`,
            );
            break;
          case "question":
            console.log(
              `${ts} ${chalk.cyan("[QUESTION]")} ${JSON.stringify(msg.data)}`,
            );
            break;
          case "message": {
            const data = msg.data as {
              content?: string;
              role?: string;
              live?: boolean;
            };
            if (data.content && !data.live) {
              const role =
                data.role === "assistant"
                  ? chalk.cyan("AGENT")
                  : chalk.green("USER");
              console.log(`${ts} ${chalk.white(`[${role}]`)} ${data.content}`);
            }
            break;
          }
          case "text": {
            const textData = msg.data as string;
            if (textData === "audio-init") {
              ws.send(JSON.stringify({ type: "text", data: "bot-speaking" }));
            } else if (textData === "audio-end") {
              ws.send(JSON.stringify({ type: "text", data: "bot-speak-end" }));
            }
            break;
          }
          case "audio":
            ws.send(JSON.stringify({ type: "ack", data: "audio-received" }));
            break;
          case "error-event": {
            const errData = msg.data as { message?: string; title?: string };
            console.log(
              `${ts} ${chalk.red("[ERROR]")} ${errData?.message || errData?.title || JSON.stringify(msg.data)}`,
            );
            break;
          }
          default:
            console.log(
              `${ts} ${chalk.gray(`[${msg.type}]`)} ${JSON.stringify(msg.data)}`,
            );
            break;
        }
      } catch {
        // ignore non-JSON
      }
    });

    ws.on("error", (err: Error) => {
      error(`WebSocket error: ${err.message}`);
      resolve();
    });

    ws.on("close", (code: number) => {
      if (pingInterval) clearInterval(pingInterval);
      console.log("");
      info(`Connection closed (code: ${code})`);
      resolve();
    });

    // Handle Ctrl+C
    process.on("SIGINT", () => {
      console.log("");
      info("Stopping log stream...");
      ws.close(1000);
    });
  });
}
