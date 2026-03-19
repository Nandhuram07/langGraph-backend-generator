import { StateGraph, Annotation } from "@langchain/langgraph";
import { callAI } from "../utils/aiProvider.js";

const GraphState = Annotation.Root({
  conversation: Annotation<string>(),
  aiResponse: Annotation<string | undefined>(),
  extracted: Annotation<any | undefined>(),
});

type State = typeof GraphState.State;