export interface ApiResponse<T> {
  data: T;
  status: number;
  requestId?: string;
}

export class ApiError extends Error {
  constructor(message: string, public status: number, public details?: unknown) {
    super(message);
    this.name = "ApiError";
  }
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export async function apiClient<T>(path: string, options: RequestInit & { timeout?: number; token?: string } = {}): Promise<ApiResponse<T>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeout ?? 12_000);
  try {
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      signal: options.signal ?? controller.signal,
      headers: { "Content-Type": "application/json", ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}), ...options.headers },
    });
    if (!response.ok) {
      const details = await response.json().catch(() => null) as { error?: string } | null;
      throw new ApiError(details?.error ?? "La requête a échoué", response.status, details);
    }
    return { data: await response.json() as T, status: response.status, requestId: response.headers.get("x-request-id") ?? undefined };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") throw new ApiError("La requête a expiré ou a été annulée", 408);
    throw new ApiError("Impossible de joindre le service", 503, error);
  } finally {
    clearTimeout(timeout);
  }
}

export const simulate = <T>(data: T, delay = 350) => new Promise<T>((resolve) => setTimeout(() => resolve(data), delay));
