#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { WsBridge } from "./ws-bridge.js";
import { getApiKey, getConfig } from "../config/store.js";

// One bridge per agent — reuse across tool calls
const bridges = new Map<string, WsBridge>();

function getBridge(apiKey: string, agentId: string): WsBridge {
  const key = `${agentId}`;
  if (!bridges.has(key)) {
    bridges.set(key, new WsBridge(apiKey, agentId));
  }
  return bridges.get(key)!;
}

function getApiKeyOrThrow(): string {
  const key = getApiKey();
  if (!key) {
    throw new Error("OpenHome API key not set. Run: npx openhome-cli login");
  }
  return key;
}

const server = new Server(
  {
    name: "openhome-voice",
    version: "0.1.22",
  },
  {
    capabilities: { tools: {} },
  },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "voice_speak",
      description:
        "Send a message to your OpenHome speaker/agent and get its spoken response back as text. The agent will speak the response out loud on your speaker.",
      inputSchema: {
        type: "object",
        properties: {
          message: {
            type: "string",
            description: "What to say to the agent",
          },
          agent_id: {
            type: "string",
            description:
              "The agent/personality ID to speak to. Leave empty to use the default from config.",
          },
        },
        required: ["message"],
      },
    },
    {
      name: "voice_status",
      description:
        "Check the connection status of the OpenHome voice bridge for a given agent.",
      inputSchema: {
        type: "object",
        properties: {
          agent_id: {
            type: "string",
            description: "The agent/personality ID to check.",
          },
        },
        required: [],
      },
    },
    {
      name: "voice_disconnect",
      description: "Disconnect the WebSocket bridge to a specific agent.",
      inputSchema: {
        type: "object",
        properties: {
          agent_id: {
            type: "string",
            description: "The agent/personality ID to disconnect.",
          },
        },
        required: [],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const apiKey = getApiKeyOrThrow();
  const config = getConfig();
  const defaultAgentId = config.default_agent_id as string | undefined;

  if (name === "voice_speak") {
    const message = args?.message as string;
    const agentId = (args?.agent_id as string | undefined) ?? defaultAgentId;

    if (!agentId) {
      return {
        content: [
          {
            type: "text",
            text: "No agent ID provided. Set a default with: openhome config, or pass agent_id explicitly.",
          },
        ],
        isError: true,
      };
    }

    const bridge = getBridge(apiKey, agentId);

    try {
      const response = await bridge.sendMessage(message);
      const parts: string[] = [];

      if (response.text) {
        parts.push(`**Agent said:** ${response.text}`);
      }
      if (response.actions.length > 0) {
        parts.push(`**Actions:** ${response.actions.join(", ")}`);
      }
      if (response.logs.length > 0) {
        parts.push(`**Logs:** ${response.logs.join(" | ")}`);
      }
      if (parts.length === 0) {
        parts.push(
          "(No text response — agent may have responded with audio only)",
        );
      }

      return { content: [{ type: "text", text: parts.join("\n") }] };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: `Voice error: ${msg}` }],
        isError: true,
      };
    }
  }

  if (name === "voice_status") {
    const agentId = (args?.agent_id as string | undefined) ?? defaultAgentId;

    if (!agentId) {
      return {
        content: [
          { type: "text", text: "No agent ID — pass agent_id or set default." },
        ],
        isError: true,
      };
    }

    const bridge = getBridge(apiKey, agentId);
    const status = bridge.getStatus();

    return {
      content: [
        {
          type: "text",
          text: [
            `Agent: ${status.agentId}`,
            `Connected: ${status.connected}`,
            `Last activity: ${status.lastActivity ? new Date(status.lastActivity).toISOString() : "never"}`,
            status.error ? `Error: ${status.error}` : null,
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
    };
  }

  if (name === "voice_disconnect") {
    const agentId = (args?.agent_id as string | undefined) ?? defaultAgentId;

    if (!agentId) {
      return {
        content: [{ type: "text", text: "No agent ID provided." }],
        isError: true,
      };
    }

    const bridge = bridges.get(agentId);
    if (bridge) {
      bridge.disconnect();
      bridges.delete(agentId);
    }

    return {
      content: [{ type: "text", text: `Disconnected from agent ${agentId}.` }],
    };
  }

  return {
    content: [{ type: "text", text: `Unknown tool: ${name}` }],
    isError: true,
  };
});

// Cleanup on exit
process.on("SIGINT", () => {
  for (const bridge of bridges.values()) bridge.disconnect();
  process.exit(0);
});
process.on("SIGTERM", () => {
  for (const bridge of bridges.values()) bridge.disconnect();
  process.exit(0);
});

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("MCP server error:", err);
  process.exit(1);
});
