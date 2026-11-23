import type { MetadataRoute } from "next";
// Deliberate foundation exclusion; review before a separately approved launch.
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", disallow: "/" }] };
}
