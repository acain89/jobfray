import { pageMetadata } from "@/lib/site";
export const metadata=pageMetadata("Password recovery","Secure business access for your free JobFray website.","/recover");
import { AuthForm } from "@/components/core/AuthForm";
export default function Page(){return <AuthForm mode="recover"/>;}
