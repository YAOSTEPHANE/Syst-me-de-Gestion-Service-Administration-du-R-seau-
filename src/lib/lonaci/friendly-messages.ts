export function friendlyErrorMessage(raw: string | null | undefined): string {
  const input = (raw ?? "").toString().trim();
  if (!input) return "Une erreur est survenue.";

  // Heuristique : si c'est déjà une phrase lisible (contient des lettres et pas de code SCREAMING_SNAKE très typé)
  if (/[A-Za-zÀ-ÿ]/.test(input) && !/^[A-Z0-9_]{2,}$/.test(input)) {
    return input;
  }

  const upper = input.toUpperCase();

  const mapped: Record<string, string> = {
    CASE_NOT_FOUND: "Dossier de succession introuvable.",
    CONCESSIONNAIRE_NOT_FOUND: "Le concessionnaire lié est introuvable.",
    AGENCE_FORBIDDEN: "Accès refusé : vous n’avez pas les droits sur cette ressource.",
    ACTE_DECES_REQUIRED: "Acte de décès obligatoire pour cette opération.",
    CONTRAT_NOT_FOUND: "Contrat introuvable.",
    CONTRAT_NOT_ACTIF: "Contrat non actif (opération refusée).",
    CONCESSIONNAIRE_BLOQUE: "Opération interdite (concessionnaire non actif/résilié/décédé).",
    CONCESSIONNAIRE_NOT_FOUND_2: "Concessionnaire introuvable.",
  };

  if (mapped[upper]) return mapped[upper];

  if (upper.includes("E11000")) return "Doublon : un enregistrement existe déjà.";
  if (upper.includes("FORBIDDEN")) return "Accès refusé.";
  if (upper.includes("NOT_FOUND")) return "Ressource introuvable.";

  // Fallback : découpe code SCREAMING_SNAKE
  if (/^[A-Z0-9_]{2,}$/.test(upper)) {
    const pretty = upper
      .split("_")
      .filter(Boolean)
      .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
      .join(" ");
    return pretty.endsWith(".") ? pretty : `${pretty}.`;
  }

  return input;
}

