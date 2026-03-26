import { Suspense } from "react";

import ContratsPanel from "@/components/lonaci/contrats-panel";

export default function ContratsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-600">Chargement…</p>}>
      <ContratsPanel />
    </Suspense>
  );
}
