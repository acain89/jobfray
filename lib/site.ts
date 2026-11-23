import type { Metadata } from "next";
const configured = process.env.JOBFRAY_PUBLIC_ORIGIN ?? "http://localhost:3000";
const origin = new URL(configured);
if (
  origin.username ||
  origin.password ||
  origin.search ||
  origin.hash ||
  origin.pathname !== "/" ||
  !["https:", "http:"].includes(origin.protocol) ||
  (origin.protocol !== "https:" &&
    !["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname))
) {
  throw new Error(
    "JOBFRAY_PUBLIC_ORIGIN must be an HTTPS origin, or local HTTP for development",
  );
}
export const siteOrigin = origin.origin;
export function pageMetadata(
  title: string,
  description: string,
  path: string,
): Metadata {
  return {
    title,
    description,
    alternates: { canonical: new URL(path, siteOrigin).toString() },
  };
}
