"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LONACI_ROLES, LONACI_ROLE_LABELS, getLonaciRoleLabel, getLonaciRoleProfile } from "@/lib/lonaci/constants";
import { friendlyErrorMessage } from "@/lib/lonaci/friendly-messages";

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
            className={`${inputClassName} min-h-[7.5rem] py-1`}
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
            className={`${inputClassName} min-h-[6rem] py-1`}
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
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<AdminUser | null>(null);
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
    if (!createOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && busyId !== "create") setCreateOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [createOpen, busyId]);

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
    setToast(null);
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
      setToast({ type: "success", message: !u.actif ? "Compte réactivé." : "Compte désactivé." });
    } catch (e) {
      const message = friendlyErrorMessage(e instanceof Error ? e.message : "Erreur");
      setError(message);
      setToast({ type: "error", message });
    } finally {
      setBusyId(null);
    }
  }

  async function adminResetPassword(userId: string) {
    setBusyId(userId);
    setToast(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/reset-password`, {
        method: "POST",
        credentials: "include",
      });
      const body = (await res.json().catch(() => null)) as
        | { message?: string; resetToken?: string }
        | null;
      if (!res.ok) throw new Error(body?.message ?? "Reset impossible");
      await load();
      setToast({
        type: "success",
        message: body?.resetToken
          ? `Token reset généré (SMTP off): ${body.resetToken}`
          : body?.message ?? "Lien de reset envoyé.",
      });
    } catch (e) {
      const message = friendlyErrorMessage(e instanceof Error ? e.message : "Erreur");
      setError(message);
      setToast({ type: "error", message });
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
    setToast(null);
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
      setToast({ type: "success", message: "Compte mis à jour." });
    } catch (e) {
      const message = friendlyErrorMessage(e instanceof Error ? e.message : "Erreur");
      setError(message);
      setToast({ type: "error", message });
    } finally {
      setBusyId(null);
    }
  }

  async function createAccount() {
    setBusyId("create");
    setToast(null);
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
      setToast({ type: "success", message: "Compte utilisateur créé." });
    } catch (e) {
      const message = friendlyErrorMessage(e instanceof Error ? e.message : "Erreur");
      setError(message);
      setToast({ type: "error", message });
    } finally {
      setBusyId(null);
    }
  }

  async function forceLogout(userId: string) {
    setBusyId(userId);
    setToast(null);
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
      setToast({ type: "success", message: "Déconnexion forcée effectuée avec succès." });
    } catch (e) {
      const message = friendlyErrorMessage(e instanceof Error ? e.message : "Erreur");
      setError(message);
      setToast({ type: "error", message });
    } finally {
      setBusyId(null);
    }
  }

  async function runBulkAction(action: "FORCE_LOGOUT" | "ACTIVATE" | "DEACTIVATE") {
    if (!selectedIds.length) return;
    setBusyId(`bulk-${action}`);
    setToast(null);
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
      setToast({ type: "success", message: body?.message ?? "Action de masse exécutée." });
    } catch (e) {
      const message = friendlyErrorMessage(e instanceof Error ? e.message : "Erreur");
      setError(message);
      setToast({ type: "error", message });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 md:p-6">
      <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.16em] text-cyan-300">Administration</p>
          <h2 className="mt-1 text-2xl font-semibold text-slate-900">Utilisateurs</h2>
          <p className="mt-1 text-sm text-slate-600">
            Gestion des comptes et déconnexion forcée de session active.
          </p>
        </div>
        <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 xl:w-auto">
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg border border-cyan-600 bg-cyan-50 px-3 py-2 text-sm text-cyan-700 hover:bg-cyan-100 disabled:opacity-50"
          >
            Rafraîchir
          </button>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="rounded-lg border border-emerald-600 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
          >
            Créer un compte
          </button>
        </div>
      </div>

      <div className="mb-3 grid gap-2 md:grid-cols-2 xl:grid-cols-5">
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Recherche nom, email, matricule…"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 xl:col-span-2"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as "ALL" | "ACTIF" | "INACTIF")}
          aria-label="Filtrer par statut"
          className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-700"
        >
          <option value="ALL">Tous statuts</option>
          <option value="ACTIF">Actifs</option>
          <option value="INACTIF">Inactifs</option>
        </select>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          aria-label="Filtrer par rôle"
          className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-700"
        >
          <option value="ALL">Tous rôles</option>
          {ROLE_OPTIONS.map((role) => (
            <option key={role} value={role}>
              {LONACI_ROLE_LABELS[role]}
            </option>
          ))}
        </select>
        <select
          value={agenceFilter}
          onChange={(e) => setAgenceFilter(e.target.value)}
          aria-label="Filtrer par agence"
          className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-700"
        >
          <option value="ALL">Toutes agences</option>
          {agences
            .filter((a) => a.actif)
            .map((ag) => (
              <option key={ag.id} value={ag.id}>
                {ag.code} — {ag.libelle}
              </option>
            ))}
        </select>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-500">{pagination.total} utilisateur(s) • {selectedIds.length} sélectionné(s)</span>
        <button
          type="button"
          disabled={!selectedIds.length || busyId === "bulk-FORCE_LOGOUT"}
          onClick={() => void runBulkAction("FORCE_LOGOUT")}
          className="rounded border border-rose-300 bg-rose-50 px-2.5 py-1.5 text-xs text-rose-700 hover:bg-rose-100 disabled:opacity-50"
        >
          Forcer déconnexion (lot)
        </button>
        <button
          type="button"
          disabled={!selectedIds.length || busyId === "bulk-DEACTIVATE"}
          onClick={() => void runBulkAction("DEACTIVATE")}
          className="rounded border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-700 hover:bg-amber-100 disabled:opacity-50"
        >
          Désactiver (lot)
        </button>
        <button
          type="button"
          disabled={!selectedIds.length || busyId === "bulk-ACTIVATE"}
          onClick={() => void runBulkAction("ACTIVATE")}
          className="rounded border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-xs text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
        >
          Réactiver (lot)
        </button>
        {!!selectedIds.length ? (
          <button
            type="button"
            onClick={() => setSelectedIds([])}
            className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
          >
            Effacer la sélection
          </button>
        ) : null}
      </div>

      {loading ? <p className="text-sm text-slate-600">Chargement...</p> : null}
      {toast ? (
        <p
          className={`mb-3 text-sm ${
            toast.type === "success" ? "text-emerald-300" : "text-rose-300"
          }`}
          role="status"
          aria-live="polite"
        >
          {toast.message}
        </p>
      ) : null}
      {error ? <p className="mb-3 text-sm text-rose-600">{error}</p> : null}

      {!loading ? (
        <div className="overflow-visible rounded-xl border border-slate-200">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-100 text-slate-600">
                <tr>
                  <th className="px-3 py-3">
                    <input
                      type="checkbox"
                      aria-label="Sélectionner toute la page"
                      checked={items.length > 0 && selectedIds.length === items.length}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedIds(items.map((u) => u.id));
                        else setSelectedIds([]);
                      }}
                    />
                  </th>
                  <th className="px-3 py-3">Utilisateur</th>
                  <th className="px-3 py-3">Rôle</th>
                  <th className="px-3 py-3">Agence</th>
                  <th className="px-3 py-3">Statut</th>
                  <th className="px-3 py-3">Dernière connexion</th>
                  <th className="px-3 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="text-slate-800">
                {items.map((u) => (
                  <tr key={u.id} className="border-t border-slate-200 bg-white hover:bg-slate-50">
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        aria-label={`Sélectionner ${u.prenom} ${u.nom}`}
                        checked={selectedIds.includes(u.id)}
                        onChange={(e) => {
                          setSelectedIds((prev) =>
                            e.target.checked ? [...new Set([...prev, u.id])] : prev.filter((id) => id !== u.id),
                          );
                        }}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-medium">{u.prenom} {u.nom}</div>
                      <div className="text-xs text-slate-600">{u.email}</div>
                      {u.matricule ? <div className="text-[11px] text-slate-500">Matricule: {u.matricule}</div> : null}
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-medium">{getLonaciRoleLabel(u.role)}</div>
                      {getLonaciRoleProfile(u.role)?.responsabilite ? (
                        <div className="text-[11px] text-slate-500">{getLonaciRoleProfile(u.role)?.responsabilite}</div>
                      ) : null}
                    </td>
                    <td className="px-3 py-3">{u.agenceId ? agenceLabelForId(u.agenceId, agences) : "—"}</td>
                    <td className="px-3 py-3">{u.actif ? "ACTIF" : "INACTIF"}</td>
                    <td className="px-3 py-3">
                      {u.derniereConnexion ? new Date(u.derniereConnexion).toLocaleString("fr-FR") : "—"}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="relative inline-block" data-user-menu-wrap>
                        <button
                          type="button"
                          disabled={busyId === u.id}
                          onClick={() => setRowMenuOpenId((prev) => (prev === u.id ? null : u.id))}
                          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                          aria-haspopup="menu"
                          aria-label={`Actions pour ${u.prenom} ${u.nom}`}
                        >
                          {busyId === u.id ? "..." : "Actions"}
                        </button>

                        {rowMenuOpenId === u.id ? (
                          <div
                            role="menu"
                            aria-label="Actions utilisateur"
                            className="absolute right-0 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg z-50"
                          >
                            <div className="px-3 py-2 text-xs text-slate-500">Utilisateur</div>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setRowMenuOpenId(null);
                                setConfirmTarget(u);
                              }}
                              disabled={busyId === u.id}
                              className="w-full px-3 py-2 text-left text-sm text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                            >
                              Forcer déconnexion
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setRowMenuOpenId(null);
                                void toggleActive(u);
                              }}
                              disabled={busyId === u.id}
                              className="w-full px-3 py-2 text-left text-sm text-amber-700 hover:bg-amber-50 disabled:opacity-50"
                            >
                              {u.actif ? "Désactiver" : "Réactiver"}
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setRowMenuOpenId(null);
                                void adminResetPassword(u.id);
                              }}
                              disabled={busyId === u.id}
                              className="w-full px-3 py-2 text-left text-sm text-cyan-700 hover:bg-cyan-50 disabled:opacity-50"
                            >
                              Reset MDP
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setRowMenuOpenId(null);
                                openEdit(u);
                              }}
                              disabled={busyId === u.id}
                              className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                            >
                              Modifier
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
                {!items.length ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-5 text-center text-slate-500">
                      Aucun utilisateur.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <div>
              Page {pagination.page} / {pagination.totalPages}
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1">
                <span>Par page</span>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="rounded border border-slate-300 bg-white px-1.5 py-1 text-xs text-slate-700"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
              </label>
              <button
                type="button"
                disabled={pagination.page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded border border-slate-300 bg-white px-2 py-1 hover:bg-slate-100 disabled:opacity-50"
              >
                Précédent
              </button>
              <button
                type="button"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                className="rounded border border-slate-300 bg-white px-2 py-1 hover:bg-slate-100 disabled:opacity-50"
              >
                Suivant
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-600/20 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <p className="text-xs uppercase tracking-[0.16em] text-rose-600">Confirmation</p>
            <h3 className="mt-1 text-lg font-semibold text-slate-900">Forcer la déconnexion ?</h3>
            <p className="mt-2 text-sm text-slate-600">
              Cette action invalidera la session active de{" "}
              <span className="font-medium text-slate-900">
                {confirmTarget.prenom} {confirmTarget.nom}
              </span>{" "}
              ({confirmTarget.email}).
            </p>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmTarget(null)}
                disabled={busyId === confirmTarget.id}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => void forceLogout(confirmTarget.id)}
                disabled={busyId === confirmTarget.id}
                className="rounded-lg border border-rose-600 bg-rose-50 px-3 py-2 text-sm text-rose-700 hover:bg-rose-100 disabled:opacity-50"
              >
                {busyId === confirmTarget.id ? "Déconnexion..." : "Confirmer"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editOpen && editTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-600/20 p-4">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-4">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-cyan-700">Modification</p>
                <h3 className="mt-1 text-lg font-semibold text-slate-900">
                  {editTarget.prenom} {editTarget.nom}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditOpen(false);
                  setEditTarget(null);
                }}
                className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                aria-label="Fermer"
              >
                ×
              </button>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="grid gap-1">
                <span className="text-xs text-slate-600">Prénom</span>
                <input
                  value={editPrenom}
                  onChange={(e) => setEditPrenom(e.target.value)}
                  className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-xs text-slate-600">Nom</span>
                <input
                  value={editNom}
                  onChange={(e) => setEditNom(e.target.value)}
                  className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                />
              </label>

              <label className="grid gap-1 md:col-span-2">
                <span className="text-xs text-slate-600">Email</span>
                <input
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                />
              </label>

              <label className="grid gap-1">
                <span className="text-xs text-slate-600">Matricule (optionnel)</span>
                <input
                  value={editMatricule}
                  onChange={(e) => setEditMatricule(e.target.value)}
                  className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                />
              </label>

              <label className="grid gap-1">
                <span className="text-xs text-slate-600">Rôle</span>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value)}
                  className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                >
                  {ROLE_OPTIONS.map((role) => (
                    <option key={role} value={role}>
                      {LONACI_ROLE_LABELS[role]}
                    </option>
                  ))}
                </select>
                {editRoleProfile ? (
                  <span className="text-[11px] text-slate-500">
                    {editRoleProfile.designation} — {editRoleProfile.responsabilite}
                  </span>
                ) : null}
              </label>

              <label className="grid gap-1 md:col-span-2">
                <span className="text-xs text-slate-600">Agence de rattachement (optionnel)</span>
                <AgenceRattachementCombobox
                  agences={agences}
                  value={editAgenceId}
                  onChange={setEditAgenceId}
                  inputClassName="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                />
              </label>

              <label className="grid gap-1">
                <span className="text-xs text-slate-600">Actif</span>
                <select
                  value={editActif ? "true" : "false"}
                  onChange={(e) => setEditActif(e.target.value === "true")}
                  className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                >
                  <option value="true">ACTIF</option>
                  <option value="false">INACTIF</option>
                </select>
              </label>

              <label className="grid gap-1 md:col-span-2">
                <span className="text-xs text-slate-600">Agences autorisées</span>
                <AgencesAutoriseesMultiPicker
                  agences={agences}
                  valueIds={editAgencesAutoriseesIds}
                  onChangeIds={setEditAgencesAutoriseesIds}
                  csvFallbackValue={editAgencesAutoriseesCsv}
                  onCsvFallbackChange={setEditAgencesAutoriseesCsv}
                  inputClassName="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                />
              </label>

              <div className="md:col-span-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                <p className="text-xs font-medium text-slate-800">Modules</p>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
                  Ce compte a accès à <strong className="text-slate-800">tous les modules</strong> applicatifs (liste
                  vide côté serveur : pas de restriction par module, le rôle continue de s’appliquer).
                </p>
              </div>

              <label className="grid gap-1 md:col-span-2">
                <span className="text-xs text-slate-600">Produits autorisés</span>
                <ProduitsAutorisesMultiPicker
                  produits={produits}
                  valueCodes={editProduitsCodes}
                  onChangeCodes={setEditProduitsCodes}
                  csvFallbackValue={editProduitsCsv}
                  onCsvFallbackChange={setEditProduitsCsv}
                  inputClassName="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                />
              </label>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditOpen(false);
                  setEditTarget(null);
                }}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={busyId === editTarget.id}
                onClick={() => void saveEdit()}
                className="rounded-lg border border-cyan-600 bg-cyan-50 px-3 py-2 text-sm font-semibold text-cyan-700 hover:bg-cyan-100 disabled:opacity-50"
              >
                {busyId === editTarget.id ? "Sauvegarde..." : "Enregistrer"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-200">
        <div className="border-b border-slate-200 bg-slate-100 px-3 py-2">
          <h3 className="text-sm font-semibold text-slate-900">Journal de connexion</h3>
          <p className="text-xs text-slate-600">Date, heure, IP et statut (succès/échec)</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                <th className="px-3 py-2">Date/heure</th>
                <th className="px-3 py-2">Compte</th>
                <th className="px-3 py-2">IP</th>
                <th className="px-3 py-2">Statut</th>
                <th className="px-3 py-2">Détail</th>
              </tr>
            </thead>
            <tbody className="text-slate-800">
              {authLogs.map((log) => (
                <tr key={log.id} className="border-t border-slate-200 bg-white">
                  <td className="px-3 py-2">{new Date(log.attemptedAt).toLocaleString("fr-FR")}</td>
                  <td className="px-3 py-2">{log.email}</td>
                  <td className="px-3 py-2">{log.ipAddress ?? "—"}</td>
                  <td className="px-3 py-2">{log.status === "SUCCESS" ? "Succès" : "Échec"}</td>
                  <td className="px-3 py-2">{log.reason ?? "—"}</td>
                </tr>
              ))}
              {!authLogs.length ? (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-center text-slate-500">
                    Aucun log de connexion.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {createOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-600/20 p-4"
          role="presentation"
          onClick={() => {
            if (busyId !== "create") setCreateOpen(false);
          }}
        >
          <div
            className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-user-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-4">
              <h3 id="create-user-title" className="text-lg font-semibold text-slate-900">
                Nouveau compte utilisateur
              </h3>
              <button
                type="button"
                onClick={() => {
                  if (busyId !== "create") setCreateOpen(false);
                }}
                disabled={busyId === "create"}
                className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Fermer"
              >
                ×
              </button>
            </div>
            <div className="mt-4 grid gap-2 md:grid-cols-2">
              <input value={createPrenom} onChange={(e) => setCreatePrenom(e.target.value)} placeholder="Prénom" className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900" />
              <input value={createNom} onChange={(e) => setCreateNom(e.target.value)} placeholder="Nom" className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900" />
              <input value={createEmail} onChange={(e) => setCreateEmail(e.target.value)} placeholder="Email" className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 md:col-span-2" />
              <input value={createMatricule} onChange={(e) => setCreateMatricule(e.target.value)} placeholder="Matricule (optionnel)" className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900" />
              <input type="password" value={createPassword} onChange={(e) => setCreatePassword(e.target.value)} placeholder="Mot de passe initial" className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900" />
              <select
                aria-label="Rôle du compte"
                value={createRole}
                onChange={(e) => setCreateRole(e.target.value)}
                className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              >
                {ROLE_OPTIONS.map((role) => (
                  <option key={role} value={role}>
                    {LONACI_ROLE_LABELS[role]}
                  </option>
                ))}
              </select>
              {createRoleProfile ? (
                <p className="text-[11px] text-slate-500 md:col-span-2">
                  {createRoleProfile.designation} — {createRoleProfile.responsabilite}
                </p>
              ) : null}
              <label className="grid gap-1 md:col-span-2">
                <span className="text-xs text-slate-600">Agence de rattachement</span>
                <AgenceRattachementCombobox
                  agences={agences}
                  value={createAgenceId}
                  onChange={setCreateAgenceId}
                  inputClassName="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                />
              </label>
              <label className="grid gap-1 md:col-span-2">
                <span className="text-xs text-slate-600">Agences autorisées</span>
                <AgencesAutoriseesMultiPicker
                  agences={agences}
                  valueIds={createAgencesAutoriseesIds}
                  onChangeIds={setCreateAgencesAutoriseesIds}
                  csvFallbackValue={createAgencesAutoriseesCsv}
                  onCsvFallbackChange={setCreateAgencesAutoriseesCsv}
                  inputClassName="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                />
              </label>
              <div className="md:col-span-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                <p className="text-xs font-medium text-slate-800">Modules</p>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
                  Accès à <strong className="text-slate-800">tous les modules</strong> (aucune liste restreinte à la
                  création ; le rôle définit les habilitations métier).
                </p>
              </div>
              <label className="grid gap-1 md:col-span-2">
                <span className="text-xs text-slate-600">Produits autorisés</span>
                <ProduitsAutorisesMultiPicker
                  produits={produits}
                  valueCodes={createProduitsCodes}
                  onChangeCodes={setCreateProduitsCodes}
                  csvFallbackValue={createProduitsCsv}
                  onCsvFallbackChange={setCreateProduitsCsv}
                  inputClassName="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                />
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                disabled={busyId === "create"}
                onClick={() => setCreateOpen(false)}
                className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={busyId === "create"}
                onClick={() => void createAccount()}
                className="rounded border border-emerald-600 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
              >
                {busyId === "create" ? "Création..." : "Créer"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

