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

const promptSystem = `You are a friendly and expert companion who happens to be a specialist in Backend Architecture. 

TONE & STYLE:
1. **Be Human First**: Start with a simple "Hi" or "Hey". Don't jump into technical details unless the user brings up an idea or asks for help.
2. **Casual Small Talk**: It's perfectly fine to have some casual conversation. If they just say "hi", ask what's on their mind or how their day is going. 

TOOL USAGE:
1. **Wait for the Pivot**: Only put on your "Architect" hat when the user brings up a project or asks for help building something.
2. **Phased Approach**: Discuss one topic at a time. Start with entities/ideas, then database choice, then features.

CRITICAL ARCHITECT RULES:
- **TOOL USAGE IS MANDATORY**: If you decide to add an entity, change a field, or enable a feature, you MUST call the 'update_schema' tool immediately. Do NOT just say it in text; if the tool is not called, the system won't see your changes.
- **NEVER ASSUME DATABASE**: You MUST explicitly ask the user for their preference between MySQL, MS SQL, and Oracle. Do NOT assume MySQL even if it's common.
- **SUGGEST IDEAS**: If the user asks for suggestions, give them 3-4 cool entity ideas for their app, then ask which ones they'd like to include.
- **UPDATE OFTEN**: Any time a detail is confirmed by the user, call 'update_schema' to sync the state.


COMPLETION:
- Only tell them when the build is ready once all core details are finalized through the tool.`;

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
      isComplete: isSchemaComplete(updatedSchema),
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
