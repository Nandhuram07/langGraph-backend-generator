/**
 * End-to-end test: generate → setup_database → open_in_ide
 * Run: npx tsx test.ts
 */

import { generateBackend } from "./src/tools/generate.js";
import { setupDatabase }   from "./src/tools/database.js";
import { openInIde }       from "./src/tools/open-ide.js";

const VERCEL_URL = "https://backend-generator-beta.vercel.app";

const ENTITIES = [
  {
    entity: "User",
    fields: [
      { name: "name",     type: "string"  as const },
      { name: "email",    type: "string"  as const },
      { name: "age",      type: "number"  as const },
      { name: "isActive", type: "boolean" as const },
    ],
  },
  {
    entity: "Product",
    fields: [
      { name: "title",    type: "string" as const },
      { name: "price",    type: "number" as const },
      { name: "stock",    type: "number" as const },
    ],
  },
];

const DB_CONFIG = {
  host:     "localhost",
  port:     3306,
  user:     "root",
  password: "root",
  database: "fullstack",
};

// ── Step 1: Generate backend ───────────────────────────────────────────────
console.log("\n🔨 Step 1: Generating backend from Vercel API...");
const genResult = await generateBackend({
  vercelUrl: VERCEL_URL,
  entities:  ENTITIES,
  db:        "mysql",
  features:  ["crud", "auth", "validation", "logging"],
});
console.log("✅ Generated:", genResult.message);
console.log("   Output dir:", genResult.outputDir);

// ── Step 2: Bootstrap database ────────────────────────────────────────────
console.log("\n🗄️  Step 2: Creating tables in MySQL (fullstack)...");
const dbResult = await setupDatabase({
  entities: ENTITIES,
  db:       "mysql",
  config:   DB_CONFIG,
});
console.log("✅ Database:", dbResult.message);
console.log("   Tables:", dbResult.tablesCreated.join(", "));

// ── Step 3: Open in IDE ───────────────────────────────────────────────────
console.log("\n💻 Step 3: Opening project in VS Code...");
const ideResult = await openInIde({
  projectPath: genResult.outputDir,
  ide:         "vscode",
});
console.log("✅ IDE:", ideResult.message);

console.log("\n🎉 All done!");
