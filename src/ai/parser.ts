import { groqClient } from "./client";
import { buildPrompt } from "./prompt";

export async function parseWithAI(input: string, schema: any[]) {
  const prompt = buildPrompt(input, schema);

  const response = await groqClient.chat.completions.create({
    model: process.env.GROQ_MODEL!,
    messages: [
      {
        role: "system",
        content: "You are a backend architect assistant. Return only JSON.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    temperature: 0,
  });

  const text = response.choices[0]?.message?.content || "";

  const cleaned = text
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .replace(/^[^{]*/, "")
    .replace(/[^}]*$/, "")
    .trim();

  return JSON.parse(cleaned);
}