import { Suspense } from "react";

import AlertsPanel from "@/components/lonaci/alerts-panel";

export default function AlertesPage() {
  return (
    <Suspense
      fallback={
        <section className="rounded-2xl border border-white/10 bg-[#0f2035]/80 p-6 text-sm text-white">
          Chargement…
        </section>
      }
    >
      <AlertsPanel />
    </Suspense>
  );
}
