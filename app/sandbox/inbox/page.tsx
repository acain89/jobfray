import {notFound} from "next/navigation";
import {sandboxEnabled} from "@/lib/core/runtime";
import SandboxInbox from "@/components/core/SandboxInbox";
export const dynamic="force-dynamic";
export default function SandboxInboxPage(){if(!sandboxEnabled())notFound();return <SandboxInbox/>;}
