/**
 * Tests for history management utilities
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import {
  loadHistory,
  saveHistory,
  addToHistory,
  formatTimestamp,
  getModuleNameFromHistory,
} from "../utils/history.js";
import type { History } from "../types.js";

describe("History Management", () => {
  let tempDir: string;
  let historyFile: string;

  beforeEach(() => {
    // Create a temporary directory for tests
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "proto-to-ts-test-"));
    historyFile = path.join(tempDir, ".proto-to-ts-history.json");
  });

  afterEach(() => {
    // Clean up temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("loadHistory", () => {
    it("should return empty history when file does not exist", () => {
      const history = loadHistory(historyFile);
      expect(history.records).toEqual([]);
    });

    it("should load existing history from file", () => {
      const existingHistory: History = {
        records: [
          {
            path: "/path/to/proto",
            timestamp: Date.now(),
            type: "directory",
            moduleName: "test",
          },
        ],
        lastRpcServiceDir: "src/api/rpc-service",
      };
      fs.writeFileSync(historyFile, JSON.stringify(existingHistory));

      const history = loadHistory(historyFile);
      expect(history.records).toHaveLength(1);
      expect(history.records[0].path).toBe("/path/to/proto");
      expect(history.records[0].moduleName).toBe("test");
      expect(history.lastRpcServiceDir).toBe("src/api/rpc-service");
    });

    it("should return empty history when file is corrupted", () => {
      fs.writeFileSync(historyFile, "invalid json");
      const history = loadHistory(historyFile);
      expect(history.records).toEqual([]);
    });
  });

  describe("saveHistory", () => {
    it("should save history to file", () => {
      const history: History = {
        records: [
          {
            path: "/path/to/proto",
            timestamp: Date.now(),
            type: "directory",
            moduleName: "test",
          },
        ],
        lastRpcServiceDir: "src/api/rpc-service",
      };

      saveHistory(historyFile, history);

      expect(fs.existsSync(historyFile)).toBe(true);
      const savedHistory = JSON.parse(fs.readFileSync(historyFile, "utf-8"));
      expect(savedHistory.records).toHaveLength(1);
      expect(savedHistory.lastRpcServiceDir).toBe("src/api/rpc-service");
    });

    it("should create parent directories if they do not exist", () => {
      const nestedHistoryFile = path.join(
        tempDir,
        "nested",
        "dir",
        "history.json",
      );
      const history: History = { records: [] };

      saveHistory(nestedHistoryFile, history);

      expect(fs.existsSync(nestedHistoryFile)).toBe(true);
    });
  });

  describe("addToHistory", () => {
    it("should add new entry to history", () => {
      addToHistory(
        historyFile,
        "/path/to/proto",
        "directory",
        "testModule",
        "src/api",
      );

      const history = loadHistory(historyFile);
      expect(history.records).toHaveLength(1);
      expect(history.records[0].path).toBe("/path/to/proto");
      expect(history.records[0].type).toBe("directory");
      expect(history.records[0].moduleName).toBe("testModule");
      expect(history.lastRpcServiceDir).toBe("src/api");
    });

    it("should move existing entry to top when re-added", () => {
      addToHistory(historyFile, "/path/one", "directory", "module1", "src/api");
      addToHistory(historyFile, "/path/two", "directory", "module2", "src/api");
      addToHistory(
        historyFile,
        "/path/one",
        "directory",
        "module1Updated",
        "src/api",
      );

      const history = loadHistory(historyFile);
      expect(history.records).toHaveLength(2);
      expect(history.records[0].path).toBe("/path/one");
      expect(history.records[0].moduleName).toBe("module1Updated");
      expect(history.records[1].path).toBe("/path/two");
    });

    it("should respect maxHistory limit", () => {
      for (let i = 0; i < 15; i++) {
        addToHistory(
          historyFile,
          `/path/${i}`,
          "directory",
          `module${i}`,
          "src/api",
          10,
        );
      }

      const history = loadHistory(historyFile);
      expect(history.records).toHaveLength(10);
      // Most recent should be first
      expect(history.records[0].path).toBe("/path/14");
    });
  });

  describe("getModuleNameFromHistory", () => {
    it("should return module name for existing path", () => {
      const history: History = {
        records: [
          {
            path: "/path/to/proto",
            timestamp: Date.now(),
            type: "directory",
            moduleName: "loyalty",
          },
        ],
      };

      const moduleName = getModuleNameFromHistory(history, "/path/to/proto");
      expect(moduleName).toBe("loyalty");
    });

    it("should return undefined for non-existing path", () => {
      const history: History = {
        records: [
          {
            path: "/path/to/proto",
            timestamp: Date.now(),
            type: "directory",
            moduleName: "loyalty",
          },
        ],
      };

      const moduleName = getModuleNameFromHistory(history, "/different/path");
      expect(moduleName).toBeUndefined();
    });

    it("should return undefined for empty history", () => {
      const history: History = { records: [] };
      const moduleName = getModuleNameFromHistory(history, "/any/path");
      expect(moduleName).toBeUndefined();
    });
  });

  describe("formatTimestamp", () => {
    it('should format recent timestamp as "just now"', () => {
      const timestamp = Date.now();
      expect(formatTimestamp(timestamp)).toBe("just now");
    });

    it("should format timestamp from minutes ago", () => {
      const timestamp = Date.now() - 5 * 60 * 1000; // 5 minutes ago
      expect(formatTimestamp(timestamp)).toBe("5 mins ago");
    });

    it("should format timestamp from 1 minute ago", () => {
      const timestamp = Date.now() - 1 * 60 * 1000; // 1 minute ago
      expect(formatTimestamp(timestamp)).toBe("1 min ago");
    });

    it("should format timestamp from hours ago", () => {
      const timestamp = Date.now() - 3 * 60 * 60 * 1000; // 3 hours ago
      expect(formatTimestamp(timestamp)).toBe("3 hours ago");
    });

    it("should format timestamp from 1 hour ago", () => {
      const timestamp = Date.now() - 1 * 60 * 60 * 1000; // 1 hour ago
      expect(formatTimestamp(timestamp)).toBe("1 hour ago");
    });

    it("should format timestamp from days ago", () => {
      const timestamp = Date.now() - 2 * 24 * 60 * 60 * 1000; // 2 days ago
      expect(formatTimestamp(timestamp)).toBe("2 days ago");
    });
  });
});
