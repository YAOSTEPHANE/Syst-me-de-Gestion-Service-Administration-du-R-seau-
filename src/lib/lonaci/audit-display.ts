/** Libellés français des champs fiche concessionnaire (journal d’audit). */
export const CONCESSIONNAIRE_AUDIT_FIELD_LABELS: Record<string, string> = {
  nomComplet: "Nom complet",
  cniNumero: "Numéro CNI",
  photoUrl: "Photo (URL)",
  email: "E-mail",
  telephonePrincipal: "Téléphone principal",
  telephoneSecondaire: "Téléphone secondaire",
  adresse: "Adresse",
  ville: "Ville",
  codePostal: "Code postal",
  agenceId: "Agence de rattachement",
  produitsAutorises: "Produits autorisés",
  statut: "Statut",
  statutBancarisation: "Statut de bancarisation",
  compteBancaire: "Compte bancaire",
  gps: "Coordonnées GPS",
  observations: "Observations",
  notesInternes: "Notes internes",
};

/**
 * Texte lisible pour l’historique concessionnaire (sans exposer le JSON brut aux utilisateurs).
 */
export function humanizeConcessionnaireAuditDetails(
  action: string,
  details: Record<string, unknown> | null,
): string | null {
  if (!details || Object.keys(details).length === 0) {
    return null;
  }

  if (action === "UPDATE") {
    const fields = details.fields;
    if (Array.isArray(fields) && fields.length > 0) {
      const lines = (fields as string[]).map((key) => {
        const label = CONCESSIONNAIRE_AUDIT_FIELD_LABELS[key] ?? key;
        return `• ${label}`;
      });
      return `Champs modifiés :\n${lines.join("\n")}`;
    }
  }

  if (action === "CREATE") {
    const lines: string[] = [];
    if (typeof details.codePdv === "string") {
      lines.push(`Code PDV attribué : ${details.codePdv}`);
    }
    if (typeof details.raisonSociale === "string") {
      lines.push(`Dénomination : ${details.raisonSociale}`);
    }
    return lines.length > 0 ? lines.join("\n") : null;
  }

  if (action === "DEACTIVATE") {
    if (details.statut === "INACTIF") {
      return "La fiche a été désactivée (statut métier : Inactif). Aucune suppression définitive.";
    }
    return `Action de désactivation — ${JSON.stringify(details)}`;
  }

  if (action === "PIECE_ADD") {
    const kind = typeof details.kind === "string" ? details.kind : "?";
    const kindFr = kind === "PHOTO" ? "Photo" : kind === "DOCUMENT" ? "Document" : kind;
    const name = typeof details.filename === "string" ? details.filename : "(sans nom)";
    return `Pièce ajoutée — type : ${kindFr}, fichier : ${name}`;
  }

  if (action === "PIECE_REMOVE") {
    const name = typeof details.filename === "string" ? details.filename : "(sans nom)";
    return `Pièce retirée du dossier : ${name}`;
  }

  return JSON.stringify(details, null, 2);
}

export function formatAuditUserDisplay(
  prenom: string,
  nom: string,
  email: string,
): string {
  const name = `${prenom} ${nom}`.trim() || "Utilisateur";
  return `${name} — ${email}`;
}
