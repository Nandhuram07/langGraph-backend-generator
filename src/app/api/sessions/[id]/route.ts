import { NextRequest, NextResponse } from "next/server";
import { getGraph } from "@/ai/langgraph";
import { isSchemaComplete } from "@/utils/detectCompletion";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: threadId } = await params;
    const config = { configurable: { thread_id: threadId } };
    
    const graph = await getGraph();
    const state = await graph.getState(config);
    
    if (!state || !state.values) {
       return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const values = state.values;
    
    // Reconstruct messages for frontend with more robust type checking
    const rawMessages = values.messages || [];
    const messages = rawMessages
      .filter((m: any) => {
        const type = Array.isArray(m.id) ? m.id[m.id.length - 1] : m.type || "";
        return type === "HumanMessage" || type === "human" || 
               type === "AIMessage" || type === "ai";
      })
      .map((m: any) => {
        const type = Array.isArray(m.id) ? m.id[m.id.length - 1] : m.type || "";
        const role = (type === "HumanMessage" || type === "human") ? "user" : "assistant";
        
        let content = m.kwargs?.content || m.content || "";
        if (Array.isArray(content)) {
          content = content.map((c: any) => c.text || JSON.stringify(c)).join("\n");
        }

        return { role, content };
      }).filter((m: any) => m.content && m.content.toString().trim().length > 0);

    // Fallback logic: if schema/db/features are missing, try to reconstruct from tool calls in history
    let schema = values.schema || [];
    let db = values.db || "";
    let features = values.features || [];
    let isComplete = values.isComplete || false;

    if (schema.length === 0 || !db || features.length === 0) {
      console.log(`[Session API] State missing for thread ${threadId}, attempting recovery from history...`);
      // Scan messages for AIMessages with update_schema tool calls
      for (const m of rawMessages) {
        const toolCalls = m.tool_calls || m.kwargs?.tool_calls;
        if (toolCalls && Array.isArray(toolCalls)) {
          for (const tc of toolCalls) {
            if (tc.name === "update_schema") {
              const args = tc.args || {};
              if (args.db) db = args.db;
              if (args.features) features = args.features;
              if (args.entities) {
                const mode = args.mode || "merge";
                if (mode === "replace") {
                  schema = args.entities.map((ent: any) => ({
                    entity: ent.name.replace(/\s+/g, '_').toLowerCase(),
                    fields: ent.fields.map((f: any) => ({
                      ...f,
                      name: f.name.replace(/\s+/g, '_').toLowerCase()
                    }))
                  }));
                } else {
                  // Merge logic
                  for (const ent of args.entities) {
                    const cleanName = ent.name.replace(/\s+/g, '_').toLowerCase();
                    const existing = schema.find((e: any) => e.entity === cleanName);
                    const cleanFields = ent.fields.map((f: any) => ({
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
                      schema.push({ entity: cleanName, fields: cleanFields });
                    }
                  }
                }
              }
            }
          }
        }
      }
      
      // Re-calculate isComplete if we recovered data
      if (!isComplete && schema.length > 0 && db && features.length > 0) {
        isComplete = isSchemaComplete(schema);
      }
    }

    return NextResponse.json({
      messages,
      schema,
      db,
      features,
      isComplete
    });

  } catch (error: any) {
    console.error("Session API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
