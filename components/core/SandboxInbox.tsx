"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { query } from "@/components/core/api";
import type { Outbox } from "@/lib/core/model";
export default function SandboxInbox(){const [items,setItems]=useState<Outbox[]>([]),[error,setError]=useState("");useEffect(()=>{void query<{items:Outbox[]}>("sandbox-inbox").then(v=>setItems(v.items)).catch(e=>setError(e.message));},[]);
  return <section><h1>Local sandbox inbox</h1><p>Mock delivery for local synthetic testing only. This page is unavailable outside the explicitly enabled loopback sandbox.</p>{error&&<p role="alert">{error}</p>}<Link href="/dashboard">Back to dashboard</Link><div className="request-list">{[...items].reverse().map(item=><article className="card" key={item.id}><h2>{item.kind}</h2><p>{item.destination}</p>{["VERIFY_EMAIL","RESET_PASSWORD"].includes(item.kind)?<Link href={`/${item.kind==="VERIFY_EMAIL"?"verify-email":"reset-password"}#token=${item.body}`}>Open secure verification flow</Link>:item.kind==="CUSTOMER_CONFIRMATION"?<Link href={item.body}>Open protected confirmation</Link>:<pre className="wrap">{item.body}</pre>}</article>)}</div></section>;
}
