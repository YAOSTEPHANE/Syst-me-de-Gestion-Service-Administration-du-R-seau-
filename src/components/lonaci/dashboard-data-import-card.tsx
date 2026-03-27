"use client";

import { useState } from "react";

import { LONACI_AGENCES } from "@/components/lonaci/lonaci-nav";

type Mode = "insert" | "upsert";
type ImportModuleKey =
  | "REFERENTIELS"
  | "CONCESSIONNAIRES"
  | "CONTRATS"
  | "CAUTIONS"
  | "PDV_INTEGRATIONS"
  | "AGREMENTS"
  | "REGISTRES";

const IMPORT_MODULES: Array<{
  key: ImportModuleKey;
  label: string;
  collections: Array<{ value: string; label: string; defaultUpsertBy?: string }>;
}> = [
  {
    key: "REFERENTIELS",
    label: "Référentiels",
    collections: [
      { value: "agences", label: "Agences", defaultUpsertBy: "code" },
      { value: "produits", label: "Produits", defaultUpsertBy: "code" },
    ],
  },
  {
    key: "CONCESSIONNAIRES",
    label: "Concessionnaires",
    collections: [{ value: "concessionnaires", label: "Concessionnaires", defaultUpsertBy: "codePdv" }],
  },
  {
    key: "CONTRATS",
    label: "Contrats",
    // Les écrans “contrats” s’appuient sur la workflow dossiers (validation -> création contrat).
    collections: [{ value: "dossiers", label: "Dossiers (contrats)", defaultUpsertBy: "reference" }],
  },
  {
    key: "CAUTIONS",
    label: "Cautions",
    // Caution: contrainte d’unicité Mongo sur `contratId`.
    collections: [{ value: "cautions", label: "Cautions", defaultUpsertBy: "contratId" }],
  },
  {
    key: "AGREMENTS",
    label: "Agréments",
    collections: [{ value: "agreements", label: "Agréments", defaultUpsertBy: "reference" }],
  },
  {
    key: "PDV_INTEGRATIONS",
    label: "Intégrations PDV",
    // Intégration PDV: contrainte d’unicité Mongo sur `reference`.
    collections: [{ value: "pdv_integrations", label: "PDV Integrations", defaultUpsertBy: "reference" }],
  },
  {
    key: "REGISTRES",
    label: "Registres",
    collections: [{ value: "lonaci_registries", label: "Registres LONACI", defaultUpsertBy: "_id" }],
  },
];

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((v) => v.trim());
}

function parsePreview(fileName: string, content: string): Array<Record<string, unknown>> {
  const lower = fileName.toLowerCase();
  const text = content.trim();
  if (!text) return [];
  if (lower.endsWith(".json")) {
    const parsed = JSON.parse(text) as unknown;
    if (Array.isArray(parsed)) return parsed.filter((x) => x && typeof x === "object") as Array<Record<string, unknown>>;
    if (parsed && typeof parsed === "object") return [parsed as Record<string, unknown>];
    return [];
  }
  if (lower.endsWith(".csv")) {
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length < 2) return [];
    const headers = splitCsvLine(lines[0]);
    return lines.slice(1).map((line) => {
      const values = splitCsvLine(line);
      const row: Record<string, unknown> = {};
      headers.forEach((h, idx) => {
        row[h] = values[idx] ?? "";
      });
      return row;
    });
  }
  return [];
}

function detectTargetFromFileName(fileName: string): { moduleKey: ImportModuleKey; collection: string; upsertBy: string } | null {
  const name = fileName.toLowerCase();
  if (name.includes("contrat")) {
    return { moduleKey: "CONTRATS", collection: "dossiers", upsertBy: "reference" };
  }
  if (name.includes("caution")) {
    return { moduleKey: "CAUTIONS", collection: "cautions", upsertBy: "contratId" };
  }
  if (name.includes("agrement")) {
    return { moduleKey: "AGREMENTS", collection: "agreements", upsertBy: "reference" };
  }
  if (name.includes("agence")) {
    return { moduleKey: "REFERENTIELS", collection: "agences", upsertBy: "code" };
  }
  if (name.includes("produit")) {
    return { moduleKey: "REFERENTIELS", collection: "produits", upsertBy: "code" };
  }
  if (name.includes("concessionnaire")) {
    return { moduleKey: "CONCESSIONNAIRES", collection: "concessionnaires", upsertBy: "codePdv" };
  }
  if (name.includes("pdv")) {
    return { moduleKey: "PDV_INTEGRATIONS", collection: "pdv_integrations", upsertBy: "reference" };
  }
  return null;
}

