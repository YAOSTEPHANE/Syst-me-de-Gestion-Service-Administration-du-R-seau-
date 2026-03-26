import RegistryModulePanel from "@/components/lonaci/registry-module-panel";

const AGREMENT_STATUTS = ["SOUMIS", "EN_COURS", "VALIDE", "REJETE"] as const;
const CESSION_STATUTS = ["SAISIE_AGENT", "CONTROLE_CHEF_SECTION", "VALIDEE_CHEF_SERVICE", "REJETEE"] as const;
const GPR_STATUTS = ["SOUMIS_AGENT", "VALIDE_N1", "VALIDE_N2", "SUIVI_CHEF_SERVICE", "REJETE"] as const;

export default function RegistresPage() {
  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-indigo-50/70 via-white to-cyan-50/60 p-5 shadow-sm">
        <div className="relative">
          <p className="text-xs uppercase tracking-[0.16em] text-indigo-700">LONACI</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">Registres</h1>
          <p className="mt-1 text-sm text-slate-600">
            Gestion transversale des registres agréments, cessions et GPR.
          </p>
        </div>
      </section>

      <RegistryModulePanel
        module="AGREMENT"
        title="Registre Agréments"
        description="Saisie et suivi des entrées d’agréments."
        statuts={AGREMENT_STATUTS}
        defaultStatut="SOUMIS"
      />
      <RegistryModulePanel
        module="CESSION"
        title="Registre Cessions"
        description="Suivi synthétique des cessions et délocalisations."
        statuts={CESSION_STATUTS}
        defaultStatut="SAISIE_AGENT"
      />
      <RegistryModulePanel
        module="GPR"
        title="Registre GPR"
        description="Saisie centralisée des enregistrements GPR."
        statuts={GPR_STATUTS}
        defaultStatut="SOUMIS_AGENT"
      />
    </div>
  );
}

