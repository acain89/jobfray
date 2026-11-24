import { pageMetadata } from "@/lib/site";
export const metadata=pageMetadata("Reset business password","Secure business access for your free JobFray website.","/reset-password");
import { AuthForm } from "@/components/core/AuthForm";
export default function Page(){return <AuthForm mode="reset-password"/>;}
