"use client";

import ConcessionnaireFicheModal from "@/components/lonaci/concessionnaire-fiche-modal";
import type { ConcessionnairesMapPointsResponse } from "@/lib/lonaci/concessionnaires-map-types";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  BANCARISATION_STATUT_LABELS,
  BANCARISATION_STATUTS,
  CONCESSIONNAIRE_STATUT_LABELS,
  CONCESSIONNAIRE_STATUTS,
  type BancarisationStatut,
  type ConcessionnaireStatut,
} from "@/lib/lonaci/constants";
import { captureByAliases, extractPdfText } from "@/lib/lonaci/pdf-import";
import type { ChangeEvent } from "react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type FicheModalTab = "fiche" | "contrats" | "historique" | "pieces";

/** Libellés courts dans le tableau (cohérents avec la fiche : Oui / Non / En cours). */
const BANCARISATION_TABLE_COURT: Record<BancarisationStatut, string> = {
  BANCARISE: "Oui",
  NON_BANCARISE: "Non",
  EN_COURS: "En cours",
};

const BANCARISATION_UI_TOKENS: Record<BancarisationStatut, string> = {
  BANCARISE: "border border-emerald-300 bg-emerald-50 text-emerald-900",
  NON_BANCARISE: "border border-rose-300 bg-rose-50 text-rose-900",
  EN_COURS: "border border-amber-200 bg-amber-50 text-amber-900",
};

const CONCESSIONNAIRE_STATUS_TOKENS: Record<string, string> = {
  ACTIF: "border-green-400 bg-green-100 text-green-900",
  SUSPENDU: "border-slate-400 bg-slate-200 text-slate-800",
  INACTIF: "border-slate-200 bg-slate-100 text-slate-700",
  RESILIE: "border-rose-200 bg-rose-50 text-rose-800",
  DECEDE: "border-rose-300 bg-rose-50 text-rose-900",
  SUCCESSION_EN_COURS: "border-violet-200 bg-violet-50 text-violet-800",
};

function IconeBancarisationOui() {
  return (
    <svg
      className="h-3.5 w-3.5 shrink-0 text-emerald-600 motion-reduce:animate-none motion-safe:animate-[lonaci-icon-pop_0.55s_ease-out_both] motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-out motion-safe:hover:scale-125 motion-safe:active:scale-95"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden
    >
      <path
        fillRule="evenodd"
        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function IconeBancarisationNon() {
  return (
    <svg
      className="h-3.5 w-3.5 shrink-0 text-rose-600 motion-reduce:animate-none motion-safe:animate-[lonaci-icon-pop_0.55s_ease-out_both] motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-out motion-safe:hover:scale-125 motion-safe:active:scale-95"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden
    >
      <path
        fillRule="evenodd"
        d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function classePastilleProduitTableau(code: string): string {
  const u = code.trim().toUpperCase();
  if (u === "LOTO") {
    return "border border-violet-300 bg-violet-100 text-violet-900";
  }
  if (u === "PMU") {
    return "border border-blue-300 bg-blue-100 text-blue-900";
  }
  return "border border-slate-200 bg-slate-100 text-slate-800";
}

function classeCelluleBancarisation(sb: BancarisationStatut): string {
  return BANCARISATION_UI_TOKENS[sb];
}

function ConcessionnaireRowActionsMenu({
  codePdv,
  onOpenFicheModal,
}: {
  codePdv: string;
  onOpenFicheModal: (tab: FicheModalTab) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpenFicheModal("fiche")}
      className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-800 shadow-sm transition hover:border-cyan-500 hover:bg-cyan-50/70"
      aria-label={`Ouvrir la fiche de ${codePdv}`}
    >
      Ouvrir
    </button>
  );
}

interface Item {
  id: string;
  codePdv: string;
  nomComplet: string;
  raisonSociale: string;
  photoUrl: string | null;
  cniNumero: string | null;
  telephonePrincipal: string | null;
  telephoneSecondaire: string | null;
  produitsAutorises: string[];
  statut: string;
  statutBancarisation: string;
  agenceId: string | null;
  gps: { lat: number; lng: number } | null;
  observations: string | null;
  telephone: string | null;
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

type ExtractedConcessionnaireDraft = {
  codePdv?: string;
  nomComplet?: string;
  cniNumero?: string;
  telephonePrincipal?: string;
  telephoneSecondaire?: string;
  agenceRaw?: string;
  produitsRaw?: string;
  statut?: string;
  statutBancarisation?: string;
  compteBancaire?: string;
  observations?: string;
  lat?: string;
  lng?: string;
};

function normalizeToken(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function pickRecordValue(record: Record<string, unknown>, aliases: string[]): string | null {
  const normalizedMap = new Map<string, string>();
  for (const key of Object.keys(record)) {
    normalizedMap.set(normalizeToken(key), key);
  }
  for (const alias of aliases) {
    const hitKey = normalizedMap.get(normalizeToken(alias));
    if (!hitKey) continue;
    const raw = record[hitKey];
    if (raw === undefined || raw === null) continue;
    const text = String(raw).trim();
    if (!text) continue;
    return text;
  }
  return null;
}

function extractDraftFromRecord(record: Record<string, unknown>): ExtractedConcessionnaireDraft {
  const codePdv = pickRecordValue(record, ["codePdv", "code pdv", "pdv", "reference"]);
  const nomComplet = pickRecordValue(record, ["nomComplet", "nom complet", "nom", "raisonSociale", "raison sociale"]);
  const cniNumero = pickRecordValue(record, ["cniNumero", "cni", "numero cni", "piece identite"]);
  const telephonePrincipal = pickRecordValue(record, [
    "telephonePrincipal",
    "telephone principal",
    "telephone",
    "tel",
    "phone",
  ]);
  const telephoneSecondaire = pickRecordValue(record, [
    "telephoneSecondaire",
    "telephone secondaire",
    "tel secondaire",
    "phone2",
  ]);
  const agenceRaw = pickRecordValue(record, ["agenceId", "agence", "code agence", "agence code"]);
  const produitsRaw = pickRecordValue(record, ["produitsAutorises", "produits", "produit", "product"]);
  const statut = pickRecordValue(record, ["statut"]);
  const statutBancarisation = pickRecordValue(record, ["statutBancarisation", "bancarisation", "statut bancarisation"]);
  const compteBancaire = pickRecordValue(record, ["compteBancaire", "compte bancaire", "iban", "numero compte"]);
  const observations = pickRecordValue(record, ["observations", "notes", "commentaire"]);
  const lat = pickRecordValue(record, ["lat", "latitude", "gps lat", "gps.latitude"]);
  const lng = pickRecordValue(record, ["lng", "longitude", "gps lng", "gps.longitude"]);
  return {
    codePdv: codePdv ?? undefined,
    nomComplet: nomComplet ?? undefined,
    cniNumero: cniNumero ?? undefined,
    telephonePrincipal: telephonePrincipal ?? undefined,
    telephoneSecondaire: telephoneSecondaire ?? undefined,
    agenceRaw: agenceRaw ?? undefined,
    produitsRaw: produitsRaw ?? undefined,
    statut: statut ?? undefined,
    statutBancarisation: statutBancarisation ?? undefined,
    compteBancaire: compteBancaire ?? undefined,
    observations: observations ?? undefined,
    lat: lat ?? undefined,
    lng: lng ?? undefined,
  };
}

async function extractDraftFromExcel(file: File): Promise<ExtractedConcessionnaireDraft> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const workbook = XLSX.read(buf, { type: "array" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) throw new Error("Aucune feuille trouvée dans le fichier Excel.");
  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  if (!rows.length) throw new Error("Le fichier Excel est vide.");
  return extractDraftFromRecord(rows[0]);
}

async function downloadConcessionnaireExcelTemplate() {
  const XLSX = await import("xlsx");
  const headers = [
    "nomComplet",
    "cniNumero",
    "telephonePrincipal",
    "telephoneSecondaire",
    "agence",
    "produitsAutorises",
    "statut",
    "statutBancarisation",
    "compteBancaire",
    "latitude",
    "longitude",
    "observations",
  ];
  const sample = {
    nomComplet: "KOUASSI JEAN",
    cniNumero: "CNI123456789",
    telephonePrincipal: "+2250700000000",
    telephoneSecondaire: "",
    agence: "ABOBO",
    produitsAutorises: "LOTO;PMU",
    statut: "ACTIF",
    statutBancarisation: "NON_BANCARISE",
    compteBancaire: "",
    latitude: "5.3599",
    longitude: "-4.0083",
    observations: "Exemple de ligne",
  };
  const ws = XLSX.utils.json_to_sheet([sample], { header: headers });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "concessionnaires");
  XLSX.writeFile(wb, "modele-concessionnaires.xlsx");
}

async function normalizeImportFileForApi(file: File): Promise<File> {
  const sanitize = (raw: Record<string, unknown>): Record<string, unknown> => ({
    nomComplet: (raw.nomComplet as string | null) ?? null,
    cniNumero: (raw.cniNumero as string | null) ?? null,
    telephonePrincipal: (raw.telephonePrincipal as string | null) ?? null,
    telephoneSecondaire: (raw.telephoneSecondaire as string | null) ?? null,
    agenceId: (raw.agenceId as string | null) ?? null,
    produitsAutorises: raw.produitsAutorises ?? [],
    statut: (raw.statut as string | null) ?? "ACTIF",
    statutBancarisation: (raw.statutBancarisation as string | null) ?? "NON_BANCARISE",
    compteBancaire: (raw.compteBancaire as string | null) ?? null,
    observations: (raw.observations as string | null) ?? null,
    gps: raw.gps ?? null,
  });
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".json") || lower.endsWith(".csv")) return file;
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    const XLSX = await import("xlsx");
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: "array" });
    const firstSheet = wb.Sheets[wb.SheetNames[0]];
    if (!firstSheet) throw new Error("Fichier Excel vide.");
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: null });
    const json = JSON.stringify(rows.map((r) => sanitize(r)));
    return new File([json], file.name.replace(/\.(xlsx|xls)$/i, ".json"), { type: "application/json" });
  }
  if (lower.endsWith(".pdf")) {
    const draft = await extractDraftFromPdf(file);
    const row: Record<string, unknown> = sanitize({
      nomComplet: draft.nomComplet ?? null,
      cniNumero: draft.cniNumero ?? null,
      telephonePrincipal: draft.telephonePrincipal ?? null,
      telephoneSecondaire: draft.telephoneSecondaire ?? null,
      agenceId: draft.agenceRaw ?? null,
      produitsAutorises: draft.produitsRaw ? draft.produitsRaw.split(/[,;|/]/).map((x) => x.trim()).filter(Boolean) : [],
      statut: draft.statut ?? "ACTIF",
      statutBancarisation: draft.statutBancarisation ?? "NON_BANCARISE",
      compteBancaire: draft.compteBancaire ?? null,
      observations: draft.observations ?? null,
      gps:
        draft.lat && draft.lng
          ? { lat: Number(draft.lat.replace(",", ".")), lng: Number(draft.lng.replace(",", ".")) }
          : null,
    });
    const json = JSON.stringify([row]);
    return new File([json], file.name.replace(/\.pdf$/i, ".json"), { type: "application/json" });
  }
  throw new Error("Format non supporte. Utilisez .json, .csv, .xlsx, .xls ou .pdf.");
}

