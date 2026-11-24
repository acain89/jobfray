"use client";
import { useState } from "react";
import { api } from "./api";
export function PushControls({ businessId, publicKey }: {
    businessId: string;
    publicKey: string;
}) {
    const [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
    const change = async (enable: boolean) => {
        if (busy)
            return;
        setBusy(true);
        try {
            if (!("serviceWorker" in navigator) || !("PushManager" in window))
                throw new Error("Push is unavailable in this browser.");
            const registration = await navigator.serviceWorker.register("/jobfray-sw.js", { scope: "/" });
            if (enable) {
                if (await Notification.requestPermission() !== "granted")
                    throw new Error("Notification permission was not granted.");
                let subscription = await registration.pushManager.getSubscription();
                if (!subscription) {
                    const raw = atob(publicKey.replace(/-/g, "+").replace(/_/g, "/"));
                    const key = Uint8Array.from(raw, c => c.charCodeAt(0));
                    subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
                }
                await api("push-subscribe", { businessId, subscription: subscription.toJSON() });
                setMessage("Notifications enabled on this device.");
            }
            else {
                await api("push-unsubscribe");
                await (await registration.pushManager.getSubscription())?.unsubscribe();
                setMessage("Notifications disabled on this device.");
            }
        }
        catch (error) {
            setMessage((error as Error).message);
        }
        finally {
            setBusy(false);
        }
    };
    if (!publicKey)
        return <p>Optional device notifications are not configured. Email remains enabled.</p>;
    return <div className="stack"><button type="button" disabled={busy} onClick={() => void change(true)}>Enable notifications on this device</button><button type="button" disabled={busy} onClick={() => void change(false)}>Disable notifications on this device</button><p role="status">{message}</p></div>;
}
