import { prisma } from "@/lib/prisma";
import { getDatabase } from "@/lib/mongodb";

function normalizeProduitCode(code: string) {
  return code.trim().toUpperCase();
}

/**
 * Compte les enregistrements métier liés à un code produit (empêche suppression dure ou renommage destructeur).
 */
export async function countProduitReferences(produitCode: string): Promise<number> {
  const code = normalizeProduitCode(produitCode);
  const db = await getDatabase();

  const [contrats, banca, dossiers, pdv, cess] = await Promise.all([
    prisma.contrat.count({ where: { produitCode: code, deletedAt: null } }),
    prisma.bancarisationRequest.count({ where: { produitCode: code } }),
    db.collection("dossiers").countDocuments({ deletedAt: null, "payload.produitCode": code }),
    db.collection("pdv_integrations").countDocuments({ deletedAt: null, produitCode: code }),
    db.collection("cessions").countDocuments({ deletedAt: null, produitCode: code }),
  ]);

  return contrats + banca + dossiers + pdv + cess;
}
