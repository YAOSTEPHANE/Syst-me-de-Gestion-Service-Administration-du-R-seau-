"use client";

import {
  Download,
  Edit3,
  KeyRound,
  LogOut,
  Mail,
  MoreHorizontal,
  Plus,
  Power,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { StatusBadge } from "@/components/lonaci/ui/badge";
import { Button } from "@/components/lonaci/ui/button";
import { DataTable, type DataTableColumn } from "@/components/lonaci/ui/data-table";
import { ConfirmDialog, Dialog } from "@/components/lonaci/ui/dialog";
import { FeedbackState, Skeleton } from "@/components/lonaci/ui/feedback-state";
import { FilterBar } from "@/components/lonaci/ui/filter-bar";
import { FormField } from "@/components/lonaci/ui/form-field";
import { PageHeader, SectionHeader } from "@/components/lonaci/ui/headers";
import { Pagination } from "@/components/lonaci/ui/pagination";
import { Surface } from "@/components/lonaci/ui/surface";
import { LONACI_ROLES, LONACI_ROLE_LABELS, getLonaciRoleLabel, getLonaciRoleProfile } from "@/lib/lonaci/constants";
import { friendlyErrorMessage } from "@/lib/lonaci/friendly-messages";
import { notify } from "@/lib/toast";

interface AdminUser {
  id: string;
  email: string;
  matricule: string | null;
  nom: string;
  prenom: string;
  role: string;
  agenceId: string | null;
  agencesAutorisees: string[];
  modulesAutorises: string[];
  produitsAutorises: string[];
  actif: boolean;
  derniereConnexion: string | null;
}

interface UsersPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface AuthLogItem {
  id: string;
  email: string;
  status: "SUCCESS" | "FAILED";
  ipAddress: string | null;
  attemptedAt: string;
  reason?: string;
}

interface AgenceRef {
  id: string;
  code: string;
  libelle: string;
  actif: boolean;
}

interface ProduitRef {
  id: string;
  code: string;
  libelle: string;
  actif: boolean;
}

const ROLE_OPTIONS = [...LONACI_ROLES];

/** Codes produits usuels si le référentiel n’est pas chargé (choix par menu). */
const PRODUITS_FALLBACK: Array<{ code: string; libelle: string }> = [
  { code: "LOTO_EDITEC", libelle: "Loto / éditique" },
  { code: "PMU_PLR", libelle: "PMU / paris" },
];

const AGENCE_CODES_HELP: Array<{ code: string; libelle: string }> = [
  { code: "YOPOUGON_1", libelle: "Yopougon 1" },
  { code: "YOPOUGON_2", libelle: "Yopougon 2" },
  { code: "ABOBO", libelle: "Abobo" },
  { code: "BIETRY", libelle: "Biétry" },
  { code: "KORHOGO", libelle: "Korhogo" },
  { code: "YAMOUSSOUKRO", libelle: "Yamoussoukro" },
  { code: "COCODY_ANGRE", libelle: "Cocody Angré" },
  { code: "PLATEAU", libelle: "Plateau" },
];

function normalizeAgenceSearch(s: string) {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

function formatAgenceChoice(a: AgenceRef) {
  return `${a.code} — ${a.libelle}`;
}

function isMongoObjectIdLike(s: string) {
  return /^[a-f0-9]{24}$/i.test(s.trim());
}

/** Sélection d’agence par bouton « Choisir » + liste (filtre optionnel dans le panneau) ; repli menu déroulant si pas de référentiel. */
function AgenceRattachementCombobox({
  agences,
  value,
  onChange,
  disabled,
  inputClassName,
}: {
  agences: AgenceRef[];
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  inputClassName: string;
}) {
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const filterInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = useMemo(() => {
    const v = value.trim();
    if (!v) return null;
    return (
      agences.find((a) => a.id === v) ??
      agences.find((a) => a.code.toUpperCase() === v.toUpperCase()) ??
      null
    );
  }, [agences, value]);

  const pickable = useMemo(() => agences.filter((a) => a.actif), [agences]);

  const closedLabel = selected
    ? formatAgenceChoice(selected)
    : value.trim() && isMongoObjectIdLike(value.trim())
      ? value.trim()
      : "";

  const filtered = useMemo(() => {
    const q = normalizeAgenceSearch(query);
    if (!q) return pickable;
    return pickable.filter((a) => {
      const hay = normalizeAgenceSearch(`${a.code} ${a.libelle} ${a.id}`);
      return hay.includes(q);
    });
  }, [pickable, query]);

  useEffect(() => {
    const onDocDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!agences.length) {
    const codeKnown = AGENCE_CODES_HELP.some((x) => x.code === value);
    return (
      <div className="grid gap-2">
        <select
          aria-label="Choisir une agence (codes usuels)"
          value={codeKnown ? value : ""}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className={inputClassName}
        >
          <option value="">Choisir une agence…</option>
          {AGENCE_CODES_HELP.map(({ code, libelle }) => (
            <option key={code} value={code}>
              {code} — {libelle}
            </option>
          ))}
        </select>
        <label className="grid gap-1">
          <span className="text-[11px] text-slate-600">
            Ou uniquement si vous avez un identifiant Mongo (24 caractères)
          </span>
          <input
            value={!codeKnown && isMongoObjectIdLike(value) ? value : ""}
            onChange={(e) => onChange(e.target.value.trim())}
            disabled={disabled}
            placeholder="Coller l’ObjectId seulement si besoin"
            className={inputClassName}
          />
        </label>
        <span className="text-[11px] text-slate-500">
          Référentiel indisponible : privilégiez le menu « Choisir ». Rechargez la page pour la liste complète.
        </span>
      </div>
    );
  }

  return (
    <div ref={wrapRef} className="relative grid gap-1">
      <div className="relative flex gap-2">
        <button
          type="button"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open ? "true" : "false"}
          aria-controls={listId}
          onClick={() => {
            if (disabled) return;
            setOpen((o) => {
              const next = !o;
              if (next) {
                setQuery("");
                queueMicrotask(() => filterInputRef.current?.focus());
              }
              return next;
            });
          }}
          className={`${inputClassName} flex min-w-0 flex-1 items-center justify-between gap-2 text-left`}
        >
          <span className={`min-w-0 truncate ${closedLabel ? "text-slate-900" : "text-slate-500"}`}>
            {closedLabel || "Choisir une agence…"}
          </span>
          <span className="shrink-0 text-slate-400" aria-hidden>
            ▾
          </span>
        </button>
        {closedLabel ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              onChange("");
              setQuery("");
              setOpen(false);
            }}
            className="shrink-0 rounded border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            Effacer
          </button>
        ) : null}
      </div>
      {open && !disabled ? (
        <div
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-60 mt-1 max-h-64 overflow-hidden rounded-md border border-slate-200 bg-white text-sm shadow-lg"
        >
          <div className="border-b border-slate-100 p-2">
            <input
              ref={filterInputRef}
              type="search"
              role="searchbox"
              aria-label="Filtrer les agences"
              placeholder="Filtrer la liste (optionnel)…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400"
              onMouseDown={(e) => e.stopPropagation()}
            />
          </div>
          <ul className="max-h-48 overflow-auto py-1">
            <li role="presentation" className="border-b border-slate-100 px-2 py-1">
              <button
                type="button"
                role="option"
                aria-selected={!value.trim()}
                className="w-full rounded px-2 py-1.5 text-left text-xs text-slate-500 hover:bg-slate-50"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange("");
                  setQuery("");
                  setOpen(false);
                }}
              >
                Aucune agence de rattachement
              </button>
            </li>
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-xs text-slate-500" role="presentation">
                Aucune agence active ne correspond au filtre.
              </li>
            ) : (
              filtered.map((a) => (
                <li key={a.id} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={value.trim() === a.id}
                    className="w-full px-3 py-2 text-left text-slate-800 hover:bg-cyan-50"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onChange(a.id);
                      setQuery("");
                      setOpen(false);
                    }}
                  >
                    <span className="font-medium text-slate-900">{a.code}</span>
                    <span className="text-slate-600"> — {a.libelle}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
      {value.trim() && !selected ? (
        <span className="text-[11px] text-amber-800">
          Valeur hors référentiel (ObjectId ou code non résolu). Choisissez dans la liste ou rechargez la page.
        </span>
      ) : (
        <span className="text-[11px] text-slate-500">
          Cliquez sur « Choisir une agence… » puis sélectionnez une ligne ; le filtre sert uniquement à réduire la liste.
        </span>
      )}
    </div>
  );
}

