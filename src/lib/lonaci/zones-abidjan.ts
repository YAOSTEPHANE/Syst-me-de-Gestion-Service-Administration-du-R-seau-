import { ObjectId, type Db } from "mongodb";

/**
 * Identifiants d’agences rattachées à la zone Abidjan (libellé ou code métier).
 * Utilisé pour ventiler les contrats / états par agence dans le district d’Abidjan.
 */
export async function listAgenceIdsZoneAbidjan(db: Db): Promise<string[]> {
  const rows = await db
    .collection<{ _id: ObjectId }>("agences")
    .find({
      $or: [{ libelle: { $regex: "abidjan", $options: "i" } }, { code: { $regex: "^ABJ", $options: "i" } }],
    })
    .project({ _id: 1 })
    .toArray();
  return rows.map((r) => r._id.toHexString());
}

export type AgenceLibelleDoc = { code: string; libelle: string };

/** Charge code + libellé des agences à partir de leurs `_id` Mongo (hex). */
export async function loadAgenceLibelleMap(db: Db, agenceIds: readonly (string | null | undefined)[]) {
  const unique = [
    ...new Set(
      agenceIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0 && ObjectId.isValid(id)),
    ),
  ];
  const map = new Map<string, AgenceLibelleDoc>();
  if (unique.length === 0) return map;
  const oids = unique.map((id) => new ObjectId(id));
  const rows = await db
    .collection<{ _id: ObjectId; code?: string; libelle?: string }>("agences")
    .find({ _id: { $in: oids } })
    .project({ code: 1, libelle: 1 })
    .toArray();
  for (const r of rows) {
    map.set(r._id.toHexString(), {
      code: String(r.code ?? "").trim(),
      libelle: String(r.libelle ?? "").trim(),
    });
  }
  return map;
}

export function formatAgenceLibelle(doc: AgenceLibelleDoc | undefined, agenceId: string | null | undefined): string {
  if (doc?.libelle) {
    const c = doc.code?.trim();
    return c ? `${c} — ${doc.libelle}` : doc.libelle;
  }
  if (agenceId?.trim()) return `Agence (${agenceId.trim()})`;
  return "Agence non renseignée";
}
