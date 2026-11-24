import { pageMetadata } from "@/lib/site";
export const metadata=pageMetadata("Business sign in","Secure business access for your free JobFray website.","/login");
import { AuthForm } from "@/components/core/AuthForm";
export default function Page(){return <AuthForm mode="login"/>;}
