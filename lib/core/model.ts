import type { BusinessMode, Fulfillment, CheckoutSnapshot } from "../domain/types";
export type { BusinessMode, Fulfillment };
export interface Account {
    id: string;
    email: string;
    passwordHash: string;
    verifiedAt: string | null;
    createdAt: string;
}
export interface Session {
    id: string;
    accountId: string;
    tokenHash: string;
    csrf: string;
    expiresAt: string;
}
export interface Token {
    id: string;
    hash: string;
    purpose: "VERIFY_EMAIL" | "RESET_PASSWORD" | "REQUEST_CAPABILITY";
    subject: string;
    expiresAt: string;
    attempts: number;
    usedAt: string | null;
    context: string;
}
export interface Theme {
    page: number;
    components: number;
    trim: number;
    button: "ROUND" | "SOFT" | "SQUARE";
    letters: number;
}
export interface WebsiteContent {
    headline: string;
    description: string;
    gallery: string[];
    testimonials: {
        name: string;
        text: string;
        genuine: boolean;
    }[];
    theme: Theme;
}
export interface Business {
    id: string;
    ownerId: string;
    slug: string;
    name: string;
    category: string;
    description: string;
    email: string;
    phone: string;
    address: string;
    addressPublic: boolean;
    city: string;
    zip: string;
    latitude: number;
    longitude: number;
    discoveryPoint?: {
        latitude: number;
        longitude: number;
    };
    timeZone: string;
    modes: BusinessMode[];
    directory: boolean;
    status: "DRAFT" | "PUBLISHED" | "SUSPENDED";
    revision: number;
    draft: WebsiteContent;
    published: WebsiteContent | null;
    pushEnabled: boolean;
    suspensionReason: string | null;
}
export interface Window {
    start: number;
    end: number;
}
export interface Hours {
    weekly: Record<string, Window[]>;
    exceptions: Record<string, Window[]>;
    blocked: {
        start: string;
        end: string;
    }[];
}
export interface Resource {
    id: string;
    businessId: string;
    name: string;
    capacity: number;
    hours: Hours;
}
export type Price = {
    kind: "VARIABLE";
} | {
    kind: "FIXED" | "STARTING" | "PER_PERSON" | "PER_NIGHT" | "HOURLY" | "DAILY" | "FREE";
    cents: number;
};
interface ConfigBase {
    fulfillments: Fulfillment[];
    radiusMiles: number;
    price: Price;
}
export type ModeConfig = ConfigBase & ({
    mode: "QUOTE";
} | {
    mode: "SERVICE";
    durationMinutes: number;
    bufferBefore: number;
    bufferAfter: number;
    noticeMinutes: number;
} | {
    mode: "RENTAL";
    minimumUnits: number;
    turnaroundMinutes: number;
    noticeMinutes: number;
} | {
    mode: "RESERVATION";
    capacityUnit: "SPACE" | "PERSON";
    interval: "SLOT" | "MULTIDAY";
    slotMinutes: number;
    minimumParty: number;
    maximumParty: number;
    noticeMinutes: number;
    arrivalInstructions: string;
});
export interface Offering {
    id: string;
    businessId: string;
    name: string;
    description: string;
    photos: string[];
    active: boolean;
    resourceId: string | null;
    configurations: ModeConfig[];
}
export interface Contact {
    name: string;
    phone: string;
    address: string;
    notes: string;
}
export interface Selection {
    businessId: string;
    offeringId: string;
    mode: BusinessMode;
    fulfillment: Fulfillment;
    quantity: number;
    partySize: number;
    startLocal: string;
    endLocal: string;
    ambiguity: "REJECT" | "EARLIER" | "LATER";
    endAmbiguity?: "REJECT" | "EARLIER" | "LATER";
    contact: Contact;
    photos: string[];
}
export type RequestStatus = "PENDING_PAYMENT" | "CONFIRMED" | "DELIVERED" | "EXPIRED" | "RELEASED" | "REFUND_REQUIRED";
export interface RequestRecord {
    browserHash?: string;
    id: string;
    businessId: string;
    offeringId: string;
    mode: BusinessMode;
    fulfillment: Fulfillment;
    idempotencyKey: string;
    payloadHash: string;
    paymentIntentId: string | null;
    settledPaymentId?: string;
    status: RequestStatus;
    payment: "CREATED" | "SUCCEEDED" | "REFUND_REQUIRED" | "REFUNDED";
    start: string | null;
    end: string | null;
    expiresAt: string;
    contact: Contact;
    photos: string[];
    confirmationHash: string;
    confirmationKeyVersion?: string;
    reference: string;
    offeringName: string;
    businessName: string;
    businessPhone: string;
    businessEmail: string;
    businessAddress: string;
    timeZone: string;
    instructions: string;
    createdAt: string;
    confirmedAt: string | null;
    priceLabel: string;
    refundReason: string | null;
}
export interface Allocation {
    id: string;
    businessId: string;
    requestId: string;
    resourceId: string;
    start: string;
    end: string;
    units: number;
    status: "HELD" | "CONFIRMED" | "RELEASED";
    expiresAt: string | null;
}
export interface Snapshot extends Omit<CheckoutSnapshot, "businessId" | "offeringId"> {
    businessId: string;
    offeringId: string;
    partySize: number;
    priceLabel: string;
    policyDisclosureVersion: string;
    customerPhone?: string;
}
export interface PaymentEvent {
    id: string;
    businessId: string;
    requestId: string;
    amountCents: number;
    currency: "USD";
    providerId: string;
    processedAt: string;
}
export interface Outbox {
    id: string;
    businessId: string | null;
    destination: string;
    channel: "EMAIL" | "PUSH";
    kind: string;
    body: string;
    key: string;
    state: "PENDING" | "SENDING" | "SENT";
    attempts: number;
    availableAt: string;
    leaseUntil: string | null;
    leaseToken?: string;
}
export interface Media {
    id: string;
    businessId: string;
    ownerId: string | null;
    capabilityHash: string | null;
    kind: "BUSINESS" | "QUOTE";
    bytes: string;
    storage?: import("../integrations/cloudinary").Asset;
    contentType: "image/webp";
    createdAt: string;
    expiresAt: string | null;
}
export interface Audit {
    id: string;
    businessId: string | null;
    requestId: string | null;
    action: string;
    at: string;
    actor: string;
}
export interface Refund {
    id: string;
    businessId: string;
    requestId: string;
    paymentId: string;
    reason: string;
    state: "REQUIRED" | "SIMULATED_REFUNDED" | "PROCESSING" | "REFUNDED" | "FAILED";
    providerId?: string;
    amountCents?: number;
    providerStatus?: string;
    createdAt: string;
    resolvedAt: string | null;
}
export interface RateBucket {
    id: string;
    count: number;
    expiresAt: string;
}
export interface Operation {
    id: string;
    businessId: string | null;
    kind: string;
    state: "PENDING" | "RUNNING" | "DONE" | "FAILED";
    availableAt: string;
    attempts: number;
    leaseUntil: string | null;
    leaseToken?: string;
    payload: Record<string, unknown>;
}
export interface PushDevice {
    id: string;
    businessId: string;
    accountId: string;
    sessionHash: string;
    endpointHash: string;
    active: boolean;
    endpoint: string;
    keys: {
        p256dh: string;
        auth: string;
    };
    createdAt: string;
}
export interface Tables {
    operations: Operation;
    push: PushDevice;
    accounts: Account;
    sessions: Session;
    tokens: Token;
    businesses: Business;
    offerings: Offering;
    resources: Resource;
    requests: RequestRecord;
    allocations: Allocation;
    snapshots: Snapshot;
    events: PaymentEvent;
    outbox: Outbox;
    media: Media;
    audits: Audit;
    refunds: Refund;
    rates: RateBucket;
}
export type Table = keyof Tables;
export interface Scope {
    accountId: string;
    businessId: string;
}
export const EMPTY_CONTENT: WebsiteContent = { headline: "", description: "", gallery: [], testimonials: [], theme: { page: 0, components: 0, trim: 0, button: "SOFT", letters: 0 } };
export const DISCLOSURE = "JF collects only its platform fee for request delivery or booking facilitation. Pay the business directly for the underlying offering. Once JF fulfills its obligation, cancellations, no-shows, business nonresponse or independent business nonperformance do not automatically refund the fee. Duplicate charges, JF failures and legally or provider-required refunds remain eligible for remediation. Contact the business directly for changes.";
