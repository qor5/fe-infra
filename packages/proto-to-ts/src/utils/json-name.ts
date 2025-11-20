/**
 * JSON name mapping utilities for protobuf fields
 */
import fs from "fs";
import path from "path";
import { findPbFiles } from "./proto-scanner.js";

/**
 * Parse proto file to extract json_name mappings
 */
export function extractJsonNameMappings(
  protoFilePath: string,
): Map<string, string> {
  const mappings = new Map<string, string>();

  try {
    if (protoFilePath.includes("..")) throw new Error("Invalid file path");
    const content = fs.readFileSync(protoFilePath, "utf-8");
    // Match pattern: fieldType fieldName = number [json_name = "jsonName"];
    // Note: semicolon is optional in some proto files
    const jsonNameRegex =
      /(\w+)\s+(\w+)\s*=\s*\d+\s*\[.*?json_name\s*=\s*"(\w+)".*?\];?/g;

    let match;
    while ((match = jsonNameRegex.exec(content)) !== null) {
      const fieldName = match[2];
      const jsonName = match[3];
      // Convert snake_case to camelCase for matching generated code
      const camelCaseField = fieldName.replace(/_([a-z])/g, (_, letter) =>
        letter.toUpperCase(),
      );
      mappings.set(camelCaseField, jsonName);
      console.log(`   Found: ${fieldName} (${camelCaseField}) -> ${jsonName}`);
    }
  } catch (error) {
    console.warn(`⚠️  Warning: Could not parse proto file ${protoFilePath}`);
  }

  return mappings;
}

/**
 * Process generated TypeScript files to replace field names with json_name
 */
export function applyJsonNameMappings(
  generatedDir: string,
  protoFiles: string[],
): void {
  console.log("   🔄 Processing generated files to apply json_name...");
  console.log(`   📂 Scanning ${protoFiles.length} proto file(s)...`);

  // Extract all json_name mappings from all proto files
  const allMappings = new Map<string, string>();
  for (const protoFile of protoFiles) {
    const mappings = extractJsonNameMappings(protoFile);
    for (const [key, value] of mappings) {
      allMappings.set(key, value);
    }
  }

  if (allMappings.size === 0) {
    console.log("   ℹ️  No json_name declarations found");
    return;
  }

  console.log(`   📝 Total unique json_name mapping(s): ${allMappings.size}`);

  // Find all generated _pb.ts files
  const pbFiles = findPbFiles(generatedDir);
  console.log(
    `   📄 Scanning ${pbFiles.length} generated TypeScript file(s)...`,
  );

  let updatedCount = 0;
  for (const pbFile of pbFiles) {
    try {
      let content = fs.readFileSync(pbFile, "utf-8");
      let modified = false;

      // Replace field declarations: fieldName = defaultValue;
      for (const [camelCase, jsonName] of allMappings) {
        // Match field declaration with various default values
        // Pattern: whitespace + fieldName + whitespace + (= or :)
        const fieldRegex = new RegExp(`(\\s+)${camelCase}(\\s*(?:=|:))`, "g");

        if (fieldRegex.test(content)) {
          // Reset regex
          fieldRegex.lastIndex = 0;
          // Replace: keep leading whitespace, replace field name, keep trailing = or :
          content = content.replace(fieldRegex, `$1${jsonName}$2`);
          modified = true;
        }
      }

      if (modified) {
        fs.writeFileSync(pbFile, content);
        console.log(`   ✅ Updated ${path.basename(pbFile)}`);
        updatedCount++;
      }
    } catch (error) {
      console.warn(`⚠️  Warning: Could not process ${pbFile}:`, error);
    }
  }

  if (updatedCount > 0) {
    console.log(
      `   ✨ Successfully updated ${updatedCount} file(s) with json_name mappings`,
    );
  } else {
    console.log(`   ℹ️  No files needed updating`);
  }
}
