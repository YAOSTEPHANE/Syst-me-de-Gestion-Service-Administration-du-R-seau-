import { ROLE_MODULE_PERMISSION_MATRIX } from "@/lib/auth/rbac";

const ROLE_HEADERS = ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"] as const;

export default function RolePermissionsMatrixPanel() {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
        <h2 className="text-base font-semibold text-slate-900">Rôles & permissions par module</h2>
        <p className="mt-1 text-xs text-slate-600">
          Légende: A = Action/Saisie · C = Contrôle · V = Validation finale · S = Suivi/Lecture · R = Rapport · — =
          Pas d&apos;accès
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-100 text-slate-700">
            <tr>
              <th className="px-3 py-2.5 font-semibold">Module</th>
              {ROLE_HEADERS.map((role) => (
                <th key={role} className="px-3 py-2.5 font-semibold">
                  {role}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="text-slate-800">
            {ROLE_MODULE_PERMISSION_MATRIX.map((row) => (
              <tr key={row.module} className="border-t border-slate-200 align-top">
                <td className="px-3 py-2.5 font-medium text-slate-900">{row.module}</td>
                {ROLE_HEADERS.map((role) => (
                  <td key={`${row.module}-${role}`} className="px-3 py-2.5 text-[13px]">
                    {row.permissions[role]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
