/**
 * History management utilities
 */
import fs from "fs";
import path from "path";
import type { History } from "../types.js";

const DEFAULT_MAX_HISTORY = 10;

/**
 * Load history from file
 */
export function loadHistory(historyFile: string): History {
  try {
    if (fs.existsSync(historyFile)) {
      const content = fs.readFileSync(historyFile, "utf-8");
      return JSON.parse(content);
    }
  } catch (error) {
    console.warn("⚠️  Warning: Could not load history file");
  }
  return { records: [] };
}

/**
 * Save history to file
 */
export function saveHistory(historyFile: string, history: History): void {
  try {
    const dir = path.dirname(historyFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(historyFile, JSON.stringify(history, null, 2));
  } catch (error) {
    console.error("❌ Error: Could not save history file:", error);
  }
}

/**
 * Add new path to history with associated module name
 */
export function addToHistory(
  historyFile: string,
  targetPath: string,
  type: "file" | "directory",
  moduleName: string,
  rpcServiceDir: string,
  maxHistory: number = DEFAULT_MAX_HISTORY,
): void {
  const history = loadHistory(historyFile);

  // Remove existing entry if it exists
  history.records = history.records.filter((r) => r.path !== targetPath);

  // Add new entry at the beginning with module name
  history.records.unshift({
    path: targetPath,
    timestamp: Date.now(),
    type,
    moduleName,
  });

  // Keep only last MAX_HISTORY entries
  history.records = history.records.slice(0, maxHistory);

  // Update last used rpcServiceDir
  history.lastRpcServiceDir = rpcServiceDir;

  saveHistory(historyFile, history);
}

/**
 * Get module name for a specific proto path from history
 */
export function getModuleNameFromHistory(
  history: History,
  protoPath: string,
): string | undefined {
  const record = history.records.find((r) => r.path === protoPath);
  return record?.moduleName;
}

/**
 * Format timestamp for display
 */
export function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? "s" : ""} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
  return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
}
