"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import {
  loadStripe,
  type StripeElementsOptions,
} from "@stripe/stripe-js";

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "",
);

type SetupIntentResponse =
  | {
      ok: true;
      clientSecret: string;
    }
  | {
      ok: false;
      error: string;
    };

type SaveCardResponse =
  | {
      ok: true;
    }
  | {
      ok: false;
      error: string;
    };

function BillingFormInner(): React.ReactElement {
  const stripe = useStripe();
  const elements = useElements();

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setError("");
    setSuccess("");
    setIsSubmitting(true);

    try {
      const result = await stripe.confirmSetup({
        elements,
        redirect: "if_required",
      });

      if (result.error) {
        setError(result.error.message ?? "Unable to verify card.");
        return;
      }

      if (!result.setupIntent?.id) {
        setError("Unable to finalize card setup.");
        return;
      }

      const response = await fetch("/api/worker/billing/save-card", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          setupIntentId: result.setupIntent.id,
        }),
      });

      const data = (await response.json()) as SaveCardResponse;

      if (!data.ok) {
        setError(data.error);
        return;
      }

      setSuccess("Card successfully verified.");

      window.location.reload();
    } catch {
      setError("Unable to save payment method.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {error ? (
        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
          {error}
        </div>
      ) : null}

      {success ? (
        <div className="mb-4 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm font-bold text-green-700">
          {success}
        </div>
      ) : null}

      <div className="rounded-[2rem] border border-[#dbe7df] bg-[#f7fbf8] p-4">
        <PaymentElement />
      </div>

      <button
        type="submit"
        disabled={!stripe || isSubmitting}
        className="mt-5 w-full rounded-full bg-[#183027] px-5 py-4 text-base font-black text-white disabled:opacity-60"
      >
        {isSubmitting ? "Saving card..." : "Save Payment Method"}
      </button>
    </form>
  );
}

export default function WorkerBillingForm(): React.ReactElement {
  const [clientSecret, setClientSecret] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadIntent(): Promise<void> {
      try {
        const response = await fetch(
          "/api/worker/billing/setup-intent",
          {
            method: "POST",
          },
        );

        const data =
          (await response.json()) as SetupIntentResponse;

        if (!data.ok) {
          setError(data.error);
          return;
        }

        setClientSecret(data.clientSecret);
      } catch {
        setError("Unable to initialize billing.");
      }
    }

    void loadIntent();
  }, []);

  const options: StripeElementsOptions | undefined = useMemo(() => {
    if (!clientSecret) {
      return undefined;
    }

    return {
      clientSecret,
      appearance: {
        theme: "stripe",
      },
    };
  }, [clientSecret]);

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
        {error}
      </div>
    );
  }

  if (!clientSecret || !options) {
    return (
      <div className="rounded-2xl border border-[#dbe7df] bg-[#f7fbf8] p-4 text-sm font-bold text-[#5f6f67]">
        Initializing secure billing...
      </div>
    );
  }

  return (
    <Elements stripe={stripePromise} options={options}>
      <BillingFormInner />
    </Elements>
  );
}