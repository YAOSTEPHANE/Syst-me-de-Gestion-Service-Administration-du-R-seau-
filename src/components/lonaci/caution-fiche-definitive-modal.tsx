"use client";

import { Download, FileText, Printer } from "lucide-react";

import { StatusBadge } from "@/components/lonaci/ui/badge";
import { Button } from "@/components/lonaci/ui/button";
import { Dialog } from "@/components/lonaci/ui/dialog";
import {
  CAUTION_FICHE_DEFINITIVE_TITLE,
  CAUTION_FICHE_PAYEE_MENTION,
} from "@/lib/lonaci/caution-fiche-definitive-constants";
import { CAUTION_FICHE_AGENCE_INSCRIPTION_LABEL } from "@/lib/lonaci/caution-fiche-provisoire-constants";
import { COURRIER_COMPTABILITE_TITLE } from "@/lib/lonaci/courrier-comptabilite-constants";
import { CLIENT_PDF_COLORS } from "@/lib/pdf/client-premium";

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
  @page { size: A4 portrait; margin: 10mm 12mm; }
  html, body { height: auto !important; overflow: visible !important; background: #fff !important; }
  body * { visibility: hidden; }
  .lonaci-fpd-print-surface, .lonaci-fpd-print-surface * { visibility: visible; }
  .lonaci-fpd-print-surface {
    position: fixed !important; inset: 0 !important; display: block !important;
    background: #fff !important; padding: 0 !important; margin: 0 !important; z-index: 99999 !important;
  }
  .lonaci-fpd-print-card {
    box-shadow: none !important; border: none !important; max-height: none !important;
    font-size: 10pt !important; line-height: 1.4 !important;
  }
  .lonaci-fpd-print-card header, .lonaci-fpd-print-card footer,
  .lonaci-fpd-row, .lonaci-fpd-qr, .lonaci-fpd-signatures {
    break-inside: avoid !important; page-break-inside: avoid !important;
  }
  .lonaci-fpd-print-card footer { display: flex !important; }
  .lonaci-fpd-print-card > .lonaci-ui-dialog__header,
  .lonaci-fpd-print-card > .lonaci-ui-dialog__footer { display: none !important; }
  .lonaci-fpd-print-card > .lonaci-ui-dialog__body { padding: 0 !important; overflow: visible !important; }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
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
    <div className="lonaci-fpd-row flex justify-between gap-3 border-b border-slate-100 py-2.5">
      <dt className="text-slate-500">{label}</dt>
      <dd
        className={`text-right ${mono ? "font-mono text-xs sm:text-sm" : ""} ${
          strong ? "font-semibold" : ""
        } ${accent ? "text-orange-800" : "text-slate-900"}`}
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
  const courrierUrl = `/api/cautions/${encodeURIComponent(slip.cautionId)}/courrier-comptabilite/pdf`;
  const qrUrl = `/api/cautions/${encodeURIComponent(slip.cautionId)}/fiche-definitive/qr`;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={CAUTION_FICHE_DEFINITIVE_TITLE}
      description={`Référence ${slip.numeroFicheDefinitive}`}
      size="lg"
      className="lonaci-fpd-print-surface lonaci-fpd-print-card print:max-h-none print:rounded-none print:border-0 print:shadow-none"
      footer={
        <>
          <a
            href={courrierUrl}
            title={COURRIER_COMPTABILITE_TITLE}
            className="lonaci-ui-button lonaci-ui-button--secondary lonaci-ui-button--md"
          >
            <FileText size={18} aria-hidden="true" />
            <span>Courrier comptabilité</span>
          </a>
          <a
            href={pdfUrl}
            className="lonaci-ui-button lonaci-ui-button--secondary lonaci-ui-button--md"
          >
            <Download size={18} aria-hidden="true" />
            <span>Télécharger PDF</span>
          </a>
          <Button leadingIcon={Printer} onClick={() => window.print()}>
            Imprimer
          </Button>
        </>
      }
    >
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <div>
        <header className="border-b-4 px-5 py-4 text-white print:border-b-4" style={{ borderColor: CLIENT_PDF_COLORS.orangeDark, backgroundColor: CLIENT_PDF_COLORS.orangeDark }}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-orange-100">LONACI</p>
          <p className="text-xs text-orange-50/90">Loterie Nationale de Côte d’Ivoire — module Cautions</p>
        </header>
        <div className="px-5 py-4">
          <h2 id="caution-fpd-title" className="text-center text-base font-bold uppercase tracking-wide text-slate-900 sm:text-lg">
            {CAUTION_FICHE_DEFINITIVE_TITLE}
          </h2>
          <p className="mt-3 flex justify-center">
            <StatusBadge tone="success" dot>
              {CAUTION_FICHE_PAYEE_MENTION}
            </StatusBadge>
          </p>
          <p className="mt-3 text-center font-mono text-sm text-slate-600">
            Réf. document : <span className="font-semibold text-orange-800">{slip.numeroFicheDefinitive}</span>
          </p>
          <dl className="mt-5 grid gap-0 text-sm">
            <FicheRow label={slip.identiteLabel} value={slip.identiteDetail} strong />
            {slip.clientCode ? <FicheRow label="Code client" value={slip.clientCode} mono /> : null}
            {slip.contratId?.trim() ? <FicheRow label="Contrat" value={slip.contratId} mono /> : null}
            <FicheRow label="Produit" value={slip.produitLibelle ? `${slip.produitCode} — ${slip.produitLibelle}` : slip.produitCode} mono />
            <FicheRow label={CAUTION_FICHE_AGENCE_INSCRIPTION_LABEL} value={slip.agenceLabel} />
            <FicheRow label="Montant paye (FCFA)" value={slip.montantFCFA.toLocaleString("fr-FR")} strong accent />
            <FicheRow label="Date de paiement" value={new Date(slip.datePaiement).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" })} />
            <FicheRow label="Mode de paiement" value={slip.modeLibelle} />
            <FicheRow label="Reference de paiement" value={slip.paymentReference} mono strong />
            {slip.ancienneFicheProvisoire ? <FicheRow label="Fiche provisoire (FPC)" value={slip.ancienneFicheProvisoire} mono /> : null}
          </dl>
          <div className="lonaci-fpd-qr mt-5 flex flex-col items-center gap-2 rounded-xl border border-dashed border-orange-300 bg-orange-50/60 p-4 sm:flex-row sm:items-start sm:justify-between">
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
          <p className="mt-4 rounded-lg bg-orange-50 px-3 py-2 text-xs leading-relaxed text-orange-950">
            {slip.apresValidationPaiement ? "Paiement valide par l agent habilite." : "Dossier finalise comme paye."}
          </p>
          <div className="lonaci-fpd-signatures mt-7 grid grid-cols-2 gap-8 text-center text-xs text-slate-600">
            <div className="border-t border-slate-400 pt-2">Agent habilité · Signature et cachet</div>
            <div className="border-t border-slate-400 pt-2">Bénéficiaire · Signature</div>
          </div>
        </div>
        <footer className="hidden items-center justify-between border-t border-orange-200 px-5 py-3 text-[10px] text-slate-500">
          <span>LONACI · Document interne sécurisé</span>
          <span>Page 1/1</span>
        </footer>
      </div>
    </Dialog>
  );
}


