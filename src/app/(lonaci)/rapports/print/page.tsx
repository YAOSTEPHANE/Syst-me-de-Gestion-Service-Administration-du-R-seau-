import type { Metadata } from "next";
import { Suspense } from "react";

import PrintReportClient from "./print-client";

export const metadata: Metadata = {
  title: "Rapport opérationnel | LONACI",
  robots: { index: false, follow: false },
};

export default function RapportPrintPage() {
  return (
    <Suspense
      fallback={<p className="p-8 text-slate-600">Préparation du rapport LONACI…</p>}
    >
      <PrintReportClient />
    </Suspense>
  );
}
