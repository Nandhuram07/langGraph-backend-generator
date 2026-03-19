import { StateGraph, Annotation, messagesStateReducer } from "@langchain/langgraph";
import { BaseMessage, HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
import { ChatGroq } from "@langchain/groq";
import { z } from "zod";
import path from "path";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { isSchemaComplete } from "@/utils/detectCompletion";

import { createClient } from "redis";
import { RedisSaver } from "@langchain/langgraph-checkpoint-redis";

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

// modelWithTools removed. agentNode now uses getModel(apiKey).bindTools()

const promptSystem = `You are the AI Backend Architect. Your goal is to gather requirements for a Node.js backend system.

MANDATORY INTERACTION FLOW:
1. Identify Entities: Ask the user what entities (tables) they need and what fields each should have.
2. Choose Database: You MUST explicitly ask the user to choose a database (MySQL, MS SQL, or Oracle). Do not assume.
3. Choose Features: You MUST explicitly ask which features to enable: CRUD, Authentication, Zod Validation, Logging, or RBAC.
4. Call 'update_schema': Whenever the user provides ANY of these details (DB, features, or schema), call the tool immediately.
   - Use 'merge' mode (default) to add fields or new entities.
   - Use 'replace' mode ONLY if the user explicitly asks to REMOVE an entity, RENAME an entity, or RESTART the schema.

REQUIREMENT GATHERING:
- If Database is missing (""): ASK the user which DB they want.
- If Features are missing ([]): ASK the user which features they want.
- If Schema is empty: ASK about entities and fields.

CONFIRMATION & COMPLETION:
- You are ONLY ready to generate once you have:
  - At least one entity with fields.
  - A confirmed Database choice.
  - A confirmed list of Features.
- Once ready, summarize the configuration and tell the user they can now click 'Download ZIP' to get their project.
- Assure them a full project zip will be generated.
- Address the user directly in a professional but helpful tone.
- Only ask one question at a time to avoid overwhelming the user.`;

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
            // Merge logic
            for (const newEnt of payload.entities) {
              const cleanEntityName = newEnt.name.replace(/\s+/g, '_').toLowerCase();
              const existing = updatedSchema.find((e) => e.entity === cleanEntityName);
              
              const cleanFields = newEnt.fields.map((f: any) => ({
                ...f,
                name: f.name.replace(/\s+/g, '_').toLowerCase()
              }));

              if (existing) {
                // Avoid duplicate fields
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
          content: "Configuration has been updated. If the system is now complete, please acknowledge to the user that we are ready to generate."
        });
      }
    }
    
    const complete = isSchemaComplete(updatedSchema);
    
    return {
      schema: updatedSchema,
      db: updatedDb,
      features: updatedFeatures,
      isComplete: complete,
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

import { JSONFileSaver } from "./persistence";

// Singleton instance to prevent multiple connections in Next.js HMR
let graph: any = null;

export async function getGraph() {
  if (graph) return graph;

  let checkpointer;
  
  if (process.env.REDIS_URL) {
    console.log("[Graph] Using Redis Persistence for Cloud Deployment");
    const redis = createClient({ url: process.env.REDIS_URL });
    await redis.connect();
    checkpointer = new RedisSaver(redis as any);
  } else {
    const persistenceDir = path.resolve(process.cwd(), ".persistence/sessions");
    console.log("[Graph] Using Local JSON Persistence Directory:", persistenceDir);
    checkpointer = new JSONFileSaver(persistenceDir);
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
