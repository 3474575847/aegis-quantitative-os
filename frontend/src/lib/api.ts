/**
 * Central API URL resolver.
 *
 * In the browser and production environments, API endpoints are served
 * co-located with the Next.js full-stack server on port 3000.
 * Relative paths (e.g. "/api/...") allow the browser to automatically query
 * the current origin without CORS or unreachable localhost port failures.
 *
 * Usage:
 *   import { apiUrl } from "@/lib/api";
 *   const res = await fetch(apiUrl("/api/signals"));
 */

function resolveBaseUrl(): string {
  // On server-side SSR, if an internal API URL is provided, use it
  const envUrl = (process.env.NEXT_PUBLIC_API_URL || "").trim().replace(/\/$/, "");
  // Ignore localhost:8000 or internal daemon ports as all APIs are served by Next.js on port 3000
  if (!envUrl || envUrl.includes(":8000") || envUrl.includes("localhost:8000") || envUrl.includes("127.0.0.1:8000")) {
    return "";
  }
  return envUrl;
}

const BASE = resolveBaseUrl();

/**
 * Build an absolute or relative API URL.
 * @param path  Must start with "/", e.g. "/api/signals"
 */
export function apiUrl(path: string): string {
  if (!path.startsWith("/")) {
    throw new Error(`apiUrl: path must start with "/" — got "${path}"`);
  }

  // In the browser, ALWAYS use relative path so requests always hit the Next.js API routes on the current origin
  if (typeof window !== "undefined") {
    return path;
  }

  // On the server side (SSR / Node.js)
  if (BASE) {
    return `${BASE}${path}`;
  }

  return path;
}

/** The raw base URL without a trailing path */
export const API_BASE = BASE || "localhost:3000";

const NUMBER_FORMATTER = new Intl.NumberFormat(undefined, {
  maximumSignificantDigits: 2,
});

export function formatFigure(value: number, significantDigits = 2): string {
  if (significantDigits === 2) return NUMBER_FORMATTER.format(value);
  return new Intl.NumberFormat(undefined, {
    maximumSignificantDigits: significantDigits,
  }).format(value);
}

export function formatSignedFigure(value: number): string {
  return value > 0 ? `+${formatFigure(value)}` : formatFigure(value);
}

export function formatPercent(value: number): string {
  return `${formatFigure(value * 100)}%`;
}
