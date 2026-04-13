import { getApiKey, getConfig, getApiBase } from "../config/store.js";
import { ApiClient } from "../api/client.js";
import { error, info, p, handleCancel } from "../ui/format.js";
import { createAgentSocket } from "../ws/agent-socket.js";
import chalk from "chalk";

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

  let phrase = phraseArg;
  if (!phrase) {
    const input = await p.text({
      message: "Trigger phrase (e.g. 'play aquaprime')",
      validate: (val) => {
        if (!val?.trim()) return "A trigger phrase is required";
      },
    });
    handleCancel(input);
    phrase = (input as string).trim();
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

  info(`Sending "${chalk.bold(phrase)}" to agent ${chalk.bold(agentId)}...`);

  const s = p.spinner();
  s.start("Waiting for response...");

  let fullResponse = "";
  let responseTimer: ReturnType<typeof setTimeout> | null = null;
  let settled = false;

  const socket = createAgentSocket({
    apiKey,
    agentId,
    baseUrl: getApiBase()
      ?.replace("https://", "wss://")
      .replace("http://", "ws://"),

    onConnect() {
      socket.send("transcribed", phrase);

      responseTimer = setTimeout(() => {
        if (!settled) {
          settled = true;
          s.stop(fullResponse ? "Response received." : "Timed out.");
          if (fullResponse)
            console.log(`\n${chalk.cyan("Agent:")} ${fullResponse}\n`);
          socket.close();
        }
      }, RESPONSE_TIMEOUT);
    },

    onTextMessage(content, role, { live, final }) {
      if (role !== "assistant") return;

      if (!live || final) {
        if (!settled) {
          settled = true;
          if (responseTimer) clearTimeout(responseTimer);
          fullResponse = content;
          s.stop("Response received.");
          console.log(`\n${chalk.cyan("Agent:")} ${fullResponse}\n`);
          socket.close();
        }
      } else {
        // accumulate streaming content
        fullResponse = content;
      }
    },

    onEvent(type) {
      // audio-end with content already accumulated — treat as final
      if (type === "text" && fullResponse && !settled) {
        settled = true;
        if (responseTimer) clearTimeout(responseTimer);
        s.stop("Response received.");
        console.log(`\n${chalk.cyan("Agent:")} ${fullResponse}\n`);
        socket.close();
      }
    },

    onError(err) {
      if (!settled) {
        settled = true;
        if (responseTimer) clearTimeout(responseTimer);
        s.stop("Error.");
        error(err.message);
        socket.close();
      }
    },

    onClose() {
      if (responseTimer) clearTimeout(responseTimer);
    },
  });

  await socket.done;
}
