import type { Geocoder, Point } from "../core/providers";
import { AppError } from "../core/validation";
import { request, object, networkTransport, type Transport } from "./http";
export class MapboxAdapter implements Geocoder {
    private cache = new Map<string, {
        point: Point;
        expires: number;
    }>();
    constructor(private token: string, private permanent: boolean, private country = "us", private transport: Transport = networkTransport) { if (!permanent)
        throw new Error("Persisted locations require Mapbox permanent geocoding entitlement"); }
    private async lookup(query: string, type: "postcode" | "address") {
        const key = type + ":" + query, hit = this.cache.get(key);
        if (hit && hit.expires > Date.now())
            return hit.point;
        const params = new URLSearchParams({ q: query, types: type, country: this.country, autocomplete: "false", limit: "2", permanent: "true", access_token: this.token });
        const data = object(await request(this.transport, "https://api.mapbox.com/search/geocode/v6/forward?" + params, { method: "GET" }));
        if (!Array.isArray(data.features) || data.features.length !== 1)
            throw new AppError("Location is ambiguous or unavailable", 422);
        const feature = object(data.features[0]), properties = object(feature.properties), geometry = object(feature.geometry), coordinates = geometry.coordinates;
        if (properties.feature_type !== type || !Array.isArray(coordinates) || coordinates.length !== 2 || !coordinates.every(v => typeof v === "number" && Number.isFinite(v)) || Math.abs(coordinates[0]) > 180 || Math.abs(coordinates[1]) > 90)
            throw new AppError("Invalid geocoding result", 422);
        if (type === "address") {
            const match = object(properties.match_code);
            if (!["exact", "high"].includes(String(match.confidence)) || object(properties.coordinates).accuracy === "approximate")
                throw new AppError("Exact address could not be verified", 422);
        }
        const point = { latitude: coordinates[1] as number, longitude: coordinates[0] as number };
        // Only permanently licensed, non-customer ZIP results are cached.
        if (type === "postcode") {
            if (this.cache.size >= 256)
                this.cache.delete(this.cache.keys().next().value!);
            this.cache.set(key, { point, expires: Date.now() + 86400000 });
        }
        return point;
    }
    async zip(zip: string) { if (!/^\d{5}$/.test(zip))
        throw new AppError("Enter a ZIP code"); return this.lookup(zip, "postcode"); }
    async address(address: string) { if (address.length < 8 || address.length > 250 || /https?:\/\//i.test(address))
        throw new AppError("Enter a service address"); return this.lookup(address, "address"); }
}
