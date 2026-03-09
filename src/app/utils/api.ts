import { projectId, publicAnonKey } from "/utils/supabase/info";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;

/**
 * Make an authenticated API call with custom JWT in X-Custom-Auth header
 * Authorization header contains publicAnonKey for platform validation
 */
export async function apiCall(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  const accessToken = localStorage.getItem("accessToken");
  
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    // Platform validation - use public ANON key
    Authorization: `Bearer ${publicAnonKey}`,
    ...((options.headers as Record<string, string>) || {}),
  };
  
  // Add custom JWT if available
  if (accessToken) {
    headers["X-Custom-Auth"] = accessToken;
  }
  
  return fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });
}

/**
 * Helper for GET requests
 */
export async function apiGet(endpoint: string): Promise<Response> {
  return apiCall(endpoint, { method: "GET" });
}

/**
 * Helper for POST requests
 */
export async function apiPost(endpoint: string, body?: any): Promise<Response> {
  return apiCall(endpoint, {
    method: "POST",
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * Helper for PUT requests
 */
export async function apiPut(endpoint: string, body?: any): Promise<Response> {
  return apiCall(endpoint, {
    method: "PUT",
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * Helper for DELETE requests
 */
export async function apiDelete(endpoint: string): Promise<Response> {
  return apiCall(endpoint, { method: "DELETE" });
}

export { API_BASE };
