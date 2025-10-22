import type { Middleware } from "../middleware";

/**
 * Parse raw protobuf string into structured error object
 * Useful for parsing already decoded protobuf strings
 *
 * Matches the structure expected by error handlers:
 * - code: Error code (e.g. "INVALID_CREDENTIAL", "TOKEN_NOT_FOUND")
 * - msg: English error message
 * - defaultViewMsg: Localized error message (usually Chinese)
 * - fieldViolations: Array of field validation errors (empty by default)
 *
 * @example
 * ```ts
 * const raw = "\n\u000fTOKEN_NOT_FOUND\u0012\u0015missing refresh token\"\u000f找不到令牌"
 * const parsed = parseProtobufString(raw)
 * // {
 * //   code: "TOKEN_NOT_FOUND",
 * //   msg: "missing refresh token",
 * //   defaultViewMsg: "找不到令牌",
 * //   fieldViolations: []
 * // }
 * ```
 */
export function parseProtobufString(text: string): any {
  // Extract printable strings (ASCII 32-126 and UTF-8 characters)
  // Filter out control characters and keep meaningful text
  const readableStrings = text
    .split(/[\x00-\x1F\x7F-\x9F]+/) // Split by control characters
    .filter((s) => s.length > 0 && /[\w\u4e00-\u9fa5]/.test(s)) // Keep strings with alphanumeric or Chinese characters
    .map((s) => s.trim())
    .filter((s) => s.length > 2); // Keep strings longer than 2 chars

  // Try to construct a meaningful error object
  if (readableStrings.length > 0) {
    return {
      code: readableStrings[0], // First string is usually error code (e.g. "INVALID_CREDENTIAL")
      msg: readableStrings[1] || readableStrings[0], // Second string is usually English message
      defaultViewMsg:
        readableStrings[2] || readableStrings[1] || readableStrings[0], // Third string is usually localized message (Chinese)
      fieldViolations: [], // Field validation errors (empty by default)
    };
  }

  return {
    code: "UNKNOWN_ERROR",
    msg: "An unknown error occurred",
    defaultViewMsg: text || "An unknown error occurred",
    fieldViolations: [],
  };
}

/**
 * Extract readable text from raw protobuf binary data
 * This is a fallback parser when no custom protobuf parser is provided
 *
 * Extracts ASCII/UTF-8 printable strings from the binary data and structures them
 * into a usable error object format.
 *
 * @example
 * ```ts
 * // Input: ArrayBuffer containing binary protobuf data
 * // Output: {
 * //   code: "TOKEN_NOT_FOUND",
 * //   msg: "missing refresh token",
 * //   defaultViewMsg: "找不到令牌",
 * //   fieldViolations: []
 * // }
 * ```
 */
export function extractReadableText(buffer: ArrayBuffer): any {
  const decoder = new TextDecoder("utf-8");
  const text = decoder.decode(buffer);
  return parseProtobufString(text);
}

/**
 * Error information passed to error handler
 */
export interface HttpErrorInfo {
  /** HTTP status code (200, 404, 500, etc.) */
  status: number;
  /** HTTP status text */
  statusText: string;
  /** Request URL */
  url: string;
  /** Parsed response body (JSON or text, depending on content-type) */
  body?: any;
  /** Native Response object */
  response: Response;
}

/**
 * Error handler function
 * Return true to prevent throwing error
 */
export type HttpErrorHandler = (
  errorInfo: HttpErrorInfo,
) => void | Promise<void> | boolean | Promise<boolean>;

/**
 * Configuration options for HTTP error middleware
 */
export interface HttpErrorMiddlewareOptions {
  /**
   * Error handler - receives status, body, and response
   * Use switch/case on status to handle different error codes
   */
  onError?: HttpErrorHandler;

  /**
   * Whether to throw an error after handling
   * @default true
   */
  throwError?: boolean;

  /**
   * Custom protobuf parser function
   * Receives ArrayBuffer and returns parsed object
   * If provided, will be used to parse protobuf responses (application/proto, application/grpc+proto, etc.)
   * If not provided, protobuf responses will be parsed as UTF-8 text
   */
  protobufParser?: (buffer: ArrayBuffer) => any | Promise<any>;
}

