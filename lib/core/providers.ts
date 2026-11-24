import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { Outbox } from "./model";
import { AppError } from "./validation";
export interface Point {
    latitude: number;
    longitude: number;
}
export interface Geocoder {
    zip(zip: string): Promise<Point>;
    address(address: string): Promise<Point>;
}
export class MockGeocoder implements Geocoder {
    constructor(private fixtures: Readonly<Record<string, Point>> = { "100 Test Lane, Austin, TX 78701": { latitude: 30.271, longitude: -97.743 }, "200 Customer Lane, Austin, TX 78701": { latitude: 30.272, longitude: -97.742 }, "78701": { latitude: 30.271, longitude: -97.743 }, "60601": { latitude: 41.886, longitude: -87.622 }, "10001": { latitude: 40.75, longitude: -73.997 }, "94103": { latitude: 37.773, longitude: -122.411 } }) { }
    async zip(zip: string) {
        const point = this.fixtures[zip];
        if (!point)
            throw new AppError("This ZIP is not in the local geocoding fixtures. A real geocoder is not connected.", 422);
        return point;
    }
    async address(address: string) {
        const point = this.fixtures[address];
        if (!point)
            throw new AppError("Exact address eligibility cannot be verified with the current geocoding fixtures", 422);
        return point;
    }
}
export function distanceMiles(a: Point, b: Point): number {
    const rad = (n: number) => n * Math.PI / 180, dlat = rad(b.latitude - a.latitude), dlon = rad(b.longitude - a.longitude);
    const h = Math.sin(dlat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dlon / 2) ** 2;
    return 3958.7613 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}
export interface PaymentIntent {
    id: string;
    requestId: string;
    amountCents: number;
    currency: "USD";
    idempotencyKey: string;
}
export interface VerifiedPayment {
    eventId: string;
    intentId: string;
    paymentId: string;
    requestId: string;
    amountCents: number;
    currency: "USD";
}
export interface PaymentAdapter {
    create(input: Omit<PaymentIntent, "id">): Promise<PaymentIntent>;
    verify(payload: string, signature: string): VerifiedPayment;
}
/** Test adapter only. Signing material is never exposed to the browser. No financial operation. */
export class MockPaymentAdapter implements PaymentAdapter {
    constructor(private key: string) {
        if (key.length < 32)
            throw new Error("Mock signing key too short");
    }
    async create(input: Omit<PaymentIntent, "id">): Promise<PaymentIntent> { return { ...input, id: "mock_" + createHmac("sha256", this.key).update(input.idempotencyKey).digest("hex") }; }
    signed(event: VerifiedPayment) { const payload = JSON.stringify(event); return { payload, signature: createHmac("sha256", this.key).update(payload).digest("hex") }; }
    verify(payload: string, signature: string): VerifiedPayment {
        const expected = Buffer.from(createHmac("sha256", this.key).update(payload).digest("hex"), "hex"), received = Buffer.from(signature, "hex");
        if (received.length !== expected.length || !timingSafeEqual(received, expected))
            throw new AppError("Unverified payment event", 403);
        const event = JSON.parse(payload) as VerifiedPayment;
        if (typeof event.eventId !== "string" || event.eventId.length > 150 || typeof event.intentId !== "string" || !event.intentId || typeof event.paymentId !== "string" || !event.paymentId || typeof event.requestId !== "string" || !Number.isSafeInteger(event.amountCents) || event.amountCents < 0 || event.currency !== "USD")
            throw new AppError("Invalid payment event");
        return event;
    }
    event(intent: PaymentIntent) { return this.signed({ eventId: randomUUID(), intentId: intent.id, paymentId: "mock_charge_" + intent.id, requestId: intent.requestId, amountCents: intent.amountCents, currency: "USD" }); }
}
export interface NotificationTransport {
    send(item: Outbox): Promise<void>;
}
export class MockNotificationTransport implements NotificationTransport {
    readonly delivered = new Map<string, Outbox>();
    fail = false;
    async send(item: Outbox) {
        if (this.fail)
            throw new Error("Mock delivery unavailable");
        this.delivered.set(item.key, structuredClone(item));
    }
}
