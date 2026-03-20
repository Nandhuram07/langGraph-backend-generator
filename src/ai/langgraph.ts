import { StateGraph, Annotation, messagesStateReducer } from "@langchain/langgraph";
import { BaseMessage, HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
import { ChatGroq } from "@langchain/groq";
import { z } from "zod";
import path from "path";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { isSchemaComplete } from "@/utils/detectCompletion";

import { createClient } from "redis";
import { RedisSaver } from "@langchain/langgraph-checkpoint-redis";
import { JSONFileSaver } from "./persistence";

// Dynamic model factory based on user-provided API key
const getModel = (apiKey?: string) => {
  return new ChatGroq({
    apiKey: apiKey || process.env.GROQ_API_KEY,
    model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
    temperature: 0,
  });
};

export const BuilderState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),
  schema: Annotation<any[]>({
    reducer: (curr, update) => update,
    default: () => [],
  }),
  db: Annotation<string>({
    reducer: (curr, update) => update,
    default: () => "",
  }),
  features: Annotation<string[]>({
    reducer: (curr, update) => update,
    default: () => [],
  }),
  isComplete: Annotation<boolean>({
    reducer: (curr, update) => update,
    default: () => false,
  }),
});

// Tool for updating the project configuration and schema
const updateSchema = z.object({
  db: z.string().optional().describe("Database type: mysql, mssql, or oracledb"),
  features: z.array(z.string()).optional().describe("Enabled features: crud, auth, validation, logging, rbac"),
  entities: z.array(z.object({
    name: z.string().describe("Name of the entity"),
    fields: z.array(z.object({
      name: z.string().describe("Name of the field"),
      type: z.string().describe("Type of the field: string, number, boolean, or date")
    }))
  })).optional(),
  mode: z.enum(["merge", "replace"]).optional().default("merge").describe("Whether to merge with existing schema or replace it entirely. Use 'replace' if the user wants to remove an entity.")
});

const updateSchemaTool: any = new DynamicStructuredTool({
  name: "update_schema",
  description: "Update backend schema, database type, or features.",
  schema: updateSchema as any,
  func: async (input: any) => "Configuration updated successfully!",
});

const promptSystem = `You are a friendly and effortless companion who happens to be a world-class Backend Architect. 

YOUR VIBE:
- **Talk Like a Friend**: Use a casual, smooth, and friendly tone. No bot-like scripts.
- **Don't Over-Identify**: NEVER repeat "I am an AI" or "I am a backend developer". Just chat like an expert friend.
- **Wait for the Idea**: Let the user lead. Let them explain what they want to build first.

TOOL USAGE:
1. **Wait for the Pivot**: Only put on your "Architect" hat when the user brings up a project or asks for help building something.
2. **Phased Approach**: Discuss one topic at a time. Start with entities/ideas, then database choice, then features.

CRITICAL STATE SYNC RULES:
- **IMMEDIATE TOOL CALLING**: Every time the user mentions a database (e.g., "my sql"), a feature, or confirms an entity idea, you MUST call the 'update_schema' tool IMMEDIATELY within that same turn. 
- **NO SILENT AGREEMENTS**: Do NOT just say "Let's use MySQL" in text. You MUST call 'update_schema(db: "mysql")' at the same time. If you don't call the tool, the user's progress is LOST.
- **SYNC IS YOUR JOB**: The UI on the right relies entirely on your tool calls. If it's empty, YOU forgot to call the tool.

THE FLOW:
1. **Casual Chat**: Chat back like a person if they just say "hi". 
2. **Project Talk**: Discuss the app idea naturally. Call 'update_schema' behind the scenes as soon as entities or projects take shape.
3. **Refining**: Guide the choice of Database (MySQL/MSSQL/Oracle) and Features.


COMPLETION:
- Only when Schema, DB, and Features are all synced via tools, summarize the requirements and invite them to download the code!`;

async function agentNode(state: typeof BuilderState.State, config: any) {
  const userApiKey = config.configurable?.apiKey;
  const model = getModel(userApiKey).bindTools([updateSchemaTool]);
  
  const systemMsg = new SystemMessage(
    `${promptSystem}\n\nCURRENT STATE:\nSchema: ${JSON.stringify(state.schema, null, 2)}\nDatabase: ${state.db || "NOT SET"}\nFeatures: ${state.features.length ? state.features.join(", ") : "NOT SET"}`
  );
  
  const response = await model.invoke([systemMsg, ...state.messages]);
  
  return {
    messages: [response]
  };
}

