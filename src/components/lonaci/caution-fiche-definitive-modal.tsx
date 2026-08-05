"use client";

import { Download, FileText, Printer } from "lucide-react";

import { StatusBadge } from "@/components/lonaci/ui/badge";
import { Button } from "@/components/lonaci/ui/button";
import { Dialog } from "@/components/lonaci/ui/dialog";
import {
  CAUTION_FICHE_DEFINITIVE_TITLE,
  CAUTION_FICHE_PAYEE_MENTION,
} from "@/lib/lonaci/caution-fiche-definitive-constants";
import {
  CAUTION_FICHE_AGENCE_INSCRIPTION_LABEL,
  CAUTION_FICHE_ENREG_REFERENCE,
  CAUTION_FICHE_ENREG_VERSION,
  CAUTION_FICHE_SIGNATURE_ROLE,
  cautionFicheAgrementTitle,
} from "@/lib/lonaci/caution-fiche-provisoire-constants";
import { COURRIER_COMPTABILITE_TITLE } from "@/lib/lonaci/courrier-comptabilite-constants";
import { montantFcfaEnLettres } from "@/lib/lonaci/montant-en-lettres";
import { CLIENT_PDF_COLORS } from "@/lib/pdf/client-premium";

export interface CautionFicheDefinitiveModalData {
  cautionId: string;
  numeroFicheDefinitive: string;
  identiteLabel: string;
  identiteDetail: string;
  nom?: string | null;
  prenoms?: string | null;
  clientCode: string | null;
  lonaciClientId: string | null;
  contratId: string | null;
  codeConcessionnaire?: string | null;
  numeroTerminal?: string | null;
  telephone?: string | null;
  situationGeographique?: string | null;
  produitCode: string;
  produitLibelle: string | null;
  titreDocument?: string | null;
  agenceLabel: string;
  montantFCFA: number;
  modeLibelle: string;
  paymentReference: string;
  datePaiement: string;
  ancienneFicheProvisoire: string | null;
  apresValidationPaiement: boolean;
  agentNom: string;
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
  .lonaci-fpd-row, .lonaci-fpd-qr, .lonaci-fpd-signatures, .lonaci-fpd-enreg {
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

function splitNomPrenoms(full: string): { nom: string; prenoms: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { nom: "—", prenoms: "—" };
  if (parts.length === 1) return { nom: parts[0]!, prenoms: "—" };
  return { nom: parts[parts.length - 1]!, prenoms: parts.slice(0, -1).join(" ") };
}

function formatAmount(value: number): string {
  if (!value) return "—";
  return `${value.toLocaleString("fr-FR")} FCFA`;
}

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
    <div className="lonaci-fpd-row flex justify-between gap-3 border-b border-dotted border-slate-300 py-2">
      <dt className="shrink-0 font-semibold uppercase tracking-wide text-slate-700">{label}</dt>
      <dd
        className={`min-w-0 text-right ${mono ? "font-mono text-xs sm:text-sm" : ""} ${
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
  const split = splitNomPrenoms(slip.identiteDetail);
  const nom = slip.nom?.trim() || split.nom;
  const prenoms = slip.prenoms?.trim() || split.prenoms;
  const codeConcessionnaire = slip.codeConcessionnaire?.trim() || "—";
  const titre =
    slip.titreDocument?.trim() ||
    cautionFicheAgrementTitle(slip.produitCode ? [slip.produitCode] : []);
  const paymentDate = new Date(slip.datePaiement);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={titre}
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
        <header
          className="border-b-4 px-5 py-4 text-white print:border-b-4"
          style={{ borderColor: CLIENT_PDF_COLORS.orangeDark, backgroundColor: CLIENT_PDF_COLORS.orangeDark }}
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-orange-100">LONACI</p>
          <p className="text-xs text-orange-50/90">Loterie Nationale de Côte d’Ivoire</p>
        </header>
        <div className="px-5 py-4">
          <div className="lonaci-fpd-enreg rounded border border-slate-300 px-3 py-2 text-xs text-slate-600">
            <p className="font-semibold uppercase tracking-wide text-slate-800">Enregistrement</p>
            <div className="mt-1 flex flex-wrap justify-between gap-2">
              <span>Référence : {CAUTION_FICHE_ENREG_REFERENCE}</span>
              <span>Version : {CAUTION_FICHE_ENREG_VERSION}</span>
              <span>Page : 1/1</span>
            </div>
          </div>

          <h2
            id="caution-fpd-title"
            className="mt-4 text-center text-base font-bold uppercase tracking-wide text-slate-900 sm:text-lg"
          >
            {titre}
          </h2>
          <p className="mt-3 flex justify-center">
            <StatusBadge tone="success" dot>
              {CAUTION_FICHE_PAYEE_MENTION}
            </StatusBadge>
          </p>
          <p className="mt-3 text-center font-mono text-sm text-slate-600">
            Réf. document :{" "}
            <span className="font-semibold text-orange-800">{slip.numeroFicheDefinitive}</span>
          </p>
          <p className="mt-1 text-center text-xs text-slate-600">
            Générée par <span className="font-semibold text-slate-800">{slip.agentNom || "—"}</span>
          </p>

          <dl className="mt-5 grid gap-0 text-sm">
            <FicheRow label="Nom" value={nom} strong />
            <FicheRow label="Prénoms" value={prenoms} />
            <FicheRow label="N° Distributeur" value={codeConcessionnaire} mono />
            <FicheRow label="N° terminal" value={slip.numeroTerminal?.trim() || "—"} mono />
            <FicheRow label={CAUTION_FICHE_AGENCE_INSCRIPTION_LABEL} value={slip.agenceLabel} />
            <FicheRow
              label="Situation géographique"
              value={slip.situationGeographique?.trim() || "—"}
            />
            <FicheRow label="N° téléphone" value={slip.telephone?.trim() || "—"} mono />
            <FicheRow label="Caution à payer" value={formatAmount(slip.montantFCFA)} strong accent />
            <FicheRow label="Caution versée" value={formatAmount(slip.montantFCFA)} strong accent />
            <FicheRow label="(En lettre)" value={montantFcfaEnLettres(slip.montantFCFA)} />
            <FicheRow label="Mode de paiement" value={slip.modeLibelle} />
            <FicheRow label="Référence de paiement" value={slip.paymentReference} mono strong />
            {slip.ancienneFicheProvisoire ? (
              <FicheRow label="Fiche provisoire (FPC)" value={slip.ancienneFicheProvisoire} mono />
            ) : null}
          </dl>

          <p className="mt-4 text-sm text-slate-800">
            Abidjan le{" "}
            {paymentDate.toLocaleDateString("fr-FR", { dateStyle: "long" })}
          </p>

          <div className="lonaci-fpd-qr mt-5 flex flex-col items-center gap-2 rounded-xl border border-dashed border-orange-300 bg-orange-50/60 p-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="text-center sm:text-left">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Vérification</p>
              <p className="mt-1 max-w-xs text-xs leading-relaxed text-slate-600">
                QR code optionnel pour contrôle d’authenticité.
              </p>
            </div>
            <img
              src={qrUrl}
              alt="QR code LONACI"
              width={120}
              height={120}
              className="h-[120px] w-[120px] rounded-md border border-slate-200 bg-white p-1"
            />
          </div>

          {slip.destinataireEmail ? (
            <p className="mt-4 text-xs text-slate-600">
              {slip.emailSent ? (
                <>
                  Transmission automatique à{" "}
                  <span className="font-medium">{slip.destinataireEmail}</span> (PDF joint).
                </>
              ) : (
                <>
                  E-mail : {slip.destinataireEmail}
                  {slip.emailSkippedReason ? ` — ${slip.emailSkippedReason}` : ""}
                </>
              )}
            </p>
          ) : (
            <p className="mt-4 text-xs text-slate-500">Aucune adresse e-mail renseignée.</p>
          )}

          <p className="mt-4 rounded-lg bg-orange-50 px-3 py-2 text-xs leading-relaxed text-orange-950">
            {slip.apresValidationPaiement
              ? "Paiement validé par l’agent habilité."
              : "Dossier finalisé comme payé."}
          </p>

          <div className="lonaci-fpd-signatures mt-7 grid grid-cols-2 gap-8 text-center text-xs text-slate-600">
            <div className="border-t border-slate-400 pt-2">
              {slip.agentNom || "Agent habilité"} · Signature et cachet
            </div>
            <div className="border-t border-slate-400 pt-2">
              {CAUTION_FICHE_SIGNATURE_ROLE} · Signature et cachet
            </div>
          </div>
        </div>
        <footer className="hidden items-center justify-between border-t border-orange-200 px-5 py-3 text-[10px] text-slate-500">
          <span>
            LONACI · {CAUTION_FICHE_DEFINITIVE_TITLE} · Générée par {slip.agentNom || "—"}
          </span>
          <span>Page 1/1</span>
        </footer>
      </div>
    </Dialog>
  );
}
