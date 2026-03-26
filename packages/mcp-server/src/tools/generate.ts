/**
 * Tool: generate_backend
 *
 * Calls the deployed Vercel /api/generate endpoint with the user's schema,
 * receives a ZIP, extracts it to outputDir, and returns the path.
 */

import fs from "fs";
import path from "path";
import os from "os";
import AdmZip from "adm-zip";

export interface EntityField {
  name: string;
  type: "string" | "number" | "boolean" | "date";
}

export interface EntityDef {
  entity: string;
  fields: EntityField[];
}

export type DbType = "mysql" | "mssql" | "oracledb";
export type Feature = "crud" | "auth" | "validation" | "logging" | "rbac";

export interface GenerateInput {
  vercelUrl: string;       // e.g. https://your-app.vercel.app
  entities: EntityDef[];
  db: DbType;
  features: Feature[];
  outputDir?: string;      // defaults to ~/ai-generated-backends/<timestamp>
  apiKey?: string;         // optional AI provider key forwarded to Vercel
}

export interface GenerateResult {
  outputDir: string;
  message: string;
}

export async function generateBackend(input: GenerateInput): Promise<GenerateResult> {
  const { vercelUrl, entities, db, features, outputDir, apiKey } = input;

  // Resolve output directory
  const resolvedOutput = outputDir
    ? path.resolve(outputDir)
    : path.join(os.homedir(), "ai-generated-backends", `backend-${Date.now()}`);

  fs.mkdirSync(resolvedOutput, { recursive: true });

  // Call Vercel API
  const url = `${vercelUrl.replace(/\/$/, "")}/api/generate`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers["x-api-key"] = apiKey;

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ entities, db, features }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Generation API failed (${response.status}): ${errText}`);
  }

  // Save ZIP to a temp file, then extract
  const buffer = Buffer.from(await response.arrayBuffer());
  const zipPath = path.join(os.tmpdir(), `ai-backend-${Date.now()}.zip`);
  fs.writeFileSync(zipPath, buffer);

  const zip = new AdmZip(zipPath);
  zip.extractAllTo(resolvedOutput, true);
  fs.unlinkSync(zipPath);

  return {
    outputDir: resolvedOutput,
    message: `Backend generated and extracted to: ${resolvedOutput}`,
  };
}
