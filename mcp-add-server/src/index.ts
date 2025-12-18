#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { z } from "zod";

const PORT = 3000;

// Create MCP server instance
const server = new McpServer({
  name: "mcp-add-server",
  version: "1.0.0",
});

// Register the add tool
server.registerTool(
  "add",
  {
    description: "Add two numbers together and return the result",
    inputSchema: z.object({
      a: z.number().describe("The first number to add"),
      b: z.number().describe("The second number to add"),
    }),
  },
  async ({ a, b }) => {
    const result = a + b;
    return {
      content: [
        {
          type: "text",
          text: `The sum of ${a} and ${b} is ${result}`,
        },
      ],
    };
  }
);

// Create Express app with MCP security features
const app = createMcpExpressApp({ host: "127.0.0.1" });

// Create Streamable HTTP transport
const transport = new StreamableHTTPServerTransport();

// Connect MCP server to transport
await server.connect(transport);

// Handle all requests through the transport
app.all("/mcp", (req, res) => {
  transport.handleRequest(req, res);
});

// Start server
app.listen(PORT, "127.0.0.1", () => {
  console.log(`MCP server running on http://localhost:${PORT}/mcp`);
});
