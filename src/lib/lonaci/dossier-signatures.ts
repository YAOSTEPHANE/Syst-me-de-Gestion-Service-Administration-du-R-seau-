import { createHash, randomBytes } from "node:crypto";
import { ObjectId } from "mongodb";

import { env } from "@/lib/env";
import { findDossierById } from "@/lib/lonaci/dossiers";
import { appendAuditLog } from "@/lib/lonaci/audit";
import { getDatabase } from "@/lib/mongodb";

const COLLECTION = "dossier_signatures";
const DEFAULT_EXPIRY_HOURS = 72;

type DossierSignatureRecord = {
  _id?: ObjectId;
  dossierId: string;
  tokenHash: string;
  status: "PENDING" | "SIGNED" | "EXPIRED";
  createdByUserId: string;
  createdAt: Date;
  expiresAt: Date;
  signedAt: Date | null;
  signerName: string | null;
  signerIp: string | null;
  signerUserAgent: string | null;
};

function hashToken(rawToken: string): string {
  return createHash("sha256")
    .update(`${rawToken}:${env.jwtSecret}`)
    .digest("hex");
}

export async function ensureDossierSignatureIndexes() {
  const db = await getDatabase();
  await db.collection<DossierSignatureRecord>(COLLECTION).createIndexes([
    { key: { tokenHash: 1 }, unique: true, name: "uniq_token_hash" },
    { key: { dossierId: 1, status: 1 }, name: "idx_dossier_status" },
    { key: { expiresAt: 1 }, name: "idx_expires_at" },
  ]);
}

export async function createDossierSignatureLink(input: {
  dossierId: string;
  createdByUserId: string;
  origin: string;
  expiryHours?: number;
}) {
  const dossier = await findDossierById(input.dossierId);
  if (!dossier || dossier.deletedAt) {
    throw new Error("DOSSIER_NOT_FOUND");
  }
  if (dossier.status !== "VALIDE_N2") {
    throw new Error("DOSSIER_NOT_READY_FOR_SIGNATURE");
  }

  await ensureDossierSignatureIndexes();
  const db = await getDatabase();
  const now = new Date();
  const expiryHours = input.expiryHours ?? DEFAULT_EXPIRY_HOURS;
  const expiresAt = new Date(now.getTime() + expiryHours * 60 * 60 * 1000);

  // Invalide les anciens liens en attente pour ce dossier.
  await db.collection<DossierSignatureRecord>(COLLECTION).updateMany(
    { dossierId: input.dossierId, status: "PENDING" },
    { $set: { status: "EXPIRED" as const } },
  );

  const token = randomBytes(24).toString("base64url");
  const tokenHash = hashToken(token);
  await db.collection<DossierSignatureRecord>(COLLECTION).insertOne({
    dossierId: input.dossierId,
    tokenHash,
    status: "PENDING",
    createdByUserId: input.createdByUserId,
    createdAt: now,
    expiresAt,
    signedAt: null,
    signerName: null,
    signerIp: null,
    signerUserAgent: null,
  });

  await appendAuditLog({
    entityType: "DOSSIER",
    entityId: input.dossierId,
    action: "ESIGN_LINK_CREATED",
    userId: input.createdByUserId,
    details: { expiresAt: expiresAt.toISOString() },
  });

  return {
    dossierId: input.dossierId,
    reference: dossier.reference,
    url: `${input.origin}/signature/dossier/${token}`,
    expiresAt,
  };
}

export async function getDossierSignatureByToken(token: string) {
  await ensureDossierSignatureIndexes();
  const db = await getDatabase();
  const tokenHash = hashToken(token);

  const record = await db.collection<DossierSignatureRecord>(COLLECTION).findOne({ tokenHash });
  if (!record) return null;

  if (record.status === "PENDING" && record.expiresAt.getTime() < Date.now()) {
    await db
      .collection<DossierSignatureRecord>(COLLECTION)
      .updateOne({ _id: record._id }, { $set: { status: "EXPIRED" as const } });
    return { ...record, status: "EXPIRED" as const };
  }

  return record;
}

export async function signDossierByToken(input: {
  token: string;
  signerName: string;
  signerIp: string | null;
  signerUserAgent: string | null;
}) {
  const record = await getDossierSignatureByToken(input.token);
  if (!record) {
    throw new Error("SIGN_TOKEN_INVALID");
  }
  if (record.status === "SIGNED") {
    throw new Error("SIGN_ALREADY_DONE");
  }
  if (record.status === "EXPIRED") {
    throw new Error("SIGN_TOKEN_EXPIRED");
  }

  const dossier = await findDossierById(record.dossierId);
  if (!dossier || dossier.deletedAt) {
    throw new Error("DOSSIER_NOT_FOUND");
  }

  const now = new Date();
  const db = await getDatabase();
  await db.collection<DossierSignatureRecord>(COLLECTION).updateOne(
    { _id: record._id, status: "PENDING" },
    {
      $set: {
        status: "SIGNED" as const,
        signedAt: now,
        signerName: input.signerName,
        signerIp: input.signerIp,
        signerUserAgent: input.signerUserAgent,
      },
    },
  );

  await appendAuditLog({
    entityType: "DOSSIER",
    entityId: record.dossierId,
    action: "ESIGN_SIGNED",
    userId: record.createdByUserId,
    details: {
      signerName: input.signerName,
      signedAt: now.toISOString(),
      signerIp: input.signerIp,
    },
  });

  return {
    dossierId: record.dossierId,
    reference: dossier.reference,
    signedAt: now,
    signerName: input.signerName,
  };
}
