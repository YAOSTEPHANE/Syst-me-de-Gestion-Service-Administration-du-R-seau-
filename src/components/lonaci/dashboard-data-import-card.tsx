"use client";

import { useState } from "react";

type Mode = "insert" | "upsert";

export default function DashboardDataImportCard() {
  const [file, setFile] = useState<File | null>(null);
  const [collection, setCollection] = useState("agences");
  const [mode, setMode] = useState<Mode>("insert");
  const [upsertBy, setUpsertBy] = useState("code");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);

    if (!file) {
      setError("Choisissez un fichier .json ou .csv");
      return;
    }
    if (!collection.trim()) {
      setError("Collection obligatoire");
      return;
    }
    if (mode === "upsert" && !upsertBy.trim()) {
      setError("Champ upsert requis");
      return;
    }

    setLoading(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("collection", collection.trim());
      fd.set("mode", mode);
      if (mode === "upsert") {
        fd.set("upsertBy", upsertBy.trim());
      }

      const res = await fetch("/api/admin/import-data", {
        method: "POST",
        body: fd,
      });
      const data = (await res.json().catch(() => null)) as
        | { message?: string; inserted?: number; upserted?: number; modified?: number }
        | null;

      if (!res.ok) {
        setError(data?.message ?? "Import échoué");
        return;
      }

      if (mode === "insert") {
        setMessage(`Import réussi: ${data?.inserted ?? 0} ligne(s) insérée(s).`);
      } else {
        setMessage(
          `Import réussi: ${data?.upserted ?? 0} créée(s), ${data?.modified ?? 0} mise(s) à jour.`,
        );
      }
      setFile(null);
      const input = document.getElementById("dashboard-import-file") as HTMLInputElement | null;
      if (input) input.value = "";
    } catch {
      setError("Erreur réseau pendant l'import");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-slate-900">Import de données (fichier externe)</h2>
        <p className="mt-1 text-xs text-slate-600">
          Ajoutez un fichier JSON/CSV et insérez les données dans la collection MongoDB de votre choix.
        </p>
      </div>

      <form onSubmit={onSubmit} className="grid gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-slate-700">
          Fichier (.json/.csv)
          <input
            id="dashboard-import-file"
            type="file"
            accept=".json,.csv"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="rounded-md border border-slate-300 px-2 py-2 text-xs"
            required
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-slate-700">
          Collection
          <input
            value={collection}
            onChange={(e) => setCollection(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-2 text-xs"
            placeholder="agences"
            required
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-slate-700">
          Mode
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as Mode)}
            className="rounded-md border border-slate-300 px-2 py-2 text-xs"
          >
            <option value="insert">Insert</option>
            <option value="upsert">Upsert</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-slate-700">
          Champ upsert (si mode upsert)
          <input
            value={upsertBy}
            onChange={(e) => setUpsertBy(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-2 text-xs"
            placeholder="code"
            disabled={mode !== "upsert"}
          />
        </label>

        <div className="md:col-span-2 flex items-center gap-2">
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? "Import en cours..." : "Importer le fichier"}
          </button>
          {message ? <p className="text-xs text-emerald-700">{message}</p> : null}
          {error ? <p className="text-xs text-rose-700">{error}</p> : null}
        </div>
      </form>
    </section>
  );
}
