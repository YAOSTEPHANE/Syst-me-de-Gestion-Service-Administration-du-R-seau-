import { Suspense } from "react";

import PrintReportClient from "./print-client";

export default function RapportPrintPage() {
  return (
    <Suspense
      fallback={<p className="p-8 text-slate-600">Préparation du rapport...</p>}
    >
      <PrintReportClient />
    </Suspense>
  );
}
