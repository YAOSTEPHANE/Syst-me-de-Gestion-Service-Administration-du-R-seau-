import { KeyRound, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/lonaci/ui/badge";
import { PageHeader } from "@/components/lonaci/ui/headers";
import { Surface } from "@/components/lonaci/ui/surface";
import { ROLE_MODULE_PERMISSION_MATRIX } from "@/lib/auth/rbac";

const ROLE_HEADERS = ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"] as const;
const ROLE_LABELS = {
  AGENT: "Agent",
  CHEF_SECTION: "Chef de section",
  ASSIST_CDS: "Assistant CDS",
  CHEF_SERVICE: "Chef de service",
} as const;

const LEGEND = [
  ["A", "Action / saisie"],
  ["C", "Contrôle"],
  ["V", "Validation finale"],
  ["S", "Suivi / lecture"],
  ["R", "Rapport"],
  ["—", "Pas d’accès"],
] as const;

export default function RolePermissionsMatrixPanel() {
  return (
    <section className="space-y-4">
      <PageHeader
        eyebrow="Administration · RBAC"
        title="Rôles & permissions"
        description="Vue de référence des capacités accordées à chaque rôle, module par module."
        actions={<Badge tone="brand"><ShieldCheck size={14} aria-hidden="true" /> Matrice en lecture seule</Badge>}
      />
      <Surface padding="md" elevated>
        <div className="flex flex-wrap gap-2" aria-label="Légende des permissions">
          {LEGEND.map(([code, label]) => (
            <Badge key={code} tone={code === "—" ? "neutral" : "info"}>
              <span className="font-mono font-bold">{code}</span> {label}
            </Badge>
          ))}
        </div>
      </Surface>
      <Surface padding="none" elevated className="lonaci-ui-data-table">
        <div className="lonaci-ui-table-scroll lonaci-ui-table-scroll--has-mobile">
        <table>
          <caption className="lonaci-ui-sr-only">Matrice des permissions par rôle et par module</caption>
          <thead>
            <tr>
              <th scope="col">Module</th>
              {ROLE_HEADERS.map((role) => (
                <th key={role} scope="col">
                  {ROLE_LABELS[role]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROLE_MODULE_PERMISSION_MATRIX.map((row) => (
              <tr key={row.module}>
                <th scope="row" className="font-semibold text-slate-950">{row.module}</th>
                {ROLE_HEADERS.map((role) => (
                  <td key={`${row.module}-${role}`}>
                    <Badge tone={row.permissions[role] === "—" ? "neutral" : "brand"}>{row.permissions[role]}</Badge>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="lonaci-ui-table-mobile" role="list" aria-label="Permissions par module">
        {ROLE_MODULE_PERMISSION_MATRIX.map((row) => (
          <Surface key={row.module} padding="md" elevated>
            <div className="flex items-center gap-2"><KeyRound size={18} className="text-cyan-700" aria-hidden="true" /><h3 className="font-semibold text-slate-950">{row.module}</h3></div>
            <dl className="mt-4 grid gap-3">
              {ROLE_HEADERS.map((role) => (
                <div key={`${row.module}-mobile-${role}`} className="flex items-center justify-between gap-3">
                  <dt className="text-sm text-slate-600">{ROLE_LABELS[role]}</dt>
                  <dd><Badge tone={row.permissions[role] === "—" ? "neutral" : "brand"}>{row.permissions[role]}</Badge></dd>
                </div>
              ))}
            </dl>
          </Surface>
        ))}
      </div>
      </Surface>
    </section>
  );
}
