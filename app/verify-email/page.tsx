import { pageMetadata } from "@/lib/site";
export const metadata=pageMetadata("Verify business email","Secure business access for your free JobFray website.","/verify-email");
import { AuthForm } from "@/components/core/AuthForm";
export default function Page(){return <AuthForm mode="verify-email"/>;}