export default function DashboardDataImportCard() {
  const [file, setFile] = useState<File | null>(null);
  const [moduleKey, setModuleKey] = useState<ImportModuleKey>("REFERENTIELS");
  const [collection, setCollection] = useState("agences");
  const [mode, setMode] = useState<Mode>("insert");
  const [upsertBy, setUpsertBy] = useState("code");
  const [agenceId, setAgenceId] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewRows, setPreviewRows] = useState<Array<Record<string, unknown>>>([]);
  const [previewColumns, setPreviewColumns] = useState<string[]>([]);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const selectedAgenceLabel = LONACI_AGENCES.find((a) => a.value === agenceId)?.label ?? "Toutes / non précisée";
  const selectedModule = IMPORT_MODULES.find((m) => m.key === moduleKey) ?? IMPORT_MODULES[0];

  async function onFilePicked(nextFile: File | null) {
    setFile(nextFile);
    setPreviewRows([]);
    setPreviewColumns([]);
    setPreviewError(null);
    if (!nextFile) return;
    try {
      const detected = detectTargetFromFileName(nextFile.name);
      if (detected) {
        setModuleKey(detected.moduleKey);
        setCollection(detected.collection);
        setUpsertBy(detected.upsertBy);
      }
      const content = await nextFile.text();
      const rows = parsePreview(nextFile.name, content);
      const firstRows = rows.slice(0, 20);
      const cols = new Set<string>();
      firstRows.forEach((row) => {
        Object.keys(row).forEach((k) => cols.add(k));
      });
      setPreviewColumns([...cols]);
      setPreviewRows(firstRows);
    } catch {
      setPreviewError("Impossible de lire le fichier pour l'aperçu.");
    }
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);

    if (!file) {
      setError("Choisissez un fichier .json ou .csv");
      return;
    }
    if (!moduleKey) {
      setError("Module concerné obligatoire");
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
      if (agenceId) {
        fd.set("agenceId", agenceId);
      }
      if (mode === "upsert") {
        fd.set("upsertBy", upsertBy.trim());
      }

      const res = await fetch("/api/import-data", {
        method: "POST",
        body: fd,
      });
      const data = (await res.json().catch(() => null)) as
        | {
            message?: string;
            inserted?: number;
            upserted?: number;
            modified?: number;
            skippedInvalidCode?: number;
            skippedFileDuplicates?: number;
            skippedExistingDuplicates?: number;
          }
        | null;

      if (!res.ok) {
        setError(data?.message ?? "Import échoué");
        return;
      }

      if (mode === "insert") {
        const skippedInvalid = data?.skippedInvalidCode ?? 0;
        const skippedFile = data?.skippedFileDuplicates ?? 0;
        const skippedExisting = data?.skippedExistingDuplicates ?? 0;
        const skippedTotal = skippedInvalid + skippedFile + skippedExisting;
        if (skippedTotal > 0) {
          setMessage(
            `Import réussi: ${data?.inserted ?? 0} ligne(s) insérée(s), ${skippedTotal} ligne(s) ignorée(s) (${skippedInvalid} code(s) invalide(s), ${skippedFile} doublon(s) dans le fichier, ${skippedExisting} déjà en base).`,
          );
        } else {
          setMessage(`Import réussi: ${data?.inserted ?? 0} ligne(s) insérée(s).`);
        }
      } else {
        setMessage(
          `Import réussi: ${data?.upserted ?? 0} créée(s), ${data?.modified ?? 0} mise(s) à jour.`,
        );
      }
      setFile(null);
      window.dispatchEvent(new Event("lonaci:data-imported"));
      const input = document.getElementById("dashboard-import-file") as HTMLInputElement | null;
      if (input) input.value = "";
    } catch {
      setError("Erreur réseau pendant l'import");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white/95 p-5 shadow-sm backdrop-blur md:p-6">
      <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-cyan-200/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 left-10 h-48 w-48 rounded-full bg-indigo-200/30 blur-3xl" />

      <div className="relative mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="inline-flex items-center rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-800">
            Import externe
          </p>
          <h2 className="mt-2 text-lg font-semibold text-slate-900 md:text-xl">Import de données (JSON/CSV)</h2>
          <p className="mt-1 text-xs text-slate-600 md:text-sm">
            Chargez un fichier, ciblez une collection, puis exécutez un insert massif ou une mise à jour intelligente.
          </p>
        </div>
        <div className="min-w-[210px] rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-slate-500">Agence active</p>
          <p className="mt-1 truncate text-sm font-semibold text-slate-800">{selectedAgenceLabel}</p>
        </div>
      </div>

      <form onSubmit={onSubmit} className="relative grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-700">
          Fichier (.json/.csv)
          <input
            id="dashboard-import-file"
            type="file"
            accept=".json,.csv"
            onChange={(e) => void onFilePicked(e.target.files?.[0] ?? null)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
            required
          />
          <span className="text-[11px] text-slate-500">
            Formats acceptés: tableau JSON ou CSV avec en-têtes.
          </span>
        </label>

        <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-700">
          Module concerné
          <select
            value={moduleKey}
            onChange={(e) => {
              const nextKey = e.target.value as ImportModuleKey;
              const nextModule = IMPORT_MODULES.find((m) => m.key === nextKey);
              setModuleKey(nextKey);
              if (nextModule && nextModule.collections.length > 0) {
                setCollection(nextModule.collections[0].value);
                setUpsertBy(nextModule.collections[0].defaultUpsertBy ?? "code");
              }
            }}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs text-slate-700 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
          >
            {IMPORT_MODULES.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-700">
          Collection
          <select
            value={collection}
            onChange={(e) => {
              const nextCollection = e.target.value;
              setCollection(nextCollection);
              const selected = selectedModule.collections.find((c) => c.value === nextCollection);
              if (selected?.defaultUpsertBy) {
                setUpsertBy(selected.defaultUpsertBy);
              }
            }}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs text-slate-700 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
          >
            {selectedModule.collections.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label} ({c.value})
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-700">
          Agence concernée
          <select
            value={agenceId}
            onChange={(e) => setAgenceId(e.target.value)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs text-slate-700 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
          >
            <option value="">Toutes / non précisée</option>
            {LONACI_AGENCES.filter((a) => a.value).map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-700">
          Mode
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as Mode)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs text-slate-700 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
          >
            <option value="insert">Insert</option>
            <option value="upsert">Upsert</option>
          </select>
        </label>

        <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-700 md:col-span-2">
          Champ upsert (si mode upsert)
          <input
            value={upsertBy}
            onChange={(e) => setUpsertBy(e.target.value)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
            placeholder="code"
            disabled={mode !== "upsert"}
          />
        </label>

        <div className="md:col-span-2 flex flex-wrap items-center gap-3 pt-1">
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
              <path d="M12 16V4m0 12l-4-4m4 4l4-4M4 19h16" />
            </svg>
            {loading ? "Import en cours..." : "Lancer l'import"}
          </button>
          <span className="text-[11px] text-slate-500">
            Sécurité: seules les collections valides sont autorisées.
          </span>
        </div>

        {message ? (
          <div className="md:col-span-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
            {message}
          </div>
        ) : null}
        {error ? (
          <div className="md:col-span-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
            {error}
          </div>
        ) : null}
        {previewError ? (
          <div className="md:col-span-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
            {previewError}
          </div>
        ) : null}

        {previewColumns.length > 0 ? (
          <div className="md:col-span-2 rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
              Aperçu du fichier ({previewRows.length} ligne(s) affichée(s), max 20)
            </div>
            <div className="max-h-64 overflow-auto">
              <table className="w-full min-w-[560px] border-collapse text-left text-xs">
                <thead className="sticky top-0 z-10 bg-slate-50 text-slate-600">
                  <tr>
                    {previewColumns.map((col) => (
                      <th key={col} className="border-b border-slate-200 px-3 py-2 font-semibold">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, i) => (
                    <tr key={`preview-row-${i}`} className="border-b border-slate-100 last:border-b-0">
                      {previewColumns.map((col) => (
                        <td key={`${col}-${i}`} className="px-3 py-2 text-slate-700">
                          {String(row[col] ?? "")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        <div className="md:col-span-2 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">Aide rapide</p>
          <p className="mt-1 text-xs text-slate-600">
            Utilisez <strong>Insert</strong> pour créer de nouvelles lignes, et <strong>Upsert</strong> pour créer ou mettre à jour selon le champ clé.
          </p>
        </div>
      </form>
    </section>
  );
}
