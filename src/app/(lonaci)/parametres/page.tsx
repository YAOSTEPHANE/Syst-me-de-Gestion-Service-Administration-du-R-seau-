import AdminAgencesPanel from "@/components/lonaci/admin-agences-panel";
import AdminEmailSettings from "@/components/lonaci/admin-email-settings";
import AdminProduitsPanel from "@/components/lonaci/admin-produits-panel";
import AlertThresholdsSettings from "@/components/lonaci/alert-thresholds-settings";
import ParametresComptePanel from "@/components/lonaci/parametres-compte-panel";
import UsersAdminPanel from "@/components/lonaci/users-admin-panel";
import { getSessionFromCookies } from "@/lib/auth/session";

export default async function ParametresPage() {
  const session = await getSessionFromCookies();
  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-sky-50/70 via-white to-indigo-50/60 p-5 shadow-sm">
        <div className="pointer-events-none absolute -right-14 -top-16 h-44 w-44 rounded-full bg-sky-200/25 blur-3xl" />
        <div className="relative">
          <p className="text-xs uppercase tracking-[0.16em] text-sky-700">LONACI</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">Paramètres</h1>
          <p className="mt-1 text-sm text-slate-600">
            Configuration compte, administration utilisateurs, seuils d’alertes et options email.
          </p>
        </div>
      </section>
      <ParametresComptePanel />
      {session?.role === "CHEF_SERVICE" ? (
        <div className="space-y-6">
          <AdminAgencesPanel />
          <AdminProduitsPanel />
          <UsersAdminPanel />
          <AlertThresholdsSettings />
          <AdminEmailSettings />
        </div>
      ) : null}
    </div>
  );
}
