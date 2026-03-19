import WebSocket from "ws";
import { getApiKey, getConfig } from "../config/store.js";
import { ApiClient } from "../api/client.js";
import { WS_BASE, ENDPOINTS } from "../api/endpoints.js";
import { error, success, info, p, handleCancel } from "../ui/format.js";
import chalk from "chalk";

const PING_INTERVAL = 30_000;
const RESPONSE_TIMEOUT = 30_000;

export async function triggerCommand(
  phraseArg?: string,
  opts: { agent?: string } = {},
): Promise<void> {
  p.intro("⚡ Trigger an ability");

  const apiKey = getApiKey();
  if (!apiKey) {
    error("Not authenticated. Run: openhome login");
    process.exit(1);
  }

  // Resolve phrase
  let phrase = phraseArg;
  if (!phrase) {
    const input = await p.text({
      message: "Trigger phrase (e.g. 'play aquaprime')",
      validate: (val) => {
        if (!val || !val.trim()) return "A trigger phrase is required";
      },
    });
    handleCancel(input);
    phrase = (input as string).trim();
  }

  // Resolve agent ID
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

  // Connect, send trigger, wait for response, disconnect
  const wsUrl = `${WS_BASE}${ENDPOINTS.voiceStream(apiKey, agentId)}`;
  info(`Sending "${chalk.bold(phrase)}" to agent ${chalk.bold(agentId)}...`);

  const s = p.spinner();
  s.start("Waiting for response...");

  await new Promise<void>((resolve) => {
    const ws = new WebSocket(wsUrl, {
      perMessageDeflate: false,
      headers: {
        Origin: "https://app.openhome.com",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      },
    });

    let fullResponse = "";
    let responseTimer: ReturnType<typeof setTimeout> | null = null;
    let pingInterval: ReturnType<typeof setInterval> | null = null;

    function cleanup(): void {
      if (pingInterval) clearInterval(pingInterval);
      if (responseTimer) clearTimeout(responseTimer);
      if (ws.readyState === WebSocket.OPEN) ws.close(1000);
    }

    ws.on("open", () => {
      // Send trigger phrase immediately
      ws.send(JSON.stringify({ type: "transcribed", data: phrase }));

      // Keepalive
      pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "ping" }));
        }
      }, PING_INTERVAL);

      // Timeout if no response
      responseTimer = setTimeout(() => {
        s.stop("Timed out waiting for response.");
        if (fullResponse) {
          console.log(`\n${chalk.cyan("Agent:")} ${fullResponse}`);
        }
        cleanup();
        resolve();
      }, RESPONSE_TIMEOUT);
    });

    ws.on("message", (raw: WebSocket.Data) => {
      try {
        const msg = JSON.parse(raw.toString()) as {
          type: string;
          data: unknown;
        };

        switch (msg.type) {
          case "message": {
            const data = msg.data as {
              content?: string;
              role?: string;
              live?: boolean;
              final?: boolean;
            };
            if (data.content && data.role === "assistant") {
              fullResponse += data.content;
              if (!data.live || data.final) {
                // Got final response
                s.stop("Response received.");
                console.log(`\n${chalk.cyan("Agent:")} ${fullResponse}\n`);
                cleanup();
                resolve();
              }
            }
            break;
          }
          case "text": {
            const textData = msg.data as string;
            if (textData === "audio-init") {
              ws.send(JSON.stringify({ type: "text", data: "bot-speaking" }));
            } else if (textData === "audio-end") {
              ws.send(JSON.stringify({ type: "text", data: "bot-speak-end" }));
              if (fullResponse) {
                s.stop("Response received.");
                console.log(`\n${chalk.cyan("Agent:")} ${fullResponse}\n`);
                cleanup();
                resolve();
              }
            }
            break;
          }
          case "audio":
            ws.send(JSON.stringify({ type: "ack", data: "audio-received" }));
            break;
          case "error-event": {
            const errData = msg.data as { message?: string; title?: string };
            s.stop("Error.");
            error(
              `Server error: ${errData?.message || errData?.title || "Unknown"}`,
            );
            cleanup();
            resolve();
            break;
          }
        }
      } catch {
        // ignore
      }
    });

    ws.on("error", (err: Error) => {
      s.stop("Connection error.");
      error(err.message);
      resolve();
    });

    ws.on("close", () => {
      if (pingInterval) clearInterval(pingInterval);
      if (responseTimer) clearTimeout(responseTimer);
      resolve();
    });
  });
}
