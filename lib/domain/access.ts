import type { BusinessId, OwnerId } from "./types";
export interface VerifiedOwnerSession {
  readonly ownerId: OwnerId;
  readonly expiresAt: Date;
}
export interface OwnerMembership {
  readonly businessId: BusinessId;
  readonly ownerId: OwnerId;
  readonly active: boolean;
}
export interface TenantScope {
  readonly businessId: BusinessId;
  readonly ownerId: OwnerId;
}
/** Input session must come from a server-verified session adapter, never request JSON. */
export function requireTenantScope(
  session: VerifiedOwnerSession | null,
  membership: OwnerMembership | null,
  requestedBusiness: BusinessId,
  now: Date,
): TenantScope {
  if (
    !session ||
    !Number.isFinite(session.expiresAt.getTime()) ||
    !Number.isFinite(now.getTime()) ||
    session.expiresAt <= now ||
    !membership?.active ||
    membership.ownerId !== session.ownerId ||
    membership.businessId !== requestedBusiness
  ) {
    throw new Error("Business access denied");
  }
  return Object.freeze({
    businessId: membership.businessId,
    ownerId: session.ownerId,
  });
}
