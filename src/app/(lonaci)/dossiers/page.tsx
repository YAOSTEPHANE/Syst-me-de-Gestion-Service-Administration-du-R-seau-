import { Suspense } from "react";

import DossiersPanel from "@/components/lonaci/dossiers-panel";

export default function DossiersPage() {
  return (
    <Suspense
      fallback={
        <section className="rounded-2xl border border-white/10 bg-[#0f2035]/80 p-6 text-sm text-white">
          Chargement écran dossiers...
        </section>
      }
    >
      <DossiersPanel />
    </Suspense>
  );
}
