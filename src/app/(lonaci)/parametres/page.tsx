import AdminAgencesPanel from "@/components/lonaci/admin-agences-panel";
import AdminEmailSettings from "@/components/lonaci/admin-email-settings";
import AdminProduitsPanel from "@/components/lonaci/admin-produits-panel";
import AlertThresholdsSettings from "@/components/lonaci/alert-thresholds-settings";
import ParametresComptePanel from "@/components/lonaci/parametres-compte-panel";
import UsersAdminPanel from "@/components/lonaci/users-admin-panel";
import { getSessionFromCookies } from "@/lib/auth/session";
import type { ReactNode } from "react";

function ParamSection({
  title,
  description,
  id,
  children,
}: {
  title: string;
  description: string;
  id: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-28">
      <div className="relative overflow-hidden rounded-3xl border border-slate-200/70 bg-white/80 p-4 shadow-[0_10px_30px_-15px_rgba(2,132,199,0.25)] backdrop-blur">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.18),transparent_55%),radial-gradient(circle_at_bottom_right,rgba(99,102,241,0.14),transparent_60%)]" />
        <div className="relative space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold tracking-tight text-slate-900">{title}</h2>
              <p className="mt-1 text-xs text-slate-600">{description}</p>
            </div>
            <div className="shrink-0 rounded-full border border-slate-200 bg-white/70 px-2 py-1 text-[11px] font-semibold text-slate-600">
              {title.split(" ")[0]}
            </div>
          </div>
          {children}
        </div>
      </div>
    </section>
  );
}

export default async function ParametresPage() {
  const session = await getSessionFromCookies();
  const isChefService = session?.role === "CHEF_SERVICE";

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-sky-50/80 via-white to-indigo-50/60 p-5 shadow-sm">
        <div className="pointer-events-none absolute -right-14 -top-16 h-44 w-44 rounded-full bg-sky-200/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-16 h-64 w-64 rounded-full bg-indigo-200/20 blur-3xl" />
        <div className="relative">
          <p className="text-xs uppercase tracking-[0.16em] text-sky-700">LONACI</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Paramètres</h1>
          <p className="mt-1 text-sm text-slate-600">
            Compte, référentiels, droits d’accès et supervision système.
          </p>
        </div>
      </section>

      <div className="space-y-6">
          <ParamSection id="mon-compte" title="Mon compte" description="Informations personnelles, préférences et sécurité de connexion.">
            <ParametresComptePanel />
          </ParamSection>

          {isChefService ? (
            <>
              <ParamSection id="referentiels" title="Référentiels" description="Gestion des agences et des produits disponibles dans l’application.">
                <div className="space-y-4">
                  <AdminAgencesPanel />
                  <AdminProduitsPanel />
                </div>
              </ParamSection>

              <ParamSection id="utilisateurs" title="Utilisateurs" description="Création, modification et activation des comptes utilisateurs.">
                <UsersAdminPanel />
              </ParamSection>

              <ParamSection id="supervision" title="Supervision" description="Seuils d’alerte et configuration des notifications email.">
                <div className="space-y-4">
                  <AlertThresholdsSettings />
                  <AdminEmailSettings />
                </div>
              </ParamSection>
            </>
          ) : (
            <section className="rounded-3xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-sm">
              Les paramètres d’administration avancés sont réservés au rôle <strong>CHEF_SERVICE</strong>.
            </section>
          )}
      </div>
    </div>
  );
}
