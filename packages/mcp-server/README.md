# AI Backend Generator — MCP Server

Connects your AI Backend Generator to any MCP-compatible client (Claude Desktop, VS Code, Cursor).

## Tools

| Tool | What it does |
|---|---|
| `generate_backend` | Calls your Vercel app → downloads ZIP → extracts to local folder |
| `setup_database` | Connects to your MySQL/MSSQL DB → runs CREATE TABLE for all entities |
| `open_in_ide` | Opens the generated project in VS Code / Cursor / WebStorm |

## Setup

```bash
cd packages/mcp-server
npm install
npm run build
```

## Connect to Claude Desktop

Edit `~/.claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "ai-backend-generator": {
      "command": "node",
      "args": ["/absolute/path/to/packages/mcp-server/dist/index.js"]
    }
  }
}
```

Restart Claude Desktop. You'll see the tools available.

## Connect to VS Code (Copilot / MCP extension)

In `.vscode/mcp.json` at workspace root:

```json
{
  "servers": {
    "ai-backend-generator": {
      "type": "stdio",
      "command": "node",
      "args": ["${workspaceFolder}/packages/mcp-server/dist/index.js"]
    }
  }
}
```

## Test with MCP Inspector

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

This opens a browser UI where you can call each tool manually.

## Example: Full flow

```
1. generate_backend
   - vercelUrl: "https://your-app.vercel.app"
   - entities: [{ entity: "User", fields: [{ name: "email", type: "string" }] }]
   - db: "mysql"
   - features: ["crud", "auth", "validation"]

2. setup_database
   - entities: <same as above>
   - db: "mysql"
   - config: { host: "localhost", user: "root", password: "secret", database: "myapp" }

3. open_in_ide
   - projectPath: <outputDir returned from step 1>
   - ide: "vscode"
```
