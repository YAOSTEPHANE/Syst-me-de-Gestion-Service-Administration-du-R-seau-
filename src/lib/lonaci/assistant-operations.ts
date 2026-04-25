import { ObjectId } from "mongodb";

import { getDatabase } from "@/lib/mongodb";

export interface AssistantChecklistItem {
  id: string;
  label: string;
  checked: boolean;
}

export interface AssistantNoteItem {
  id: string;
  text: string;
  createdAt: string;
  createdByUserId: string;
  createdByDisplay: string;
}

type AssistantChecklistDoc = {
  _id: string;
  items: AssistantChecklistItem[];
  updatedAt: Date;
  updatedByUserId: string;
};

type AssistantNoteDoc = {
  _id?: ObjectId;
  text: string;
  createdAt: Date;
  createdByUserId: string;
  createdByDisplay: string;
};

const ASSISTANT_CHECKLIST_COLLECTION = "assistant_ops_checklist";
const ASSISTANT_NOTES_COLLECTION = "assistant_ops_notes";
const CHECKLIST_DOC_ID = "daily-checklist";

export const DEFAULT_ASSISTANT_CHECKLIST: AssistantChecklistItem[] = [
  { id: "auth-check", label: "Verifier les connexions / sessions anormales", checked: false },
  { id: "alerts-check", label: "Traiter les alertes critiques OPEN", checked: false },
  { id: "contracts-check", label: "Controler les dossiers contrats en attente", checked: false },
  { id: "cautions-check", label: "Controler les cautions J+10", checked: false },
  { id: "pdv-check", label: "Suivre les integrations PDV en retard", checked: false },
];

export async function ensureAssistantOperationsIndexes() {
  const db = await getDatabase();
  await db.collection<AssistantNoteDoc>(ASSISTANT_NOTES_COLLECTION).createIndexes([
    { key: { createdAt: -1 }, name: "idx_createdAt_desc" },
    { key: { createdByUserId: 1, createdAt: -1 }, name: "idx_author_createdAt" },
  ]);
}

export async function getAssistantChecklist(): Promise<AssistantChecklistItem[]> {
  const db = await getDatabase();
  const doc = await db
    .collection<AssistantChecklistDoc>(ASSISTANT_CHECKLIST_COLLECTION)
    .findOne({ _id: CHECKLIST_DOC_ID });
  if (!doc) return DEFAULT_ASSISTANT_CHECKLIST;
  return doc.items ?? DEFAULT_ASSISTANT_CHECKLIST;
}

export async function saveAssistantChecklist(input: { items: AssistantChecklistItem[]; actorUserId: string }) {
  const db = await getDatabase();
  await db.collection<AssistantChecklistDoc>(ASSISTANT_CHECKLIST_COLLECTION).updateOne(
    { _id: CHECKLIST_DOC_ID },
    {
      $set: {
        items: input.items,
        updatedAt: new Date(),
        updatedByUserId: input.actorUserId,
      },
    },
    { upsert: true },
  );
}

export async function listAssistantNotes(limit = 50): Promise<AssistantNoteItem[]> {
  const db = await getDatabase();
  const rows = await db
    .collection<AssistantNoteDoc>(ASSISTANT_NOTES_COLLECTION)
    .find({})
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
  return rows.map((row) => ({
    id: row._id?.toHexString() ?? "",
    text: row.text,
    createdAt: row.createdAt.toISOString(),
    createdByUserId: row.createdByUserId,
    createdByDisplay: row.createdByDisplay,
  }));
}

export async function createAssistantNote(input: {
  text: string;
  createdByUserId: string;
  createdByDisplay: string;
}) {
  const db = await getDatabase();
  const result = await db.collection<AssistantNoteDoc>(ASSISTANT_NOTES_COLLECTION).insertOne({
    text: input.text,
    createdAt: new Date(),
    createdByUserId: input.createdByUserId,
    createdByDisplay: input.createdByDisplay,
  });
  return result.insertedId.toHexString();
}

export async function getAssistantNoteById(id: string): Promise<AssistantNoteItem | null> {
  if (!ObjectId.isValid(id)) return null;
  const db = await getDatabase();
  const row = await db
    .collection<AssistantNoteDoc>(ASSISTANT_NOTES_COLLECTION)
    .findOne({ _id: new ObjectId(id) });
  if (!row) return null;
  return {
    id: row._id?.toHexString() ?? "",
    text: row.text,
    createdAt: row.createdAt.toISOString(),
    createdByUserId: row.createdByUserId,
    createdByDisplay: row.createdByDisplay,
  };
}

export async function deleteAssistantNote(id: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;
  const db = await getDatabase();
  const result = await db
    .collection<AssistantNoteDoc>(ASSISTANT_NOTES_COLLECTION)
    .deleteOne({ _id: new ObjectId(id) });
  return result.deletedCount > 0;
}
