import type { ModuleCourrierContext, ModuleCourrierTemplate } from "@/lib/lonaci/module-courrier-types";

export function buildModuleCourrierContext(
  base: Omit<ModuleCourrierContext, "date" | "dateLong" | "contacts"> & {
    contacts?: string;
    generatedAt?: Date;
  },
): ModuleCourrierContext {
  const generatedAt = base.generatedAt ?? new Date();
  const telephone = base.telephone.trim();
  const email = base.email.trim();
  const contacts =
    base.contacts?.trim() ||
    [telephone, email].filter(Boolean).join(" · ") ||
    "—";
  return {
    nom: base.nom.trim() || "—",
    prenoms: base.prenoms.trim() || "—",
    nomComplet: base.nomComplet.trim() || "—",
    telephone: telephone || "—",
    email: email || "—",
    contacts,
    codeTerminal: base.codeTerminal.trim() || base.codePdv.trim() || "—",
    codePdv: base.codePdv.trim() || base.codeTerminal.trim() || "—",
    reference: base.reference.trim() || "—",
    agence: base.agence.trim() || "—",
    ville: base.ville.trim() || "Abidjan",
    date: generatedAt.toLocaleDateString("fr-FR"),
    dateLong: generatedAt.toLocaleDateString("fr-FR", { dateStyle: "long" }),
  };
}

const PLACEHOLDER_KEYS: Array<keyof ModuleCourrierContext> = [
  "nom",
  "prenoms",
  "nomComplet",
  "telephone",
  "email",
  "contacts",
  "codeTerminal",
  "codePdv",
  "reference",
  "agence",
  "ville",
  "date",
  "dateLong",
];

export function interpolateModuleCourrierText(text: string, context: ModuleCourrierContext): string {
  let output = text;
  for (const key of PLACEHOLDER_KEYS) {
    const token = `{{${key}}}`;
    output = output.split(token).join(context[key]);
  }
  return output;
}

export function applyModuleCourrierTemplate(
  template: ModuleCourrierTemplate,
  context: ModuleCourrierContext,
): Pick<ModuleCourrierTemplate, "destinataire" | "objet" | "corps" | "signatureLabel"> {
  return {
    destinataire: interpolateModuleCourrierText(template.destinataire, context),
    objet: interpolateModuleCourrierText(template.objet, context),
    corps: interpolateModuleCourrierText(template.corps, context),
    signatureLabel: interpolateModuleCourrierText(template.signatureLabel, context),
  };
}
