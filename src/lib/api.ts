import { NextResponse } from "next/server";
import { ZodError } from "zod";

/**
 * Every route handler returns one of two shapes so the client only needs a
 * single parsing path: `{ data }` on success, `{ error }` on failure.
 */

export function apiOk<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ data }, { status });
}

export function apiError(
  message: string,
  status = 400,
  details?: unknown,
): NextResponse {
  return NextResponse.json(
    { error: { message, ...(details !== undefined ? { details } : {}) } },
    { status },
  );
}

export function apiNotFound(what = "Resource"): NextResponse {
  return apiError(`${what} not found`, 404);
}

export function apiUnauthorized(): NextResponse {
  return apiError("You must be signed in", 401);
}

export function apiForbidden(): NextResponse {
  return apiError("You do not have access to this resource", 403);
}

/**
 * Maps thrown values to a sane HTTP response. Unexpected errors are logged
 * server-side but only a generic message reaches the client.
 */
export function handleApiError(error: unknown): NextResponse {
  if (error instanceof ZodError) {
    return apiError(
      "Invalid input",
      422,
      error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    );
  }

  if (error instanceof ApiRequestError) {
    return apiError(error.message, error.status, error.details);
  }

  if (error instanceof Error && error.name === "PayloadTooLargeError") {
    return apiError("The uploaded file is too large", 413);
  }

  console.error("[api] unhandled error:", error);
  return apiError("Something went wrong on our end. Please try again.", 500);
}

/** Throw from inside a handler to produce a specific HTTP status. */
export class ApiRequestError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export async function readJson<T>(request: Request, maxBytes?: number): Promise<T> {
  if (maxBytes !== undefined) {
    const text = await readLimitedBody(request, maxBytes);
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new ApiRequestError(400, "Request body must be valid JSON");
    }
  }

  try {
    return (await request.json()) as T;
  } catch {
    throw new ApiRequestError(400, "Request body must be valid JSON");
  }
}

const textDecoder = new TextDecoder();

/**
 * Read a request body as UTF-8 text, refusing more than `maxBytes`.
 *
 * `Content-Length` is consulted first only as a cheap fast-reject — it may be
 * missing, stale or dishonest, so it is never trusted. The authoritative bound
 * is enforced while consuming the stream: the moment the running total exceeds
 * `maxBytes` the reader is cancelled and a 413 is thrown, so an oversized body
 * is never buffered in full. Callers that do not pass a limit keep the exact
 * previous `request.json()` path.
 */
async function readLimitedBody(request: Request, maxBytes: number): Promise<string> {
  const declared = request.headers.get("content-length");
  if (declared !== null) {
    const length = Number(declared);
    if (Number.isFinite(length) && length > maxBytes) {
      throw new ApiRequestError(413, "Request body is too large");
    }
  }

  const body = request.body;
  if (!body) return "";

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new ApiRequestError(413, "Request body is too large");
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return textDecoder.decode(bytes);
}

/** Parses JSON against a schema, throwing a 422-shaped error on failure. */
export async function parseJsonBody<S extends { parse(data: unknown): unknown }>(
  request: Request,
  schema: S,
  maxBytes?: number,
): Promise<ReturnType<S["parse"]>> {
  const raw = await readJson<unknown>(request, maxBytes);
  return schema.parse(raw) as ReturnType<S["parse"]>;
}
