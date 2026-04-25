import AdminAgencesPanel from "@/components/lonaci/admin-agences-panel";
import AdminProduitsPanel from "@/components/lonaci/admin-produits-panel";
import AdminAuditLogPanel from "@/components/lonaci/admin-audit-log-panel";
import AdminEmailSettings from "@/components/lonaci/admin-email-settings";
import AdminLocalBackupSettings from "@/components/lonaci/admin-local-backup-settings";
import AdminOperationalAlertsPanel from "@/components/lonaci/admin-operational-alerts-panel";
import AdminSlaOverviewPanel from "@/components/lonaci/admin-sla-overview-panel";
import AdminSupervisionRunsPanel from "@/components/lonaci/admin-supervision-runs-panel";
import AlertThresholdsSettings from "@/components/lonaci/alert-thresholds-settings";
import MonitoringEventsPanel from "@/components/lonaci/monitoring-events-panel";
import ParametresComptePanel from "@/components/lonaci/parametres-compte-panel";
import ParametresPanelsControls from "@/components/lonaci/parametres-panels-controls";
import ParametresTabs from "@/components/lonaci/parametres-tabs";
import UsersAdminPanel from "@/components/lonaci/users-admin-panel";
import { userRequiresPasswordRotation } from "@/lib/auth/password-policy";
import { getSessionFromCookies } from "@/lib/auth/session";
import { findUserById } from "@/lib/lonaci/users";
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

function CollapsiblePanel({
  panelId,
  title,
  subtitle,
  defaultOpen = false,
  children,
}: {
  panelId: string;
  title: string;
  subtitle: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details
      open={defaultOpen}
      data-param-panel-id={panelId}
      className="group rounded-2xl border border-slate-200 bg-white/80 shadow-sm transition hover:shadow"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5">
        <div>
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          <p className="text-xs text-slate-600">{subtitle}</p>
        </div>
        <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600">
          <span className="group-open:hidden">Afficher</span>
          <span className="hidden group-open:inline">Masquer</span>
        </span>
      </summary>
      <div className="border-t border-slate-200 px-3 py-3">{children}</div>
    </details>
  );
}

