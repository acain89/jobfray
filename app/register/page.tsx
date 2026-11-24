import { pageMetadata } from "@/lib/site";
export const metadata=pageMetadata("Create your free account","Secure business access for your free JobFray website.","/register");
import { AuthForm } from "@/components/core/AuthForm";
export default function Page(){return <AuthForm mode="register"/>;}
