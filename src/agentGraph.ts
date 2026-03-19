import { StateGraph, Annotation } from "@langchain/langgraph";
import { llm } from "./llm.js";

const GraphState = Annotation.Root({
  question: Annotation<string>(),
  answer: Annotation<string | undefined>(),
});

type State = typeof GraphState.State;

async function generateAnswer(state: State) {

  const result = await llm.invoke(
    `You are an AI backend assistant. Answer the question clearly.

Question: ${state.question}`
  );

  return {
    answer: result.content as string
  };
}

export const graph = new StateGraph(GraphState)
  .addNode("generateAnswer", generateAnswer)
  .addEdge("__start__", "generateAnswer")
  .addEdge("generateAnswer", "__end__")
  .compile();