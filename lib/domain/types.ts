/** Validated domain contracts; adapters must never cast untrusted input into these. */
export type BusinessId = string & { readonly __businessId: unique symbol };
export type OwnerId = string & { readonly __ownerId: unique symbol };
export type OfferingId = string & { readonly __offeringId: unique symbol };
export type ResourceId = string & { readonly __resourceId: unique symbol };
export type LocalDate = string;
export type Instant = string;
export type BusinessMode = "RENTAL" | "SERVICE" | "QUOTE" | "RESERVATION";
export type ScheduledMode = Exclude<BusinessMode, "QUOTE">;
export type Fulfillment = "MOBILE" | "STOREFRONT";
export type PublicationStatus = "DRAFT" | "PUBLISHED" | "SUSPENDED";
export interface Business {
  readonly id: BusinessId;
  readonly name: string;
  readonly slug: string;
  readonly timeZone: string;
  readonly status: PublicationStatus;
  readonly enabledModes: readonly BusinessMode[];
}
export type OfferingPrice =
  | { readonly kind: "UNKNOWN" }
  | { readonly kind: "KNOWN"; readonly unitAmountCents: number;
      readonly basis: "FIXED" | "QUANTITY" | "QUANTITY_DURATION" };
export interface ServiceTiming {
  readonly durationMinutes: number;
  readonly bufferBeforeMinutes: number;
  readonly bufferAfterMinutes: number;
}
type ModeBase = {
  readonly fulfillments: readonly Fulfillment[];
  readonly price: OfferingPrice;
};
/** Null means unresolved, not a default. Scheduled requests must fail closed until configured. */
export type OfferingModeConfig = ModeBase & (
  | { readonly mode: "SERVICE"; readonly timing: ServiceTiming | null }
  | { readonly mode: "RENTAL"; readonly durationUnit: "HOUR" | "DAY" | null }
  | { readonly mode: "RESERVATION"; readonly capacityUnit: "PARTY" | "PERSON" | null }
  | { readonly mode: "QUOTE" }
);
export interface Offering {
  readonly id: OfferingId;
  readonly businessId: BusinessId;
  readonly name: string;
  readonly categoryId: string;
  readonly active: boolean;
  readonly configurations: readonly OfferingModeConfig[];
}
export interface Website {
  readonly businessId: BusinessId;
  readonly title: string;
  readonly introduction: string;
  readonly status: PublicationStatus;
}
export interface BusinessDomain {
  readonly businessId: BusinessId;
  readonly hostname: string;
  readonly kind: "SUBDOMAIN" | "CUSTOM";
  readonly verification: "PENDING" | "VERIFIED" | "DISABLED";
}
export interface DirectoryQuery {
  readonly location: string;
  readonly category: string;
  readonly mode: BusinessMode | "";
  readonly fulfillment: Fulfillment | "";
}
export interface DirectoryEntry {
  readonly business: Pick<Business, "id" | "name" | "slug">;
  readonly summary: string;
  readonly locationLabel: string;
  readonly categoryIds: readonly string[];
  readonly modes: readonly BusinessMode[];
  readonly fulfillments: readonly Fulfillment[];
}
export interface Resource {
  readonly id: ResourceId;
  readonly businessId: BusinessId;
  readonly name: string;
  readonly capacity: number;
  readonly timeZone: string;
}
export interface ResourceRequirement {
  readonly businessId: BusinessId;
  readonly offeringId: OfferingId;
  readonly mode: ScheduledMode;
  readonly resourceId: ResourceId;
  readonly unitsPerQuantity: number;
}
export interface AvailabilityRule {
  readonly businessId: BusinessId;
  readonly resourceId: ResourceId;
  readonly weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  readonly startMinute: number;
  readonly endMinute: number;
}
export interface AvailabilityException {
  readonly businessId: BusinessId;
  readonly resourceId: ResourceId;
  readonly date: LocalDate;
  readonly windows: readonly { readonly startMinute: number; readonly endMinute: number }[];
}
export interface SchedulingPolicy {
  readonly businessId: BusinessId;
  readonly offeringId: OfferingId;
  readonly mode: ScheduledMode;
  readonly horizonDays: number;
  readonly minimumLeadMinutes: number;
  readonly holdMinutes: number;
  readonly version: string;
}
export interface Allocation {
  readonly id: string;
  readonly businessId: BusinessId;
  readonly requestId: string;
  readonly resourceId: ResourceId;
  readonly startsAt: Instant;
  readonly endsAt: Instant;
  readonly units: number;
  readonly status: "HELD" | "CONFIRMED" | "RELEASED";
  readonly holdExpiresAt: Instant | null;
}
export type CustomerRequest = {
  readonly id: string;
  readonly businessId: BusinessId;
  readonly offeringId: OfferingId;
  readonly fulfillment: Fulfillment;
  readonly quantity: number;
} & (
  | { readonly mode: "QUOTE"; readonly status: "SUBMITTED" | "CLOSED"; readonly customerMessage: string }
  | { readonly mode: ScheduledMode; readonly status: "HELD" | "CONFIRMED" | "CANCELLED" | "EXPIRED";
      readonly startsAt: Instant; readonly endsAt: Instant; readonly timeZone: string;
      readonly holdExpiresAt: Instant | null }
);
export type FeeCents = 200 | 300 | 400 | 500;
export interface CheckoutSnapshot {
  readonly id: string;
  readonly businessId: BusinessId;
  readonly offeringId: OfferingId;
  readonly requestId: string;
  readonly mode: BusinessMode;
  readonly fulfillment: Fulfillment;
  readonly quantity: number;
  readonly durationUnits: number | null;
  readonly durationUnit: "HOUR" | "DAY" | null;
  readonly priceKind: "KNOWN" | "UNKNOWN";
  readonly priceBasis: "FIXED" | "QUANTITY" | "QUANTITY_DURATION" | null;
  readonly unitAmountCents: number | null;
  readonly underlyingSubtotalCents: number | null;
  readonly platformFeeCents: FeeCents;
  readonly pricingPolicyVersion: string;
  readonly currency: "USD";
  readonly recipient: "JOBFRAY";
  readonly processingCostPayer: "JOBFRAY";
  readonly createdAt: Instant;
}
export interface PlatformFeeOrder {
  readonly id: string;
  readonly businessId: BusinessId;
  readonly snapshot: CheckoutSnapshot;
  readonly state: "CREATED" | "PROCESSING" | "SUCCEEDED" | "FAILED" | "REFUNDED" | "DISPUTED";
  readonly idempotencyKey: string;
}
export interface OwnerNotification {
  readonly id: string;
  readonly businessId: BusinessId;
  readonly ownerId: OwnerId;
  readonly requestId: string;
  readonly kind: "REQUEST_SUBMITTED" | "REQUEST_CONFIRMED";
  readonly readAt: Instant | null;
}
