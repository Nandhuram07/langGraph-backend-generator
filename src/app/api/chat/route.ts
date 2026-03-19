import { NextRequest, NextResponse } from "next/server";
import { getGraph } from "@/ai/langgraph";
import { HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";

export async function POST(req: NextRequest) {
  try {
    const { messages, schema, db, features, threadId } = await req.json();

    // Reconstruct messages for LangGraph
    const langgraphMessages = messages.map((m: any) => {
      if (m.role === "user") return new HumanMessage(m.content);
      if (m.role === "assistant") return new AIMessage(m.content);
      if (m.role === "system") return new SystemMessage(m.content);
      return new HumanMessage(m.content);
    });

    const userApiKey = req.headers.get("x-api-key") || undefined;
    const config = { 
      configurable: { 
        thread_id: threadId || "default-session",
        apiKey: userApiKey
      } 
    };
    console.log(`[Chat API] Invoking graph for session: ${config.configurable.thread_id} with ${userApiKey ? "User API Key" : "System API Key"}`);
    
    // In LangGraph, we just need to send the NEW messages.
    const inputState: any = { messages: langgraphMessages };
    
    if (db) inputState.db = db;
    if (features && features.length > 0) inputState.features = features;
    if (schema && schema.length > 0) inputState.schema = schema;

    const graph = await getGraph();
    const result = await graph.invoke(inputState, config);

    console.log(`[Chat API] Graph finished. Result messages count: ${result.messages?.length}`);
    console.log(`[Chat API] Schema count: ${result.schema?.length}`);

    // LangGraph result contains message objects, we need to convert back to serializable JSON for Next.js
    // Graph result may contain serialized LC messages
    const lastMsg = result.messages[result.messages.length - 1];
    
    let content = lastMsg?.kwargs?.content || lastMsg?.content || "";
    if (Array.isArray(content)) {
      content = content.map((c: any) => c.text || JSON.stringify(c)).join("\n");
    }

    // If last msg is empty (e.g. just a tool call), try to find the actual response
    if (!content || content.trim() === "") {
        const assistantMsgsWithContent = result.messages.filter((m: any) => {
           const id = Array.isArray(m.id) ? m.id[m.id.length - 1] : m.type || "";
           return (id === "AIMessage" || id === "ai") && (m.kwargs?.content || m.content);
        });
        const lastWithContent = assistantMsgsWithContent[assistantMsgsWithContent.length - 1];
        content = lastWithContent?.kwargs?.content || lastWithContent?.content || "Configuration confirmed. What's next?";
    }

    return NextResponse.json({
      content: content,
      role: "assistant",
      schema: result.schema,
      db: result.db,
      features: result.features,
      isComplete: result.isComplete
    });

  } catch (error: any) {
    console.error("Chat API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
