/**
 * fetchWithRetry — wraps the native fetch with automatic retry + exponential backoff.
 * Handles transient "Failed to fetch" (cold-start / network blip) errors that surface
 * as TypeError in the browser.
 */

interface RetryOptions {
  /** Maximum number of attempts (including the first). Default: 3 */
  maxRetries?: number;
  /** Initial delay in ms before the first retry. Default: 1500 */
  initialDelayMs?: number;
  /** Multiplier applied to the delay after each retry. Default: 1.5 */
  backoffFactor?: number;
  /** Optional AbortSignal — if already aborted the retry loop exits immediately */
  signal?: AbortSignal;
}

export async function fetchWithRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
  opts?: RetryOptions,
): Promise<Response> {
  const maxRetries = opts?.maxRetries ?? 3;
  const initialDelay = opts?.initialDelayMs ?? 1500;
  const factor = opts?.backoffFactor ?? 1.5;

  let lastError: any;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    // Honour abort signals
    if (opts?.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    try {
      const response = await fetch(input, init);
      return response;
    } catch (error: any) {
      lastError = error;

      // Don't retry on intentional abort
      if (error?.name === "AbortError") throw error;

      // Only retry on network-level errors (TypeError: Failed to fetch)
      const isNetworkError =
        error instanceof TypeError || error?.message?.includes("Failed to fetch");

      if (!isNetworkError || attempt >= maxRetries) {
        throw error;
      }

      const delay = initialDelay * Math.pow(factor, attempt - 1);
      console.warn(
        `fetchWithRetry: attempt ${attempt}/${maxRetries} failed (${error?.message}). Retrying in ${Math.round(delay)}ms...`,
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw lastError;
}
