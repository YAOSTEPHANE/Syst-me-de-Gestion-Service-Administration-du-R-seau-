"use client";

import {
  Bot,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  History,
  LoaderCircle,
  LockKeyhole,
  MessageSquareText,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Trash2,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { LONACI_NAV } from "@/components/lonaci/lonaci-nav";
import { Button } from "@/components/lonaci/ui/button";
import { FeedbackState, Skeleton } from "@/components/lonaci/ui/feedback-state";
import { PageHeader } from "@/components/lonaci/ui/headers";
import { Surface } from "@/components/lonaci/ui/surface";
import { notify } from "@/lib/toast";

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
    setChecklist(next);
    try {
      const res = await fetch("/api/assistant-operations/checklist", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: next }),
      });
      if (!res.ok) throw new Error("Sauvegarde impossible");
      notify.success("Checklist sauvegardée.");
    } catch (error) {
      notify.error(error, "Impossible de sauvegarder la checklist.");
      await loadAssistantOps();
    } finally {
      setSavingChecklist(false);
    }
  }

  async function createNote() {
    const text = noteDraft.trim();
    if (!text) return;
    setSavingNote(true);
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
      notify.success("Note ajoutée.");
    } catch (error) {
      notify.error(error, "Impossible d’ajouter la note.");
    } finally {
      setSavingNote(false);
    }
  }

  async function deleteNote(id: string) {
    setDeletingNoteId(id);
    try {
      const res = await fetch(`/api/assistant-operations/notes/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Suppression impossible");
      await loadAssistantOps();
      notify.success("Note supprimée.");
    } catch (error) {
      notify.error(error, "Impossible de supprimer la note.");
    } finally {
      setDeletingNoteId(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Opérations · Assistant"
        title="Assistant opérations"
        description="Votre espace de travail quotidien pour piloter la checklist, transmettre les notes terrain et accéder rapidement aux modules."
        actions={
          <div className="flex min-h-11 items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-4 text-sm font-semibold text-orange-800">
            <Sparkles size={18} aria-hidden="true" />
            {completionRatio.percent}% accompli
          </div>
        }
      />

      {error ? (
        <FeedbackState
          tone="danger"
          title="Assistant indisponible"
          description={error}
          action={
            <Button variant="secondary" leadingIcon={RefreshCw} onClick={() => void loadAssistantOps()}>
              Réessayer
            </Button>
          }
        />
      ) : null}

      <Surface elevated padding="none" className="overflow-hidden">
        <div className="grid min-h-160 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section className="flex min-w-0 flex-col bg-slate-50/70" aria-labelledby="conversation-title">
            <div className="flex min-h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#071b33] text-orange-400 shadow-sm">
                  <Bot size={22} aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <h2 id="conversation-title" className="truncate text-base font-bold text-slate-950">
                    Fil opérationnel
                  </h2>
                  <p className="flex items-center gap-1.5 text-xs text-slate-500">
                    <span className="size-2 rounded-full bg-emerald-500" aria-hidden="true" />
                    Notes partagées avec votre équipe
                  </p>
                </div>
              </div>
              <span className="hidden items-center gap-1.5 text-xs font-medium text-slate-500 sm:flex">
                <History size={16} aria-hidden="true" />
                {notes.length} note{notes.length > 1 ? "s" : ""}
              </span>
            </div>

            <div
              className="flex-1 space-y-5 overflow-y-auto px-4 py-5 sm:px-6"
              aria-live="polite"
              aria-busy={loading || savingNote || Boolean(deletingNoteId)}
            >
              <div className="flex max-w-2xl items-start gap-3">
                <span className="mt-1 grid size-9 shrink-0 place-items-center rounded-xl bg-[#071b33] text-orange-400">
                  <Bot size={18} aria-hidden="true" />
                </span>
                <div className="rounded-2xl rounded-tl-md border border-slate-200 bg-white px-4 py-3 shadow-sm">
                  <p className="text-sm font-semibold text-slate-950">Bonjour, votre espace est prêt.</p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    Suivez les actions du jour, consultez l’historique partagé ou ouvrez un module depuis les
                    suggestions.
                  </p>
                </div>
              </div>

              <div className="flex max-w-2xl items-start gap-3">
                <span className="mt-1 grid size-9 shrink-0 place-items-center rounded-xl bg-orange-100 text-orange-700">
                  <ClipboardCheck size={18} aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1 rounded-2xl rounded-tl-md border border-orange-200 bg-orange-50/80 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold text-slate-950">Checklist quotidienne</p>
                      <p className="mt-0.5 text-xs text-slate-600">
                        {completionRatio.done} action{completionRatio.done > 1 ? "s" : ""} terminée
                        {completionRatio.done > 1 ? "s" : ""} sur {completionRatio.total}
                      </p>
                    </div>
                    <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-orange-800 ring-1 ring-orange-200">
                      {completionRatio.percent}%
                    </span>
                  </div>
                  <div
                    className="mt-3 h-2 overflow-hidden rounded-full bg-orange-100"
                    role="progressbar"
                    aria-label="Progression de la checklist"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={completionRatio.percent}
                  >
                    <div
                      className="h-full rounded-full bg-orange-500 transition-[width]"
                      style={{ width: `${completionRatio.percent}%` }}
                    />
                  </div>

                  <div className="mt-4 space-y-2">
                    {loading ? (
                      <Skeleton lines={4} />
                    ) : checklist.length === 0 ? (
                      <p className="rounded-xl bg-white/70 p-3 text-sm text-slate-600">Aucune action planifiée.</p>
                    ) : (
                      checklist.map((item) => (
                        <label
                          key={item.id}
                          className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-orange-100 bg-white px-3 py-2.5 transition hover:border-orange-300 has-disabled:cursor-not-allowed has-disabled:opacity-70"
                        >
                          <input
                            type="checkbox"
                            checked={item.checked}
                            disabled={!canEditChecklist || savingChecklist}
                            onChange={(event) => {
                              void persistChecklist(
                                checklist.map((current) =>
                                  current.id === item.id ? { ...current, checked: event.target.checked } : current,
                                ),
                              );
                            }}
                            className="size-5 shrink-0 accent-orange-600"
                          />
                          <span
                            className={
                              item.checked
                                ? "text-sm text-slate-400 line-through"
                                : "text-sm font-medium text-slate-700"
                            }
                          >
                            {item.label}
                          </span>
                          {item.checked ? <Check size={17} className="ml-auto text-emerald-600" aria-hidden="true" /> : null}
                        </label>
                      ))
                    )}
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      leadingIcon={RefreshCw}
                      loading={savingChecklist}
                      disabled={!canEditChecklist || loading}
                      className="min-h-11"
                      onClick={() => void persistChecklist(checklist.map((item) => ({ ...item, checked: false })))}
                    >
                      Réinitialiser
                    </Button>
                    {!canEditChecklist ? (
                      <span className="flex items-center gap-1.5 text-xs text-slate-500">
                        <LockKeyhole size={15} aria-hidden="true" />
                        Réservé à la supervision
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>

              {loading ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <Skeleton lines={5} />
                </div>
              ) : notes.length === 0 ? (
                <div className="mx-auto flex max-w-md flex-col items-center py-8 text-center">
                  <span className="grid size-12 place-items-center rounded-2xl bg-slate-200 text-slate-600">
                    <MessageSquareText size={22} aria-hidden="true" />
                  </span>
                  <p className="mt-3 text-sm font-semibold text-slate-800">Aucune note dans l’historique</p>
                  <p className="mt-1 text-sm text-slate-500">Ajoutez la première information opérationnelle.</p>
                </div>
              ) : (
                notes.slice(0, 8).map((note) => {
                  const isCurrentUser = note.createdByUserId === currentUserId;
                  return (
                    <article
                      key={note.id}
                      className={`flex items-start gap-3 ${isCurrentUser ? "ml-auto max-w-2xl flex-row-reverse" : "max-w-2xl"}`}
                    >
                      <span
                        className={`mt-1 grid size-9 shrink-0 place-items-center rounded-xl ${
                          isCurrentUser ? "bg-orange-100 text-orange-700" : "bg-slate-200 text-[#071b33]"
                        }`}
                      >
                        <UserRound size={18} aria-hidden="true" />
                      </span>
                      <div
                        className={`min-w-0 rounded-2xl px-4 py-3 shadow-sm ${
                          isCurrentUser
                            ? "rounded-tr-md bg-[#071b33] text-white"
                            : "rounded-tl-md border border-slate-200 bg-white text-slate-900"
                        }`}
                      >
                        <p className="wrap-break-word whitespace-pre-wrap text-sm leading-6">{note.text}</p>
                        <div
                          className={`mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs ${
                            isCurrentUser ? "text-slate-300" : "text-slate-500"
                          }`}
                        >
                          <span>
                            {note.createdByDisplay} · {new Date(note.createdAt).toLocaleString("fr-FR")}
                          </span>
                          {canDeleteAnyNote || isCurrentUser ? (
                            <button
                              type="button"
                              disabled={deletingNoteId === note.id}
                              onClick={() => void deleteNote(note.id)}
                              className={`ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 font-semibold transition disabled:opacity-50 ${
                                isCurrentUser
                                  ? "text-orange-200 hover:bg-white/10 hover:text-orange-100"
                                  : "text-rose-700 hover:bg-rose-50"
                              }`}
                              aria-label={`Supprimer la note de ${note.createdByDisplay}`}
                            >
                              {deletingNoteId === note.id ? (
                                <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
                              ) : (
                                <Trash2 size={16} aria-hidden="true" />
                              )}
                              {deletingNoteId === note.id ? "Suppression…" : "Supprimer"}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </article>
                  );
                })
              )}
            </div>

            <form
              className="border-t border-slate-200 bg-white p-4 sm:p-5"
              onSubmit={(event) => {
                event.preventDefault();
                void createNote();
              }}
              aria-label="Ajouter une note opérationnelle"
            >
              <label htmlFor="assistant-note" className="mb-2 block text-sm font-semibold text-slate-800">
                Nouvelle note opérationnelle
              </label>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <textarea
                  id="assistant-note"
                  value={noteDraft}
                  onChange={(event) => setNoteDraft(event.target.value)}
                  placeholder="Partagez une consigne, un suivi ou une information terrain…"
                  rows={2}
                  disabled={savingNote}
                  className="min-h-14 w-full resize-none rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950 outline-none ring-orange-400/30 transition placeholder:text-slate-400 focus:border-orange-500 focus:ring-4 disabled:bg-slate-100"
                />
                <Button
                  type="submit"
                  leadingIcon={Send}
                  loading={savingNote}
                  disabled={!noteDraft.trim()}
                  className="min-h-11 shrink-0"
                >
                  Envoyer
                </Button>
              </div>
              <p className="mt-2 text-xs text-slate-500">La note sera ajoutée à l’historique partagé de l’équipe.</p>
              <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
                {savingNote ? "Envoi de la note en cours" : ""}
                {savingChecklist ? "Sauvegarde de la checklist en cours" : ""}
                {deletingNoteId ? "Suppression de la note en cours" : ""}
              </p>
            </form>
          </section>

          <aside className="border-t border-slate-200 bg-white p-4 lg:border-l lg:border-t-0 lg:p-5" aria-labelledby="suggestions-title">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-orange-100 text-orange-700">
                <Sparkles size={19} aria-hidden="true" />
              </span>
              <div>
                <h2 id="suggestions-title" className="text-sm font-bold text-slate-950">
                  Suggestions
                </h2>
                <p className="mt-0.5 text-xs leading-5 text-slate-500">Ouvrez rapidement un module métier.</p>
              </div>
            </div>

            <div className="relative mt-5">
              <label htmlFor="module-search" className="mb-2 block text-sm font-semibold text-slate-800">
                Rechercher un module
              </label>
              <Search
                size={18}
                className="pointer-events-none absolute bottom-3.25 left-3 text-slate-400"
                aria-hidden="true"
              />
              <input
                id="module-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Nom du module…"
                className="min-h-11 w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-950 outline-none ring-orange-400/30 transition placeholder:text-slate-400 focus:border-orange-500 focus:ring-4"
              />
            </div>

            <nav className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-1" aria-label="Modules suggérés">
              {moduleLinks.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
                  Aucun module ne correspond à votre recherche.
                </p>
              ) : (
                moduleLinks.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="group flex min-h-11 items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-[#071b33] transition hover:border-orange-300 hover:bg-orange-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-400/30"
                    >
                      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white text-orange-700 shadow-sm ring-1 ring-slate-200 group-hover:ring-orange-200">
                        <Icon size={18} aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">{item.label}</span>
                      <ChevronRight size={17} className="shrink-0 text-slate-400 group-hover:text-orange-700" aria-hidden="true" />
                    </Link>
                  );
                })
              )}
            </nav>

            <div className="mt-6 rounded-2xl bg-[#071b33] p-4 text-white">
              <div className="flex items-center gap-2 text-sm font-bold">
                <CheckCircle2 size={18} className="text-orange-400" aria-hidden="true" />
                État de la journée
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                {completionRatio.done === completionRatio.total && completionRatio.total > 0
                  ? "Toutes les actions prévues sont terminées."
                  : `${completionRatio.total - completionRatio.done} action${
                      completionRatio.total - completionRatio.done > 1 ? "s" : ""
                    } encore à traiter.`}
              </p>
            </div>
          </aside>
        </div>
      </Surface>
    </div>
  );
}
