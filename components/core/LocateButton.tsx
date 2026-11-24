"use client";
import { useState } from "react";
export function LocateButton() {
    const [message, setMessage] = useState("");
    return <div><button type="button" onClick={() => {
            if (!navigator.geolocation) {
                setMessage("Location is not supported; enter a ZIP code.");
                return;
            }
            setMessage("Requesting your permission...");
            navigator.geolocation.getCurrentPosition(position => { const url = new URL(window.location.href); url.searchParams.set("lat", String(position.coords.latitude)); url.searchParams.set("lon", String(position.coords.longitude)); window.location.assign(url.pathname + url.search); }, () => setMessage("Location was not shared. You can search using a ZIP code."), { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
        }}>Use my location</button><p role="status">{message}</p></div>;
}
