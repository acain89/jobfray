import type { TenantScope, VerifiedOwnerSession } from "./access";
import type {
  Booking,
  BusinessDomain,
  Job,
  DirectoryEntry,
  DirectoryQuery,
  FeePurpose,
  OwnerNotification,
  PlatformFeeOrder,
  QuoteRequest,
  ServiceId,
  Website,
} from "./types";
/** No implementations or write endpoints in this foundation. */
export interface SessionReader {
  verifiedOwnerSession(): Promise<VerifiedOwnerSession | null>;
}
export interface OwnerWorkspaceReader {
  website(scope: TenantScope): Promise<Website | null>;
  quoteRequests(scope: TenantScope): Promise<readonly QuoteRequest[]>;
  bookings(scope: TenantScope): Promise<readonly Booking[]>;
  jobs(scope: TenantScope): Promise<readonly Job[]>;
  notifications(scope: TenantScope): Promise<readonly OwnerNotification[]>;
}
export interface DirectoryReader {
  searchPublished(
    query: DirectoryQuery,
    cursor?: string,
  ): Promise<{
    readonly entries: readonly DirectoryEntry[];
    readonly nextCursor: string | null;
  }>;
}
export interface VerifiedDomainReader {
  // Look up an exact normalized host, require verified ownership. No forwarded-host trust.
  findPublishedWebsite(
    hostname: string,
  ): Promise<{
    readonly domain: BusinessDomain;
    readonly website: Website;
  } | null>;
}
export interface AvailabilityReader {
  // Compute 14 local dates [today, today + 14), then convert to UTC, handling DST.
  slots(
    scope: TenantScope,
    serviceId: ServiceId,
    now: Date,
  ): Promise<readonly { readonly startsAt: string; readonly endsAt: string }[]>;
}
export interface PlatformFeeReader {
  find(scope: TenantScope, orderId: string): Promise<PlatformFeeOrder | null>;
  price(purpose: FeePurpose): 300 | 500;
  // JobFray is the sole recipient. No connected-account or transfer destination.
}
