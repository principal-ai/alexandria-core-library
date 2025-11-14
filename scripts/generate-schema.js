#!/usr/bin/env node
import { execSync } from "child_process";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");
const schemaDir = join(rootDir, "schema");
const outputFile = join(schemaDir, "alexandriarc.json");

// Ensure schema directory exists
if (!existsSync(schemaDir)) {
  mkdirSync(schemaDir, { recursive: true });
  console.log("Created schema directory");
}

// Generate JSON schema from TypeScript types
console.log("Generating JSON schema from TypeScript types...");
try {
  execSync(
    `npx typescript-json-schema ${join(rootDir, "tsconfig.json")} AlexandriaConfig --out ${outputFile} --required --noExtraProps --strictNullChecks`,
    { stdio: "inherit", cwd: rootDir },
  );

  // Post-process the schema to add metadata and clean up
  const schema = JSON.parse(readFileSync(outputFile, "utf-8"));

  // Add metadata
  schema.$id =
    "https://raw.githubusercontent.com/principal-ai/alexandria-core-library/main/schema/alexandriarc.json";
  schema.title = "Alexandria Configuration Schema";
  schema.description = "Schema for Alexandria library configuration files";

  // Ensure version is required
  if (!schema.required) {
    schema.required = [];
  }
  if (!schema.required.includes("version")) {
    schema.required.push("version");
  }

  // Write the final schema
  writeFileSync(outputFile, JSON.stringify(schema, null, 2) + "\n");

  console.log(`✅ Schema generated successfully at: ${outputFile}`);
} catch (error) {
  console.error("❌ Failed to generate schema:", error.message);
  process.exit(1);
}
