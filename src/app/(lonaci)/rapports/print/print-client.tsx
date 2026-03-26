"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function PrintReportClient() {
  const searchParams = useSearchParams();
  const period = (searchParams.get("period") ?? "daily") as "daily" | "weekly" | "monthly";
  const [text, setText] = useState("");

  useEffect(() => {
    void (async () => {
      const res = await fetch(`/api/reports/summary?period=${period}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) {
        setText("Non autorisé ou erreur de chargement.");
        return;
      }
      const data = await res.json();
      setText(JSON.stringify(data, null, 2));
    })();
  }, [period]);

  return (
    <div className="min-h-screen bg-white p-8 text-black print:p-4">
      <h1 className="text-xl font-bold">Rapport {period}</h1>
      <p className="mt-2 text-sm text-gray-600">Imprimer ce document (Ctrl+P) pour obtenir un PDF.</p>
      <pre className="mt-6 whitespace-pre-wrap font-mono text-xs">{text}</pre>
      <button
        type="button"
        onClick={() => window.print()}
        className="mt-8 rounded border border-gray-400 px-4 py-2 text-sm print:hidden"
      >
        Imprimer / PDF
      </button>
    </div>
  );
}
