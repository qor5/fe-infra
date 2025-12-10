/**
 * Tests for service wrapper utilities
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import {
  generateServiceWrapper,
  generateServicesIndexFile,
  generateTypesIndexFile,
  shouldIncludeService,
  shouldExcludeService,
  shouldGenerateService,
} from "../utils/service-wrapper.js";
import type { ServiceInfo } from "../types.js";

describe("Service Wrapper", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "service-wrapper-test-"));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("generateServiceWrapper", () => {
    it("should generate service wrapper code with service name", () => {
      const serviceInfo: ServiceInfo = {
        serviceName: "TestService",
        importPath: "./generated/test_pb.js",
        methods: [
          {
            name: "GetItem",
            inputType: "GetItemRequest",
            inputSchema: "GetItemRequestSchema",
            outputType: "GetItemResponse",
            outputSchema: "GetItemResponseSchema",
          },
        ],
        imports: {
          GetItemRequest: "./generated/test_pb.js",
          GetItemResponse: "./generated/test_pb.js",
        },
      };

      const code = generateServiceWrapper("Test", serviceInfo, "myModule");

      // Check that the generated code contains expected elements
      expect(code).toContain("TestService");
      expect(code).toContain("testClient");
      expect(code).toContain("createClient");
    });

    it("should generate proper import statements", () => {
      const serviceInfo: ServiceInfo = {
        serviceName: "UserService",
        importPath: "../generated/user_pb.js",
        methods: [],
        imports: {},
      };

      const code = generateServiceWrapper("User", serviceInfo);

      expect(code).toContain("UserService");
      expect(code).toContain("import");
      expect(code).toContain("transport");
    });
  });

  describe("generateServicesIndexFile", () => {
    it("should generate index file with exports for services", () => {
      const services = [
        { name: "User", camelName: "user" },
        { name: "Product", camelName: "product" },
      ];

      const code = generateServicesIndexFile(services, "testModule");

      // Check that the generated code contains expected elements
      expect(code).toContain("userClient");
      expect(code).toContain("productClient");
      expect(code).toContain("user.client");
      expect(code).toContain("product.client");
      expect(code).toContain("export");
    });

    it("should handle empty services array", () => {
      const code = generateServicesIndexFile([], "emptyModule");

      // Should still have exports and types
      expect(code).toContain("export");
      expect(code).toContain("types");
    });

    it("should include types namespace export", () => {
      const services = [{ name: "Test", camelName: "test" }];
      const code = generateServicesIndexFile(services, "myModule");

      expect(code).toContain("export * as types from '../types'");
    });
  });

  describe("generateTypesIndexFile", () => {
    it("should generate namespaced exports to avoid conflicts", () => {
      const typeFiles = [
        "loyalty/campaign/v1/campaign_pb",
        "loyalty/order/v1/order_reward_pb",
      ];

      const code = generateTypesIndexFile(typeFiles);

      // Should use namespace exports instead of star exports
      expect(code).toContain("export * as Campaign from");
      expect(code).toContain("export * as OrderReward from");
      // Should NOT use plain star exports
      expect(code).not.toMatch(/^export \* from/m);
    });

    it("should convert snake_case file names to PascalCase namespaces", () => {
      const typeFiles = [
        "loyalty/ledger/v1/ledger_pb",
        "loyalty/common/v1/error_pb",
      ];

      const code = generateTypesIndexFile(typeFiles);

      expect(code).toContain("export * as Ledger from");
      expect(code).toContain("export * as Error from");
    });

    it("should handle empty type files array", () => {
      const code = generateTypesIndexFile([]);

      expect(code).toContain("No type files found");
      expect(code).toContain("export {}");
    });

    it("should handle duplicate namespace names by appending suffix", () => {
      const typeFiles = [
        "module/v1/user_pb",
        "other/v1/user_pb", // Same filename, different path
      ];

      const code = generateTypesIndexFile(typeFiles);

      // First one should be User, second should be User2
      expect(code).toContain("export * as User from");
      expect(code).toContain("export * as User2 from");
    });

    it("should include usage comment", () => {
      const typeFiles = ["loyalty/order/v1/order_reward_pb"];
      const code = generateTypesIndexFile(typeFiles);

      expect(code).toContain("OrderReward.Reward");
    });
  });

  describe("shouldIncludeService", () => {
    it("should return true when undefined (include all)", () => {
      expect(shouldIncludeService("UserService", undefined)).toBe(true);
      expect(shouldIncludeService("AdminService", undefined)).toBe(true);
    });

    it("should return false when empty array (include none)", () => {
      expect(shouldIncludeService("UserService", [])).toBe(false);
      expect(shouldIncludeService("AdminService", [])).toBe(false);
    });

    it("should return true when * is in patterns (include all)", () => {
      expect(shouldIncludeService("UserService", ["*"])).toBe(true);
      expect(shouldIncludeService("AdminService", ["*"])).toBe(true);
      expect(shouldIncludeService("AnyService", ["*", "Other"])).toBe(true);
    });

    it("should match services ending with CustomerService", () => {
      const patterns = ["CustomerService$"];

      expect(shouldIncludeService("UserCustomerService", patterns)).toBe(true);
      expect(shouldIncludeService("LoyaltyCustomerService", patterns)).toBe(
        true,
      );
      expect(shouldIncludeService("CustomerServiceAdmin", patterns)).toBe(
        false,
      );
      expect(shouldIncludeService("AdminService", patterns)).toBe(false);
    });

    it("should support multiple include patterns", () => {
      const patterns = ["CustomerService$", "PublicService$"];

      expect(shouldIncludeService("UserCustomerService", patterns)).toBe(true);
      expect(shouldIncludeService("ApiPublicService", patterns)).toBe(true);
      expect(shouldIncludeService("AdminService", patterns)).toBe(false);
    });
  });

  describe("shouldExcludeService", () => {
    it("should return false when no patterns provided", () => {
      expect(shouldExcludeService("UserService", undefined)).toBe(false);
      expect(shouldExcludeService("UserService", [])).toBe(false);
    });

    it("should match service names containing pattern", () => {
      const patterns = ["Admin"];

      expect(shouldExcludeService("AdminService", patterns)).toBe(true);
      expect(shouldExcludeService("UserAdminService", patterns)).toBe(true);
      expect(shouldExcludeService("ProductAdminService", patterns)).toBe(true);
      expect(shouldExcludeService("UserService", patterns)).toBe(false);
    });

    it("should support multiple patterns (comma-separated in user input)", () => {
      const patterns = ["Admin", "Internal"];

      expect(shouldExcludeService("AdminService", patterns)).toBe(true);
      expect(shouldExcludeService("InternalService", patterns)).toBe(true);
      expect(shouldExcludeService("UserService", patterns)).toBe(false);
    });

    it("should support regex patterns for exact matching", () => {
      // Match services ending with "Admin"
      const patterns = ["Admin$"];

      expect(shouldExcludeService("UserAdmin", patterns)).toBe(true);
      expect(shouldExcludeService("AdminService", patterns)).toBe(false);
    });

    it("should support regex patterns for start matching", () => {
      // Match services starting with "Admin"
      const patterns = ["^Admin"];

      expect(shouldExcludeService("AdminService", patterns)).toBe(true);
      expect(shouldExcludeService("UserAdminService", patterns)).toBe(false);
    });

    it("should handle invalid regex patterns as substring match", () => {
      // Invalid regex pattern - should fall back to substring match
      const patterns = ["[invalid"];

      expect(shouldExcludeService("Service[invalid", patterns)).toBe(true);
      expect(shouldExcludeService("UserService", patterns)).toBe(false);
    });

    it("should be case sensitive by default", () => {
      const patterns = ["admin"];

      expect(shouldExcludeService("adminService", patterns)).toBe(true);
      expect(shouldExcludeService("AdminService", patterns)).toBe(false);
    });
  });

  describe("shouldGenerateService", () => {
    it("should include all when undefined patterns", () => {
      expect(shouldGenerateService("UserService", undefined, undefined)).toBe(
        true,
      );
      expect(shouldGenerateService("AdminService", undefined, undefined)).toBe(
        true,
      );
    });

    it("should include all when * pattern", () => {
      expect(shouldGenerateService("UserService", ["*"], [])).toBe(true);
      expect(shouldGenerateService("AdminService", ["*"], [])).toBe(true);
    });

    it("should include none when empty array", () => {
      expect(shouldGenerateService("UserService", [], [])).toBe(false);
      expect(shouldGenerateService("AdminService", [], [])).toBe(false);
    });

    it("should apply whitelist first", () => {
      const include = ["CustomerService$"];

      expect(
        shouldGenerateService("UserCustomerService", include, undefined),
      ).toBe(true);
      expect(shouldGenerateService("AdminService", include, undefined)).toBe(
        false,
      );
    });

    it("should apply blacklist after whitelist", () => {
      const include = ["CustomerService$"];
      const exclude = ["Test"];

      // Included by whitelist, not excluded
      expect(
        shouldGenerateService("UserCustomerService", include, exclude),
      ).toBe(true);

      // Included by whitelist, but excluded by blacklist
      expect(
        shouldGenerateService("TestCustomerService", include, exclude),
      ).toBe(false);

      // Not included by whitelist
      expect(shouldGenerateService("AdminService", include, exclude)).toBe(
        false,
      );
    });

    it("should work with * whitelist and blacklist", () => {
      const include = ["*"];
      const exclude = ["Admin", "Internal"];

      expect(shouldGenerateService("UserService", include, exclude)).toBe(true);
      expect(shouldGenerateService("AdminService", include, exclude)).toBe(
        false,
      );
      expect(shouldGenerateService("InternalService", include, exclude)).toBe(
        false,
      );
    });

    it("should handle complex filtering scenario", () => {
      // Only include customer services, but exclude test ones
      const include = ["CustomerService$"];
      const exclude = ["^Test", "Mock"];

      expect(
        shouldGenerateService("UserCustomerService", include, exclude),
      ).toBe(true);
      expect(
        shouldGenerateService("LoyaltyCustomerService", include, exclude),
      ).toBe(true);
      expect(
        shouldGenerateService("TestCustomerService", include, exclude),
      ).toBe(false);
      expect(
        shouldGenerateService("MockCustomerService", include, exclude),
      ).toBe(false);
      expect(shouldGenerateService("AdminService", include, exclude)).toBe(
        false,
      );
    });
  });
});
