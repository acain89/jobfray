import type { Geocoder, Point } from "../core/providers";
import { AppError } from "../core/validation";
import { request, object, networkTransport, type Transport } from "./http";

/** US-only forward geocoding. Never cache private addresses or retain provider payloads. */
export class GeocodioAdapter implements Geocoder {
    private cache = new Map<string, { point: Point; expires: number }>();

    constructor(
        private apiKey: string,
        private transport: Transport = networkTransport,
        private clock: () => number = Date.now,
    ) {
        if (!apiKey || apiKey.includes("PLACEHOLDER") || /[\r\n]/.test(apiKey))
            throw new Error("Geocodio server API key required");
    }

    private async lookup(query: string, kind: "zip" | "address"): Promise<Point> {
        const hit = kind === "zip" ? this.cache.get(query) : undefined;
        if (hit && hit.expires > this.clock()) return { ...hit.point };
        const params = new URLSearchParams({ country: "USA", limit: "2" });
        params.set(kind === "zip" ? "postal_code" : "q", query);
        const data = object(await request(this.transport,
            "https://api.geocod.io/v2.1/geocode?" + params,
            { method: "GET", headers: { Authorization: "Bearer " + this.apiKey, Accept: "application/json" } }));
        if (!Array.isArray(data.results) || data.results.length !== 1)
            throw new AppError("Location is ambiguous or unavailable", 422);
        const result = object(data.results[0]), components = object(result.address_components);
        const location = object(result.location);
        if (components.country !== "US" || typeof location.lat !== "number" || typeof location.lng !== "number" ||
            !Number.isFinite(location.lat) || !Number.isFinite(location.lng) ||
            Math.abs(location.lat) > 90 || Math.abs(location.lng) > 180)
            throw new AppError("Invalid geocoding result", 422);
        if (typeof result.accuracy !== "number" || !Number.isFinite(result.accuracy) || result.accuracy < 0.9 || result.accuracy > 1)
            throw new AppError("Location could not be verified", 422);
        if (kind === "zip") {
            if (components.postal_code !== query || result.accuracy_type !== "place")
                throw new AppError("ZIP location could not be verified", 422);
        } else if (!["rooftop", "point", "range_interpolation"].includes(String(result.accuracy_type)) ||
            typeof components.number !== "string" || !components.number ||
            typeof components.street !== "string" || !components.street) {
            throw new AppError("Exact address could not be verified", 422);
        }
        const point = { latitude: location.lat, longitude: location.lng };
        if (kind === "zip") {
            if (this.cache.size >= 256) this.cache.delete(this.cache.keys().next().value!);
            this.cache.set(query, { point: { ...point }, expires: this.clock() + 86400000 });
        }
        return point;
    }

    async zip(zip: string): Promise<Point> {
        if (zip.length !== 5 || !/^\d{5}$/.test(zip)) throw new AppError("Enter a ZIP code");
        return this.lookup(zip, "zip");
    }

    async address(address: string): Promise<Point> {
        if (address.length < 8 || address.length > 250 || /https?:\/\/|[\r\n\0]/i.test(address))
            throw new AppError("Enter a service address");
        return this.lookup(address, "address");
    }
}