async function extractDraftFromPdf(file: File): Promise<ExtractedConcessionnaireDraft> {
  const text = await extractPdfText(file, 8);
  return {
    codePdv: captureByAliases(text, ["code pdv", "pdv", "reference"], "[a-z0-9\\-_/]{3,60}") ?? undefined,
    nomComplet:
      captureByAliases(text, ["nom complet", "nom", "raison sociale", "raisonsociale"], "[^|;]{2,120}") ?? undefined,
    cniNumero: captureByAliases(text, ["cni", "numero cni", "piece identite"], "[a-z0-9\\-_/]{3,80}") ?? undefined,
    telephonePrincipal:
      captureByAliases(text, ["telephone principal", "telephone", "tel", "phone"], "[+0-9 ]{8,20}") ?? undefined,
    telephoneSecondaire:
      captureByAliases(text, ["telephone secondaire", "tel 2", "phone2"], "[+0-9 ]{8,20}") ?? undefined,
    agenceRaw: captureByAliases(text, ["agence", "code agence", "agence id"], "[a-z0-9_ \\-]{2,80}") ?? undefined,
    produitsRaw: captureByAliases(text, ["produits autorises", "produits", "produit"], "[^|;]{2,180}") ?? undefined,
    statut: captureByAliases(text, ["statut"], "[a-z_]{3,40}") ?? undefined,
    statutBancarisation: captureByAliases(text, ["statut bancarisation", "bancarisation"], "[a-z_]{3,40}") ?? undefined,
    compteBancaire: captureByAliases(text, ["compte bancaire", "iban", "numero compte"], "[a-z0-9 \\-]{3,80}") ?? undefined,
    observations: captureByAliases(text, ["observations", "notes", "commentaire"], "[^|;]{2,300}") ?? undefined,
    lat: captureByAliases(text, ["lat", "latitude", "gps lat"], "-?[0-9]+(?:[.,][0-9]+)?") ?? undefined,
    lng: captureByAliases(text, ["lng", "long", "longitude", "gps lng"], "-?[0-9]+(?:[.,][0-9]+)?") ?? undefined,
  };
}

