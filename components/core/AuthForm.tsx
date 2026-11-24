"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, appSession } from "./api";
export function AuthForm({ mode }: {
    mode: "login" | "register" | "recover" | "verify-email" | "reset-password";
}) {
    const router = useRouter();
    const [message, setMessage] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false), [sandbox, setSandbox] = useState(false), [token, setToken] = useState(""), [fromLink,setFromLink] = useState(false);
    useEffect(() => {
        const value = new URLSearchParams(window.location.hash.slice(1)).get("token");
        if (value)
            history.replaceState(null, "", window.location.pathname);
        void appSession().then(s => {
            setSandbox(s.sandbox);
            if (value) { setToken(value); setFromLink(true); }
        }).catch(() => { });
    }, []);
    const title = mode === "login" ? "Welcome back" : mode === "register" ? "Create your free business account" : mode === "recover" ? "Recover your password" : mode === "verify-email" ? "Verify your email" : "Choose a new password";
    return <section className="auth-panel"><p className="eyebrow">JobFray for businesses</p><h1>{title}</h1>
    <p>No banking information. No subscriptions or commissions.</p>
    <form className="stack" onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setError("");
            setMessage("");
            const f = new FormData(event.currentTarget);
            try {
                const result = await api<{
                    message?: string;
                }>(mode, { email: f.get("email"), password: f.get("password"), token });
                if (mode === "login")
                    router.push("/dashboard");
                else
                    setMessage(result.message ?? "Done.");
            }
            catch (e) {
                setError((e as Error).message);
            }
            finally {
                setBusy(false);
            }
        }}>
      {["login", "register", "recover"].includes(mode) && <label>Email<input name="email" type="email" autoComplete="email" required maxLength={254}/></label>}
      {["login", "register", "reset-password"].includes(mode) && <label>Password<input name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={mode === "login" ? 1 : 12} maxLength={128} required/><small>At least 12 characters for a new password.</small></label>}
      {["verify-email", "reset-password"].includes(mode) && !fromLink && <label>Verification token<input value={token} onChange={e => setToken(e.target.value)} autoComplete="off" required/></label>}
      <button className="button" disabled={busy}>{busy ? "Please wait..." : mode === "login" ? "Sign in" : mode === "register" ? "Create free account" : mode === "recover" ? "Send recovery instructions" : mode === "verify-email" ? "Verify email" : "Save new password"}</button>
      {error && <p role="alert" className="error-text">{error}</p>}{message && <p role="status">{message}</p>}
    </form>
    <div className="auth-links"><Link href="/login">Sign in</Link><Link href="/register">Register free</Link><Link href="/recover">Forgot password?</Link></div>
    {sandbox && <aside className="notice"><strong>Local sandbox</strong><p>Email delivery is mocked. Use synthetic details only.</p><Link href="/sandbox/inbox">Open local verification inbox</Link></aside>}
  </section>;
}