function agenceLabelForId(id: string, agences: AgenceRef[]) {
  const a = agences.find((x) => x.id === id);
  return a ? formatAgenceChoice(a) : id;
}

/** Plusieurs agences : puces + bouton « Choisir » pour ajouter (référentiel chargé) ; sinon liste CSV de secours. */
function AgencesAutoriseesMultiPicker({
  agences,
  valueIds,
  onChangeIds,
  csvFallbackValue,
  onCsvFallbackChange,
  inputClassName,
}: {
  agences: AgenceRef[];
  valueIds: string[];
  onChangeIds: (next: string[]) => void;
  csvFallbackValue: string;
  onCsvFallbackChange: (v: string) => void;
  inputClassName: string;
}) {
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const filterInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const pickable = useMemo(() => agences.filter((a) => a.actif), [agences]);
  const selectedSet = useMemo(() => new Set(valueIds), [valueIds]);

  const filtered = useMemo(() => {
    const available = pickable.filter((a) => !selectedSet.has(a.id));
    const q = normalizeAgenceSearch(query);
    if (!q) return available;
    return available.filter((a) => {
      const hay = normalizeAgenceSearch(`${a.code} ${a.libelle} ${a.id}`);
      return hay.includes(q);
    });
  }, [pickable, query, selectedSet]);

  useEffect(() => {
    const onDocDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!agences.length) {
    function splitCsvLocal(v: string) {
      return v
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
    }
    const helpCodes = new Set(AGENCE_CODES_HELP.map((x) => x.code));
    const fromSelect = splitCsvLocal(csvFallbackValue).filter((c) => helpCodes.has(c));
    return (
      <div className="grid gap-2">
        <label className="grid gap-1">
          <span className="text-[11px] text-slate-600">Choisir des agences (codes usuels)</span>
          <select
            multiple
            size={Math.min(9, AGENCE_CODES_HELP.length)}
            aria-label="Choisir une ou plusieurs agences parmi les codes usuels"
            className={`${inputClassName} min-h-30 py-1`}
            value={fromSelect}
            onChange={(e) => {
              const picked = [...e.target.selectedOptions].map((o) => o.value);
              const rest = splitCsvLocal(csvFallbackValue).filter((c) => !helpCodes.has(c));
              onCsvFallbackChange([...rest, ...picked].join(", "));
            }}
          >
            {AGENCE_CODES_HELP.map(({ code, libelle }) => (
              <option key={code} value={code}>
                {code} — {libelle}
              </option>
            ))}
          </select>
        </label>
        <span className="text-[11px] text-slate-500">
          Maintenez Ctrl (ou Cmd) pour en sélectionner plusieurs. Rechargez la page pour la liste complète avec recherche.
        </span>
        <label className="grid gap-1">
          <span className="text-[11px] text-slate-600">Autres codes ou ObjectId (secours, séparés par des virgules)</span>
          <input
            value={splitCsvLocal(csvFallbackValue)
              .filter((c) => !helpCodes.has(c))
              .join(", ")}
            onChange={(e) => {
              const extra = splitCsvLocal(e.target.value);
              onCsvFallbackChange([...fromSelect, ...extra].join(", "));
            }}
            placeholder="Optionnel"
            className={inputClassName}
          />
        </label>
      </div>
    );
  }

  function removeId(id: string) {
    onChangeIds(valueIds.filter((x) => x !== id));
  }

  function addId(id: string) {
    if (selectedSet.has(id)) return;
    onChangeIds([...valueIds, id]);
    setQuery("");
    setOpen(false);
  }

  return (
    <div ref={wrapRef} className="grid gap-2">
      {valueIds.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {valueIds.map((id) => {
            const a = agences.find((x) => x.id === id);
            const unknown = !a;
            return (
              <li key={id}>
                <span
                  className={`inline-flex max-w-full items-center gap-1 rounded-full border px-2.5 py-0.5 text-left text-[11px] font-medium ${
                    unknown ? "border-amber-300 bg-amber-50 text-amber-900" : "border-slate-200 bg-slate-50 text-slate-800"
                  }`}
                >
                  <span className="truncate" title={id}>
                    {agenceLabelForId(id, agences)}
                  </span>
                  <button
                    type="button"
                    className="shrink-0 rounded-full px-0.5 text-slate-500 hover:bg-white/80 hover:text-slate-800"
                    aria-label={`Retirer ${agenceLabelForId(id, agences)}`}
                    onClick={() => removeId(id)}
                  >
                    ×
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-[11px] text-slate-500">Aucune agence supplémentaire choisie (hors rattachement).</p>
      )}

      <div className="relative">
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open ? "true" : "false"}
          aria-controls={listId}
          disabled={pickable.every((a) => selectedSet.has(a.id))}
          onClick={() => {
            if (pickable.every((a) => selectedSet.has(a.id))) return;
            setOpen((o) => {
              const next = !o;
              if (next) {
                setQuery("");
                queueMicrotask(() => filterInputRef.current?.focus());
              }
              return next;
            });
          }}
          className={`${inputClassName} w-full text-left text-slate-700 disabled:cursor-not-allowed disabled:opacity-60`}
        >
          {pickable.every((a) => selectedSet.has(a.id))
            ? "Toutes les agences actives sont déjà ajoutées"
            : "Choisir une agence à ajouter…"}
        </button>
        {open ? (
          <div
            id={listId}
            role="listbox"
            className="absolute left-0 right-0 top-full z-60 mt-1 max-h-64 overflow-hidden rounded-md border border-slate-200 bg-white text-sm shadow-lg"
          >
            <div className="border-b border-slate-100 p-2">
              <input
                ref={filterInputRef}
                type="search"
                role="searchbox"
                aria-label="Filtrer la liste des agences"
                placeholder="Filtrer la liste (optionnel)…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400"
                onMouseDown={(e) => e.stopPropagation()}
              />
            </div>
            <ul className="max-h-48 overflow-auto py-1">
              {filtered.length === 0 ? (
                <li className="px-3 py-2 text-xs text-slate-500" role="presentation">
                  {pickable.every((a) => selectedSet.has(a.id))
                    ? "Toutes les agences actives sont déjà ajoutées."
                    : "Aucune agence ne correspond au filtre."}
                </li>
              ) : (
                filtered.map((a) => (
                  <li key={a.id} role="presentation">
                    <button
                      type="button"
                      role="option"
                      aria-selected="false"
                      className="w-full px-3 py-2 text-left text-slate-800 hover:bg-cyan-50"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        addId(a.id);
                      }}
                    >
                      <span className="font-medium text-slate-900">{a.code}</span>
                      <span className="text-slate-600"> — {a.libelle}</span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        ) : null}
      </div>
      <span className="text-[11px] text-slate-500">
        Utilisez « Choisir une agence à ajouter… », puis cliquez sur une ligne ; le champ en haut du panneau sert uniquement à filtrer.
      </span>
    </div>
  );
}

function formatProduitChoice(p: ProduitRef) {
  return `${p.code} — ${p.libelle}`;
}

function produitLabelForCode(code: string, produits: ProduitRef[]) {
  const u = code.trim().toUpperCase();
  const p = produits.find((x) => x.code.toUpperCase() === u);
  return p ? formatProduitChoice(p) : code;
}

/** Produits autorisés : codes métier, même UX que les agences (puces + Choisir + filtre dans le panneau). */
function ProduitsAutorisesMultiPicker({
  produits,
  valueCodes,
  onChangeCodes,
  csvFallbackValue,
  onCsvFallbackChange,
  inputClassName,
}: {
  produits: ProduitRef[];
  valueCodes: string[];
  onChangeCodes: (next: string[]) => void;
  csvFallbackValue: string;
  onCsvFallbackChange: (v: string) => void;
  inputClassName: string;
}) {
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const filterInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const normalizedSelected = useMemo(
    () => new Set(valueCodes.map((c) => c.trim().toUpperCase()).filter(Boolean)),
    [valueCodes],
  );

  const pickable = useMemo(() => produits.filter((p) => p.actif), [produits]);

  const filtered = useMemo(() => {
    const available = pickable.filter((p) => !normalizedSelected.has(p.code.toUpperCase()));
    const q = normalizeAgenceSearch(query);
    if (!q) return available;
    return available.filter((p) => {
      const hay = normalizeAgenceSearch(`${p.code} ${p.libelle} ${p.id}`);
      return hay.includes(q);
    });
  }, [pickable, query, normalizedSelected]);

  useEffect(() => {
    const onDocDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!produits.length) {
    const helpCodes = new Set(PRODUITS_FALLBACK.map((x) => x.code.toUpperCase()));
    function splitCsvLocal(v: string) {
      return v
        .split(",")
        .map((x) => x.trim().toUpperCase())
        .filter(Boolean);
    }
    const fromSelect = splitCsvLocal(csvFallbackValue).filter((c) => helpCodes.has(c));
    return (
      <div className="grid gap-2">
        <label className="grid gap-1">
          <span className="text-[11px] text-slate-600">Choisir des produits (liste usuelle)</span>
          <select
            multiple
            size={Math.min(6, PRODUITS_FALLBACK.length)}
            aria-label="Choisir un ou plusieurs produits"
            className={`${inputClassName} min-h-24 py-1`}
            value={fromSelect}
            onChange={(e) => {
              const picked = [...e.target.selectedOptions].map((o) => o.value.toUpperCase());
              const rest = splitCsvLocal(csvFallbackValue).filter((c) => !helpCodes.has(c));
              onCsvFallbackChange([...rest, ...picked].join(", "));
            }}
          >
            {PRODUITS_FALLBACK.map(({ code, libelle }) => (
              <option key={code} value={code.toUpperCase()}>
                {code} — {libelle}
              </option>
            ))}
          </select>
        </label>
        <span className="text-[11px] text-slate-500">
          Maintenez Ctrl (ou Cmd) pour plusieurs choix. Rechargez la page pour la liste complète du référentiel.
        </span>
        <label className="grid gap-1">
          <span className="text-[11px] text-slate-600">Autres codes produit (secours, séparés par des virgules)</span>
          <input
            value={splitCsvLocal(csvFallbackValue)
              .filter((c) => !helpCodes.has(c))
              .join(", ")}
            onChange={(e) => {
              const extra = splitCsvLocal(e.target.value);
              onCsvFallbackChange([...fromSelect, ...extra].join(", "));
            }}
            placeholder="Optionnel"
            className={inputClassName}
          />
        </label>
      </div>
    );
  }

  function removeCode(code: string) {
    const u = code.trim().toUpperCase();
    onChangeCodes(valueCodes.filter((c) => c.trim().toUpperCase() !== u));
  }

  function addCode(raw: string) {
    const u = raw.trim().toUpperCase();
    if (!u || normalizedSelected.has(u)) return;
    onChangeCodes([...valueCodes, u]);
    setQuery("");
    setOpen(false);
  }

  return (
    <div ref={wrapRef} className="grid gap-2">
      {valueCodes.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {valueCodes.map((code, idx) => {
            const p = produits.find((x) => x.code.toUpperCase() === code.trim().toUpperCase());
            const unknown = !p;
            return (
              <li key={`${code.trim().toUpperCase()}-${idx}`}>
                <span
                  className={`inline-flex max-w-full items-center gap-1 rounded-full border px-2.5 py-0.5 text-left text-[11px] font-medium ${
                    unknown ? "border-amber-300 bg-amber-50 text-amber-900" : "border-slate-200 bg-slate-50 text-slate-800"
                  }`}
                >
                  <span className="truncate" title={code}>
                    {produitLabelForCode(code, produits)}
                  </span>
                  <button
                    type="button"
                    className="shrink-0 rounded-full px-0.5 text-slate-500 hover:bg-white/80 hover:text-slate-800"
                    aria-label={`Retirer ${produitLabelForCode(code, produits)}`}
                    onClick={() => removeCode(code)}
                  >
                    ×
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-[11px] text-slate-500">
          Aucun produit choisi : le compte n’est pas restreint par produit (tous les produits autorisés côté métier).
        </p>
      )}

      <div className="relative">
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open ? "true" : "false"}
          aria-controls={listId}
          disabled={pickable.every((p) => normalizedSelected.has(p.code.toUpperCase()))}
          onClick={() => {
            if (pickable.every((p) => normalizedSelected.has(p.code.toUpperCase()))) return;
            setOpen((o) => {
              const next = !o;
              if (next) {
                setQuery("");
                queueMicrotask(() => filterInputRef.current?.focus());
              }
              return next;
            });
          }}
          className={`${inputClassName} w-full text-left text-slate-700 disabled:cursor-not-allowed disabled:opacity-60`}
        >
          {pickable.every((p) => normalizedSelected.has(p.code.toUpperCase()))
            ? "Tous les produits actifs sont déjà ajoutés"
            : "Choisir un produit à ajouter…"}
        </button>
        {open ? (
          <div
            id={listId}
            role="listbox"
            className="absolute left-0 right-0 top-full z-60 mt-1 max-h-64 overflow-hidden rounded-md border border-slate-200 bg-white text-sm shadow-lg"
          >
            <div className="border-b border-slate-100 p-2">
              <input
                ref={filterInputRef}
                type="search"
                role="searchbox"
                aria-label="Filtrer la liste des produits"
                placeholder="Filtrer la liste (optionnel)…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400"
                onMouseDown={(e) => e.stopPropagation()}
              />
            </div>
            <ul className="max-h-48 overflow-auto py-1">
              {filtered.length === 0 ? (
                <li className="px-3 py-2 text-xs text-slate-500" role="presentation">
                  {pickable.every((p) => normalizedSelected.has(p.code.toUpperCase()))
                    ? "Tous les produits actifs sont déjà ajoutés."
                    : "Aucun produit ne correspond au filtre."}
                </li>
              ) : (
                filtered.map((p) => (
                  <li key={p.id} role="presentation">
                    <button
                      type="button"
                      role="option"
                      aria-selected="false"
                      className="w-full px-3 py-2 text-left text-slate-800 hover:bg-cyan-50"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        addCode(p.code);
                      }}
                    >
                      <span className="font-medium text-slate-900">{p.code}</span>
                      <span className="text-slate-600"> — {p.libelle}</span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        ) : null}
      </div>
      <span className="text-[11px] text-slate-500">
        « Choisir un produit à ajouter… » puis une ligne dans la liste. Laisser vide = pas de restriction par produit.
      </span>
    </div>
  );
}

export default function UsersAdminPanel() {
  const [items, setItems] = useState<AdminUser[]>([]);
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIF" | "INACTIF">("ALL");
  const [roleFilter, setRoleFilter] = useState<string>("ALL");
  const [agenceFilter, setAgenceFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [pagination, setPagination] = useState<UsersPagination>({ page: 1, pageSize: 20, total: 0, totalPages: 1 });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<AdminUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [passwordTarget, setPasswordTarget] = useState<AdminUser | null>(null);
  const [adminNewPassword, setAdminNewPassword] = useState("");
  const [adminNewPasswordConfirm, setAdminNewPasswordConfirm] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createEmail, setCreateEmail] = useState("");
  const [createMatricule, setCreateMatricule] = useState("");
  const [createNom, setCreateNom] = useState("");
  const [createPrenom, setCreatePrenom] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createRole, setCreateRole] = useState("AGENT");
  const [createAgenceId, setCreateAgenceId] = useState("");
  const [createProduitsCodes, setCreateProduitsCodes] = useState<string[]>([]);
  const [createProduitsCsv, setCreateProduitsCsv] = useState("");
  const [createAgencesAutoriseesIds, setCreateAgencesAutoriseesIds] = useState<string[]>([]);
  const [createAgencesAutoriseesCsv, setCreateAgencesAutoriseesCsv] = useState("");
  const [authLogs, setAuthLogs] = useState<AuthLogItem[]>([]);
  const [agences, setAgences] = useState<AgenceRef[]>([]);
  const [produits, setProduits] = useState<ProduitRef[]>([]);
  const [rowMenuOpenId, setRowMenuOpenId] = useState<string | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AdminUser | null>(null);
  const [editNom, setEditNom] = useState("");
  const [editPrenom, setEditPrenom] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editMatricule, setEditMatricule] = useState("");
  const [editRole, setEditRole] = useState("AGENT");
  const [editAgenceId, setEditAgenceId] = useState("");
  const [editAgencesAutoriseesIds, setEditAgencesAutoriseesIds] = useState<string[]>([]);
  const [editAgencesAutoriseesCsv, setEditAgencesAutoriseesCsv] = useState("");
  const [editProduitsCodes, setEditProduitsCodes] = useState<string[]>([]);
  const [editProduitsCsv, setEditProduitsCsv] = useState("");
  const [editActif, setEditActif] = useState(true);

  const searchParams = useSearchParams();
  const createRoleProfile = getLonaciRoleProfile(createRole);
  const editRoleProfile = getLonaciRoleProfile(editRole);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("status", statusFilter);
      if (roleFilter !== "ALL") params.set("role", roleFilter);
      if (agenceFilter !== "ALL") params.set("agenceId", agenceFilter);
      if (searchQuery.trim()) params.set("q", searchQuery.trim());
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));

      const res = await fetch(`/api/admin/users?${params.toString()}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? "Chargement utilisateurs impossible");
      }
      const data = (await res.json()) as { users: AdminUser[]; pagination?: UsersPagination };
      setItems(data.users);
      const nextPagination =
        data.pagination ?? {
          page,
          pageSize,
          total: data.users.length,
          totalPages: 1,
        };
      setPagination(nextPagination);
      if (nextPagination.page !== page) {
        setPage(nextPagination.page);
      }

      const logsRes = await fetch("/api/admin/auth-logs?page=1&pageSize=10", {
        credentials: "include",
        cache: "no-store",
      });
      if (logsRes.ok) {
        const logsData = (await logsRes.json()) as { logs: AuthLogItem[] };
        setAuthLogs(logsData.logs);
      }
    } catch (e) {
      setError(friendlyErrorMessage(e instanceof Error ? e.message : "Erreur"));
    } finally {
      setLoading(false);
    }
  }, [statusFilter, roleFilter, agenceFilter, searchQuery, page, pageSize]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, roleFilter, agenceFilter, searchQuery, pageSize]);

  useEffect(() => {
    setSelectedIds((prev) => prev.filter((id) => items.some((u) => u.id === id)));
  }, [items]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/referentials", {
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { agences: AgenceRef[]; produits?: ProduitRef[] };
        setAgences(data.agences ?? []);
        setProduits(data.produits ?? []);
      } catch {
        // Ne bloque pas l'écran admin : on peut saisir des ObjectId Mongo manuellement.
      }
    })();
  }, []);

  useEffect(() => {
    const v = searchParams.get("createUser");
    if (v === "1" || v === "true") {
      setCreateOpen(true);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!rowMenuOpenId) return;

    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (!target) return;
      if (target.closest?.("[data-user-menu-wrap]")) return;
      setRowMenuOpenId(null);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setRowMenuOpenId(null);
    };

    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [rowMenuOpenId]);

  async function toggleActive(u: AdminUser) {
    setBusyId(u.id);
    try {
      const res = await fetch(`/api/admin/users/${u.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actif: !u.actif }),
      });
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) {
        throw new Error(body?.message ?? "Mise à jour impossible");
      }
      await load();
      notify.success(!u.actif ? "Compte réactivé." : "Compte désactivé.");
    } catch (e) {
      const message = friendlyErrorMessage(e instanceof Error ? e.message : "Erreur");
      setError(message);
      notify.error(message);
    } finally {
      setBusyId(null);
    }
  }

  async function confirmDeleteUser() {
    if (!deleteTarget) return;
    const userId = deleteTarget.id;
    setBusyId(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "DELETE",
        credentials: "include",
      });
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) {
        throw new Error(body?.message ?? "Suppression impossible");
      }
      await load();
      setDeleteTarget(null);
      setDeleteConfirmText("");
      notify.success("Utilisateur supprimé.");
    } catch (e) {
      const message = friendlyErrorMessage(e instanceof Error ? e.message : "Erreur");
      setError(message);
      notify.error(message);
    } finally {
      setBusyId(null);
    }
  }

  async function adminResetPassword(userId: string) {
    setBusyId(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}/reset-password`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = (await res.json().catch(() => null)) as { message?: string; mode?: string } | null;
      if (!res.ok) throw new Error(body?.message ?? "Reset impossible");
      await load();
      notify.success(body?.message ?? "Lien de réinitialisation envoyé.");
    } catch (e) {
      const message = friendlyErrorMessage(e instanceof Error ? e.message : "Erreur");
      setError(message);
      notify.error(message);
    } finally {
      setBusyId(null);
    }
  }

  function closePasswordModal() {
    setPasswordTarget(null);
    setAdminNewPassword("");
    setAdminNewPasswordConfirm("");
  }

  async function adminSetPasswordDirect() {
    if (!passwordTarget) return;
    const pwd = adminNewPassword.trim();
    const pwd2 = adminNewPasswordConfirm.trim();
    if (pwd.length < 8) {
      notify.error("Le mot de passe doit contenir au moins 8 caractères.");
      return;
    }
    if (pwd !== pwd2) {
      notify.error("La confirmation ne correspond pas au mot de passe.");
      return;
    }
    setBusyId(passwordTarget.id);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(passwordTarget.id)}/reset-password`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword: pwd }),
      });
      const body = (await res.json().catch(() => null)) as { message?: string; mode?: string } | null;
      if (!res.ok) throw new Error(body?.message ?? "Mise à jour impossible");
      await load();
      closePasswordModal();
      notify.success(
        body?.mode === "direct"
          ? "Mot de passe mis à jour. L’utilisateur devra se reconnecter."
          : "Mot de passe mis à jour.",
      );
    } catch (e) {
      const message = friendlyErrorMessage(e instanceof Error ? e.message : "Erreur");
      setError(message);
      notify.error(message);
    } finally {
      setBusyId(null);
    }
  }

  function splitCsv(v: string) {
    return v
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  }

  function joinCsv(arr: string[]) {
    return (arr ?? []).join(", ");
  }

  function resolveAgenceIdToken(tokenRaw: string): string | null {
    const token = tokenRaw.trim();
    if (!token) return null;
    if (isMongoObjectIdLike(token)) return token;
    // Si c'est un code, on mappe sur l'id Mongo via le référentiel.
    if (!agences.length) return null;
    const codeNormalized = token.toUpperCase();
    const match = agences.find((a) => a.code.toUpperCase() === codeNormalized);
    return match?.id ?? null;
  }

  function mapTokensCsvToAgenceIds(csv: string): { ids: string[]; unknown: string[] } {
    const tokens = splitCsv(csv);
    const ids: string[] = [];
    const unknown: string[] = [];
    for (const t of tokens) {
      const id = resolveAgenceIdToken(t);
      if (id) ids.push(id);
      else unknown.push(t);
    }
    return { ids, unknown };
  }

  function openEdit(u: AdminUser) {
    setEditTarget(u);
    setEditNom(u.nom ?? "");
    setEditPrenom(u.prenom ?? "");
    setEditEmail(u.email ?? "");
    setEditMatricule(u.matricule ?? "");
    setEditRole(u.role ?? "AGENT");
    setEditAgenceId(u.agenceId ?? "");
    const agAuth = [...new Set(u.agencesAutorisees ?? [])];
    setEditAgencesAutoriseesIds(agAuth);
    setEditAgencesAutoriseesCsv(joinCsv(agAuth));
    const prod = [...new Set((u.produitsAutorises ?? []).map((c) => c.trim().toUpperCase()).filter(Boolean))];
    setEditProduitsCodes(prod);
    setEditProduitsCsv(joinCsv(prod));
    setEditActif(u.actif);
    setEditOpen(true);
  }

  async function saveEdit() {
    if (!editTarget) return;
    setBusyId(editTarget.id);
    setError(null);
    try {
      const agenceIdResolved = editAgenceId.trim()
        ? resolveAgenceIdToken(editAgenceId.trim())
        : null;
      if (editAgenceId.trim() && !agenceIdResolved) {
        throw new Error(
          "Agence ID invalide : fournis un ObjectId (24 hex) ou un code existant (ex: YOPOUGON_1).",
        );
      }

      const agencesAutoriseesResolved = agences.length
        ? [...new Set(editAgencesAutoriseesIds)]
        : (() => {
            const { ids, unknown } = mapTokensCsvToAgenceIds(editAgencesAutoriseesCsv);
            if (unknown.length > 0) {
              throw new Error(`Codes/agences inconnus dans “Agences autorisées” : ${unknown.join(", ")}`);
            }
            return ids;
          })();

      const res = await fetch(`/api/admin/users/${editTarget.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: editEmail.trim(),
          matricule: editMatricule.trim() ? editMatricule.trim().toUpperCase() : null,
          nom: editNom.trim(),
          prenom: editPrenom.trim(),
          role: editRole,
          agenceId: agenceIdResolved,
          agencesAutorisees: agencesAutoriseesResolved,
          modulesAutorises: [],
          produitsAutorises: produits.length
            ? [...new Set(editProduitsCodes.map((c) => c.trim().toUpperCase()).filter(Boolean))]
            : splitCsv(editProduitsCsv)
                .map((c) => c.trim().toUpperCase())
                .filter(Boolean),
          actif: editActif,
        }),
      });
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) throw new Error(body?.message ?? "Mise à jour impossible");
      await load();
      setEditOpen(false);
      setEditTarget(null);
      notify.success("Compte mis à jour.");
    } catch (e) {
      const message = friendlyErrorMessage(e instanceof Error ? e.message : "Erreur");
      setError(message);
      notify.error(message);
    } finally {
      setBusyId(null);
    }
  }

  async function createAccount() {
    setBusyId("create");
    try {
      const splitCsv = (v: string) =>
        v
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean);

      const agenceIdResolved = createAgenceId.trim() ? resolveAgenceIdToken(createAgenceId.trim()) : null;
      if (createAgenceId.trim() && !agenceIdResolved) {
        throw new Error(
          "Agence ID invalide : fournis un ObjectId (24 hex) ou un code existant (ex: YOPOUGON_1).",
        );
      }

      const agencesAutoriseesResolved = agences.length
        ? [...new Set(createAgencesAutoriseesIds)]
        : (() => {
            const { ids, unknown } = mapTokensCsvToAgenceIds(createAgencesAutoriseesCsv);
            if (unknown.length > 0) {
              throw new Error(`Codes/agences inconnus dans “Agences autorisées” : ${unknown.join(", ")}`);
            }
            return ids;
          })();

      const res = await fetch("/api/admin/users", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: createEmail,
          matricule: createMatricule || undefined,
          password: createPassword,
          nom: createNom,
          prenom: createPrenom,
          role: createRole,
          agenceId: agenceIdResolved,
          produitsAutorises: produits.length
            ? [...new Set(createProduitsCodes.map((c) => c.trim().toUpperCase()).filter(Boolean))]
            : splitCsv(createProduitsCsv)
                .map((c) => c.trim().toUpperCase())
                .filter(Boolean),
          agencesAutorisees: agencesAutoriseesResolved,
          modulesAutorises: [],
        }),
      });
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) throw new Error(body?.message ?? "Création impossible");
      setCreateOpen(false);
      setCreateEmail("");
      setCreateMatricule("");
      setCreateNom("");
      setCreatePrenom("");
      setCreatePassword("");
      setCreateRole("AGENT");
      setCreateAgenceId("");
      setCreateProduitsCodes([]);
      setCreateProduitsCsv("");
      setCreateAgencesAutoriseesIds([]);
      setCreateAgencesAutoriseesCsv("");
      await load();
      notify.success("Compte utilisateur créé.");
    } catch (e) {
      const message = friendlyErrorMessage(e instanceof Error ? e.message : "Erreur");
      setError(message);
      notify.error(message);
    } finally {
      setBusyId(null);
    }
  }

  async function forceLogout(userId: string) {
    setBusyId(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}/force-logout`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? "Action impossible");
      }
      await load();
      setConfirmTarget(null);
      notify.success("Déconnexion forcée effectuée avec succès.");
    } catch (e) {
      const message = friendlyErrorMessage(e instanceof Error ? e.message : "Erreur");
      setError(message);
      notify.error(message);
    } finally {
      setBusyId(null);
    }
  }

  async function runBulkAction(action: "FORCE_LOGOUT" | "ACTIVATE" | "DEACTIVATE") {
    if (!selectedIds.length) return;
    setBusyId(`bulk-${action}`);
    try {
      const res = await fetch("/api/admin/users/bulk", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ids: selectedIds }),
      });
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) {
        throw new Error(body?.message ?? "Action de masse impossible");
      }
      await load();
      setSelectedIds([]);
      notify.success(body?.message ?? "Action de masse exécutée.");
    } catch (e) {
      const message = friendlyErrorMessage(e instanceof Error ? e.message : "Erreur");
      setError(message);
      notify.error(message);
    } finally {
      setBusyId(null);
    }
  }

  function renderUserActions(user: AdminUser) {
    const isOpen = rowMenuOpenId === user.id;
    const isBusy = busyId === user.id;
    const fullName = `${user.prenom} ${user.nom}`.trim();

    return (
      <div className="relative inline-flex" data-user-menu-wrap>
        <Button
          variant="ghost"
          size="sm"
          leadingIcon={MoreHorizontal}
          disabled={isBusy}
          aria-haspopup="menu"
          aria-expanded={isOpen}
          aria-label={`Actions pour ${fullName}`}
          onClick={() => setRowMenuOpenId((current) => (current === user.id ? null : user.id))}
        >
          Actions
        </Button>
        {isOpen ? (
          <div
            role="menu"
            aria-label={`Actions pour ${fullName}`}
            className="absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 text-left shadow-xl"
          >
            <button
              type="button"
              role="menuitem"
              className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-orange-500"
              onClick={() => {
                setRowMenuOpenId(null);
                openEdit(user);
              }}
            >
              <Edit3 size={18} aria-hidden="true" />
              Modifier le compte
            </button>
            <button
              type="button"
              role="menuitem"
              className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-orange-500"
              onClick={() => {
                setRowMenuOpenId(null);
                setPasswordTarget(user);
                setAdminNewPassword("");
                setAdminNewPasswordConfirm("");
              }}
            >
              <KeyRound size={18} aria-hidden="true" />
              Définir le mot de passe
            </button>
            <button
              type="button"
              role="menuitem"
              className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-orange-500"
              onClick={() => {
                setRowMenuOpenId(null);
                void adminResetPassword(user.id);
              }}
            >
              <Mail size={18} aria-hidden="true" />
              Envoyer un lien de reset
            </button>
            <button
              type="button"
              role="menuitem"
              className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-orange-500"
              onClick={() => {
                setRowMenuOpenId(null);
                setConfirmTarget(user);
              }}
            >
              <LogOut size={18} aria-hidden="true" />
              Forcer la déconnexion
            </button>
            <button
              type="button"
              role="menuitem"
              className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-amber-800 hover:bg-amber-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-orange-500"
              onClick={() => {
                setRowMenuOpenId(null);
                void toggleActive(user);
              }}
            >
              <Power size={18} aria-hidden="true" />
              {user.actif ? "Désactiver le compte" : "Réactiver le compte"}
            </button>
            <button
              type="button"
              role="menuitem"
              className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-rose-700 hover:bg-rose-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-rose-600"
              onClick={() => {
                setRowMenuOpenId(null);
                setDeleteTarget(user);
                setDeleteConfirmText("");
              }}
            >
              <Trash2 size={18} aria-hidden="true" />
              Supprimer l’utilisateur
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  const userColumns: DataTableColumn<AdminUser>[] = [
    {
      id: "selection",
      header: (
        <input
          type="checkbox"
          className="size-5"
          aria-label="Sélectionner tous les utilisateurs de la page"
          checked={items.length > 0 && selectedIds.length === items.length}
          onChange={(event) => setSelectedIds(event.target.checked ? items.map((user) => user.id) : [])}
        />
      ),
      cell: (user) => (
        <input
          type="checkbox"
          className="size-5"
          aria-label={`Sélectionner ${user.prenom} ${user.nom}`}
          checked={selectedIds.includes(user.id)}
          onChange={(event) => {
            setSelectedIds((current) =>
              event.target.checked
                ? [...new Set([...current, user.id])]
                : current.filter((id) => id !== user.id),
            );
          }}
        />
      ),
    },
    {
      id: "user",
      header: "Utilisateur",
      cell: (user) => (
        <div>
          <strong className="font-semibold text-slate-950">{user.prenom} {user.nom}</strong>
          <p className="mt-0.5 text-sm text-slate-600">{user.email}</p>
          {user.matricule ? <p className="mt-0.5 text-xs text-slate-500">Matricule : {user.matricule}</p> : null}
        </div>
      ),
    },
    {
      id: "role",
      header: "Rôle",
      cell: (user) => (
        <div>
          <strong className="font-semibold text-slate-900">{getLonaciRoleLabel(user.role)}</strong>
          {getLonaciRoleProfile(user.role)?.responsabilite ? (
            <p className="mt-0.5 max-w-xs text-xs text-slate-500">
              {getLonaciRoleProfile(user.role)?.responsabilite}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      id: "agence",
      header: "Agence",
      cell: (user) => user.agenceId ? agenceLabelForId(user.agenceId, agences) : "—",
    },
    {
      id: "status",
      header: "Statut",
      cell: (user) => (
        <StatusBadge tone={user.actif ? "success" : "neutral"}>
          {user.actif ? "Actif" : "Inactif"}
        </StatusBadge>
      ),
    },
    {
      id: "lastLogin",
      header: "Dernière connexion",
      cell: (user) => user.derniereConnexion
        ? new Date(user.derniereConnexion).toLocaleString("fr-FR")
        : "Jamais",
    },
    {
      id: "actions",
      header: "Actions",
      align: "right",
      cell: renderUserActions,
    },
  ];

  const authLogColumns: DataTableColumn<AuthLogItem>[] = [
    {
      id: "date",
      header: "Date et heure",
      cell: (log) => new Date(log.attemptedAt).toLocaleString("fr-FR"),
    },
    { id: "account", header: "Compte", cell: (log) => log.email },
    { id: "ip", header: "Adresse IP", cell: (log) => log.ipAddress ?? "—" },
    {
      id: "status",
      header: "Statut",
      cell: (log) => (
        <StatusBadge tone={log.status === "SUCCESS" ? "success" : "danger"}>
          {log.status === "SUCCESS" ? "Succès" : "Échec"}
        </StatusBadge>
      ),
    },
    { id: "detail", header: "Détail", cell: (log) => log.reason ?? "—" },
  ];

  const passwordValidationError = adminNewPassword.length > 0 && adminNewPassword.length < 8
    ? "Le mot de passe doit contenir au moins 8 caractères."
    : undefined;
  const passwordConfirmationError =
    adminNewPasswordConfirm.length > 0 && adminNewPassword !== adminNewPasswordConfirm
      ? "La confirmation ne correspond pas au mot de passe."
      : undefined;
  const deleteValidationError =
    deleteConfirmText.length > 0 && deleteConfirmText.trim().toUpperCase() !== "SUPPRIMER"
      ? "Saisissez exactement SUPPRIMER."
      : undefined;

  return (
    <section className="min-w-0 space-y-5">
      <PageHeader
        eyebrow="Administration"
        title="Utilisateurs"
        description="Gérez les comptes, les rôles, les droits d’accès et les sessions actives."
        actions={
          <>
            <Button variant="secondary" leadingIcon={RefreshCw} loading={loading} onClick={() => void load()}>
              Rafraîchir
            </Button>
            <Button leadingIcon={Plus} onClick={() => setCreateOpen(true)}>
              Créer un compte
            </Button>
          </>
        }
      />

      <FilterBar
        search={{
          value: searchQuery,
          onChange: setSearchQuery,
          placeholder: "Nom, email ou matricule…",
          label: "Rechercher un utilisateur",
        }}
        filters={
          <>
            <FormField label="Statut" htmlFor="users-filter-status">
              <select
                id="users-filter-status"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as "ALL" | "ACTIF" | "INACTIF")}
              >
                <option value="ALL">Tous les statuts</option>
                <option value="ACTIF">Actifs</option>
                <option value="INACTIF">Inactifs</option>
              </select>
            </FormField>
            <FormField label="Rôle" htmlFor="users-filter-role">
              <select id="users-filter-role" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
                <option value="ALL">Tous les rôles</option>
                {ROLE_OPTIONS.map((role) => (
                  <option key={role} value={role}>{LONACI_ROLE_LABELS[role]}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Agence" htmlFor="users-filter-agence">
              <select id="users-filter-agence" value={agenceFilter} onChange={(event) => setAgenceFilter(event.target.value)}>
                <option value="ALL">Toutes les agences</option>
                {agences.filter((agence) => agence.actif).map((agence) => (
                  <option key={agence.id} value={agence.id}>{agence.code} — {agence.libelle}</option>
                ))}
              </select>
            </FormField>
          </>
        }
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              leadingIcon={Download}
              onClick={() =>
                window.open(
                  `/api/admin/users/export?${new URLSearchParams({
                    status: statusFilter,
                    ...(roleFilter !== "ALL" ? { role: roleFilter } : {}),
                    ...(agenceFilter !== "ALL" ? { agenceId: agenceFilter } : {}),
                    ...(searchQuery.trim() ? { q: searchQuery.trim() } : {}),
                  }).toString()}`,
                  "_blank",
                  "noopener,noreferrer",
                )
              }
            >
              Export utilisateurs
            </Button>
            <Button
              variant="secondary"
              size="sm"
              leadingIcon={Download}
              onClick={() => window.open("/api/admin/auth-logs/export", "_blank", "noopener,noreferrer")}
            >
              Export journal
            </Button>
          </>
        }
      />

      <div aria-live="polite" aria-atomic="true" className="lonaci-ui-sr-only">
        {loading ? "Chargement des utilisateurs." : `${pagination.total} utilisateurs chargés.`}
      </div>
      {error ? (
        <FeedbackState
          tone="danger"
          title="Opération impossible"
          description={error}
          action={<Button variant="secondary" size="sm" onClick={() => void load()}>Réessayer</Button>}
        />
      ) : null}

      <Surface padding="none" elevated>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
          <div>
            <h2 className="font-semibold text-slate-950">Comptes utilisateurs</h2>
            <p className="mt-1 text-sm text-slate-600">
              {pagination.total} compte(s) · {selectedIds.length} sélectionné(s)
            </p>
          </div>
          <div className="flex flex-wrap gap-2" aria-label="Actions groupées">
            <Button
              variant="secondary"
              size="sm"
              leadingIcon={LogOut}
              disabled={!selectedIds.length}
              loading={busyId === "bulk-FORCE_LOGOUT"}
              onClick={() => void runBulkAction("FORCE_LOGOUT")}
            >
              Déconnecter
            </Button>
            <Button
              variant="secondary"
              size="sm"
              leadingIcon={Power}
              disabled={!selectedIds.length}
              loading={busyId === "bulk-DEACTIVATE"}
              onClick={() => void runBulkAction("DEACTIVATE")}
            >
              Désactiver
            </Button>
            <Button
              variant="secondary"
              size="sm"
              leadingIcon={ShieldCheck}
              disabled={!selectedIds.length}
              loading={busyId === "bulk-ACTIVATE"}
              onClick={() => void runBulkAction("ACTIVATE")}
            >
              Réactiver
            </Button>
            {selectedIds.length ? (
              <Button variant="ghost" size="sm" leadingIcon={X} onClick={() => setSelectedIds([])}>
                Effacer
              </Button>
            ) : null}
          </div>
        </div>
        {loading ? (
          <div className="p-5"><Skeleton lines={6} /></div>
        ) : (
          <DataTable
            rows={items}
            columns={userColumns}
            rowKey={(user) => user.id}
            caption="Liste des comptes utilisateurs"
            getRowLabel={(user) => `${user.prenom} ${user.nom}, ${getLonaciRoleLabel(user.role)}`}
            emptyState={
              <FeedbackState
                title="Aucun utilisateur"
                description="Aucun compte ne correspond aux filtres actuels."
                action={<Button variant="secondary" onClick={() => {
                  setSearchQuery("");
                  setStatusFilter("ALL");
                  setRoleFilter("ALL");
                  setAgenceFilter("ALL");
                }}>Réinitialiser les filtres</Button>}
              />
            }
            mobileCard={(user) => (
              <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <label className="flex min-h-11 items-center gap-3">
                    <input
                      type="checkbox"
                      className="size-5"
                      checked={selectedIds.includes(user.id)}
                      onChange={(event) => setSelectedIds((current) =>
                        event.target.checked
                          ? [...new Set([...current, user.id])]
                          : current.filter((id) => id !== user.id),
                      )}
                    />
                    <span className="lonaci-ui-sr-only">Sélectionner {user.prenom} {user.nom}</span>
                  </label>
                  <StatusBadge tone={user.actif ? "success" : "neutral"}>
                    {user.actif ? "Actif" : "Inactif"}
                  </StatusBadge>
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <span className="grid size-11 shrink-0 place-items-center rounded-full bg-orange-50 text-orange-700">
                    <UserRound size={20} aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold text-slate-950">{user.prenom} {user.nom}</h3>
                    <p className="truncate text-sm text-slate-600">{user.email}</p>
                  </div>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div><dt className="text-slate-500">Rôle</dt><dd className="mt-1 font-medium">{getLonaciRoleLabel(user.role)}</dd></div>
                  <div><dt className="text-slate-500">Matricule</dt><dd className="mt-1 font-medium">{user.matricule ?? "—"}</dd></div>
                  <div className="col-span-2"><dt className="text-slate-500">Agence</dt><dd className="mt-1 font-medium">{user.agenceId ? agenceLabelForId(user.agenceId, agences) : "—"}</dd></div>
                  <div className="col-span-2"><dt className="text-slate-500">Dernière connexion</dt><dd className="mt-1 font-medium">{user.derniereConnexion ? new Date(user.derniereConnexion).toLocaleString("fr-FR") : "Jamais"}</dd></div>
                </dl>
                <div className="mt-4 flex justify-end">{renderUserActions(user)}</div>
              </article>
            )}
          />
        )}
        <div className="flex flex-col items-center justify-between gap-4 border-t border-slate-200 bg-slate-50 p-4 sm:flex-row">
          <FormField label="Résultats par page" htmlFor="users-page-size" className="w-full sm:w-44">
            <select id="users-page-size" value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
          </FormField>
          <Pagination
            page={pagination.page}
            pageCount={pagination.totalPages}
            onPageChange={setPage}
            label="Pagination des utilisateurs"
          />
        </div>
      </Surface>

      <Surface elevated>
        <SectionHeader
          title="Journal de connexion"
          description="Les dix dernières tentatives avec date, adresse IP et résultat."
          action={<StatusBadge tone="info">{authLogs.length} événement(s)</StatusBadge>}
        />
        <div className="mt-4">
          <DataTable
            rows={authLogs}
            columns={authLogColumns}
            rowKey={(log) => log.id}
            caption="Journal des connexions"
            mobileCard={(log) => (
              <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <strong className="break-all text-sm text-slate-950">{log.email}</strong>
                  <StatusBadge tone={log.status === "SUCCESS" ? "success" : "danger"}>
                    {log.status === "SUCCESS" ? "Succès" : "Échec"}
                  </StatusBadge>
                </div>
                <dl className="mt-3 grid gap-2 text-sm">
                  <div><dt className="text-slate-500">Date et heure</dt><dd>{new Date(log.attemptedAt).toLocaleString("fr-FR")}</dd></div>
                  <div><dt className="text-slate-500">Adresse IP</dt><dd>{log.ipAddress ?? "—"}</dd></div>
                  {log.reason ? <div><dt className="text-slate-500">Détail</dt><dd>{log.reason}</dd></div> : null}
                </dl>
              </article>
            )}
            emptyState={<FeedbackState title="Aucun événement" description="Le journal de connexion est vide." />}
          />
        </div>
      </Surface>

      <ConfirmDialog
        open={confirmTarget !== null}
        onOpenChange={(open) => {
          if (!open && busyId !== confirmTarget?.id) setConfirmTarget(null);
        }}
        title="Forcer la déconnexion ?"
        description="Toutes les sessions actives de ce compte seront invalidées."
        message={confirmTarget ? (
          <>Déconnecter <strong>{confirmTarget.prenom} {confirmTarget.nom}</strong> ({confirmTarget.email}) ?</>
        ) : null}
        confirmLabel="Forcer la déconnexion"
        destructive
        pending={busyId === confirmTarget?.id}
        onConfirm={() => confirmTarget ? forceLogout(confirmTarget.id) : undefined}
      />

      <Dialog
        open={passwordTarget !== null}
        onOpenChange={(open) => {
          if (!open && busyId !== passwordTarget?.id) closePasswordModal();
        }}
        title="Définir le mot de passe"
        description={passwordTarget
          ? `${passwordTarget.prenom} ${passwordTarget.nom} · ${passwordTarget.email}. Les sessions actives seront invalidées.`
          : undefined}
        size="sm"
        footer={
          <>
            <Button variant="secondary" disabled={busyId === passwordTarget?.id} onClick={closePasswordModal}>
              Annuler
            </Button>
            <Button
              type="submit"
              form="admin-password-form"
              leadingIcon={KeyRound}
              loading={busyId === passwordTarget?.id}
              disabled={
                adminNewPassword.length < 8 ||
                adminNewPassword !== adminNewPasswordConfirm
              }
            >
              Enregistrer
            </Button>
          </>
        }
      >
        <form
          id="admin-password-form"
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void adminSetPasswordDirect();
          }}
        >
          <FormField label="Nouveau mot de passe" htmlFor="admin-new-password" required error={passwordValidationError} hint="8 caractères minimum.">
            <input
              id="admin-new-password"
              data-autofocus
              required
              minLength={8}
              type="password"
              autoComplete="new-password"
              value={adminNewPassword}
              aria-invalid={passwordValidationError ? "true" : undefined}
              onChange={(event) => setAdminNewPassword(event.target.value)}
            />
          </FormField>
          <FormField label="Confirmation du mot de passe" htmlFor="admin-new-password-confirm" required error={passwordConfirmationError}>
            <input
              id="admin-new-password-confirm"
              required
              minLength={8}
              type="password"
              autoComplete="new-password"
              value={adminNewPasswordConfirm}
              aria-invalid={passwordConfirmationError ? "true" : undefined}
              onChange={(event) => setAdminNewPasswordConfirm(event.target.value)}
            />
          </FormField>
        </form>
      </Dialog>

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && busyId !== deleteTarget?.id) {
            setDeleteTarget(null);
            setDeleteConfirmText("");
          }
        }}
        title="Supprimer cet utilisateur ?"
        description="Cette action invalide ses sessions et retire définitivement le compte des listes actives."
        size="sm"
        footer={
          <>
            <Button
              variant="secondary"
              disabled={busyId === deleteTarget?.id}
              onClick={() => {
                setDeleteTarget(null);
                setDeleteConfirmText("");
              }}
            >
              Annuler
            </Button>
            <Button
              variant="danger"
              leadingIcon={Trash2}
              loading={busyId === deleteTarget?.id}
              disabled={deleteConfirmText.trim().toUpperCase() !== "SUPPRIMER"}
              onClick={() => void confirmDeleteUser()}
            >
              Supprimer
            </Button>
          </>
        }
      >
        {deleteTarget ? (
          <div className="space-y-4">
            <FeedbackState
              tone="danger"
              title={`${deleteTarget.prenom} ${deleteTarget.nom}`}
              description={deleteTarget.email}
            />
            <FormField
              label={<>Saisissez <strong>SUPPRIMER</strong> pour confirmer</>}
              htmlFor="delete-user-confirmation"
              required
              error={deleteValidationError}
            >
              <input
                id="delete-user-confirmation"
                data-autofocus
                required
                value={deleteConfirmText}
                aria-invalid={deleteValidationError ? "true" : undefined}
                onChange={(event) => setDeleteConfirmText(event.target.value)}
              />
            </FormField>
          </div>
        ) : null}
      </Dialog>

      <Dialog
        open={editOpen && editTarget !== null}
        onOpenChange={(open) => {
          if (!open && busyId !== editTarget?.id) {
            setEditOpen(false);
            setEditTarget(null);
          }
        }}
        title="Modifier le compte"
        description={editTarget ? `${editTarget.prenom} ${editTarget.nom} · ${editTarget.email}` : undefined}
        size="lg"
        footer={
          <>
            <Button variant="secondary" disabled={busyId === editTarget?.id} onClick={() => {
              setEditOpen(false);
              setEditTarget(null);
            }}>
              Annuler
            </Button>
            <Button
              type="submit"
              form="edit-user-form"
              leadingIcon={Edit3}
              loading={busyId === editTarget?.id}
            >
              Enregistrer
            </Button>
          </>
        }
      >
        {editTarget ? (
          <form
            id="edit-user-form"
            className="grid gap-4 md:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              void saveEdit();
            }}
          >
            <FormField label="Prénom" htmlFor="edit-user-prenom" required><input id="edit-user-prenom" data-autofocus required value={editPrenom} onChange={(event) => setEditPrenom(event.target.value)} /></FormField>
            <FormField label="Nom" htmlFor="edit-user-nom" required><input id="edit-user-nom" required value={editNom} onChange={(event) => setEditNom(event.target.value)} /></FormField>
            <FormField label="Adresse email" htmlFor="edit-user-email" required className="md:col-span-2"><input id="edit-user-email" required type="email" value={editEmail} onChange={(event) => setEditEmail(event.target.value)} /></FormField>
            <FormField label="Matricule" htmlFor="edit-user-matricule" hint="Optionnel"><input id="edit-user-matricule" value={editMatricule} onChange={(event) => setEditMatricule(event.target.value)} /></FormField>
            <FormField label="Rôle" htmlFor="edit-user-role" required hint={editRoleProfile ? `${editRoleProfile.designation} — ${editRoleProfile.responsabilite}` : undefined}>
              <select id="edit-user-role" required value={editRole} onChange={(event) => setEditRole(event.target.value)}>
                {ROLE_OPTIONS.map((role) => <option key={role} value={role}>{LONACI_ROLE_LABELS[role]}</option>)}
              </select>
            </FormField>
            <FormField label="Agence de rattachement" hint="Optionnel" className="md:col-span-2">
              <AgenceRattachementCombobox agences={agences} value={editAgenceId} onChange={setEditAgenceId} inputClassName="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900" />
            </FormField>
            <FormField label="Statut du compte" htmlFor="edit-user-status">
              <select id="edit-user-status" value={editActif ? "true" : "false"} onChange={(event) => setEditActif(event.target.value === "true")}>
                <option value="true">Actif</option>
                <option value="false">Inactif</option>
              </select>
            </FormField>
            <FormField label="Agences autorisées" className="md:col-span-2">
              <AgencesAutoriseesMultiPicker agences={agences} valueIds={editAgencesAutoriseesIds} onChangeIds={setEditAgencesAutoriseesIds} csvFallbackValue={editAgencesAutoriseesCsv} onCsvFallbackChange={setEditAgencesAutoriseesCsv} inputClassName="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900" />
            </FormField>
            <FeedbackState className="md:col-span-2" tone="info" title="Accès aux modules" description="Tous les modules restent accessibles côté serveur ; le rôle continue de définir les habilitations métier." />
            <FormField label="Produits autorisés" className="md:col-span-2">
              <ProduitsAutorisesMultiPicker produits={produits} valueCodes={editProduitsCodes} onChangeCodes={setEditProduitsCodes} csvFallbackValue={editProduitsCsv} onCsvFallbackChange={setEditProduitsCsv} inputClassName="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900" />
            </FormField>
          </form>
        ) : null}
      </Dialog>

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          if (busyId !== "create") setCreateOpen(open);
        }}
        title="Nouveau compte utilisateur"
        description="Créez le compte, attribuez son rôle et définissez son périmètre d’accès."
        size="lg"
        footer={
          <>
            <Button variant="secondary" disabled={busyId === "create"} onClick={() => setCreateOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" form="create-user-form" leadingIcon={Plus} loading={busyId === "create"}>
              Créer le compte
            </Button>
          </>
        }
      >
        <form
          id="create-user-form"
          className="grid gap-4 md:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            void createAccount();
          }}
        >
          <FormField label="Prénom" htmlFor="create-user-prenom" required><input id="create-user-prenom" data-autofocus required value={createPrenom} onChange={(event) => setCreatePrenom(event.target.value)} /></FormField>
          <FormField label="Nom" htmlFor="create-user-nom" required><input id="create-user-nom" required value={createNom} onChange={(event) => setCreateNom(event.target.value)} /></FormField>
          <FormField label="Adresse email" htmlFor="create-user-email" required className="md:col-span-2"><input id="create-user-email" required type="email" autoComplete="email" value={createEmail} onChange={(event) => setCreateEmail(event.target.value)} /></FormField>
          <FormField label="Matricule" htmlFor="create-user-matricule" hint="Optionnel"><input id="create-user-matricule" value={createMatricule} onChange={(event) => setCreateMatricule(event.target.value)} /></FormField>
          <FormField label="Mot de passe initial" htmlFor="create-user-password" required hint="8 caractères minimum."><input id="create-user-password" required minLength={8} type="password" autoComplete="new-password" value={createPassword} onChange={(event) => setCreatePassword(event.target.value)} /></FormField>
          <FormField label="Rôle" htmlFor="create-user-role" required className="md:col-span-2" hint={createRoleProfile ? `${createRoleProfile.designation} — ${createRoleProfile.responsabilite}` : undefined}>
            <select id="create-user-role" required value={createRole} onChange={(event) => setCreateRole(event.target.value)}>
              {ROLE_OPTIONS.map((role) => <option key={role} value={role}>{LONACI_ROLE_LABELS[role]}</option>)}
            </select>
          </FormField>
          <FormField label="Agence de rattachement" hint="Optionnel" className="md:col-span-2">
            <AgenceRattachementCombobox agences={agences} value={createAgenceId} onChange={setCreateAgenceId} inputClassName="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900" />
          </FormField>
          <FormField label="Agences autorisées" className="md:col-span-2">
            <AgencesAutoriseesMultiPicker agences={agences} valueIds={createAgencesAutoriseesIds} onChangeIds={setCreateAgencesAutoriseesIds} csvFallbackValue={createAgencesAutoriseesCsv} onCsvFallbackChange={setCreateAgencesAutoriseesCsv} inputClassName="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900" />
          </FormField>
          <FeedbackState className="md:col-span-2" tone="info" title="Accès aux modules" description="Tous les modules sont accessibles ; le rôle définit les habilitations métier." />
          <FormField label="Produits autorisés" className="md:col-span-2">
            <ProduitsAutorisesMultiPicker produits={produits} valueCodes={createProduitsCodes} onChangeCodes={setCreateProduitsCodes} csvFallbackValue={createProduitsCsv} onCsvFallbackChange={setCreateProduitsCsv} inputClassName="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900" />
          </FormField>
        </form>
      </Dialog>
    </section>
  );
}

