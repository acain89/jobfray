import { notFound } from "next/navigation";
// Fail closed until verified owner sessions and tenant-scoped readers exist.
export const dynamic = "force-dynamic";
export default function DashboardPage(): never {
  notFound();
}
