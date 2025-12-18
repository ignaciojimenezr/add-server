#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";
import express from "express";
import { randomUUID } from "crypto";
const app = express();
const PORT = parseInt(process.env.PORT || "3000", 10);
const MCP_PROTOCOL_VERSION = "2025-11-25";
// Parse JSON bodies
app.use(express.json());
// Session management
const sessions = new Map();
// Create MCP server instance
function createMCPServer() {
    const server = new McpServer({
        name: "mcp-add-server",
        version: "1.0.0",
    });
    // Register the add tool
    server.registerTool("add", {
        description: "Add two numbers together and return the result",
        inputSchema: {
            a: z.number().describe("The first number to add"),
            b: z.number().describe("The second number to add"),
        },
    }, async ({ a, b }) => {
        const result = a + b;
        return {
            content: [
                {
                    type: "text",
                    text: `The sum of ${a} and ${b} is ${result}`,
                },
            ],
        };
    });
    return server;
}
// Middleware to validate MCP headers
function validateMCPHeaders(req, res, next) {
    const protocolVersion = req.headers["mcp-protocol-version"];
    if (protocolVersion && protocolVersion !== MCP_PROTOCOL_VERSION) {
        return res.status(400).json({
            error: "Unsupported protocol version",
            supported: MCP_PROTOCOL_VERSION
        });
    }
    next();
}
// Security: Validate Origin header to prevent DNS rebinding
function validateOrigin(req, res, next) {
    const origin = req.headers.origin;
    if (origin) {
        const allowed = ['http://localhost:3000', 'http://127.0.0.1:3000'];
        if (!allowed.some(o => origin.startsWith(o))) {
            return res.status(403).json({ error: "Forbidden origin" });
        }
    }
    next();
}
app.use(validateOrigin);
// GET /mcp - Server-to-client SSE stream
app.get("/mcp", validateMCPHeaders, async (req, res) => {
    const sessionId = req.headers["mcp-session-id"];
    if (!sessionId || !sessions.has(sessionId)) {
        return res.status(404).json({ error: "Session not found" });
    }
    console.log(`SSE stream opened for session: ${sessionId}`);
    // Set up SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    // Send initial priming event
    res.write("event: message\n");
    res.write("data: \n\n");
    // Keep connection alive
    const keepAlive = setInterval(() => {
        res.write(": keepalive\n\n");
    }, 30000);
    req.on("close", () => {
        clearInterval(keepAlive);
        console.log(`SSE stream closed for session: ${sessionId}`);
    });
});
// POST /mcp - Client-to-server messages
app.post("/mcp", validateMCPHeaders, async (req, res) => {
    try {
        let sessionId = req.headers["mcp-session-id"];
        const acceptsSSE = req.headers.accept?.includes("text/event-stream");
        console.log("Received MCP request:", {
            sessionId,
            method: req.body.method,
            acceptsSSE
        });
        // Create new session if needed
        if (!sessionId || !sessions.has(sessionId)) {
            sessionId = randomUUID();
            const server = createMCPServer();
            const transport = new SSEServerTransport("/message", res);
            sessions.set(sessionId, { transport, server });
            console.log(`Created new session: ${sessionId}`);
            // Connect server to transport
            await server.connect(transport);
            // Set session ID header
            res.setHeader("MCP-Session-Id", sessionId);
        }
        const session = sessions.get(sessionId);
        if (!session) {
            return res.status(404).json({ error: "Session not found" });
        }
        // Handle JSON-RPC message through the SDK
        // The SDK will handle the response through the transport
    }
    catch (error) {
        console.error("Error handling MCP request:", error);
        res.status(500).json({
            jsonrpc: "2.0",
            error: {
                code: -32603,
                message: "Internal error"
            }
        });
    }
});
// POST /message - Message endpoint for SSE transport
app.post("/message", express.text({ type: "*/*" }), (req, res) => {
    // This endpoint is used by SSEServerTransport
    res.status(202).end();
});
// DELETE /mcp - Terminate session
app.delete("/mcp", validateMCPHeaders, (req, res) => {
    const sessionId = req.headers["mcp-session-id"];
    if (sessionId && sessions.has(sessionId)) {
        sessions.delete(sessionId);
        console.log(`Session terminated: ${sessionId}`);
        res.status(200).json({ message: "Session terminated" });
    }
    else {
        res.status(404).json({ error: "Session not found" });
    }
});
// Start the HTTP server - bind to localhost only for security
app.listen(PORT, "127.0.0.1", () => {
    console.log(`✓ MCP Add Server running on http://localhost:${PORT}`);
    console.log(`✓ Protocol version: ${MCP_PROTOCOL_VERSION}`);
    console.log(`✓ Transport: Streamable HTTP with SSE`);
    console.log(`✓ MCP endpoint: http://localhost:${PORT}/mcp`);
});
