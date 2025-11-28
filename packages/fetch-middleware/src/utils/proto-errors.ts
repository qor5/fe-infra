import { fromBinary } from "@bufbuild/protobuf";
import type { JsonValue } from "@bufbuild/protobuf";
import type { ValidationError as TValidationError } from "../proto/spec_pb";
import { ValidationErrorSchema } from "../proto/spec_pb";
import { ConnectError, Code } from "@connectrpc/connect";
import {
  errorFromJson,
  codeFromString,
} from "@connectrpc/connect/protocol-connect";
import {
  ErrorInfoSchema,
  BadRequestSchema,
  LocalizedMessageSchema,
} from "../proto/google/rpc/error_details_pb";

/**
 * Base class for HTTP errors with ValidationError details
 * These errors are thrown by the middleware and will be wrapped by ConnectError
 */

/**
 * HTTP error with status code and ValidationError details
 */
export class HttpError extends Error {
  readonly errors: TValidationError;

  constructor(
    readonly status: number,
    url: string,
    responseBody: Uint8Array,
  ) {
    super(`HTTP error on ${url}: ${status}`);
    this.name = "HttpError";
    this.errors = fromBinary(ValidationErrorSchema, responseBody);
    Object.setPrototypeOf(this, HttpError.prototype);
  }
}

/**
 * 401 - Unauthorized error
 */
export class UnauthorizedError extends Error {
  readonly errors: TValidationError;

  constructor(url: string, responseBody: Uint8Array) {
    super(`Unauthorized error on ${url}`);
    this.name = "UnauthorizedError";
    this.errors = fromBinary(ValidationErrorSchema, responseBody);
    Object.setPrototypeOf(this, UnauthorizedError.prototype);
  }
}

/**
 * 403 - Authentication error
 */
export class AuthenticationError extends Error {
  readonly errors: TValidationError;

  constructor(url: string, responseBody: Uint8Array) {
    super(`Authentication error on ${url}`);
    this.name = "AuthenticationError";
    this.errors = fromBinary(ValidationErrorSchema, responseBody);
    Object.setPrototypeOf(this, AuthenticationError.prototype);
  }
}

/**
 * 404 - Not found error
 */
export class NotFoundError extends Error {
  readonly errors: TValidationError;

  constructor(url: string, responseBody: Uint8Array) {
    super(`Not found error on ${url}`);
    this.name = "NotFoundError";
    this.errors = fromBinary(ValidationErrorSchema, responseBody);
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

/**
 * 422 - Validation error with protobuf details
 */
export class ValidationError extends Error {
  readonly errors: TValidationError;

  constructor(responseBody: Uint8Array, url: string) {
    super(`Validation error on ${url}`);
    this.name = "ValidationError";
    this.errors = fromBinary(ValidationErrorSchema, responseBody);
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

/**
 * >= 500 - Service error
 */
export class ServiceError extends Error {
  readonly errors: TValidationError;

  constructor(url: string, responseBody: Uint8Array) {
    super(`Service error on ${url}`);
    this.name = "ServiceError";
    this.errors = fromBinary(ValidationErrorSchema, responseBody);
    Object.setPrototypeOf(this, ServiceError.prototype);
  }
}

/**
 * Generic application error
 */
export class AppError extends Error {
  readonly errors: TValidationError;

  constructor(url: string, responseBody: Uint8Array) {
    super(`App error on ${url}`);
    this.name = "AppError";
    this.errors = fromBinary(ValidationErrorSchema, responseBody);
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

/**
 * Network error
 */
export class NetworkError extends Error {
  constructor(
    readonly cause: Error,
    url: string,
  ) {
    super(`Network error on ${url}: ${cause.message}`);
    this.name = "NetworkError";
    Object.setPrototypeOf(this, NetworkError.prototype);
  }
}

/**
 * Check if input is a Connect JSON error body
 * Connect JSON format: { code: string, message: string, details?: [...] }
 */
function isConnectJsonBody(
  input: unknown,
): input is { code: string; message: string; details?: unknown[] } {
  return (
    typeof input === "object" &&
    input !== null &&
    "code" in input &&
    typeof (input as Record<string, unknown>).code === "string" &&
    "message" in input &&
    !(input instanceof Error)
  );
}

/**
 * Parse ConnectError into structured error information
 * Similar to the error handling in ConnectComponent.tsx
 *
 * Supports two input types:
 * - ConnectError object (thrown by connect-es): Uses findDetails() to extract info
 * - Connect JSON body (from httpErrorMiddleware): Converts to ConnectError first
 *
 * For Proto errors (ProTTP): Extracts ValidationError from custom error classes
 * For JSON errors (Connect): Uses ConnectError.findDetails to extract error info
 *
 * @example
 * ```ts
 * // From catch block (ConnectError)
 * try {
 *   await client.login(credentials)
 * } catch (err) {
 *   const parsed = parseConnectError(err)
 *   console.log(parsed.localizedMessage)
 * }
 *
 * // From httpErrorMiddleware (JSON body)
 * onError: ({ body }) => {
 *   const parsed = parseConnectError(body)
 *   console.log(parsed.localizedMessage)
 * }
 * ```
 */
export function parseConnectError(err: unknown) {
  // Handle JSON body (from httpErrorMiddleware onError callback)
  // Use connect-es's errorFromJson to create a proper ConnectError
  if (isConnectJsonBody(err)) {
    // Create a fallback error for errorFromJson
    const fallback = new ConnectError(
      err.message || "Unknown error",
      codeFromString(err.code),
    );
    // Use connect-es's internal errorFromJson to properly parse the JSON
    // This handles the Connect JSON format with base64-encoded detail values
    const connectErr = errorFromJson(err as JsonValue, undefined, fallback);
    return {
      code: connectErr.code,
      message: connectErr.message,
      localizedMessage: connectErr.findDetails(LocalizedMessageSchema)[0]
        ?.message,
      errorInfo: connectErr.findDetails(ErrorInfoSchema)[0],
      badRequest: connectErr.findDetails(BadRequestSchema)[0],
      details: connectErr.details,
      cause: connectErr.cause,
    };
  }

  // Handle ConnectError object (from connect-es catch block)
  // connect-es has already deserialized the details from the response,
  // so findDetails() works correctly
  const connectErr = ConnectError.from(err);
  return {
    code: connectErr.code,
    message: connectErr.message,
    localizedMessage: connectErr.findDetails(LocalizedMessageSchema)[0]
      ?.message,
    errorInfo: connectErr.findDetails(ErrorInfoSchema)[0],
    badRequest: connectErr.findDetails(BadRequestSchema)[0],
    details: connectErr.details,
    cause: connectErr.cause,
  };
}
