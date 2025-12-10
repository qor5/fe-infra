/**
 * Tests for proto scanner utilities
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { isValidProtoPath, findProtoFiles } from "../utils/proto-scanner.js";

describe("Proto Scanner", () => {
  let tempDir: string;

  beforeEach(() => {
    // Create a temporary directory for tests
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "proto-scanner-test-"));
  });

  afterEach(() => {
    // Clean up temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("isValidProtoPath", () => {
    it("should return invalid for non-existent path", () => {
      const result = isValidProtoPath("/non/existent/path");
      expect(result.valid).toBe(false);
    });

    it("should return valid for directory with proto files", () => {
      // Create a proto file
      const protoFile = path.join(tempDir, "test.proto");
      fs.writeFileSync(protoFile, 'syntax = "proto3";');

      const result = isValidProtoPath(tempDir);
      expect(result.valid).toBe(true);
      expect(result.type).toBe("directory");
      expect(result.files).toContain(protoFile);
    });

    it("should return valid for single proto file", () => {
      const protoFile = path.join(tempDir, "test.proto");
      fs.writeFileSync(protoFile, 'syntax = "proto3";');

      const result = isValidProtoPath(protoFile);
      expect(result.valid).toBe(true);
      expect(result.type).toBe("file");
      expect(result.files).toContain(protoFile);
    });

    it("should return invalid for directory without proto files", () => {
      // Create a non-proto file
      fs.writeFileSync(path.join(tempDir, "test.txt"), "hello");

      const result = isValidProtoPath(tempDir);
      expect(result.valid).toBe(false);
    });

    it("should return invalid for non-proto file", () => {
      const txtFile = path.join(tempDir, "test.txt");
      fs.writeFileSync(txtFile, "hello");

      const result = isValidProtoPath(txtFile);
      expect(result.valid).toBe(false);
    });

    it("should find proto files in nested directories", () => {
      // Create nested structure
      const nestedDir = path.join(tempDir, "nested", "deep");
      fs.mkdirSync(nestedDir, { recursive: true });
      const protoFile = path.join(nestedDir, "test.proto");
      fs.writeFileSync(protoFile, 'syntax = "proto3";');

      const result = isValidProtoPath(tempDir);
      expect(result.valid).toBe(true);
      expect(result.files).toContain(protoFile);
    });
  });

  describe("findProtoFiles", () => {
    it("should find all proto files in directory", () => {
      // Create multiple proto files
      fs.writeFileSync(path.join(tempDir, "a.proto"), 'syntax = "proto3";');
      fs.writeFileSync(path.join(tempDir, "b.proto"), 'syntax = "proto3";');

      const files = findProtoFiles(tempDir);
      expect(files).toHaveLength(2);
    });

    it("should find proto files in nested directories", () => {
      const nestedDir = path.join(tempDir, "v1");
      fs.mkdirSync(nestedDir);
      fs.writeFileSync(path.join(tempDir, "root.proto"), 'syntax = "proto3";');
      fs.writeFileSync(
        path.join(nestedDir, "nested.proto"),
        'syntax = "proto3";',
      );

      const files = findProtoFiles(tempDir);
      expect(files).toHaveLength(2);
    });

    it("should return empty array for directory without proto files", () => {
      const files = findProtoFiles(tempDir);
      expect(files).toEqual([]);
    });
  });
});
