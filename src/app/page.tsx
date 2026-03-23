export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 py-16 text-slate-100">
      <main className="w-full max-w-3xl rounded-2xl border border-slate-800 bg-slate-900/70 p-10 shadow-2xl">
        <p className="text-sm uppercase tracking-[0.2em] text-emerald-300">LONACI</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">
          ADMR - MVP en cours de developpement
        </h1>
        <p className="mt-4 text-slate-300">
          Base technique initialisee avec Next.js (App Router + Turbopack) et
          MongoDB pour demarrer les modules prioritaires du PRD.
        </p>

        <section className="mt-8 grid gap-3 text-sm text-slate-200 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <p className="font-semibold">Etat de l API</p>
            <p className="mt-2 text-slate-400">GET /api/health</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <p className="font-semibold">Stack</p>
            <p className="mt-2 text-slate-400">Next.js 16 + MongoDB</p>
          </div>
        </section>

        <section className="mt-8 rounded-xl border border-emerald-900/50 bg-emerald-950/30 p-4 text-sm text-emerald-200">
          Prochaine etape: Authentification RBAC (AGENT, CHEF_SECTION,
          ASSIST_CDS, CHEF_SERVICE) puis module Referentiel Concessionnaires.
        </section>
      </main>
    </div>
  );
}
