/**
 * Connect client template generation
 */

/**
 * Generate connect-client.ts template
 */
export function generateConnectClientTemplate(): string {
  return `/**
 * API Client configuration for Connect-RPC
 * Using @theplant/fetch-middleware for advanced request/response handling
 */
import type { Interceptor } from '@connectrpc/connect'
import { createConnectTransport } from '@connectrpc/connect-web'
import {
  createFetchClient,
  formatProtoErrorMiddleware,
} from '@theplant/fetch-middleware'
import { handleConnectError } from './handlers/connect-error-handler'

// Use binary format (protobuf) instead of JSON
const useBinaryFormat = false

// API base URL from environment
const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) || ''

// Create fetch client for Connect-RPC
export const connectFetchClient = createFetchClient({
  fetchInit: {
    credentials: 'include',
    headers: {
      Accept: useBinaryFormat ? 'application/proto' : 'application/json',
      // Ensure server returns Connect standard error format with Details
      'X-Ensure-Connect-Error': 'true',
    },
  },
  middlewares: [formatProtoErrorMiddleware()],
})

/**
 * Error interceptor for global error handling
 * Catches all Connect-RPC errors and handles them appropriately
 */
const errorInterceptor: Interceptor = (next) => async (req) => {
  try {
    return await next(req)
  } catch (err) {
    // Parse and handle the error
    handleConnectError(err)

    // Re-throw the error for specific handling if needed
    throw err
  }
}

/**
 * Create Connect transport with custom fetch and interceptors
 */
export const transport = createConnectTransport({
  baseUrl: API_BASE_URL,
  fetch: connectFetchClient,
  useBinaryFormat,
  interceptors: [errorInterceptor],
})
`;
}

/**
 * Generate connect-error-handler.ts template (without toast)
 */
export function generateConnectErrorHandlerTemplate(): string {
  return `/**
 * Error handling utilities for Connect-RPC
 * Reference: https://github.com/qor5/fe-infra/tree/main/packages/fetch-middleware
 */
import type { ConnectError } from '@connectrpc/connect'
import { parseConnectError } from '@theplant/fetch-middleware'

/**
 * Parse and handle Connect-RPC errors
 * Returns structured error information including validation errors
 */
export function handleConnectError(err: unknown) {
  if (!err) return null

  const parsed = parseConnectError(err as ConnectError)

  // Log error details for debugging
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.error('[Connect-RPC Error]', parsed)
  }

  // Normalize the response structure
  const errorInfo = {
    code: parsed.code,
    message: parsed.localizedMessage || parsed.message,
    rawMessage: parsed.rawMessage,
    validationErrors: parsed.validationError?.fieldViolations || [],
    errorInfo: parsed.errorInfo,
    badRequest: parsed.badRequest,
  }

  return errorInfo
}

/**
 * Get user-friendly error message from Connect error
 */
export function getErrorMessage(err: unknown): string {
  const errorInfo = handleConnectError(err)
  if (!errorInfo) return 'Unknown error'

  // If validation error, return first field error
  if (errorInfo.validationErrors.length > 0) {
    const firstError = errorInfo.validationErrors[0]
    return ${"`${firstError.field}: ${firstError.msg}`"}
  }

  return errorInfo.message
}
`;
}

/**
 * Generate utils.ts template for error handling utilities
 */
export function generateUtilsTemplate(): string {
  return `/**
 * Utility functions for API error handling
 */

/**
 * Check if error is a Connect-RPC error
 */
export function isConnectError(err: unknown): boolean {
  return (
    err !== null &&
    typeof err === 'object' &&
    'code' in err &&
    'message' in err
  )
}

/**
 * Format error message for display
 */
export function formatErrorMessage(err: unknown): string {
  if (!err) return 'Unknown error'
  
  if (isConnectError(err)) {
    return (err as { message: string }).message
  }
  
  if (err instanceof Error) {
    return err.message
  }
  
  return String(err)
}
`;
}