async function toolNode(state: typeof BuilderState.State) {
  const lastMessage = state.messages[state.messages.length - 1];
  
  if (lastMessage._getType() === "ai" && "tool_calls" in lastMessage) {
    const aiMsg = lastMessage as any;
    const toolCalls = aiMsg.tool_calls || [];
    
    let updatedSchema = [...state.schema];
    let updatedDb = state.db;
    let updatedFeatures = [...state.features];
    let results = [];
    
    for (const action of toolCalls) {
      if (action.name === "update_schema") {
        const payload = action.args;
        if (payload.db) updatedDb = payload.db;
        if (payload.features) updatedFeatures = payload.features;

        if (payload && payload.entities) {
          const mode = payload.mode || "merge";
          if (mode === "replace") {
            updatedSchema = payload.entities.map((ent: any) => ({
              entity: ent.name.replace(/\s+/g, '_').toLowerCase(),
              fields: ent.fields.map((f: any) => ({
                ...f,
                name: f.name.replace(/\s+/g, '_').toLowerCase()
              }))
            }));
          } else {
            for (const newEnt of payload.entities) {
              const cleanEntityName = newEnt.name.replace(/\s+/g, '_').toLowerCase();
              const existing = updatedSchema.find((e) => e.entity === cleanEntityName);
              const cleanFields = newEnt.fields.map((f: any) => ({
                ...f,
                name: f.name.replace(/\s+/g, '_').toLowerCase()
              }));

              if (existing) {
                const existingFieldNames = existing.fields.map((ef: any) => ef.name);
                for (const cf of cleanFields) {
                  if (!existingFieldNames.includes(cf.name)) {
                    existing.fields.push(cf);
                  }
                }
              } else {
                updatedSchema.push({
                  entity: cleanEntityName,
                  fields: cleanFields
                });
              }
            }
          }
        }
        
        results.push({
          role: "tool",
          name: action.name,
          tool_call_id: action.id,
          content: "Configuration updated."
        });
      }
    }
    
    return {
      schema: updatedSchema,
      db: updatedDb,
      features: updatedFeatures,
      isComplete: isSchemaComplete(updatedSchema) && !!updatedDb && updatedFeatures.length > 0,
      messages: results
    };
  }
  return {};
}

function shouldContinueFromAgent(state: typeof BuilderState.State) {
  const lastMessage = state.messages[state.messages.length - 1];
  if (lastMessage._getType() === "ai" && (lastMessage as any).tool_calls?.length > 0) {
    return "tools";
  }
  return "end";
}


let graph: any = null;

export async function getGraph() {
  if (graph) return graph;

  let checkpointer;
  
  if (process.env.REDIS_URL) {
    console.log("[Graph] Connecting to Redis via node-redis (Cloud Mode)...");
    try {
      const client = createClient({
        url: process.env.REDIS_URL,
        socket: {
          tls: process.env.REDIS_URL.startsWith('rediss'),
          reconnectStrategy: (retries: number) => Math.min(retries * 100, 3000)
        } as any
      });

      client.on('error', (err) => console.error('[Graph] Redis Connection Error:', err));
      client.on('connect', () => console.log('[Graph] Redis Connected.'));
      client.on('ready', () => console.log('[Graph] Redis Ready.'));

      await client.connect();

      checkpointer = new RedisSaver(client as any);
      console.log("[Graph] Redis checkpointer initialized with official client.");
    } catch (e) {
      console.error("[Graph] Redis init failed, falling back to /tmp JSON:", e);
      checkpointer = new JSONFileSaver();
    }
  } else {
    console.log("[Graph] Using Local JSON Persistence.");
    checkpointer = new JSONFileSaver();
  }
  
  graph = new StateGraph(BuilderState)
    .addNode("agent", agentNode)
    .addNode("tools", toolNode)
    .addEdge("__start__", "agent")
    .addConditionalEdges("agent", shouldContinueFromAgent, {
      tools: "tools",
      end: "__end__"
    })
    .addEdge("tools", "agent")
    .compile({ checkpointer });

  return graph;
}
