#!/usr/bin/env node
/**
 * AI Backend Generator — MCP Server
 *
 * Exposes three tools:
 *   1. generate_backend  — calls Vercel /api/generate → downloads + extracts ZIP
 *   2. setup_database    — connects to user's DB → runs CREATE TABLE DDL
 *   3. open_in_ide       — opens the generated project in VS Code / Cursor / WebStorm
 *
 * Run locally:
 *   npx tsx src/index.ts
 *
 * Configure in Claude Desktop (~/.claude/claude_desktop_config.json):
 *   {
 *     "mcpServers": {
 *       "ai-backend-generator": {
 *         "command": "node",
 *         "args": ["/absolute/path/to/packages/mcp-server/dist/index.js"]
 *       }
 *     }
 *   }
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
import { generateBackend } from "./tools/generate.js";
import { setupDatabase } from "./tools/database.js";
import { openInIde } from "./tools/open-ide.js";
// ── Tool definitions (shown to the MCP client / AI) ───────────────────────
const TOOLS = [
    {
        name: "generate_backend",
        description: "Generate a production-ready Express.js TypeScript backend from an entity schema. " +
            "Calls the AI Backend Generator API, receives a ZIP, and extracts it to a local directory. " +
            "Returns the path to the extracted project.",
        inputSchema: {
            type: "object",
            required: ["vercelUrl", "entities", "db", "features"],
            properties: {
                vercelUrl: {
                    type: "string",
                    description: "Base URL of the deployed AI Backend Generator (e.g. https://your-app.vercel.app)",
                },
                entities: {
                    type: "array",
                    description: "List of entities with their fields",
                    items: {
                        type: "object",
                        required: ["entity", "fields"],
                        properties: {
                            entity: { type: "string", description: "Entity name (e.g. User, Product)" },
                            fields: {
                                type: "array",
                                items: {
                                    type: "object",
                                    required: ["name", "type"],
                                    properties: {
                                        name: { type: "string" },
                                        type: { type: "string", enum: ["string", "number", "boolean", "date"] },
                                    },
                                },
                            },
                        },
                    },
                },
                db: {
                    type: "string",
                    enum: ["mysql", "mssql", "oracledb"],
                    description: "Target database type",
                },
                features: {
                    type: "array",
                    items: { type: "string", enum: ["crud", "auth", "validation", "logging", "rbac"] },
                    description: "Features to include in the generated backend",
                },
                outputDir: {
                    type: "string",
                    description: "Local directory to extract the project into (defaults to ~/ai-generated-backends/<timestamp>)",
                },
                apiKey: {
                    type: "string",
                    description: "Optional AI provider API key forwarded to the generator",
                },
            },
        },
    },
    {
        name: "setup_database",
        description: "Connect to the user's database and create all tables derived from the entity schema. " +
            "Supports MySQL and MSSQL. Runs CREATE TABLE IF NOT EXISTS for each entity. " +
            "Call this after generate_backend to bootstrap the schema in the real database.",
        inputSchema: {
            type: "object",
            required: ["entities", "db", "config"],
            properties: {
                entities: {
                    type: "array",
                    description: "Same entity list used in generate_backend",
                    items: {
                        type: "object",
                        required: ["entity", "fields"],
                        properties: {
                            entity: { type: "string" },
                            fields: {
                                type: "array",
                                items: {
                                    type: "object",
                                    required: ["name", "type"],
                                    properties: {
                                        name: { type: "string" },
                                        type: { type: "string", enum: ["string", "number", "boolean", "date"] },
                                    },
                                },
                            },
                        },
                    },
                },
                db: {
                    type: "string",
                    enum: ["mysql", "mssql"],
                    description: "Database type",
                },
                config: {
                    type: "object",
                    required: ["host", "user", "password", "database"],
                    description: "Database connection details",
                    properties: {
                        host: { type: "string" },
                        port: { type: "number" },
                        user: { type: "string" },
                        password: { type: "string" },
                        database: { type: "string" },
                    },
                },
            },
        },
    },
    {
        name: "open_in_ide",
        description: "Open a local project directory in the user's IDE (VS Code, Cursor, or WebStorm). " +
            "Call this after generate_backend to immediately open the generated project. " +
            "Requires the IDE CLI to be installed and on PATH.",
        inputSchema: {
            type: "object",
            required: ["projectPath"],
            properties: {
                projectPath: {
                    type: "string",
                    description: "Absolute path to the project directory to open",
                },
                ide: {
                    type: "string",
                    enum: ["vscode", "cursor", "webstorm"],
                    description: "IDE to open the project in (default: vscode)",
                },
            },
        },
    },
];
// ── Server setup ───────────────────────────────────────────────────────────
const server = new Server({ name: "ai-backend-generator", version: "1.0.0" }, { capabilities: { tools: {} } });
// List tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
// Call tools
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
        switch (name) {
            case "generate_backend": {
                const result = await generateBackend(args);
                return {
                    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
                };
            }
            case "setup_database": {
                const result = await setupDatabase(args);
                return {
                    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
                };
            }
            case "open_in_ide": {
                const result = await openInIde(args);
                return {
                    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
                };
            }
            default:
                throw new Error(`Unknown tool: ${name}`);
        }
    }
    catch (error) {
        return {
            content: [{ type: "text", text: `Error: ${error.message}` }],
            isError: true,
        };
    }
});
// ── Start ──────────────────────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[ai-backend-mcp] Server running on stdio");
