/** Convertit un montant entier FCFA en lettres (français). */

const UNITS = [
  "zéro",
  "un",
  "deux",
  "trois",
  "quatre",
  "cinq",
  "six",
  "sept",
  "huit",
  "neuf",
  "dix",
  "onze",
  "douze",
  "treize",
  "quatorze",
  "quinze",
  "seize",
  "dix-sept",
  "dix-huit",
  "dix-neuf",
] as const;

const TENS = [
  "",
  "",
  "vingt",
  "trente",
  "quarante",
  "cinquante",
  "soixante",
  "soixante",
  "quatre-vingt",
  "quatre-vingt",
] as const;

function underHundred(n: number): string {
  if (n < 20) return UNITS[n]!;
  const ten = Math.floor(n / 10);
  const unit = n % 10;
  if (ten === 7 || ten === 9) {
    const base = ten === 7 ? 60 : 80;
    const rest = n - base;
    if (ten === 9 && unit === 0) return "quatre-vingts";
    if (rest === 1 && ten === 7) return "soixante et onze";
    return `${TENS[ten]}-${underHundred(rest)}`;
  }
  if (unit === 0) return ten === 8 ? "quatre-vingts" : TENS[ten]!;
  if (unit === 1 && ten !== 8) return `${TENS[ten]} et un`;
  return `${TENS[ten]}-${UNITS[unit]}`;
}

function underThousand(n: number): string {
  if (n < 100) return underHundred(n);
  const hundred = Math.floor(n / 100);
  const rest = n % 100;
  const hundredPart =
    hundred === 1 ? "cent" : `${UNITS[hundred]} cent${rest === 0 ? "s" : ""}`;
  if (rest === 0) return hundredPart;
  return `${hundred === 1 ? "cent" : `${UNITS[hundred]} cent`} ${underHundred(rest)}`;
}

function underMillion(n: number): string {
  if (n < 1000) return underThousand(n);
  const thousands = Math.floor(n / 1000);
  const rest = n % 1000;
  const thousandPart =
    thousands === 1 ? "mille" : `${underThousand(thousands)} mille`;
  if (rest === 0) return thousandPart;
  return `${thousandPart} ${underThousand(rest)}`;
}

/**
 * Montant en lettres pour affichage sur fiches LONACI (FCFA).
 * Ex. 250000 → « deux cent cinquante mille francs CFA »
 */
export function montantFcfaEnLettres(amount: number): string {
  const n = Math.round(Math.abs(Number.isFinite(amount) ? amount : 0));
  const unit = n === 0 || n === 1 ? "franc CFA" : "francs CFA";
  if (n === 0) return `zéro ${unit}`;
  if (n >= 1_000_000_000) {
    return `${n.toLocaleString("fr-FR")} ${unit}`;
  }
  let words: string;
  if (n < 1_000_000) {
    words = underMillion(n);
  } else {
    const millions = Math.floor(n / 1_000_000);
    const rest = n % 1_000_000;
    const millionPart =
      millions === 1 ? "un million" : `${underMillion(millions)} millions`;
    words = rest === 0 ? millionPart : `${millionPart} ${underMillion(rest)}`;
  }
  return `${words} ${unit}`;
}
