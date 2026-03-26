import { Suspense } from "react";

import CautionsPanel from "@/components/lonaci/cautions-panel";

export default function CautionsPage() {
  return (
    <Suspense
      fallback={
        <section className="rounded-2xl bg-white p-6 text-sm text-slate-900">
          Chargement cautions...
        </section>
      }
    >
      <CautionsPanel />
    </Suspense>
  );
}