/**
 * HTTP error handling middleware
 *
 * Supports both JSON and Protobuf response parsing.
 * Checks response status and calls onError handler with:
 * - status: HTTP status code (200, 401, 404, 500, etc.)
 * - body: Parsed response body (automatically parsed from Response)
 * - response: Native Response object
 *
 * The middleware automatically parses the response body based on content-type:
 * - JSON responses (application/json): parsed as object
 * - Protobuf responses (application/proto, application/grpc+proto, etc.): parsed using custom parser or as UTF-8 text
 * - Text responses: returned as string
 * - Other types: undefined
 *
 * @example
 * ```ts
 * // JSON error handling
 * const errorMiddleware = httpErrorMiddleware({
 *   onError: async ({ status, body }) => {
 *     // Handler is automatically skipped if request was aborted
 *     const message = body?.message || body?.error || ''
 *
 *     switch (status) {
 *       case 401:
 *       case 419:
 *       case 440:
 *         // Handle auth errors
 *         window.location.href = '/login'
 *         toast.error('Please log in')
 *         break
 *       case 500:
 *       case 502:
 *       case 503:
 *         // Handle server errors
 *         toast.error(message || 'Server error')
 *         break
 *       default:
 *         // Handle other errors
 *         if (status >= 400) {
 *           toast.error(message || `Error ${status}`)
 *         }
 *     }
 *   },
 * })
 * ```
 *
 * @example
 * ```ts
 * // Protobuf error handling with custom parser
 * import { create } from '@bufbuild/protobuf'
 * import { ErrorResponseSchema } from './proto/error_pb'
 *
 * const errorMiddleware = httpErrorMiddleware({
 *   protobufParser: async (buffer) => {
 *     return create(ErrorResponseSchema, new Uint8Array(buffer))
 *   },
 *   onError: async ({ status, body }) => {
 *     switch (status) {
 *       case 401:
 *         toast.error(body?.message || 'Unauthorized')
 *         break
 *       case 500:
 *         toast.error(body?.message || 'Server error')
 *         break
 *     }
 *   },
 * })
 * ```
 */
export function httpErrorMiddleware(
  options: HttpErrorMiddlewareOptions = {},
): Middleware {
  const { onError, throwError = true, protobufParser } = options;

  return async (req, next, ctx) => {
    try {
      const res = await next(req);

      // Read from native Response object
      const ok = (res as Response).ok;
      const status = (res as Response).status;
      const statusText = (res as Response).statusText || "Request failed";

      // Return early if response is ok
      if (ok) return res;

      // Parse response body for error info
      let body: any = undefined;
      const contentType = (res as Response).headers.get("content-type") || "";

      try {
        // Check if this is a protobuf response
        const isProtobuf = contentType.includes("application/proto");

        if (isProtobuf) {
          // Parse as protobuf
          const arrayBuffer = await (res as Response).clone().arrayBuffer();

          if (protobufParser) {
            // Use custom parser
            body = await protobufParser(arrayBuffer);
          } else {
            // Fallback: extract readable text from binary data
            // This will parse strings like "\n\u000fTOKEN_NOT_FOUND\u0012\u0015missing refresh token"
            // into structured format: { code: "TOKEN_NOT_FOUND", message: "missing refresh token", ... }
            body = extractReadableText(arrayBuffer);
          }
        } else if (contentType.includes("application/json")) {
          // Parse as JSON
          body = await (res as Response).clone().json();
        } else {
          // Parse as text
          body = await (res as Response).clone().text();
        }
      } catch (e) {
        // Ignore parse errors
        console.warn("[httpErrorMiddleware] Failed to parse response:", e);
      }

      // ✅ Attach parsed body to response object
      // This allows connect-es interceptor to access the parsed error body
      // when ConnectError is thrown by connect-es
      (res as any)._body = body;

      // Prepare error info
      const errorInfo: HttpErrorInfo = {
        status,
        statusText,
        url: req.url,
        body,
        response: res as Response,
      };

      // Call error handler (skip if request was aborted)
      let shouldPreventThrow = false;
      if (onError && !ctx.signal.aborted) {
        const result = await onError(errorInfo);
        if (result === true) shouldPreventThrow = true;
      }

      // Throw error to stop execution chain (unless prevented)
      if (throwError && !shouldPreventThrow) {
        const error = new Error(`HTTP ${status} ${statusText}`);
        (error as any).status = status;
        (error as any).url = req.url;
        (error as any).response = res;
        (error as any).body = body;
        throw error;
      }

      return res;
    } catch (error: any) {
      // Re-throw if it's not an HTTP error
      if (!error?.status) {
        throw error;
      }

      // Always re-throw the error
      throw error;
    }
  };
}
