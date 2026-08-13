import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { env } from "./env";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "request_failed",
  ) {
    super(message);
  }
}

export function jsonError(
  error: unknown,
  requestId: string = crypto.randomUUID(),
) {
  const status = error instanceof HttpError ? error.status : 500;
  const code = error instanceof HttpError ? error.code : "internal_error";
  const message =
    error instanceof HttpError ? error.message : "An unexpected error occurred";
  if (status >= 500)
    console.error(
      JSON.stringify({
        level: "error",
        requestId,
        message: error instanceof Error ? error.message : String(error),
      }),
    );
  return Response.json(
    { error: { code, message, requestId } },
    { status, headers: { "x-request-id": requestId } },
  );
}

function blockedV4(address: string) {
  const octets = address.split(".").map(Number);
  return (
    octets[0] === 10 ||
    octets[0] === 127 ||
    (octets[0] === 169 && octets[1] === 254) ||
    (octets[0] === 172 && (octets[1] ?? 0) >= 16 && (octets[1] ?? 0) <= 31) ||
    (octets[0] === 192 && octets[1] === 168) ||
    octets[0] === 0
  );
}

function blockedV6(address: string) {
  const normalized = address.toLowerCase();
  return (
    normalized === "::1" ||
    normalized === "::" ||
    normalized.startsWith("fe80:") ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd")
  );
}

export async function assertSafeOutboundUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new HttpError(400, "Enter a valid absolute URL", "invalid_url");
  }
  if (url.username || url.password)
    throw new HttpError(
      400,
      "Credentials in URLs are not allowed",
      "invalid_url",
    );
  if (
    url.protocol !== "https:" &&
    !(env().ALLOW_INSECURE_HTTP === "true" && url.protocol === "http:")
  ) {
    throw new HttpError(400, "HTTPS is required", "unsafe_url");
  }
  if (env().ALLOW_PRIVATE_EGRESS !== "true") {
    const addresses = isIP(url.hostname)
      ? [{ address: url.hostname }]
      : await lookup(url.hostname, { all: true });
    if (
      addresses.some(({ address }) =>
        isIP(address) === 4 ? blockedV4(address) : blockedV6(address),
      )
    ) {
      throw new HttpError(
        400,
        "Private, local, and metadata network destinations are blocked",
        "unsafe_url",
      );
    }
  }
  return url;
}

export async function safeFetch(
  raw: string,
  init: RequestInit = {},
  timeoutMs = 10_000,
): Promise<Response> {
  const url = await assertSafeOutboundUrl(raw);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      redirect: "error",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}
