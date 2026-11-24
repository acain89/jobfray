import type {MetadataRoute} from "next";
import {publicIndexing} from "@/lib/site";
export default function robots():MetadataRoute.Robots{return {rules:[{userAgent:"*",...(publicIndexing?{allow:"/",disallow:["/api/","/dashboard","/admin","/confirmation","/request/","/sandbox/","/login","/register","/recover","/reset-password","/verify-email"]}:{disallow:"/"})}]};}