function ParamSubgroup({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2 rounded-2xl border border-slate-200/80 bg-slate-50/60 p-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-700">{title}</p>
        <p className="mt-0.5 text-[11px] text-slate-600">{hint}</p>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

const PARAMETRES_TAB_IDS = ["mon-compte", "utilisateurs", "referentiels", "supervision", "restriction"] as const;

type ParametresPageProps = {
  searchParams?: Promise<{ tab?: string | string[] }>;
};

export default async function ParametresPage({ searchParams }: ParametresPageProps) {
  const sp = searchParams ? await searchParams : {};
  const rawTab = sp.tab;
  const tabParam = typeof rawTab === "string" ? rawTab : Array.isArray(rawTab) ? rawTab[0] : undefined;
  const initialTabId =
    tabParam && (PARAMETRES_TAB_IDS as readonly string[]).includes(tabParam) ? tabParam : null;

  const session = await getSessionFromCookies();
  const isChefService = session?.role === "CHEF_SERVICE";
  const currentUser = session?.sub ? await findUserById(session.sub) : null;
  const mustChangePassword = currentUser ? userRequiresPasswordRotation(currentUser) : false;
  const canAccessAdminSections = isChefService && !mustChangePassword;

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-linear-to-br from-sky-50/80 via-white to-indigo-50/60 p-5 shadow-sm">
        <div className="pointer-events-none absolute -right-14 -top-16 h-44 w-44 rounded-full bg-sky-200/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-16 h-64 w-64 rounded-full bg-indigo-200/20 blur-3xl" />
        <div className="relative">
          <p className="text-xs uppercase tracking-[0.16em] text-sky-700">Infinitecore Systeme</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Paramètres</h1>
          <p className="mt-1 text-sm text-slate-600">
            Compte, référentiels, droits d’accès et supervision système.
          </p>
          <ParametresPanelsControls />
        </div>
      </section>

      <div id="parametres-content" className="space-y-6">
        <ParametresTabs
          initialTabId={initialTabId}
          comptePanel={
            <ParamSection
              id="mon-compte"
              title="Mon compte"
              description="Informations personnelles, préférences et sécurité de connexion."
            >
              <ParametresComptePanel />
            </ParamSection>
          }
          utilisateursPanel={
            canAccessAdminSections ? (
              <ParamSection
                id="utilisateurs"
                title="Utilisateurs"
                description="Création, modification, activation des comptes et définition ou réinitialisation des mots de passe."
              >
                <UsersAdminPanel />
              </ParamSection>
            ) : undefined
          }
          referentielsPanel={
            canAccessAdminSections ? (
              <ParamSection
                id="referentiels"
                title="Référentiels"
                description="Agences et produits (codes, libellés, prix de caution) utilisés dans les modules métier."
              >
                <div className="space-y-4">
                  <CollapsiblePanel
                    panelId="referentiels-agences"
                    title="Agences"
                    subtitle="Créer, modifier et activer les agences."
                    defaultOpen={initialTabId !== "referentiels"}
                  >
                    <AdminAgencesPanel />
                  </CollapsiblePanel>
                  <CollapsiblePanel
                    panelId="referentiels-produits"
                    title="Produits"
                    subtitle="Créer et gérer les produits : code, libellé et prix de caution."
                    defaultOpen={initialTabId === "referentiels"}
                  >
                    <AdminProduitsPanel />
                  </CollapsiblePanel>
                </div>
              </ParamSection>
            ) : undefined
          }
          supervisionPanel={
            canAccessAdminSections ? (
              <ParamSection
                id="supervision"
                title="Supervision"
                description="Seuils d’alerte et configuration des notifications email."
              >
                <div className="space-y-4">
                  <ParamSubgroup
                    title="Pilotage quotidien"
                    hint="Paramètres prioritaires pour suivre et ajuster l’exploitation."
                  >
                    <CollapsiblePanel
                      panelId="supervision-alert-thresholds"
                      title="Seuils d’alerte"
                      subtitle="Paramétrage des seuils critiques de supervision."
                      defaultOpen
                    >
                      <AlertThresholdsSettings />
                    </CollapsiblePanel>
                    <CollapsiblePanel
                      panelId="supervision-email"
                      title="Paramètres email"
                      subtitle="Activation des notifications SMTP critiques."
                      defaultOpen
                    >
                      <AdminEmailSettings />
                    </CollapsiblePanel>
                    <CollapsiblePanel
                      panelId="supervision-operational-alerts"
                      title="Alertes opérationnelles"
                      subtitle="Synthèse des incidents et actions récentes."
                    >
                      <AdminOperationalAlertsPanel />
                    </CollapsiblePanel>
                    <CollapsiblePanel
                      panelId="supervision-sla"
                      title="Vue SLA"
                      subtitle="Comparatif des volumes journaliers et hebdomadaires."
                    >
                      <AdminSlaOverviewPanel />
                    </CollapsiblePanel>
                  </ParamSubgroup>

                  <ParamSubgroup
                    title="Suivi et traçabilité"
                    hint="Historique des exécutions et des événements pour diagnostic."
                  >
                    <CollapsiblePanel
                      panelId="supervision-runs"
                      title="Exécutions supervision"
                      subtitle="Historique des exécutions planifiées et résultats."
                    >
                      <AdminSupervisionRunsPanel />
                    </CollapsiblePanel>
                    <CollapsiblePanel
                      panelId="supervision-audit"
                      title="Journal d’audit"
                      subtitle="Historique unifié des événements de sécurité et supervision."
                    >
                      <AdminAuditLogPanel />
                    </CollapsiblePanel>
                    <CollapsiblePanel
                      panelId="supervision-monitoring-events"
                      title="Événements monitoring"
                      subtitle="Liste détaillée des événements OPEN/ACK."
                    >
                      <MonitoringEventsPanel />
                    </CollapsiblePanel>
                  </ParamSubgroup>

                  <ParamSubgroup
                    title="Maintenance"
                    hint="Sauvegarde et opérations sensibles à utiliser ponctuellement."
                  >
                    <CollapsiblePanel
                      panelId="supervision-backups"
                      title="Sauvegarde locale"
                      subtitle="Créer, simuler et restaurer les sauvegardes."
                    >
                      <AdminLocalBackupSettings />
                    </CollapsiblePanel>
                  </ParamSubgroup>
                </div>
              </ParamSection>
            ) : undefined
          }
          restrictionPanel={
            !canAccessAdminSections ? (
              isChefService && mustChangePassword ? (
                <section className="rounded-3xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-sm">
                  Change d’abord ton mot de passe dans <strong>Mon compte</strong> pour réactiver les paramètres
                  d’administration avancés.
                </section>
              ) : (
                <section className="rounded-3xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-sm">
                  Les paramètres d’administration avancés sont réservés au rôle <strong>CHEF_SERVICE</strong>.
                </section>
              )
            ) : undefined
          }
        />
      </div>
    </div>
  );
}
