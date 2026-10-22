"use client";

import { LazyLogoLoader } from "@netfly/ui";
import { ApiError } from "@netfly/api-client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { RegistrationShell, StepHeading } from "@/components/auth/registration-shell";
import { Button } from "@/components/ui/button";
import { readCheckout, stepHref } from "@/lib/checkout";
import { useCheckout } from "@/lib/queries";

/** Sends the member to the first checkout step still to do (email → phone → payment). */
function VerifyRouter() {
  const params = useSearchParams();
  const router = useRouter();
  const ctx = readCheckout(params);
  const checkout = useCheckout(ctx.plan, ctx.trial);
  useEffect(() => {
    if (!ctx.plan) router.replace(ctx.fromAccount ? "/account/security" : "/signup/plan");
    else if (checkout.data) router.replace(stepHref(checkout.data.steps[0] ?? "payment", ctx));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkout.data, ctx.plan]);
  if (checkout.error) {
    return (
      <RegistrationShell>
        <StepHeading title="Let's pick your plan again">
          {checkout.error instanceof ApiError
            ? checkout.error.message
            : "Something went wrong. Please try again."}
        </StepHeading>
        <Button asChild variant="accent-light" size="lg" fullWidth className="text-h3 h-14">
          <Link href={`/signup/plan?next=${encodeURIComponent(ctx.next)}`}>Choose a plan</Link>
        </Button>
      </RegistrationShell>
    );
  }
  return (
    <RegistrationShell>
      <div className="grid flex-1 place-items-center" aria-busy>
        <LazyLogoLoader size="md" />
      </div>
    </RegistrationShell>
  );
}

export default function VerifyPage() {
  return (
    <Suspense>
      <VerifyRouter />
    </Suspense>
  );
}