export default function ConcessionnairesPanel() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  /** Lignes par page — limité pour garder la liste lisible sur un seul écran. */
  const pageSize = 12;
  const [q, setQ] = useState("");
  const [filterAgenceId, setFilterAgenceId] = useState("");
  const [agences, setAgences] = useState<AgenceRef[]>([]);
  const [produits, setProduits] = useState<ProduitRef[]>([]);

  const [rs, setRs] = useState("");
  const [cniNumero, setCniNumero] = useState("");
  const [tel, setTel] = useState("");
  const [telSecondary, setTelSecondary] = useState("");
  const [agenceId, setAgenceId] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [produitsAutorises, setProduitsAutorises] = useState<string[]>([]);
  const [createStatut, setCreateStatut] = useState<string>("ACTIF");
  const [bancarisation, setBancarisation] = useState<string>("NON_BANCARISE");
  const [compteBancaire, setCompteBancaire] = useState("");
  const [observations, setObservations] = useState("");
  const [me, setMe] = useState<{ agenceId: string | null; role: string } | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const directImportInputRef = useRef<HTMLInputElement>(null);
  const [creating, setCreating] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [importingFile, setImportingFile] = useState(false);
  const [lastSearchMs, setLastSearchMs] = useState<number | null>(null);
  /** Heure affichée après chargement réussi — évite l’écart SSR/client (new Date() au rendu). */
  const [lastSyncLabel, setLastSyncLabel] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const createFormRef = useRef<HTMLFormElement>(null);
  const [ficheModalId, setFicheModalId] = useState<string | null>(null);
  const [ficheModalTab, setFicheModalTab] = useState<FicheModalTab>("fiche");
  /** Total PDV avec GPS (filtres actuels) — pour le libellé du lien Carte. */
  const [carteGpsTotal, setCarteGpsTotal] = useState<number | null>(null);

  useEffect(() => {
    if (!createOpen) return;
    const t = window.setTimeout(() => {
      createFormRef.current?.querySelector<HTMLInputElement>("input:not([type=hidden])")?.focus();
    }, 50);
    return () => window.clearTimeout(t);
  }, [createOpen]);

  useEffect(() => {
    if (!createOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !creating) setCreateOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [createOpen, creating]);

  async function load(p = page, filters?: { q?: string; agenceId?: string }) {
    const qEff = filters?.q !== undefined ? filters.q : q;
    const agenceEff = filters?.agenceId !== undefined ? filters.agenceId : filterAgenceId;
    setLoading(true);
    setError(null);
    try {
      const start = performance.now();
      const params = new URLSearchParams({ page: String(p), pageSize: String(pageSize) });
      if (qEff.trim()) params.set("q", qEff.trim());
      if (agenceEff) params.set("agenceId", agenceEff);
      const res = await fetch(`/api/concessionnaires?${params}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Liste inaccessible");
      const data = (await res.json()) as { items: Item[]; total: number; page: number };
      setItems(data.items);
      setTotal(data.total);
      setPage(data.page);
      setLastSearchMs(Math.round(performance.now() - start));
      setLastSyncLabel(new Date().toLocaleTimeString("fr-FR"));
      void refreshMapPointsTotal(qEff, agenceEff);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const aid = searchParams.get("agenceId")?.trim() ?? "";
    if (aid) setFilterAgenceId(aid);
    void load(1, aid ? { agenceId: aid, q: "" } : undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onDataImported = () => {
      void load(page, { q, agenceId: filterAgenceId });
    };
    window.addEventListener("lonaci:data-imported", onDataImported);
    return () => window.removeEventListener("lonaci:data-imported", onDataImported);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, q, filterAgenceId]);

  async function refreshMapPointsTotal(qEff: string, agenceEff: string) {
    try {
      const params = new URLSearchParams();
      if (qEff.trim()) params.set("q", qEff.trim());
      if (agenceEff) params.set("agenceId", agenceEff);
      const res = await fetch(`/api/concessionnaires/map-points?${params}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Carte indisponible");
      const data = (await res.json()) as ConcessionnairesMapPointsResponse;
      setCarteGpsTotal(data.totalWithGps);
    } catch {
      setCarteGpsTotal(null);
    }
  }

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/referentials", { credentials: "include", cache: "no-store" });
        if (!res.ok) throw new Error("Référentiels indisponibles");
        const data = (await res.json()) as { agences: AgenceRef[]; produits: ProduitRef[] };
        /** Toutes les agences (y compris inactives) pour résoudre les libellés dans le tableau. */
        setAgences(data.agences);
        setProduits(data.produits.filter((p) => p.actif));
      } catch (e) {
        setToast({
          type: "error",
          message: e instanceof Error ? e.message : "Erreur de chargement des référentiels",
        });
      }
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include", cache: "no-store" });
        if (!res.ok) throw new Error("Profil utilisateur indisponible");
        const data = (await res.json()) as { user: { agenceId: string | null; role: string } };
        setMe(data.user);
      } catch (e) {
        setToast({
          type: "error",
          message: e instanceof Error ? e.message : "Erreur de chargement du profil",
        });
      }
    })();
  }, []);

  const isAgenceProfileFixed = Boolean(
    me &&
      me.agenceId &&
      (me.role === "AGENT" || me.role === "CHEF_SECTION" || me.role === "ASSIST_CDS"),
  );

  /** Filtres et création : uniquement agences actives ; le tableau utilise `agences` complet pour les libellés. */
  const agencesActives = useMemo(() => agences.filter((a) => a.actif), [agences]);

  useEffect(() => {
    if (isAgenceProfileFixed && me?.agenceId) {
      setAgenceId(me.agenceId);
    }
  }, [isAgenceProfileFixed, me?.agenceId]);

  useEffect(() => {
    if (createOpen) return;
    setPhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    if (photoInputRef.current) photoInputRef.current.value = "";
  }, [createOpen]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      if (!rs.trim() || rs.trim().length < 2) {
        throw new Error("Le nom complet est obligatoire (2 caractères minimum).");
      }
      if (!agenceId.trim()) {
        throw new Error("L’agence de rattachement est obligatoire.");
      }
      const la = Number(lat.replace(",", "."));
      const lo = Number(lng.replace(",", "."));
      if (Number.isNaN(la) || Number.isNaN(lo)) {
        throw new Error("Coordonnées GPS obligatoires (latitude et longitude valides).");
      }
      if (bancarisation === "BANCARISE" && !compteBancaire.trim()) {
        throw new Error("Le numéro de compte est obligatoire pour passer au statut BANCARISÉ.");
      }
      const cni = cniNumero.trim();
      if (cni.length > 0 && cni.length < 4) {
        throw new Error("Numéro CNI : au moins 4 caractères si renseigné.");
      }

      const body: Record<string, unknown> = {
        nomComplet: rs.trim(),
        cniNumero: cni || null,
        email: null,
        telephonePrincipal: tel.trim() || null,
        telephoneSecondaire: telSecondary.trim() || null,
        ville: null,
        agenceId: agenceId.trim(),
        produitsAutorises,
        statut: createStatut,
        statutBancarisation: bancarisation,
        compteBancaire: compteBancaire.trim() || null,
        observations: observations.trim() || null,
        adresse: null,
        codePostal: null,
        notesInternes: null,
        gps: { lat: la, lng: lo },
      };
      const res = await fetch("/api/concessionnaires", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(b?.message ?? "Création impossible");
      }
      const created = (await res.json()) as { concessionnaire?: { id: string } };
      const newId = created.concessionnaire?.id;
      const photoFile = photoInputRef.current?.files?.[0];
      if (newId && photoFile) {
        const fd = new FormData();
        fd.append("file", photoFile);
        fd.append("kind", "PHOTO");
        const up = await fetch(`/api/concessionnaires/${newId}/pieces`, {
          method: "POST",
          body: fd,
          credentials: "include",
        });
        if (!up.ok) {
          const b = (await up.json().catch(() => null)) as { message?: string } | null;
          setToast({
            type: "error",
            message: b?.message ?? "Concessionnaire créé, mais l’import de la photo a échoué.",
          });
          await load(1);
          return;
        }
      }

      setRs("");
      setCniNumero("");
      setTel("");
      setTelSecondary("");
      if (!isAgenceProfileFixed) setAgenceId("");
      setLat("");
      setLng("");
      setProduitsAutorises([]);
      setCreateStatut("ACTIF");
      setBancarisation("NON_BANCARISE");
      setCompteBancaire("");
      setObservations("");
      setPhotoPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      if (photoInputRef.current) photoInputRef.current.value = "";
      await load(1);
      setCreateOpen(false);
      setToast({ type: "success", message: "Concessionnaire créé." });
    } catch (e) {
      setToast({ type: "error", message: e instanceof Error ? e.message : "Erreur" });
    } finally {
      setCreating(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = total === 0 ? 0 : (page - 1) * pageSize + items.length;
  const paginationLocked = loading;
  const activeCount = items.filter((item) => item.statut === "ACTIF").length;
  const withContactCount = items.filter(
    (item) => item.telephone || item.telephonePrincipal || item.telephoneSecondaire,
  ).length;
  const mapCount = items.filter((item) => item.gps).length;
  const carteCountAffiche = carteGpsTotal ?? mapCount;
  const cartePdvHref = useMemo(() => {
    const p = new URLSearchParams();
    if (filterAgenceId) p.set("agenceId", filterAgenceId);
    if (q.trim()) p.set("q", q.trim());
    const s = p.toString();
    return s ? `/carte-pdv?${s}` : "/carte-pdv";
  }, [filterAgenceId, q]);
  const statusClass = CONCESSIONNAIRE_STATUS_TOKENS;

  const inputClass =
    "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-cyan-500/20 placeholder:text-slate-400 focus:ring-2 focus:ring-cyan-500";

  const searchInputClass =
    "w-36 max-w-[11rem] rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 outline-none ring-cyan-500/20 placeholder:text-slate-400 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500 sm:w-44 sm:max-w-none";

  const agencesTriees = useMemo(
    () =>
      [...agencesActives].sort((a, b) =>
        a.libelle.localeCompare(b.libelle, "fr", { sensitivity: "base" }),
      ),
    [agencesActives],
  );

  function selectAgenceFiltre(agId: string) {
    const next = filterAgenceId === agId ? "" : agId;
    setFilterAgenceId(next);
    void load(1, { agenceId: next });
  }

  function clearAgenceFiltre() {
    setFilterAgenceId("");
    void load(1, { agenceId: "" });
  }

  const chipBase =
    "shrink-0 rounded-full border px-2.5 py-0.5 text-left text-[11px] font-medium transition focus-visible:outline focus-visible:ring-2 focus-visible:ring-cyan-500";
  const chipIdle = "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50";
  const chipActive = "border-cyan-600 bg-cyan-50 text-cyan-900";

  const selectedAgence = agences.find((a) => a.id === agenceId);
  const pdvFormatHint = selectedAgence
    ? `PDV-${selectedAgence.code.toUpperCase()}-###### (numéro attribué à l’enregistrement)`
    : "Choisissez une agence pour prévisualiser le format du code.";

  function onPhotoFileChange(ev: ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    setPhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return file ? URL.createObjectURL(file) : null;
    });
  }
  const photoFile = photoInputRef.current?.files?.[0] ?? null;

  async function onImportConcessionnaireFileChange(ev: ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    if (!file) return;
    setExtracting(true);
    try {
      const lower = file.name.toLowerCase();
      let draft: ExtractedConcessionnaireDraft;
      if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
        draft = await extractDraftFromExcel(file);
      } else if (lower.endsWith(".pdf")) {
        draft = await extractDraftFromPdf(file);
      } else {
        throw new Error("Format non supporté. Utilisez .xlsx, .xls ou .pdf.");
      }

      if (draft.nomComplet) setRs(draft.nomComplet);
      if (draft.cniNumero) setCniNumero(draft.cniNumero);
      if (draft.telephonePrincipal) setTel(draft.telephonePrincipal);
      if (draft.telephoneSecondaire) setTelSecondary(draft.telephoneSecondaire);
      if (draft.compteBancaire) setCompteBancaire(draft.compteBancaire);
      if (draft.observations) setObservations(draft.observations);
      if (draft.lat) setLat(draft.lat.replace(",", "."));
      if (draft.lng) setLng(draft.lng.replace(",", "."));

      if (draft.agenceRaw) {
        const token = normalizeToken(draft.agenceRaw);
        const matched =
          agencesActives.find((a) => normalizeToken(a.id) === token) ??
          agencesActives.find((a) => normalizeToken(a.code) === token) ??
          agencesActives.find((a) => normalizeToken(a.libelle) === token);
        if (matched) setAgenceId(matched.id);
      }

      if (draft.produitsRaw) {
        const tokens = draft.produitsRaw
          .split(/[,;|/]/)
          .map((t) => t.trim())
          .filter(Boolean);
        const selectedCodes = new Set<string>();
        for (const t of tokens) {
          const tk = normalizeToken(t);
          const matched =
            produits.find((p) => normalizeToken(p.code) === tk) ??
            produits.find((p) => normalizeToken(p.libelle) === tk);
          if (matched) selectedCodes.add(matched.code);
        }
        if (selectedCodes.size > 0) setProduitsAutorises([...selectedCodes]);
      }

      if (draft.statut) {
        const s = normalizeToken(draft.statut);
        const matched = CONCESSIONNAIRE_STATUTS.find((x) => normalizeToken(x) === s);
        if (matched) setCreateStatut(matched);
      }
      if (draft.statutBancarisation) {
        const s = normalizeToken(draft.statutBancarisation);
        const matched = BANCARISATION_STATUTS.find((x) => normalizeToken(x) === s);
        if (matched) setBancarisation(matched);
      }

      setToast({ type: "success", message: "Fichier analysé. Les champs reconnus ont été préremplis." });
    } catch (e) {
      setToast({ type: "error", message: e instanceof Error ? e.message : "Extraction impossible." });
    } finally {
      setExtracting(false);
      ev.target.value = "";
    }
  }

  async function onDirectImportConcessionnaireFileChange(ev: ChangeEvent<HTMLInputElement>) {
    const source = ev.target.files?.[0];
    if (!source) return;
    setImportingFile(true);
    try {
      const file = await normalizeImportFileForApi(source);
      const fd = new FormData();
      fd.set("file", file);
      fd.set("collection", "concessionnaires");
      fd.set("mode", "insert");
      const res = await fetch("/api/import-data", { method: "POST", body: fd });
      const data = (await res.json().catch(() => null)) as
        | { message?: string; inserted?: number; skippedExistingDuplicates?: number }
        | null;
      if (!res.ok) throw new Error(data?.message ?? "Import impossible");
      await load(1, { q, agenceId: filterAgenceId });
      window.dispatchEvent(new Event("lonaci:data-imported"));
      setToast({
        type: "success",
        message: `Import concessionnaires terminé: ${data?.inserted ?? 0} ligne(s) insérée(s), ${data?.skippedExistingDuplicates ?? 0} doublon(s) ignoré(s).`,
      });
    } catch (err) {
      setToast({ type: "error", message: err instanceof Error ? err.message : "Import impossible." });
    } finally {
      setImportingFile(false);
      ev.target.value = "";
    }
  }

  const paginationBtnBase =
    "inline-flex items-center justify-center gap-1 rounded-lg border text-xs font-semibold transition focus-visible:outline focus-visible:ring-2 focus-visible:ring-cyan-500 disabled:pointer-events-none disabled:opacity-40";
  const paginationBtnGhost = `${paginationBtnBase} border-slate-200 bg-white px-2.5 py-2 text-slate-700 hover:border-slate-300 hover:bg-slate-50 sm:px-3`;
  const paginationBtnPrimary = `${paginationBtnBase} border-cyan-600 bg-cyan-600 px-3 py-2 text-white hover:border-cyan-700 hover:bg-cyan-700 sm:min-w-[7.5rem]`;

  const listePaginationBar = (placement: "top" | "bottom") => (
    <div
      className={
        placement === "top"
          ? "mb-3 rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm sm:px-4"
          : "border-t border-slate-200 bg-slate-50/90 px-3 py-3 sm:px-4"
      }
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <p className="text-xs leading-relaxed text-slate-600">
          Affichage{" "}
          <span className="tabular-nums font-semibold text-slate-900">{rangeStart}</span>
          <span className="text-slate-400"> — </span>
          <span className="tabular-nums font-semibold text-slate-900">{rangeEnd}</span>
          <span className="text-slate-500"> sur </span>
          <span className="tabular-nums font-semibold text-slate-900">{total}</span>
          <span className="text-slate-500"> résultat{total > 1 ? "s" : ""}</span>
          <span className="mt-0.5 block text-[11px] text-slate-500 sm:mt-0 sm:ml-1 sm:inline">
            · Page <span className="font-medium text-slate-800">{page}</span> / {totalPages}
          </span>
        </p>
        <nav
          className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2"
          aria-label="Pagination de la liste des concessionnaires"
        >
          <button
            type="button"
            disabled={paginationLocked || page <= 1}
            onClick={() => void load(1)}
            className={`${paginationBtnGhost} aspect-square p-2 sm:aspect-auto sm:px-2.5`}
            aria-label="Première page"
            title="Première page"
          >
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
            <span className="hidden sm:inline">Début</span>
          </button>
          <button
            type="button"
            disabled={paginationLocked || page <= 1}
            onClick={() => void load(page - 1)}
            className={paginationBtnPrimary}
            aria-label="Page précédente"
          >
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 18l-6-6 6-6" />
            </svg>
            <span>Précédent</span>
          </button>
          <button
            type="button"
            disabled={paginationLocked || page >= totalPages}
            onClick={() => void load(page + 1)}
            className={paginationBtnPrimary}
            aria-label="Page suivante"
          >
            <span>Suivant</span>
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 18l6-6-6-6" />
            </svg>
          </button>
          <button
            type="button"
            disabled={paginationLocked || page >= totalPages}
            onClick={() => void load(totalPages)}
            className={`${paginationBtnGhost} aspect-square p-2 sm:aspect-auto sm:px-2.5`}
            aria-label="Dernière page"
            title="Dernière page"
          >
            <span className="hidden sm:inline">Fin</span>
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
            </svg>
          </button>
        </nav>
      </div>
    </div>
  );

  return (
    <div className="min-w-0 space-y-4">
      <section className="relative overflow-hidden rounded-3xl border border-sky-200 bg-gradient-to-r from-sky-50 via-white to-cyan-50 p-5 shadow-sm">
        <div className="pointer-events-none absolute -right-14 -top-14 h-44 w-44 rounded-full bg-sky-200/40 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-16 left-24 h-44 w-44 rounded-full bg-cyan-200/30 blur-2xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="inline-flex rounded-full border border-sky-300 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-700">
            Référentiel
          </p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">Concessionnaires</h2>
          <p className="mt-1 text-sm text-slate-700">Pilotage centralisé du réseau PDV, création rapide et suivi en temps réel.</p>
        </div>
        <div className="flex w-full flex-col items-stretch gap-3 sm:w-auto sm:items-end">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <a
              href={`/api/concessionnaires/export?format=excel&q=${encodeURIComponent(q.trim())}&agenceId=${encodeURIComponent(filterAgenceId)}`}
              className="inline-flex items-center justify-center rounded-xl border border-emerald-300 bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
            >
              Excel
            </a>
            <a
              href={`/api/concessionnaires/export?format=pdf&q=${encodeURIComponent(q.trim())}&agenceId=${encodeURIComponent(filterAgenceId)}`}
              className="inline-flex items-center justify-center rounded-xl border border-rose-300 bg-rose-600 px-3 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700"
            >
              PDF
            </a>
            <Link
              href={cartePdvHref}
              className="inline-flex items-center justify-center rounded-xl border border-violet-300 bg-violet-600 px-3 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700"
            >
              Carte ({carteCountAffiche})
            </Link>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-400 bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:border-cyan-600 hover:bg-cyan-600"
            >
              <span className="text-lg font-light leading-none">+</span>
              Nouveau concessionnaire
            </button>
          </div>
          <div className="rounded-xl border border-white/80 bg-white/80 px-3 py-2 text-right text-xs text-slate-700 shadow-sm backdrop-blur">
            Dernière synchronisation <span className="font-medium text-slate-900">{lastSyncLabel ?? "—"}</span>
          </div>
        </div>
        </div>

        <div className="relative mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative overflow-hidden rounded-lg border border-blue-200/90 bg-gradient-to-br from-blue-50 via-white to-sky-50 p-2 shadow-sm transition hover:shadow-md">
            <div
              className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-slate-300/25"
              aria-hidden
            />
            <div className="relative flex gap-3">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white shadow-md"
                aria-hidden
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                  <path d="M4 6h16M4 10h16M4 14h10M4 18h10" strokeLinecap="round" />
                </svg>
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-blue-700">Total PDV</p>
                <p className="mt-1 text-xl font-bold tabular-nums tracking-tight text-blue-950">{total}</p>
                <p className="mt-1 text-[10px] leading-snug text-blue-700/80">Selon recherche et agence</p>
              </div>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-lg border border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-white to-teal-50/60 p-2 shadow-sm transition hover:shadow-md">
            <div
              className="pointer-events-none absolute -left-6 bottom-0 h-16 w-16 rounded-full bg-emerald-400/15"
              aria-hidden
            />
            <div className="relative flex gap-3">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white shadow-md ring-4 ring-emerald-100"
                aria-hidden
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-700">Actifs</p>
                <p className="mt-1 text-xl font-bold tabular-nums tracking-tight text-emerald-950">{activeCount}</p>
                <p className="mt-1 text-[10px] leading-snug text-emerald-800/80">Sur la page affichée</p>
              </div>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-lg border border-cyan-200/80 bg-gradient-to-b from-cyan-50 to-white p-2 shadow-sm transition hover:shadow-md">
            <div
              className="pointer-events-none absolute right-1 top-1/2 h-14 w-14 -translate-y-1/2 rounded-2xl bg-sky-400/10 rotate-12"
              aria-hidden
            />
            <div className="relative flex gap-3">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-500 text-white shadow-md"
                aria-hidden
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                  <path
                    d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-700">Contacts</p>
                <p className="mt-1 text-xl font-bold tabular-nums tracking-tight text-cyan-950">{withContactCount}</p>
                <p className="mt-1 text-[10px] leading-snug text-cyan-800/80">Tél. renseigné sur la page</p>
              </div>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-lg border-2 border-violet-300/70 bg-gradient-to-tr from-violet-100/40 via-white to-fuchsia-50/50 p-2 shadow-sm transition hover:shadow-md">
            <div
              className="pointer-events-none absolute inset-x-4 top-0 h-1 rounded-b-full bg-gradient-to-r from-violet-500 to-fuchsia-500 opacity-80"
              aria-hidden
            />
            <div className="relative flex gap-2 pt-0.5">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border-2 border-violet-200 bg-white text-violet-600 shadow-sm"
                aria-hidden
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                  <path d="M4 19.5A2.5 2.5 0 016.5 17H20" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M8 7h8M8 11h6" strokeLinecap="round" />
                </svg>
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-violet-800">Pagination</p>
                <p className="mt-1 text-xl font-bold tabular-nums tracking-tight text-violet-950">
                  {page}
                  <span className="text-base font-semibold text-violet-600/90">/{totalPages}</span>
                </p>
                <p className="mt-1 text-[10px] leading-snug text-violet-800/80">Page courante · total pages</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-2 shadow-sm sm:p-2.5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <div
            className="flex min-h-8 min-w-0 flex-1 items-center gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:thin]"
            role="group"
            aria-label="Filtrer par agence"
          >
            <button
              type="button"
              onClick={() => clearAgenceFiltre()}
              className={`${chipBase} ${!filterAgenceId ? chipActive : chipIdle}`}
            >
              Toutes
            </button>
            {agencesTriees.map((ag) => {
              const selected = filterAgenceId === ag.id;
              return (
                <button
                  key={ag.id}
                  type="button"
                  title={`${ag.code} — ${ag.libelle}`}
                  onClick={() => selectAgenceFiltre(ag.id)}
                  className={`${chipBase} max-w-[10rem] truncate ${selected ? chipActive : chipIdle}`}
                >
                  {ag.libelle}
                </button>
              );
            })}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Recherche PDV…"
              className={searchInputClass}
              aria-label="Recherche concessionnaire"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void load(1);
                }
              }}
            />
            <button
              type="button"
              onClick={() => void load(1)}
              className="rounded-md border border-cyan-400 bg-cyan-500 px-2.5 py-1 text-xs font-semibold text-white transition hover:border-cyan-600 hover:bg-cyan-600"
            >
              OK
            </button>
          </div>
        </div>
        <p className="mt-1.5 text-[10px] text-slate-500">
          Dernière requête : {lastSearchMs != null ? `${lastSearchMs} ms` : "—"}
        </p>
      </div>

      {createOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="nouveau-concessionnaire-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]"
            aria-label="Fermer la fenêtre"
            disabled={creating}
            onClick={() => setCreateOpen(false)}
          />
          <div className="relative z-10 flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl outline-none sm:max-h-[min(88vh,760px)] sm:rounded-3xl">
              <div className="relative flex shrink-0 items-start justify-between gap-2 border-b border-slate-200 bg-gradient-to-r from-cyan-50 via-white to-indigo-50 px-3 py-3 sm:gap-3 sm:px-5 sm:py-4">
              <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-cyan-200/40 blur-2xl" />
              <div>
                <h3 id="nouveau-concessionnaire-title" className="text-lg font-semibold text-slate-900">
                  Nouveau concessionnaire
                </h3>
                <p className="mt-0.5 text-xs text-slate-600">
                  Code PDV généré automatiquement (format PDV-[code agence]-[séquence]). GPS obligatoire à la création.
                </p>
              </div>
              <button
                type="button"
                disabled={creating}
                onClick={() => setCreateOpen(false)}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-sm text-slate-600 transition hover:bg-slate-100 disabled:opacity-50"
                aria-label="Fermer"
              >
                ×
              </button>
            </div>
            <form
              ref={createFormRef}
              id="nouveau-concessionnaire"
              onSubmit={onCreate}
              className="flex min-h-0 flex-1 flex-col"
            >
              <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2.5 sm:px-4 sm:py-3">
                <div className="grid gap-2.5">
                  <section className="rounded-xl border border-cyan-200 bg-cyan-50/50 px-3 py-2 text-xs text-slate-700">
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-cyan-800">Règle de génération PDV</p>
                    <p>
                      <span className="font-medium text-slate-800">Code PDV</span> — attribué automatiquement à
                      l’enregistrement. Format :{" "}
                      <code className="rounded bg-white px-1 py-0.5 text-slate-900">
                        PDV-[code agence]-[séquence 6 chiffres]
                      </code>
                    </p>
                    <p className="mt-1 text-slate-500">{pdvFormatHint}</p>
                    <div className="mt-2 rounded-lg border border-cyan-200 bg-white px-2.5 py-2">
                      <p className="text-[11px] font-semibold text-cyan-900">Préremplir via fichier (Excel / PDF)</p>
                      <p className="mt-0.5 text-[11px] text-slate-600">
                        Téléchargez un fichier pour extraire automatiquement les informations détectables.
                      </p>
                      <input
                        ref={importInputRef}
                        type="file"
                        accept=".xlsx,.xls,application/pdf"
                        className="sr-only"
                        onChange={(e) => void onImportConcessionnaireFileChange(e)}
                      />
                      <input
                        ref={directImportInputRef}
                        type="file"
                        accept=".json,.csv,.xlsx,.xls,.pdf"
                        className="sr-only"
                        onChange={(e) => void onDirectImportConcessionnaireFileChange(e)}
                      />
                      <button
                        type="button"
                        onClick={() => importInputRef.current?.click()}
                        disabled={extracting}
                        className="mt-2 inline-flex items-center rounded-md border border-cyan-300 bg-cyan-50 px-2.5 py-1 text-[11px] font-semibold text-cyan-900 hover:bg-cyan-100 disabled:opacity-60"
                      >
                        {extracting ? "Extraction..." : "Télécharger un fichier"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void downloadConcessionnaireExcelTemplate()}
                        className="mt-2 ml-2 inline-flex items-center rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Télécharger le modèle Excel
                      </button>
                      <button
                        type="button"
                        onClick={() => directImportInputRef.current?.click()}
                        disabled={importingFile}
                        className="mt-2 ml-2 inline-flex items-center rounded-md border border-indigo-300 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-800 hover:bg-indigo-100 disabled:opacity-60"
                      >
                        {importingFile ? "Import..." : "Importer fichier vers le tableau"}
                      </button>
                    </div>
                  </section>

                  <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Identité</p>
                    <div className="grid gap-1.5 sm:grid-cols-2">
                      <label className="grid gap-1 sm:col-span-2">
                        <span className="text-xs font-medium text-slate-700">Nom complet *</span>
                        <input required value={rs} onChange={(e) => setRs(e.target.value)} placeholder="Nom et prénom" className={inputClass} />
                      </label>
                      <label className="grid gap-1">
                        <span className="text-xs font-medium text-slate-700">Numéro CNI</span>
                        <input value={cniNumero} onChange={(e) => setCniNumero(e.target.value)} placeholder="Optionnel" className={inputClass} />
                      </label>
                      <label className="grid gap-1">
                        <span className="text-xs font-medium text-slate-700">Agence de rattachement *</span>
                        <select
                          aria-label="Agence de rattachement"
                          required
                          value={agenceId}
                          onChange={(e) => setAgenceId(e.target.value)}
                          disabled={isAgenceProfileFixed}
                          className={`${inputClass} disabled:cursor-not-allowed disabled:bg-slate-100`}
                        >
                          <option value="">Sélectionner une agence</option>
                          {agencesActives.map((ag) => (
                            <option key={ag.id} value={ag.id}>
                              {ag.code} — {ag.libelle}
                            </option>
                          ))}
                        </select>
                        {isAgenceProfileFixed ? <span className="text-xs text-slate-500">Rattaché à votre agence (non modifiable).</span> : null}
                      </label>
                    </div>
                  </section>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Médias & contact</p>
                      <div className="grid gap-2">
                        <div className="grid gap-2">
                          <span className="text-xs font-medium text-slate-700">Photo du point de vente (optionnel)</span>
                          <input
                            ref={photoInputRef}
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            aria-label="Photo du point de vente (optionnel)"
                            onChange={onPhotoFileChange}
                            className="sr-only"
                          />
                          <button
                            type="button"
                            onClick={() => photoInputRef.current?.click()}
                            className="flex w-full min-w-0 items-center justify-between gap-2 rounded-md border border-slate-300 bg-white px-2 py-1 text-left text-[11px] leading-4 text-slate-900 shadow-sm outline-none focus:ring-2 focus:ring-indigo-500/20"
                          >
                            <span className="inline-flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
                              <svg
                                aria-hidden="true"
                                viewBox="0 0 24 24"
                                className="h-3.5 w-3.5 shrink-0 text-slate-500"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z" />
                                <path d="M14 2v5h5" />
                              </svg>
                              <span className="truncate">{photoFile ? photoFile.name : "Choisir une image (JPG/PNG/WebP)"}</span>
                            </span>
                            <span className="shrink-0 text-slate-500">Parcourir</span>
                          </button>
                          {photoPreview ? (
                            <Image
                              src={photoPreview}
                              alt="Aperçu"
                              width={420}
                              height={240}
                              unoptimized
                              className="max-h-28 w-auto rounded-lg border border-slate-200 object-contain"
                            />
                          ) : null}
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <div className="rounded-lg border border-cyan-200 bg-cyan-50/50 p-2">
                            <label className="grid gap-1">
                              <span className="text-xs font-semibold text-cyan-900">Téléphone principal</span>
                              <input
                                value={tel}
                                onChange={(e) => setTel(e.target.value)}
                                placeholder="Numéro principal"
                                className={inputClass}
                              />
                            </label>
                          </div>
                          <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                            <label className="grid gap-1">
                              <span className="text-xs font-semibold text-slate-800">Téléphone secondaire</span>
                              <input
                                value={telSecondary}
                                onChange={(e) => setTelSecondary(e.target.value)}
                                placeholder="Numéro secondaire"
                                className={inputClass}
                              />
                            </label>
                          </div>
                        </div>
                      </div>
                    </section>

                    <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Produits</p>
                      <div className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2">
                        <p className="mb-2 text-xs font-medium text-slate-700">Produits autorisés</p>
                        <div className="grid gap-1.5 grid-cols-1 sm:grid-cols-2">
                          {produits.map((p) => (
                            <label key={p.id} className="flex items-center gap-2 text-xs text-slate-800">
                              <input
                                type="checkbox"
                                checked={produitsAutorises.includes(p.code)}
                                onChange={(e) =>
                                  setProduitsAutorises((curr) =>
                                    e.target.checked ? [...curr, p.code] : curr.filter((code) => code !== p.code),
                                  )
                                }
                              />
                              <span>
                                {p.code} <span className="text-slate-500">({p.libelle})</span>
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </section>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Géolocalisation</p>
                      <div className="grid gap-2 grid-cols-1 sm:grid-cols-2">
                        <label className="grid gap-1">
                          <span className="text-xs font-medium text-slate-700">Latitude GPS *</span>
                          <input value={lat} onChange={(e) => setLat(e.target.value)} placeholder="ex. 5.3599" inputMode="decimal" className={inputClass} />
                        </label>
                        <label className="grid gap-1">
                          <span className="text-xs font-medium text-slate-700">Longitude GPS *</span>
                          <input value={lng} onChange={(e) => setLng(e.target.value)} placeholder="ex. -4.0083" inputMode="decimal" className={inputClass} />
                        </label>
                      </div>
                    </section>

                    <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Statuts & bancarisation</p>
                      <div className="grid gap-2">
                        <label className="grid gap-1">
                          <span className="text-xs font-medium text-slate-700">Statut</span>
                          <select aria-label="Statut concessionnaire" value={createStatut} onChange={(e) => setCreateStatut(e.target.value)} className={inputClass}>
                            {CONCESSIONNAIRE_STATUTS.map((s) => (
                              <option key={s} value={s}>
                                {CONCESSIONNAIRE_STATUT_LABELS[s]}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="grid gap-1">
                          <span className="text-xs font-medium text-slate-700">Statut de bancarisation</span>
                          <select aria-label="Statut de bancarisation" value={bancarisation} onChange={(e) => setBancarisation(e.target.value)} className={inputClass}>
                            {BANCARISATION_STATUTS.map((s) => (
                              <option key={s} value={s}>
                                {BANCARISATION_STATUT_LABELS[s]}
                              </option>
                            ))}
                          </select>
                          <span className="rounded-md border border-cyan-100 bg-cyan-50 px-2 py-1 text-[11px] text-cyan-900">
                            Le numéro de compte est obligatoire pour passer au statut BANCARISÉ.
                          </span>
                        </label>
                        {bancarisation === "BANCARISE" ? (
                          <label className="grid gap-1">
                            <span className="text-xs font-medium text-slate-700">Numéro de compte bancaire *</span>
                            <input value={compteBancaire} onChange={(e) => setCompteBancaire(e.target.value)} placeholder="Obligatoire si bancarisé" className={inputClass} />
                          </label>
                        ) : (
                          <label className="grid gap-1">
                            <span className="text-xs font-medium text-slate-700">Numéro de compte bancaire</span>
                            <input value={compteBancaire} onChange={(e) => setCompteBancaire(e.target.value)} placeholder="Optionnel si non bancarisé" className={inputClass} />
                          </label>
                        )}
                      </div>
                    </section>
                  </div>

                  <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Observations</p>
                    <label className="grid gap-1">
                      <span className="text-xs font-medium text-slate-700">Notes internes</span>
                      <textarea value={observations} onChange={(e) => setObservations(e.target.value)} placeholder="Texte libre" className={`min-h-16 ${inputClass}`} />
                    </label>
                  </section>
                </div>
              </div>
              <div className="shrink-0 border-t border-slate-200 bg-slate-50 px-3 py-2.5 sm:px-5 sm:py-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                  <button
                    type="button"
                    disabled={creating}
                    onClick={() => setCreateOpen(false)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-60 sm:w-auto"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={creating}
                    className="w-full rounded-lg border border-indigo-500 bg-indigo-600 px-3 py-2.5 text-sm font-semibold text-white transition hover:border-indigo-700 hover:bg-indigo-700 disabled:opacity-60 sm:w-auto sm:min-w-[220px]"
                  >
                    {creating ? "Création..." : "Créer concessionnaire"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <ConcessionnaireFicheModal
        open={ficheModalId != null}
        concessionnaireId={ficheModalId}
        initialTab={ficheModalTab}
        onClose={() => setFicheModalId(null)}
        agences={agences}
        produits={produits}
        me={me}
        isAgenceProfileFixed={isAgenceProfileFixed}
        onSaved={() => void load(page)}
      />

      {toast ? (
        <div
          className={`mb-3 rounded-lg border px-3 py-2 text-sm ${
            toast.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-rose-200 bg-rose-50 text-rose-900"
          }`}
        >
          <div className="flex justify-between gap-2">
            <span>{toast.message}</span>
            <button type="button" onClick={() => setToast(null)} className="text-xs underline">
              Fermer
            </button>
          </div>
        </div>
      ) : null}

      {loading ? <p className="text-sm text-slate-600">Chargement...</p> : null}
      {error ? <p className="text-sm text-rose-700">{error}</p> : null}

      {!loading ? (
        <>
          {listePaginationBar("top")}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm ring-1 ring-slate-900/[0.02]">
          <div className="max-h-[min(70vh,36rem)] overflow-y-auto overflow-x-auto overscroll-y-contain">
              <table className="w-full min-w-[980px] table-fixed border-collapse text-left text-xs">
                <colgroup>
                  <col style={{ width: "13%" }} />
                  <col style={{ width: "20%" }} />
                  <col style={{ width: "11%" }} />
                  <col style={{ width: "18%" }} />
                  <col style={{ width: "14%" }} />
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "12%" }} />
                </colgroup>
                <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-slate-600 shadow-[0_1px_0_0_rgb(226_232_240)]">
                  <tr>
                    <th className="px-2 py-2 font-medium" scope="col">
                      Code PDV
                    </th>
                    <th className="px-2 py-2 font-medium" scope="col">
                      Nom
                    </th>
                    <th className="px-2 py-2 font-medium" scope="col">
                      Agence
                    </th>
                    <th className="px-2 py-2 font-medium" scope="col">
                      Produits
                    </th>
                    <th className="px-2 py-2 font-medium" scope="col">
                      Statut
                    </th>
                    <th className="px-2 py-2 font-medium" scope="col">
                      Bancarisé
                    </th>
                    <th className="px-2 py-2 text-right font-medium" scope="col">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="text-slate-800">
                  {items.map((row) => {
                    const produitsTitle =
                      row.produitsAutorises?.length > 0
                        ? row.produitsAutorises
                            .map((c) => {
                              const p = produits.find((pr) => pr.code === c);
                              return p ? `${p.code} — ${p.libelle}` : c;
                            })
                            .join(" · ")
                        : "";
                    const sb = row.statutBancarisation as BancarisationStatut;
                    const bancCourt = BANCARISATION_TABLE_COURT[sb] ?? row.statutBancarisation;
                    const bancTitle = BANCARISATION_STATUT_LABELS[sb] ?? row.statutBancarisation;
                    return (
                    <tr key={row.id} className="border-t border-slate-100 bg-white hover:bg-slate-50">
                      <td className="px-2 py-1.5 font-mono text-[11px] leading-tight text-slate-600 whitespace-nowrap">
                        <span className="block truncate" title={row.codePdv}>
                          {row.codePdv}
                        </span>
                      </td>
                      <td className="max-w-0 px-2 py-1.5 font-medium leading-tight text-slate-900">
                        <span className="block truncate" title={row.nomComplet || row.raisonSociale}>
                          {row.nomComplet || row.raisonSociale}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-[11px] leading-tight text-slate-700">
                        {row.agenceId ? (
                          (() => {
                            const ag = agences.find((a) => a.id === row.agenceId);
                            if (ag) {
                              return (
                                <span
                                  className="block truncate font-mono text-slate-800"
                                  title={`${ag.code} — ${ag.libelle}${ag.actif ? "" : " (agence inactive)"}`}
                                >
                                  {ag.code}
                                  {!ag.actif ? (
                                    <span className="ml-0.5 font-sans text-[10px] font-normal text-slate-500">
                                      (inact.)
                                    </span>
                                  ) : null}
                                </span>
                              );
                            }
                            return (
                              <span className="truncate text-amber-800" title={row.agenceId}>
                                ?
                              </span>
                            );
                          })()
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="max-w-0 px-2 py-1.5 text-[10px] leading-tight">
                        {row.produitsAutorises?.length ? (
                          <span
                            className="flex max-w-full flex-wrap items-center gap-x-0.5 gap-y-1"
                            title={produitsTitle}
                          >
                            {row.produitsAutorises.map((c, idx) => {
                              const affiche = produits.find((pr) => pr.code === c)?.code ?? c;
                              return (
                                <span key={`${row.id}-p-${idx}-${c}`} className="inline-flex items-center gap-0.5">
                                  {idx > 0 ? (
                                    <span className="text-slate-400" aria-hidden>
                                      ,
                                    </span>
                                  ) : null}
                                  <span
                                    className={`rounded px-1 py-0.5 font-semibold leading-tight ${classePastilleProduitTableau(c)}`}
                                  >
                                    {affiche}
                                  </span>
                                </span>
                              );
                            })}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-2 py-1.5 align-middle">
                        <span
                          className={`block max-w-full truncate rounded-full border px-1.5 py-0.5 text-center text-[10px] font-medium leading-tight ${
                            statusClass[row.statut] ?? "border-slate-200 bg-slate-100 text-slate-700"
                          }`}
                          title={
                            CONCESSIONNAIRE_STATUT_LABELS[row.statut as ConcessionnaireStatut] ?? row.statut
                          }
                        >
                          {CONCESSIONNAIRE_STATUT_LABELS[row.statut as ConcessionnaireStatut] ?? row.statut}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 align-middle text-[10px] leading-tight">
                        <span
                          className={`inline-flex max-w-full items-center gap-1 rounded px-1.5 py-0.5 font-semibold ${classeCelluleBancarisation(sb)}`}
                          title={bancTitle}
                        >
                          <span className="min-w-0 truncate">{bancCourt}</span>
                          {sb === "BANCARISE" ? (
                            <IconeBancarisationOui />
                          ) : sb === "NON_BANCARISE" ? (
                            <IconeBancarisationNon />
                          ) : null}
                        </span>
                      </td>
                      <td className="px-1 py-1.5 text-right align-middle">
                        <div className="flex justify-end">
                          <ConcessionnaireRowActionsMenu
                            codePdv={row.codePdv}
                            onOpenFicheModal={(tab) => {
                              setFicheModalTab(tab);
                              setFicheModalId(row.id);
                            }}
                          />
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                  {!items.length ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-4 text-center text-slate-500">
                        Aucun concessionnaire.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            {listePaginationBar("bottom")}
          </div>
        </>
      ) : null}
    </div>
  );
}
