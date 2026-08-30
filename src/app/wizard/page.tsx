import { Suspense } from "react";
import WizardClient from "./wizard-client";

export default function WizardPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">Loading…</div>}>
      <WizardClient />
    </Suspense>
  );
}
