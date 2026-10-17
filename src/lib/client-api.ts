/**
 * Fetch helper for client components.
 *
 * Every route returns `{ data }` or `{ error: { message, details? } }`, so this
 * unwraps one shape and turns the other into a throwable that already carries a
 * message worth showing the user plus any per-field errors for forms.
 */

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public fieldErrors: Record<string, string[]> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** True when the session expired mid-interaction. */
  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  field(name: string): string | undefined {
    return this.fieldErrors[name]?.[0];
  }
}

type Envelope<T> = { data?: T; error?: { message?: string; details?: unknown } };

function toFieldErrors(details: unknown): Record<string, string[]> {
  if (!details || typeof details !== "object") return {};

  // Zod's flatten().fieldErrors: { field: string[] }
  if (!Array.isArray(details)) {
    const out: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(details as Record<string, unknown>)) {
      if (Array.isArray(value)) out[key] = value.filter((v): v is string => typeof v === "string");
      else if (typeof value === "string") out[key] = [value];
    }
    return out;
  }

  // Zod issues: [{ path, message }]
  const out: Record<string, string[]> = {};
  for (const issue of details as { path?: string; message?: string }[]) {
    const key = issue.path ?? "_";
    if (typeof issue.message !== "string") continue;
    out[key] = [...(out[key] ?? []), issue.message];
  }
  return out;
}

export type ApiOptions = Omit<RequestInit, "body"> & {
  /** Serialised as JSON. Do not combine with `form`. */
  body?: unknown;
  form?: FormData;
};

export async function apiFetch<T>(url: string, options: ApiOptions = {}): Promise<T> {
  const { body, form, headers, ...init } = options;

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      // The server checks Origin on every mutation; a same-origin fetch always sends it.
      credentials: "same-origin",
      headers: {
        ...(form ? {} : body !== undefined ? { "Content-Type": "application/json" } : {}),
        Accept: "application/json",
        ...headers,
      },
      body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
  } catch {
    throw new ApiError("Cannot reach the server. Check your connection and try again.", 0);
  }

  const text = await response.text();
  const parsed: Envelope<T> | null = text ? safeParse<Envelope<T>>(text) : null;

  if (!response.ok) {
    throw new ApiError(
      parsed?.error?.message ?? `Request failed (${response.status})`,
      response.status,
      toFieldErrors(parsed?.error?.details),
    );
  }

  if (!parsed || parsed.data === undefined) {
    throw new ApiError("The server sent an unexpected response.", 502);
  }

  return parsed.data;
}

function safeParse<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/** Human-readable form of an ApiError for inline display. */
export function describeError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong. Please try again.";
}
