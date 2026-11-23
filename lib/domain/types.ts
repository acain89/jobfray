/** Domain contracts only. No database or provider adapters are wired. */
export type BusinessId = string & { readonly __businessId: unique symbol };
export type OwnerId = string & { readonly __ownerId: unique symbol };
export type ServiceId = string & { readonly __serviceId: unique symbol };
export type LocalDate = string; // YYYY-MM-DD in the business IANA time zone.
export type Instant = string; // ISO 8601 UTC; validate at the eventual API boundary.
export type ServiceMode = "AT_CUSTOMER" | "AT_BUSINESS" | "REMOTE";
export type PublicationStatus = "DRAFT" | "PUBLISHED" | "SUSPENDED";
export interface Business {
  readonly id: BusinessId;
  readonly name: string;
  readonly slug: string;
  readonly timeZone: string;
  readonly status: PublicationStatus;
}
export interface Service {
  readonly id: ServiceId;
  readonly businessId: BusinessId;
  readonly name: string;
  readonly categoryId: string;
  readonly mode: ServiceMode;
  readonly durationMinutes: number;
  readonly bufferBeforeMinutes: number;
  readonly bufferAfterMinutes: number;
  readonly concurrentCapacity: number;
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
  readonly mode: ServiceMode | "";
}
export interface DirectoryEntry {
  readonly business: Pick<Business, "id" | "name" | "slug">;
  readonly summary: string;
  readonly locationLabel: string;
  readonly categoryIds: readonly string[];
  readonly modes: readonly ServiceMode[];
}
export interface AvailabilityRule {
  readonly businessId: BusinessId;
  readonly serviceId: ServiceId;
  readonly weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  readonly startMinute: number;
  readonly endMinute: number;
}
export interface AvailabilityException {
  readonly businessId: BusinessId;
  readonly serviceId: ServiceId;
  readonly date: LocalDate;
  readonly windows: readonly {
    readonly startMinute: number;
    readonly endMinute: number;
  }[];
  // Empty windows close the day; nonempty windows replace the normal day.
}
export interface Booking {
  readonly id: string;
  readonly businessId: BusinessId;
  readonly serviceId: ServiceId;
  readonly startsAt: Instant;
  readonly endsAt: Instant;
  readonly timeZone: string;
  readonly status: "HELD" | "CONFIRMED" | "CANCELLED" | "EXPIRED";
  readonly holdExpiresAt: Instant | null;
}
export interface QuoteRequest {
  readonly id: string;
  readonly businessId: BusinessId;
  readonly serviceId: ServiceId;
  readonly status: "AWAITING_PAYMENT" | "SUBMITTED" | "CLOSED";
  readonly customerMessage: string;
}
export type FeePurpose = "QUOTE_REQUEST" | "CONFIRMED_APPOINTMENT";
export type PlatformFeeOrder = {
  readonly id: string;
  readonly businessId: BusinessId;
  readonly requestId: string;
  readonly currency: "USD";
  readonly recipient: "JOBFRAY";
  readonly state:
    | "CREATED"
    | "PROCESSING"
    | "SUCCEEDED"
    | "FAILED"
    | "REFUNDED"
    | "DISPUTED";
  readonly idempotencyKey: string;
} & (
  | { readonly purpose: "QUOTE_REQUEST"; readonly amountCents: 300 }
  | { readonly purpose: "CONFIRMED_APPOINTMENT"; readonly amountCents: 500 }
);
export interface Job {
  readonly id: string;
  readonly businessId: BusinessId;
  readonly source: {
    readonly kind: "QUOTE_REQUEST" | "BOOKING";
    readonly id: string;
  };
  readonly status: "OPEN" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
}
export interface OwnerNotification {
  readonly id: string;
  readonly businessId: BusinessId;
  readonly ownerId: OwnerId;
  readonly kind: "QUOTE_SUBMITTED" | "BOOKING_CONFIRMED";
  readonly readAt: Instant | null;
}
