import fs from "fs-extra";
import path from "path";
import { BaseCheckpointSaver, Checkpoint, CheckpointMetadata, CheckpointTuple } from "@langchain/langgraph-checkpoint";

export class JSONFileSaver extends BaseCheckpointSaver {
  private baseDir: string;

  constructor(baseDir: string = "checkpoints") {
    super();
    this.baseDir = path.resolve(process.cwd(), baseDir);
    fs.ensureDirSync(this.baseDir);
  }

  async getTuple(config: any): Promise<CheckpointTuple | undefined> {
    const threadId = config.configurable.thread_id;
    const filePath = path.join(this.baseDir, `${threadId}.json`);
    
    if (!fs.existsSync(filePath)) return undefined;

    try {
      const data = fs.readJsonSync(filePath);
      return {
        config: config,
        checkpoint: data.checkpoint as Checkpoint,
        metadata: data.metadata as CheckpointMetadata,
      };
    } catch (e) {
      console.error(`Error loading checkpoint for ${threadId}:`, e);
      return undefined;
    }
  }

  async put(config: any, checkpoint: Checkpoint, metadata: CheckpointMetadata): Promise<any> {
    const threadId = config.configurable.thread_id;
    const filePath = path.join(this.baseDir, `${threadId}.json`);
    
    try {
      fs.outputJsonSync(filePath, {
        checkpoint,
        metadata,
      });
      return { configurable: { thread_id: threadId, checkpoint_id: checkpoint.id } };
    } catch (e) {
      console.error(`Error saving checkpoint for ${threadId}:`, e);
    }
  }

  async putWrites(config: any, writes: any[], task_id: string): Promise<void> {
    // Basic implementation: for file-based JSON, we can just ignore writes if not doing complex re-tracing
  }

  async deleteThread(threadId: string): Promise<void> {
    const filePath = path.join(this.baseDir, `${threadId}.json`);
    if (fs.existsSync(filePath)) {
      await fs.remove(filePath);
    }
  }

  async *list(config: any): AsyncGenerator<CheckpointTuple, any, any> {
    // If needed to iterate through all sessions
    const files = await fs.readdir(this.baseDir);
    for (const file of files) {
       if (file.endsWith(".json")) {
          const threadId = file.replace(".json", "");
          const tuple = await this.getTuple({ configurable: { thread_id: threadId } });
          if (tuple) yield tuple;
       }
    }
  }
}
