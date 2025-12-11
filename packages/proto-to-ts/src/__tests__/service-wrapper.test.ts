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
  snakeToPascalCase,
  filePathToTypeName,
  extractModuleName,
  filePathToImportAlias,
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

  describe("snakeToPascalCase", () => {
    it("should convert single word", () => {
      expect(snakeToPascalCase("error")).toBe("Error");
      expect(snakeToPascalCase("user")).toBe("User");
    });

    it("should convert snake_case to PascalCase", () => {
      expect(snakeToPascalCase("order_reward")).toBe("OrderReward");
      expect(snakeToPascalCase("gallery_image")).toBe("GalleryImage");
      expect(snakeToPascalCase("user_profile_settings")).toBe(
        "UserProfileSettings",
      );
    });

    it("should handle already capitalized input", () => {
      expect(snakeToPascalCase("ORDER_REWARD")).toBe("OrderReward");
      expect(snakeToPascalCase("Order_Reward")).toBe("OrderReward");
    });

    it("should handle empty string", () => {
      expect(snakeToPascalCase("")).toBe("");
    });
  });

  describe("filePathToTypeName", () => {
    it("should extract type name from simple path", () => {
      expect(filePathToTypeName("loyalty/order/v1/order_reward_pb")).toBe(
        "OrderReward",
      );
      expect(filePathToTypeName("loyalty/campaign/v1/campaign_pb")).toBe(
        "Campaign",
      );
    });

    it("should handle snake_case filenames", () => {
      expect(filePathToTypeName("pim/models/v1/gallery_image_pb")).toBe(
        "GalleryImage",
      );
      expect(filePathToTypeName("pim/common/v1/error_pb")).toBe("Error");
    });

    it("should handle filename only (no path)", () => {
      expect(filePathToTypeName("user_pb")).toBe("User");
      expect(filePathToTypeName("order_reward_pb")).toBe("OrderReward");
    });

    it("should handle deep nested paths", () => {
      expect(filePathToTypeName("root/sub/module/v1/my_complex_type_pb")).toBe(
        "MyComplexType",
      );
    });
  });

  describe("extractModuleName", () => {
    it("should extract module name before version directory", () => {
      expect(extractModuleName("pim/models/v1/category_pb")).toBe("models");
      expect(extractModuleName("pim/product/v1/category_pb")).toBe("product");
      expect(extractModuleName("loyalty/campaign/v1/campaign_pb")).toBe(
        "campaign",
      );
    });

    it("should handle different version numbers", () => {
      expect(extractModuleName("pim/common/v2/error_pb")).toBe("common");
      expect(extractModuleName("pim/models/v10/category_pb")).toBe("models");
    });

    it("should handle short paths (module/version/file)", () => {
      expect(extractModuleName("models/v1/user_pb")).toBe("models");
      expect(extractModuleName("common/v1/error_pb")).toBe("common");
    });

    it("should return first directory if no version found", () => {
      expect(extractModuleName("models/category_pb")).toBe("models");
      expect(extractModuleName("some/nested/path/file_pb")).toBe("some");
    });

    it("should return empty string for filename only", () => {
      expect(extractModuleName("user_pb")).toBe("");
    });

    it("should handle complex nested paths", () => {
      // project/sub-project/module/version/file
      expect(extractModuleName("pim/api/models/v1/category_pb")).toBe("models");
    });
  });

  describe("filePathToImportAlias", () => {
    it("should generate alias with module prefix", () => {
      expect(filePathToImportAlias("pim/models/v1/category_pb")).toBe(
        "_ModelsCategory",
      );
      expect(filePathToImportAlias("pim/product/v1/category_pb")).toBe(
        "_ProductCategory",
      );
      expect(filePathToImportAlias("pim/common/v1/error_pb")).toBe(
        "_CommonError",
      );
    });

    it("should handle snake_case module and filename", () => {
      expect(filePathToImportAlias("pim/models/v1/gallery_image_pb")).toBe(
        "_ModelsGalleryImage",
      );
      expect(filePathToImportAlias("loyalty/order/v1/order_reward_pb")).toBe(
        "_OrderOrderReward",
      );
    });

    it("should handle short paths", () => {
      expect(filePathToImportAlias("models/v1/user_pb")).toBe("_ModelsUser");
      expect(filePathToImportAlias("common/v1/error_pb")).toBe("_CommonError");
    });

    it("should handle filename only (no module)", () => {
      expect(filePathToImportAlias("user_pb")).toBe("_User");
      expect(filePathToImportAlias("order_reward_pb")).toBe("_OrderReward");
    });

    it("should produce unique aliases for different paths with same filename", () => {
      const alias1 = filePathToImportAlias("pim/models/v1/category_pb");
      const alias2 = filePathToImportAlias("pim/product/v1/category_pb");

      expect(alias1).toBe("_ModelsCategory");
      expect(alias2).toBe("_ProductCategory");
      expect(alias1).not.toBe(alias2);
    });

    it("should handle different version directories", () => {
      expect(filePathToImportAlias("pim/models/v2/category_pb")).toBe(
        "_ModelsCategory",
      );
      expect(filePathToImportAlias("pim/models/v10/category_pb")).toBe(
        "_ModelsCategory",
      );
    });
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
    it("should generate nested namespaces grouped by module", () => {
      const typeFiles = [
        "loyalty/campaign/v1/campaign_pb",
        "loyalty/order/v1/order_reward_pb",
      ];

      const code = generateTypesIndexFile(typeFiles);

      // Should have import statements
      expect(code).toContain("import * as _CampaignCampaign from");
      expect(code).toContain("import * as _OrderOrderReward from");
      // Should have namespace declarations
      expect(code).toContain("export namespace Campaign {");
      expect(code).toContain("export namespace Order {");
      // Should have export import statements inside namespaces
      expect(code).toContain("export import Campaign = _CampaignCampaign");
      expect(code).toContain("export import OrderReward = _OrderOrderReward");
    });

    it("should convert snake_case file names to PascalCase type names", () => {
      const typeFiles = [
        "loyalty/ledger/v1/ledger_pb",
        "loyalty/common/v1/error_pb",
      ];

      const code = generateTypesIndexFile(typeFiles);

      expect(code).toContain("export namespace Ledger {");
      expect(code).toContain("export namespace Common {");
      expect(code).toContain("export import Ledger = _LedgerLedger");
      expect(code).toContain("export import Error = _CommonError");
    });

    it("should handle empty type files array", () => {
      const code = generateTypesIndexFile([]);

      expect(code).toContain("No type files found");
      expect(code).toContain("export {}");
    });

    it("should group same module files into one namespace", () => {
      const typeFiles = ["root/module/v1/user_pb", "root/module/v1/order_pb"];

      const code = generateTypesIndexFile(typeFiles);

      // Should have one Module namespace containing both types
      expect(code).toContain("export namespace Module {");
      expect(code).toContain("export import User = _ModuleUser");
      expect(code).toContain("export import Order = _ModuleOrder");
      // Should only have one Module namespace declaration
      expect(code.match(/export namespace Module \{/g)?.length).toBe(1);
    });

    it("should handle pim models vs product as separate namespaces", () => {
      const typeFiles = [
        "pim/models/v1/category_pb",
        "pim/product/v1/category_pb",
        "pim/models/v1/gallery_image_pb",
        "pim/product/v1/gallery_image_pb",
      ];

      const code = generateTypesIndexFile(typeFiles);

      // Should have separate namespaces for Models and Product
      expect(code).toContain("export namespace Models {");
      expect(code).toContain("export namespace Product {");
      // Each namespace should have its own Category and GalleryImage
      expect(code).toContain("export import Category = _ModelsCategory");
      expect(code).toContain("export import Category = _ProductCategory");
      expect(code).toContain(
        "export import GalleryImage = _ModelsGalleryImage",
      );
      expect(code).toContain(
        "export import GalleryImage = _ProductGalleryImage",
      );
    });

    it("should handle multiple modules correctly", () => {
      const typeFiles = [
        "pim/common/v1/error_pb",
        "pim/common/v1/openapi_pb",
        "pim/models/v1/category_pb",
        "pim/product/v1/category_pb",
        "pim/product/v1/service_pb",
      ];

      const code = generateTypesIndexFile(typeFiles);

      // Should have three namespaces
      expect(code).toContain("export namespace Common {");
      expect(code).toContain("export namespace Models {");
      expect(code).toContain("export namespace Product {");
      // Common namespace should have Error and Openapi
      expect(code).toContain("export import Error = _CommonError");
      expect(code).toContain("export import Openapi = _CommonOpenapi");
      // Models namespace should have Category
      expect(code).toContain("export import Category = _ModelsCategory");
      // Product namespace should have Category and Service
      expect(code).toContain("export import Category = _ProductCategory");
      expect(code).toContain("export import Service = _ProductService");
    });

    it("should handle duplicate type names within same module with numeric suffix", () => {
      const typeFiles = [
        "root/same/v1/user_pb",
        "root2/same/v1/user_pb", // Same module name "same"
      ];

      const code = generateTypesIndexFile(typeFiles);

      // Both files go into Same namespace, second one gets numeric suffix
      expect(code).toContain("export namespace Same {");
      expect(code).toContain("export import User = _SameUser");
      expect(code).toContain("export import User2 = _SameUser2");
    });

    it("should include usage comment with nested namespace example", () => {
      const typeFiles = ["loyalty/order/v1/order_reward_pb"];
      const code = generateTypesIndexFile(typeFiles);

      expect(code).toContain("Models.Category.Category");
      expect(code).toContain("Product.Category.Category");
    });

    it("should generate correct import paths", () => {
      const typeFiles = ["pim/models/v1/category_pb"];
      const code = generateTypesIndexFile(typeFiles);

      expect(code).toContain(
        "import * as _ModelsCategory from '../generated/pim/models/v1/category_pb'",
      );
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
