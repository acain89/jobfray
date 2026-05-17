type Props = {
  hasCard: boolean;
  cardBrand: string | null;
  cardLast4: string | null;
  billingSuspended: boolean;
  billingFailureReason: string | null;
};

export default function BillingStatusCard({
  hasCard,
  cardBrand,
  cardLast4,
  billingSuspended,
  billingFailureReason,
}: Props): React.ReactElement {
  if (billingSuspended) {
    return (
      <div className="rounded-[2rem] border border-red-200 bg-red-50 p-5">
        <p className="text-lg font-black text-red-700">
          Billing suspended
        </p>

        <p className="mt-2 text-sm font-bold text-red-600">
          {billingFailureReason ?? "Payment issue detected."}
        </p>
      </div>
    );
  }

  if (hasCard) {
    return (
      <div className="rounded-[2rem] border border-[#cde7d8] bg-[#eef8f2] p-5">
        <p className="text-lg font-black text-[#183027]">
          Card verified
        </p>

        <p className="mt-2 text-sm font-bold text-[#4f6d5d]">
          {cardBrand?.toUpperCase()} ending in {cardLast4}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-[2rem] border border-[#dbe7df] bg-[#f7fbf8] p-5">
      <p className="text-lg font-black text-[#183027]">
        No payment method added
      </p>

      <p className="mt-2 text-sm font-bold text-[#5f6f67]">
        Add a card to unlock worker offers and accepted matches.
      </p>
    </div>
  );
}