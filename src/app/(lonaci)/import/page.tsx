import DashboardDataImportCard from "@/components/lonaci/dashboard-data-import-card";

export default function ImportPage() {
  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-cyan-200 bg-gradient-to-r from-slate-900 via-slate-800 to-cyan-900 p-5 shadow-sm">
        <p className="inline-flex rounded-full border border-white/30 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100">
          Import
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">Import de fichiers externes</h1>
        <p className="mt-1 text-sm text-cyan-100/90">
          Chargez un fichier JSON/CSV pour insérer ou mettre à jour des données.
        </p>
      </section>

      <DashboardDataImportCard />
    </div>
  );
}
