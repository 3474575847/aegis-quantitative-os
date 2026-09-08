/**
 * Central API URL resolver.
 *
 * At build / dev time Next.js inlines NEXT_PUBLIC_API_URL from the environment.
 * When the variable is not set the application falls back to localhost:8000 so
 * that local development still works without any .env file.
 *
 * Usage:
 *   import { apiUrl } from "@/lib/api";
 *   const res = await fetch(apiUrl("/api/signals"));
 */

const BASE = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"
).replace(/\/$/, ""); // strip trailing slash if present

/**
 * Build an absolute API URL.
 * @param path  Must start with "/", e.g. "/api/signals"
 */
export function apiUrl(path: string): string {
  if (!path.startsWith("/")) {
    throw new Error(`apiUrl: path must start with "/" — got "${path}"`);
  }
  return `${BASE}${path}`;
}

/** The raw base URL without a trailing path, e.g. "http://localhost:8000" */
export const API_BASE = BASE;

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
