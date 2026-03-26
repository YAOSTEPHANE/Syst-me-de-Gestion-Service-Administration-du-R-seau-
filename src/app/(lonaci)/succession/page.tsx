import { Suspense } from "react";

import SuccessionPanel from "@/components/lonaci/succession-panel";

export default function SuccessionPage() {
  return (
    <Suspense
      fallback={
        <section className="rounded-2xl border border-white/10 bg-[#0f2035]/80 p-6 text-sm text-white">
          Chargement succession…
        </section>
      }
    >
      <SuccessionPanel />
    </Suspense>
  );
}
