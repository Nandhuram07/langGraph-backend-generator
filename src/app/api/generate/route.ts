import { NextRequest, NextResponse } from "next/server";
import { runSystemAgent } from "@/systemagent";
import path from "path";
import fs from "fs-extra";
import archiver from "archiver";
import { Stream } from "stream";

export async function POST(req: NextRequest) {
  const isProd = process.env.NODE_ENV === "production";
  const tmpBase = isProd ? "/tmp" : path.join(process.cwd(), "tmp-builds");
  const requestId = Math.random().toString(36).substring(7);
  const outDir = path.join(tmpBase, requestId);
  const zipName = `backend-${requestId}.zip`;

  try {
    const { entities, db, features } = await req.json();
    const userApiKey = req.headers.get("x-api-key") || undefined;

    // Configure generation settings
    const systemInput = {
      systemName: "GeneratedSystem",
      entities: entities, // Cleaned schemas from LangGraph
      relations: [],
      features: features || ["crud", "auth", "validation", "logging"],
      db: db || "mysql",
      outputDir: outDir,
      apiKey: userApiKey,
    };

    // Run the existing system generator logic
    await runSystemAgent(systemInput as any);

    // ZIP the output directory
    const archive = archiver("zip", { zlib: { level: 9 } });

    // Use a pass-through stream to handle the binary response
    const passThrough = new Stream.PassThrough();
    archive.pipe(passThrough);

    // Append files from directory
    archive.directory(outDir, false);
    
    // Finalize the archive (returns a promise)
    const finalizePromise = archive.finalize();

    // Clean up temporary files after streaming starts (Next.js keeps process alive for response)
    // Actually better to cleanup after some delay or via a background task
    setTimeout(async () => {
       try { await fs.remove(outDir); } catch(e) {}
    }, 60000); 

    // Convert pass-through to a readable stream for Response
    const readableStream = new ReadableStream({
      async start(controller) {
        passThrough.on("data", (chunk) => controller.enqueue(chunk));
        passThrough.on("end", () => controller.close());
        passThrough.on("error", (err) => controller.error(err));
        await finalizePromise;
      },
    });

    return new Response(readableStream, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${zipName}"`,
      },
    });

  } catch (error: any) {
    console.error("Generation API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
