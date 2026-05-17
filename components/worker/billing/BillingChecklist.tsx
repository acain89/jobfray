type Props = {
  phoneVerified: boolean;
  billingVerified: boolean;
  identityVerified: boolean;
};

function statusLabel(value: boolean): string {
  return value ? "Complete" : "Pending";
}

export default function BillingChecklist({
  phoneVerified,
  billingVerified,
  identityVerified,
}: Props): React.ReactElement {
  return (
    <section className="grid gap-4 sm:grid-cols-3">
      <div className="rounded-[2rem] border border-[#dbe7df] bg-white p-5 shadow-sm">
        <h2 className="text-xl font-black text-[#183027]">
          1. Phone
        </h2>

        <p className="mt-2 text-sm font-semibold text-[#5f6f67]">
          {statusLabel(phoneVerified)}
        </p>
      </div>

      <div className="rounded-[2rem] border border-[#dbe7df] bg-white p-5 shadow-sm">
        <h2 className="text-xl font-black text-[#183027]">
          2. Billing
        </h2>

        <p className="mt-2 text-sm font-semibold text-[#5f6f67]">
          {statusLabel(billingVerified)}
        </p>
      </div>

      <div className="rounded-[2rem] border border-[#dbe7df] bg-white p-5 shadow-sm">
        <h2 className="text-xl font-black text-[#183027]">
          3. Identity
        </h2>

        <p className="mt-2 text-sm font-semibold text-[#5f6f67]">
          {statusLabel(identityVerified)}
        </p>
      </div>
    </section>
  );
}