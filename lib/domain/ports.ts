import type { TenantScope, VerifiedOwnerSession } from "./access";
import type { Allocation, BusinessDomain, BusinessId, CustomerRequest, DirectoryEntry, DirectoryQuery,
  Offering, OfferingId, OwnerNotification, PlatformFeeOrder, ResourceId, ScheduledMode, Website } from "./types";
export interface SessionReader { verifiedOwnerSession(): Promise<VerifiedOwnerSession | null> }
export interface OwnerWorkspaceReader {
  website(scope: TenantScope): Promise<Website | null>;
  offerings(scope: TenantScope): Promise<readonly Offering[]>;
  requests(scope: TenantScope): Promise<readonly CustomerRequest[]>;
  notifications(scope: TenantScope): Promise<readonly OwnerNotification[]>;
}
export interface DirectoryReader {
  // Mode and fulfillment must match the SAME active, published offering configuration.
  searchPublished(query: DirectoryQuery, cursor?: string): Promise<{
    readonly entries: readonly DirectoryEntry[]; readonly nextCursor: string | null;
  }>;
}
export interface VerifiedDomainReader {
  findPublishedWebsite(hostname: string): Promise<{ readonly domain: BusinessDomain; readonly website: Website } | null>;
}
export interface PublicAvailabilityReader {
  // Server resolves published business/offering. Return no allocations, owner IDs or customer data.
  // QUOTE deliberately excluded. Range/quantity semantics require approved mode policy.
  available(input: { readonly businessId: BusinessId; readonly offeringId: OfferingId;
    readonly mode: ScheduledMode; readonly startsAt: string; readonly endsAt: string;
    readonly quantity: number }): Promise<boolean>;
}
export interface AllocationStore {
  /** One atomic operation: authenticate scope; verify enabled mode, offering/resource ownership,
   * approved scheduling/fulfillment policy and opening windows; lock ALL required resource IDs in
   * stable order; expire holds; read overlaps across all offerings; check capacity; write allocations
   * and request together. Same scoped key + same payload returns original result; different payload
   * conflicts. Confirmation/cancellation/rescheduling must use the same locking discipline.
   */
  hold(scope: TenantScope, input: { readonly requestId: string; readonly offeringId: OfferingId;
    readonly mode: ScheduledMode; readonly resourceIds: readonly ResourceId[];
    readonly startsAt: string; readonly endsAt: string; readonly quantity: number;
    readonly idempotencyKey: string }): Promise<readonly Allocation[]>;
}
export interface PlatformFeeReader {
  // Historical reads return the persisted snapshot verbatim, never call the fee calculator.
  find(scope: TenantScope, orderId: string): Promise<PlatformFeeOrder | null>;
}
