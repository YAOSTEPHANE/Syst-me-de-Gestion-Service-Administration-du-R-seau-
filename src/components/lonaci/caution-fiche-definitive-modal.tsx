"use client";

import {
  CAUTION_FICHE_DEFINITIVE_TITLE,
  CAUTION_FICHE_PAYEE_MENTION,
} from "@/lib/lonaci/caution-fiche-definitive-constants";

export interface CautionFicheDefinitiveModalData {
  cautionId: string;
  numeroFicheDefinitive: string;
  identiteLabel: string;
  identiteDetail: string;
  clientCode: string | null;
  lonaciClientId: string | null;
  contratId: string | null;
  produitCode: string;
  produitLibelle: string | null;
  agenceLabel: string;
  montantFCFA: number;
  modeLibelle: string;
  paymentReference: string;
  datePaiement: string;
  ancienneFicheProvisoire: string | null;
  apresValidationPaiement: boolean;
  emailSent?: boolean;
  emailSkippedReason?: string;
  destinataireEmail?: string | null;
}

const PRINT_CSS = `
@media print {
  @page { size: A4; margin: 8mm; }
  html, body { height: auto !important; overflow: visible !important; background: #fff !important; }
  body * { visibility: hidden; }
  .lonaci-fpd-print-surface, .lonaci-fpd-print-surface * { visibility: visible; }
  .lonaci-fpd-print-surface {
    position: fixed !important; inset: 0 !important; display: block !important;
    background: #fff !important; padding: 0 !important; margin: 0 !important; z-index: 99999 !important;
  }
  .lonaci-fpd-print-card { box-shadow: none !important; border: none !important; max-height: none !important; }
  .print\\:hidden { display: none !important; }
}
`;

function FicheRow({
  label,
  value,
  mono,
  strong,
  accent,
}: {
  label: string;
  value: string;
  mono?: boolean;
  strong?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="flex justify-between gap-3 border-b border-slate-100 py-2.5">
      <dt className="text-slate-500">{label}</dt>
      <dd
        className={`text-right ${mono ? "font-mono text-xs sm:text-sm" : ""} ${
          strong ? "font-semibold" : ""
        } ${accent ? "text-emerald-900" : "text-slate-900"}`}
      >
        {value}
      </dd>
    </div>
  );
}

export function CautionFicheDefinitiveModal({
  slip,
  onClose,
}: {
  slip: CautionFicheDefinitiveModalData;
  onClose: () => void;
}) {
  const pdfUrl = `/api/cautions/${encodeURIComponent(slip.cautionId)}/fiche-definitive/pdf`;
  const qrUrl = `/api/cautions/${encodeURIComponent(slip.cautionId)}/fiche-definitive/qr`;

  return (
    <div
      className="lonaci-fpd-print-surface fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/55 p-4"
      role="dialog"
      aria-modal
      aria-labelledby="caution-fpd-title"
    >
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <div className="lonaci-fpd-print-card max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-emerald-200 bg-white shadow-2xl print:max-h-none print:rounded-none print:border-0 print:shadow-none">
        <header className="border-b-4 border-[#0f3d2e] bg-[#0f3d2e] px-5 py-4 text-white print:border-b-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-emerald-100">Lonaci</p>
          <p className="text-xs text-emerald-50/90">Loterie Nationale de Cote d Ivoire — module Cautions</p>
        </header>
        <div className="px-5 py-4">
          <h2 id="caution-fpd-title" className="text-center text-base font-bold uppercase tracking-wide text-slate-900 sm:text-lg">
            {CAUTION_FICHE_DEFINITIVE_TITLE}
          </h2>
          <p className="mt-3 text-center">
            <span className="inline-block rounded-md border-2 border-emerald-600 bg-emerald-600 px-4 py-1.5 text-sm font-bold uppercase tracking-widest text-white">
              {CAUTION_FICHE_PAYEE_MENTION}
            </span>
          </p>
          <p className="mt-3 text-center font-mono text-sm text-slate-600">
            Ref. document : <span className="font-semibold text-emerald-900">{slip.numeroFicheDefinitive}</span>
          </p>
          <dl className="mt-5 grid gap-0 text-sm">
            <FicheRow label={slip.identiteLabel} value={slip.identiteDetail} strong />
            {slip.clientCode ? <FicheRow label="Code client" value={slip.clientCode} mono /> : null}
            {slip.contratId?.trim() ? <FicheRow label="Contrat" value={slip.contratId} mono /> : null}
            <FicheRow label="Produit" value={slip.produitLibelle ? `${slip.produitCode} — ${slip.produitLibelle}` : slip.produitCode} mono />
            <FicheRow label="Agence" value={slip.agenceLabel} />
            <FicheRow label="Montant paye (FCFA)" value={slip.montantFCFA.toLocaleString("fr-FR")} strong accent />
            <FicheRow label="Date de paiement" value={new Date(slip.datePaiement).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" })} />
            <FicheRow label="Mode de paiement" value={slip.modeLibelle} />
            <FicheRow label="Reference de paiement" value={slip.paymentReference} mono strong />
            {slip.ancienneFicheProvisoire ? <FicheRow label="Fiche provisoire (FPC)" value={slip.ancienneFicheProvisoire} mono /> : null}
          </dl>
          <div className="mt-5 flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50/80 p-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="text-center sm:text-left">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Verification</p>
              <p className="mt-1 max-w-xs text-xs leading-relaxed text-slate-600">QR code optionnel pour controle d authenticite.</p>
            </div>
            <img src={qrUrl} alt="QR code LONACI" width={120} height={120} className="h-[120px] w-[120px] rounded-md border border-slate-200 bg-white p-1" />
          </div>
          {slip.destinataireEmail ? (
            <p className="mt-4 text-xs text-slate-600">
              {slip.emailSent ? <>Transmission automatique a <span className="font-medium">{slip.destinataireEmail}</span> (PDF joint).</> : <>E-mail : {slip.destinataireEmail}{slip.emailSkippedReason ? ` — ${slip.emailSkippedReason}` : ""}</>}
            </p>
          ) : (
            <p className="mt-4 text-xs text-slate-500">Aucune adresse e-mail renseignee.</p>
          )}
          <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-xs leading-relaxed text-emerald-950">
            {slip.apresValidationPaiement ? "Paiement valide par l agent habilite." : "Dossier finalise comme paye."}
          </p>
          <div className="mt-6 flex flex-wrap justify-end gap-2 print:hidden">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">Fermer</button>
            <a href={pdfUrl} className="rounded-lg border border-slate-400 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50">Telecharger PDF</a>
            <button type="button" onClick={() => window.print()} className="rounded-lg border border-emerald-600 bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700">Imprimer</button>
          </div>
        </div>
      </div>
    </div>
  );
}


