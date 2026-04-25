"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { LONACI_NAV } from "@/components/lonaci/lonaci-nav";

type ChecklistItem = {
  id: string;
  label: string;
  checked: boolean;
};

type NoteItem = {
  id: string;
  text: string;
  createdAt: string;
  createdByUserId: string;
  createdByDisplay: string;
};

export default function AssistantOperationsPage() {
  const [query, setQuery] = useState("");
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [canEditChecklist, setCanEditChecklist] = useState(false);
  const [canDeleteAnyNote, setCanDeleteAnyNote] = useState(false);
  const [currentUserId, setCurrentUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingChecklist, setSavingChecklist] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");

  const loadAssistantOps = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/assistant-operations", {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Chargement impossible");
      const data = (await res.json()) as {
        checklist: ChecklistItem[];
        notes: NoteItem[];
        currentUserId: string;
        permissions: {
          canEditChecklist: boolean;
          canDeleteAnyNote: boolean;
        };
      };
      setChecklist(data.checklist ?? []);
      setNotes(data.notes ?? []);
      setCurrentUserId(data.currentUserId ?? "");
      setCanEditChecklist(Boolean(data.permissions?.canEditChecklist));
      setCanDeleteAnyNote(Boolean(data.permissions?.canDeleteAnyNote));
    } catch {
      setError("Impossible de charger l’assistant opérations.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAssistantOps();
  }, [loadAssistantOps]);

  const moduleLinks = useMemo(() => {
    const q = query.trim().toLowerCase();
    return LONACI_NAV.filter((item) => item.href !== "/assistant-operations").filter((item) => {
      if (!q) return true;
      return item.label.toLowerCase().includes(q) || item.href.toLowerCase().includes(q);
    });
  }, [query]);

  const completionRatio = useMemo(() => {
    const total = checklist.length;
    const done = checklist.filter((item) => item.checked).length;
    return { total, done, percent: total > 0 ? Math.round((done / total) * 100) : 0 };
  }, [checklist]);

  async function persistChecklist(next: ChecklistItem[]) {
    if (!canEditChecklist) return;
    setSavingChecklist(true);
    setError(null);
    setChecklist(next);
    try {
      const res = await fetch("/api/assistant-operations/checklist", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: next }),
      });
      if (!res.ok) throw new Error("Sauvegarde impossible");
    } catch {
      setError("Impossible de sauvegarder la checklist.");
      await loadAssistantOps();
    } finally {
      setSavingChecklist(false);
    }
  }

  async function createNote() {
    const text = noteDraft.trim();
    if (!text) return;
    setSavingNote(true);
    setError(null);
    try {
      const res = await fetch("/api/assistant-operations/notes", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error("Creation impossible");
      setNoteDraft("");
      await loadAssistantOps();
    } catch {
      setError("Impossible d’ajouter la note.");
    } finally {
      setSavingNote(false);
    }
  }

  async function deleteNote(id: string) {
    setDeletingNoteId(id);
    setError(null);
    try {
      const res = await fetch(`/api/assistant-operations/notes/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Suppression impossible");
      await loadAssistantOps();
    } catch {
      setError("Impossible de supprimer la note.");
    } finally {
      setDeletingNoteId(null);
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs uppercase tracking-[0.14em] text-sky-700">Module productivité</p>
        <h1 className="mt-1 text-xl font-semibold text-slate-900">Assistant opérations</h1>
        <p className="mt-1 text-sm text-slate-600">
          Regroupe les actions quotidiennes : checklist, notes terrain et accès rapide aux modules.
        </p>
      </section>

      {error ? (
        <section className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</section>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Checklist quotidienne</h2>
            <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700">
              {completionRatio.done}/{completionRatio.total} ({completionRatio.percent}%)
            </span>
          </div>
          <div className="space-y-2">
            {loading ? (
              <p className="text-xs text-slate-500">Chargement...</p>
            ) : (
              checklist.map((item) => (
              <label key={item.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-2 py-1.5">
                <input
                  type="checkbox"
                  checked={item.checked}
                  disabled={!canEditChecklist || savingChecklist}
                  onChange={(e) => {
                    void persistChecklist(
                      checklist.map((current) =>
                        current.id === item.id ? { ...current, checked: e.target.checked } : current,
                      ),
                    );
                  }}
                />
                <span className={item.checked ? "text-sm text-slate-400 line-through" : "text-sm text-slate-700"}>
                  {item.label}
                </span>
              </label>
              ))
            )}
          </div>
          <button
            type="button"
            disabled={!canEditChecklist || savingChecklist}
            onClick={() => void persistChecklist(checklist.map((item) => ({ ...item, checked: false })))}
            className="mt-3 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Réinitialiser la checklist
          </button>
          {!canEditChecklist ? (
            <p className="mt-2 text-[11px] text-slate-500">Modification checklist réservée aux rôles de supervision.</p>
          ) : null}
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Notes rapides</h2>
          <div className="flex gap-2">
            <input
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder="Ajouter une note opérationnelle..."
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
            />
            <button
              type="button"
              disabled={savingNote}
              onClick={() => void createNote()}
              className="rounded-lg border border-indigo-600 bg-indigo-600 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {savingNote ? "Ajout..." : "Ajouter"}
            </button>
          </div>
          <div className="mt-3 space-y-2">
            {loading ? (
              <p className="text-xs text-slate-500">Chargement...</p>
            ) : notes.length === 0 ? (
              <p className="text-xs text-slate-500">Aucune note pour le moment.</p>
            ) : (
              notes.slice(0, 8).map((note) => (
                <div key={note.id} className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
                  <p className="text-sm text-slate-800">{note.text}</p>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-[11px] text-slate-500">
                      {new Date(note.createdAt).toLocaleString("fr-FR")} · {note.createdByDisplay}
                    </span>
                    {canDeleteAnyNote || note.createdByUserId === currentUserId ? (
                      <button
                        type="button"
                        disabled={deletingNoteId === note.id}
                        onClick={() => void deleteNote(note.id)}
                        className="text-[11px] text-rose-700 hover:underline disabled:opacity-50"
                      >
                        {deletingNoteId === note.id ? "Suppression..." : "Supprimer"}
                      </button>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>
        </article>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900">Accès rapide modules</h2>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un module..."
            className="w-full max-w-xs rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900"
          />
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {moduleLinks.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 hover:border-sky-300 hover:bg-sky-50"
            >
              {item.label}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
