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
import { Badge } from "@/components/lonaci/ui/badge";
import { PageHeader } from "@/components/lonaci/ui/headers";
import { Surface } from "@/components/lonaci/ui/surface";
import UsersAdminPanel from "@/components/lonaci/users-admin-panel";
import { userRequiresPasswordRotation } from "@/lib/auth/password-policy";
import { getSessionFromCookies } from "@/lib/auth/session";
import { findUserById } from "@/lib/lonaci/users";
import { ChevronDown, LockKeyhole, Settings2 } from "lucide-react";
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
      <Surface
        padding="lg"
        elevated
        className="relative overflow-hidden border-orange-200/70 bg-white shadow-[0_24px_70px_-42px_rgba(15,23,42,0.55)]"
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-linear-to-r from-orange-500 via-amber-400 to-orange-600" />
        <div className="relative space-y-5">
          <div className="flex flex-col gap-3 border-b border-slate-200/80 pb-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-3xl">
              <h2 className="text-xl font-bold tracking-tight text-[#102a43]">{title}</h2>
              <p className="mt-1.5 text-sm leading-6 text-slate-600">{description}</p>
            </div>
            <Badge tone="warning" className="w-fit">
              {title.split(" ")[0]}
            </Badge>
          </div>
          {children}
        </div>
      </Surface>
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
      className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition open:border-orange-200 open:shadow-md"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3.5 outline-none transition hover:bg-orange-50/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-500">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-[#102a43]">{title}</h3>
          <p className="mt-0.5 text-xs leading-5 text-slate-600">{subtitle}</p>
        </div>
        <span className="flex shrink-0 items-center gap-2 text-xs font-semibold text-slate-600">
          <span className="hidden sm:inline">
            <span className="group-open:hidden">Afficher</span>
            <span className="hidden group-open:inline">Masquer</span>
          </span>
          <span className="grid size-8 place-items-center rounded-full bg-[#102a43] text-white">
            <ChevronDown
              size={16}
              aria-hidden="true"
              className="transition-transform duration-200 group-open:rotate-180"
            />
          </span>
        </span>
      </summary>
      <div className="border-t border-slate-200 bg-slate-50/45 p-3 sm:p-4">{children}</div>
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
    <section className="space-y-3 rounded-2xl border border-slate-200 bg-[#f7f9fc] p-3 sm:p-4">
      <div className="border-l-4 border-orange-500 pl-3">
        <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-[#102a43]">{title}</h3>
        <p className="mt-1 text-xs leading-5 text-slate-600">{hint}</p>
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
    <div className="space-y-5 sm:space-y-6">
      <Surface
        padding="lg"
        elevated
        className="relative overflow-hidden border-[#102a43] bg-[#102a43] text-white shadow-[0_24px_60px_-32px_rgba(15,23,42,0.9)]"
      >
        <div className="pointer-events-none absolute -right-20 -top-28 size-72 rounded-full bg-orange-500/20 blur-3xl" />
        <div className="pointer-events-none absolute inset-y-0 left-0 w-1.5 bg-orange-500" />
        <PageHeader
          className="relative mb-0 [&_h1]:text-white [&_p]:text-slate-300"
          eyebrow={
            <span className="inline-flex items-center gap-2 text-orange-300">
              <Settings2 size={15} aria-hidden="true" />
              LONACI
            </span>
          }
          title="Paramètres"
          description="Gérez votre compte, les référentiels, les droits d’accès et la supervision système."
          actions={
            <Badge tone={canAccessAdminSections ? "success" : "warning"} className="bg-white/10 text-white">
              <LockKeyhole size={13} aria-hidden="true" />
              {canAccessAdminSections ? "Administration active" : "Accès standard"}
            </Badge>
          }
        />
        <div className="relative mt-5 border-t border-white/10 pt-4">
          <ParametresPanelsControls />
        </div>
      </Surface>

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
                      title="Événements de supervision"
                      subtitle="Liste détaillée des événements ouverts ou traités."
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
                <Surface className="border-orange-200 bg-orange-50 text-sm text-orange-950">
                  Change d’abord ton mot de passe dans <strong>Mon compte</strong> pour réactiver les paramètres
                  d’administration avancés.
                </Surface>
              ) : (
                <Surface className="border-orange-200 bg-orange-50 text-sm text-orange-950">
                  Les paramètres d’administration avancés sont réservés au rôle <strong>CHEF_SERVICE</strong>.
                </Surface>
              )
            ) : undefined
          }
        />
      </div>
    </div>
  );
}
