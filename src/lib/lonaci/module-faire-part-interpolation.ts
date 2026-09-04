import type { FairePartContext, FairePartTemplate } from "@/lib/lonaci/module-faire-part-types";

export function buildFairePartContext(
  base: Omit<FairePartContext, "date" | "dateLong" | "contacts" | "dateDeces" | "dateDecesLong"> & {
    contacts?: string;
    generatedAt?: Date;
    dateDecesRaw?: Date | null;
  },
): FairePartContext {
  const generatedAt = base.generatedAt ?? new Date();
  const telephone = base.telephone.trim();
  const email = base.email.trim();
  const contacts =
    base.contacts?.trim() ||
    [telephone, email].filter(Boolean).join(" · ") ||
    "—";
  const dateDecesRaw = base.dateDecesRaw ?? null;
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
    defunt: base.defunt.trim() || "—",
    dateDeces: dateDecesRaw ? dateDecesRaw.toLocaleDateString("fr-FR") : "—",
    dateDecesLong: dateDecesRaw
      ? dateDecesRaw.toLocaleDateString("fr-FR", { dateStyle: "long" })
      : "—",
    ayantDroit: base.ayantDroit.trim() || base.nomComplet.trim() || "—",
    lienParente: base.lienParente.trim() || "—",
  };
}

const PLACEHOLDER_KEYS: Array<keyof FairePartContext> = [
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
  "defunt",
  "dateDeces",
  "dateDecesLong",
  "ayantDroit",
  "lienParente",
];

export function interpolateFairePartText(text: string, context: FairePartContext): string {
  let output = text;
  for (const key of PLACEHOLDER_KEYS) {
    const token = `{{${key}}}`;
    output = output.split(token).join(context[key]);
  }
  // Confort rédactionnel : {{lienParenteSuffix}} → « (lien) » ou chaîne vide
  const lien = context.lienParente.trim();
  const suffix =
    !lien || lien === "—" ? "" : ` (${lien})`;
  output = output.split("{{lienParenteSuffix}}").join(suffix);
  return output;
}

export function applyFairePartTemplate(
  template: FairePartTemplate,
  context: FairePartContext,
): Pick<FairePartTemplate, "destinataire" | "objet" | "corps" | "signatureLabel"> {
  return {
    destinataire: interpolateFairePartText(template.destinataire, context),
    objet: interpolateFairePartText(template.objet, context),
    corps: interpolateFairePartText(template.corps, context),
    signatureLabel: interpolateFairePartText(template.signatureLabel, context),
  };
}
