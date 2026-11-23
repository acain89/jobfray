import { notFound } from "next/navigation";
// No synthetic tenants and no host/query-selected private business data.
// Resolve only published, verified tenant sites when the read adapter is approved.
export const dynamic = "force-dynamic";
export default function BusinessSitePage(): never {
  notFound();
}
