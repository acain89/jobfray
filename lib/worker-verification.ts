import "server-only";

export type WorkerVerificationState = {
  allowed: boolean;
  reason: string | null;

  checks: {
    accountActive: boolean;
    phoneVerified: boolean;
    billingVerified: boolean;
    identityVerified: boolean;
    billingSuspended: boolean;
  };
};

type WorkerVerificationInput = {
  status: string;
  phoneVerifiedAt: Date | null;
  cardVerifiedAt: Date | null;
  identityVerifiedAt: Date | null;
  billingSuspendedAt: Date | null;
};

export function getWorkerVerificationState(
  worker: WorkerVerificationInput,
): WorkerVerificationState {
  const checks = {
    accountActive:
      worker.status !== "DELETED" &&
      worker.status !== "SUSPENDED",

    phoneVerified: Boolean(worker.phoneVerifiedAt),

    billingVerified: Boolean(worker.cardVerifiedAt),

    identityVerified: Boolean(worker.identityVerifiedAt),

    billingSuspended: Boolean(worker.billingSuspendedAt),
  };

  if (!checks.accountActive) {
    return {
      allowed: false,
      reason: "Worker account unavailable.",
      checks,
    };
  }

  if (!checks.phoneVerified) {
    return {
      allowed: false,
      reason: "Phone verification required.",
      checks,
    };
  }

  if (!checks.billingVerified) {
    return {
      allowed: false,
      reason: "Payment method required before sending offers.",
      checks,
    };
  }

  if (checks.billingSuspended) {
    return {
      allowed: false,
      reason: "Billing issue detected. Update payment method.",
      checks,
    };
  }

  if (!checks.identityVerified) {
    return {
      allowed: false,
      reason: "Identity verification required.",
      checks,
    };
  }

  return {
    allowed: true,
    reason: null,
    checks,
  };
}