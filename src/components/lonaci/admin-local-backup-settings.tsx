"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Archive, Download, FlaskConical, RefreshCw, RotateCcw } from "lucide-react";

import { Button } from "@/components/lonaci/ui/button";
import { ConfirmDialog } from "@/components/lonaci/ui/dialog";
import { FeedbackState } from "@/components/lonaci/ui/feedback-state";
import { FormField } from "@/components/lonaci/ui/form-field";
import { SectionHeader } from "@/components/lonaci/ui/headers";
import { Surface } from "@/components/lonaci/ui/surface";
import { notify } from "@/lib/toast";

type LocalBackupItem = {
  name: string;
  createdAt: string;
  database: string;
  collectionsCount: number;
  documentsCount: number;
  uploadsCopied: boolean;
};

type RestoreApiResponse = {
  message?: string;
  result?: {
    restoredCollections: number;
    restoredDocuments: number;
    dryRun: boolean;
    integrity?: {
      valid: boolean;
      filesChecked: number;
      missingFiles: string[];
      checksumMismatches: Array<{ file: string; expected: string; actual: string }>;
    };
  };
};

export default function AdminLocalBackupSettings() {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resultDetail, setResultDetail] = useState<string | null>(null);
  const [backups, setBackups] = useState<LocalBackupItem[]>([]);
  const [selectedBackup, setSelectedBackup] = useState("");
  const [restoreUploads, setRestoreUploads] = useState(true);
  const [verifyChecksum, setVerifyChecksum] = useState(true);
  const [confirmText, setConfirmText] = useState("");
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);

  const canRestore = useMemo(
    () => selectedBackup.trim().length > 0 && confirmText.trim().toUpperCase() === "RESTAURER",
    [selectedBackup, confirmText],
  );

  async function loadBackups() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/backups", { credentials: "include", cache: "no-store" });
      if (res.status === 403 || res.status === 401) {
        setVisible(false);
        return;
      }
      if (!res.ok) throw new Error("Chargement impossible");
      const data = (await res.json()) as { backups?: LocalBackupItem[] };
      const list = data.backups ?? [];
      setBackups(list);
      setSelectedBackup((prev) => (prev && list.some((b) => b.name === prev) ? prev : list[0]?.name ?? ""));
      setVisible(true);
    } catch {
      setVisible(false);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadBackups();
  }, []);

  async function createBackup() {
    setSaving(true);
    setResultDetail(null);
    try {
      const res = await fetch("/api/admin/backups", {
        method: "POST",
        credentials: "include",
      });
      const data = (await res.json()) as { message?: string };
      if (!res.ok) throw new Error(data.message ?? "Erreur sauvegarde");
      await loadBackups();
      notify.success(data.message ?? "Sauvegarde créée.");
    } catch (error) {
      const text = error instanceof Error ? error.message : "Erreur sauvegarde";
      notify.error(text);
    } finally {
      setSaving(false);
    }
  }

  async function onRestoreSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canRestore) return;
    setRestoreDialogOpen(true);
  }

  async function restoreBackup() {
    setSaving(true);
    setResultDetail(null);
    try {
      const res = await fetch("/api/admin/backups/restore", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          backupName: selectedBackup,
          dropCollections: true,
          restoreUploads,
          verifyChecksum,
          dryRun: false,
        }),
      });
      const data = (await res.json()) as RestoreApiResponse;
      if (!res.ok) throw new Error(data.message ?? "Erreur restauration");
      setConfirmText("");
      setRestoreDialogOpen(false);
      notify.success(data.message ?? "Restauration terminée.", {
        description: "Reconnectez-vous pour repartir sur une session propre.",
        duration: 8000,
      });
    } catch (error) {
      const text = error instanceof Error ? error.message : "Erreur restauration";
      notify.error(text);
    } finally {
      setSaving(false);
    }
  }

  async function runDryRunRestore() {
    if (!selectedBackup) return;
    setSaving(true);
    setResultDetail(null);
    try {
      const res = await fetch("/api/admin/backups/restore", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          backupName: selectedBackup,
          dropCollections: true,
          restoreUploads,
          verifyChecksum,
          dryRun: true,
        }),
      });
      const data = (await res.json()) as RestoreApiResponse;
      if (!res.ok) throw new Error(data.message ?? "Simulation impossible");
      const integrity = data.result?.integrity;
      setResultDetail(
        `${data.message ?? "Simulation terminée."} Collections: ${data.result?.restoredCollections ?? 0}, documents: ${
          data.result?.restoredDocuments ?? 0
        }, checksum: ${integrity?.valid ? "OK" : "KO"}.`,
      );
      notify.success("Simulation de restauration terminée.");
    } catch (error) {
      const text = error instanceof Error ? error.message : "Erreur simulation";
      notify.error(text);
    } finally {
      setSaving(false);
    }
  }

  function downloadBackup() {
    if (!selectedBackup) return;
    window.open(`/api/admin/backups/download?name=${encodeURIComponent(selectedBackup)}`, "_blank");
  }

  if (loading || !visible) return null;

  const selectedMeta = backups.find((item) => item.name === selectedBackup);

  return (
    <>
    <Surface elevated aria-labelledby="local-backup-title">
      <SectionHeader
        title={<span id="local-backup-title" className="inline-flex items-center gap-2"><Archive size={19} className="text-orange-600" aria-hidden="true" />Sauvegarde et restauration locale</span>}
        description="Copies complètes de la base et des fichiers joints, conservées dans l’espace de sauvegarde."
      />

      <div className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl border border-orange-200 bg-orange-50/50 p-4" aria-busy={saving}>
        <Button
          loading={saving}
          leadingIcon={Archive}
          onClick={() => void createBackup()}
        >
          {saving ? "Traitement..." : "Créer une sauvegarde locale"}
        </Button>
        <Button
          variant="secondary"
          disabled={saving}
          leadingIcon={RefreshCw}
          onClick={() => void loadBackups()}
        >
          Actualiser la liste
        </Button>
        <Button
          variant="secondary"
          disabled={saving || !selectedBackup}
          leadingIcon={Download}
          onClick={downloadBackup}
        >
          Télécharger l&apos;archive
        </Button>
      </div>

      <form onSubmit={(e) => void onRestoreSubmit(e)} className="mt-4 rounded-2xl border border-rose-200 bg-rose-50/40 p-4" aria-busy={saving}>
        <p className="text-sm font-bold text-[#13213c]">Restauration locale</p>
        <p className="mt-1 text-xs text-rose-700">Cette opération remplace les collections existantes. Une confirmation supplémentaire sera demandée.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <FormField label="Sauvegarde" htmlFor="local-backup-select">
            <select
              id="local-backup-select"
              value={selectedBackup}
              disabled={saving || backups.length === 0}
              onChange={(e) => setSelectedBackup(e.target.value)}
              className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-950"
            >
              {backups.length === 0 ? <option value="">Aucune sauvegarde</option> : null}
              {backups.map((item) => (
                <option key={item.name} value={item.name}>
                  {item.name}
                </option>
              ))}
            </select>
          </FormField>
          <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600" aria-live="polite">
            {selectedMeta ? (
              <div className="space-y-0.5">
                <p>Créée: {new Date(selectedMeta.createdAt).toLocaleString("fr-FR")}</p>
                <p>Collections: {selectedMeta.collectionsCount}</p>
                <p>Documents: {selectedMeta.documentsCount}</p>
              </div>
            ) : (
              <p>Choisissez une sauvegarde à restaurer.</p>
            )}
          </div>
        </div>

        <label className="mt-4 flex items-center gap-3 text-sm text-slate-800">
          <input
            type="checkbox"
            checked={restoreUploads}
            disabled={saving}
            onChange={(e) => setRestoreUploads(e.target.checked)}
            className="h-5 w-5 accent-orange-600"
          />
          Restaurer aussi les fichiers joints
        </label>

        <label className="mt-3 flex items-center gap-3 text-sm text-slate-800">
          <input
            type="checkbox"
            checked={verifyChecksum}
            disabled={saving}
            onChange={(e) => setVerifyChecksum(e.target.checked)}
            className="h-5 w-5 accent-orange-600"
          />
          Vérifier l&apos;intégrité avant restauration
        </label>

        <FormField className="mt-4" label={<>Tapez <strong>RESTAURER</strong> pour confirmer</>} htmlFor="local-backup-confirm" hint="La saisie doit correspondre exactement au mot indiqué.">
          <input
            id="local-backup-confirm"
            value={confirmText}
            disabled={saving}
            onChange={(e) => setConfirmText(e.target.value)}
            className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-950"
            placeholder="RESTAURER"
          />
        </FormField>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            disabled={saving || !selectedBackup}
            leadingIcon={FlaskConical}
            onClick={() => void runDryRunRestore()}
          >
            {saving ? "Traitement..." : "Simuler la restauration"}
          </Button>
          <Button
            type="submit"
            variant="danger"
            disabled={saving || !canRestore}
            leadingIcon={RotateCcw}
          >
            {saving ? "Restauration..." : "Restaurer cette sauvegarde"}
          </Button>
        </div>
      </form>

      {resultDetail ? <FeedbackState className="mt-4" tone="success" title="Simulation terminée" description={resultDetail} aria-live="polite" /> : null}
    </Surface>
    <ConfirmDialog
      open={restoreDialogOpen}
      onOpenChange={(open) => { if (!saving) setRestoreDialogOpen(open); }}
      title="Confirmer la restauration locale"
      message={<>Restaurer <strong>{selectedBackup}</strong> et remplacer toutes les collections actuelles ? Cette opération est irréversible.</>}
      confirmLabel="Restaurer définitivement"
      destructive
      pending={saving}
      onConfirm={restoreBackup}
    />
    </>
  );
}
