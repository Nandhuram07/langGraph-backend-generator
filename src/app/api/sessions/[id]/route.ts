import { NextRequest, NextResponse } from "next/server";
import { getGraph } from "@/ai/langgraph";

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
    const messages = (values.messages || []).map((m: any) => {
      let role: "user" | "assistant" = "assistant";
      
      // Look for role in id array or type property
      const msgId = Array.isArray(m.id) ? m.id[m.id.length - 1] : m.type || "";
      if (msgId === "HumanMessage" || msgId === "human" || msgId === "user") {
        role = "user";
      }
      
      // Content can be directly in .content or in .kwargs.content
      let content = m.kwargs?.content || m.content || "";
      if (Array.isArray(content)) {
        content = content.map((c: any) => c.text || JSON.stringify(c)).join("\n");
      }

      return { role, content };
    }).filter((m: any) => m.content && m.content.toString().trim().length > 0);

    return NextResponse.json({
      messages,
      schema: values.schema || [],
      db: values.db || "",
      features: values.features || [],
      isComplete: values.isComplete || false
    });

  } catch (error: any) {
    console.error("Session API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
