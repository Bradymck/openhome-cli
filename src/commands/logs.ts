import { getApiKey, getConfig, getApiBase } from "../config/store.js";
import { ApiClient } from "../api/client.js";
import { error, success, info, p, handleCancel } from "../ui/format.js";
import { createAgentSocket } from "../ws/agent-socket.js";
import chalk from "chalk";

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
      const client = new ApiClient(apiKey, getApiBase());
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

  info(`Streaming logs from agent ${chalk.bold(agentId)}...`);
  info(`Press ${chalk.bold("Ctrl+C")} to stop.\n`);

  const socket = createAgentSocket({
    apiKey,
    agentId,
    baseUrl: getApiBase()
      ?.replace("https://", "wss://")
      .replace("http://", "ws://"),

    onConnect() {
      success("Connected. Waiting for messages...\n");
    },

    onEvent(type, data) {
      const ts = chalk.gray(new Date().toLocaleTimeString());

      switch (type) {
        case "log":
          console.log(`${ts} ${chalk.blue("[LOG]")} ${JSON.stringify(data)}`);
          break;
        case "action":
          console.log(
            `${ts} ${chalk.magenta("[ACTION]")} ${JSON.stringify(data)}`,
          );
          break;
        case "progress":
          console.log(
            `${ts} ${chalk.yellow("[PROGRESS]")} ${JSON.stringify(data)}`,
          );
          break;
        case "question":
          console.log(
            `${ts} ${chalk.cyan("[QUESTION]")} ${JSON.stringify(data)}`,
          );
          break;
        case "message": {
          const d = data as { content?: string; role?: string; live?: boolean };
          if (d.content && !d.live) {
            const role =
              d.role === "assistant"
                ? chalk.cyan("AGENT")
                : chalk.green("USER");
            console.log(`${ts} ${chalk.white(`[${role}]`)} ${d.content}`);
          }
          break;
        }
        case "error-event": {
          const d = data as { message?: string; title?: string };
          console.log(
            `${ts} ${chalk.red("[ERROR]")} ${d?.message ?? d?.title ?? JSON.stringify(data)}`,
          );
          break;
        }
        default:
          console.log(
            `${ts} ${chalk.gray(`[${type}]`)} ${JSON.stringify(data)}`,
          );
      }
    },

    onError(err) {
      error(`WebSocket error: ${err.message}`);
    },

    onClose(code) {
      console.log("");
      info(`Connection closed (code: ${code})`);
    },
  });

  process.on("SIGINT", () => {
    console.log("");
    info("Stopping log stream...");
    socket.close();
  });

  await socket.done;
}
