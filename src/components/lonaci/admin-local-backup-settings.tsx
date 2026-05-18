"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

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
  const [message, setMessage] = useState<string | null>(null);
  const [backups, setBackups] = useState<LocalBackupItem[]>([]);
  const [selectedBackup, setSelectedBackup] = useState("");
  const [restoreUploads, setRestoreUploads] = useState(true);
  const [verifyChecksum, setVerifyChecksum] = useState(true);
  const [confirmText, setConfirmText] = useState("");

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
    setMessage(null);
    try {
      const res = await fetch("/api/admin/backups", {
        method: "POST",
        credentials: "include",
      });
      const data = (await res.json()) as { message?: string };
      if (!res.ok) throw new Error(data.message ?? "Erreur sauvegarde");
      await loadBackups();
      setMessage(data.message ?? "Sauvegarde créée.");
    } catch (error) {
      const text = error instanceof Error ? error.message : "Erreur sauvegarde";
      setMessage(text);
    } finally {
      setSaving(false);
    }
  }

  async function onRestoreSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canRestore) return;
    setSaving(true);
    setMessage(null);
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
      setMessage(`${data.message ?? "Restauration terminée."} Reconnectez-vous pour repartir sur une session propre.`);
    } catch (error) {
      const text = error instanceof Error ? error.message : "Erreur restauration";
      setMessage(text);
    } finally {
      setSaving(false);
    }
  }

  async function runDryRunRestore() {
    if (!selectedBackup) return;
    setSaving(true);
    setMessage(null);
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
      setMessage(
        `${data.message ?? "Simulation terminée."} Collections: ${data.result?.restoredCollections ?? 0}, documents: ${
          data.result?.restoredDocuments ?? 0
        }, checksum: ${integrity?.valid ? "OK" : "KO"}.`,
      );
    } catch (error) {
      const text = error instanceof Error ? error.message : "Erreur simulation";
      setMessage(text);
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
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-900">Sauvegarde / restauration locale</h3>
      <p className="mt-1 text-xs text-slate-600">
        Sauvegarde la base locale dans le dossier <code>backups/</code>, puis restaure un snapshot complet si nécessaire.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-sky-200/70 bg-sky-50/50 p-3">
        <button
          type="button"
          disabled={saving}
          onClick={() => void createBackup()}
          className="rounded border border-sky-600 bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-700 disabled:opacity-60"
        >
          {saving ? "Traitement..." : "Créer une sauvegarde locale"}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => void loadBackups()}
          className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          Actualiser la liste
        </button>
        <button
          type="button"
          disabled={saving || !selectedBackup}
          onClick={downloadBackup}
          className="rounded border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-xs text-indigo-700 hover:bg-indigo-100 disabled:opacity-60"
        >
          Télécharger l&apos;archive
        </button>
      </div>

      <form onSubmit={(e) => void onRestoreSubmit(e)} className="mt-3 rounded-xl border border-rose-200/70 bg-rose-50/40 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">Restauration locale</p>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <label className="block text-xs text-slate-700">
            Sauvegarde
            <select
              value={selectedBackup}
              disabled={saving || backups.length === 0}
              onChange={(e) => setSelectedBackup(e.target.value)}
              className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900"
            >
              {backups.length === 0 ? <option value="">Aucune sauvegarde</option> : null}
              {backups.map((item) => (
                <option key={item.name} value={item.name}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <div className="rounded border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-600">
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

        <label className="mt-3 inline-flex items-center gap-2 text-xs text-slate-700">
          <input
            type="checkbox"
            checked={restoreUploads}
            disabled={saving}
            onChange={(e) => setRestoreUploads(e.target.checked)}
          />
          Restaurer aussi le dossier <code>uploads/</code>
        </label>

        <label className="mt-2 inline-flex items-center gap-2 text-xs text-slate-700">
          <input
            type="checkbox"
            checked={verifyChecksum}
            disabled={saving}
            onChange={(e) => setVerifyChecksum(e.target.checked)}
          />
          Vérifier l&apos;intégrité (checksum) avant restauration
        </label>

        <label className="mt-3 block text-xs text-slate-700">
          Tapez <strong>RESTAURER</strong> pour confirmer
          <input
            value={confirmText}
            disabled={saving}
            onChange={(e) => setConfirmText(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900"
            placeholder="RESTAURER"
          />
        </label>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={saving || !selectedBackup}
            onClick={() => void runDryRunRestore()}
            className="rounded border border-amber-500 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-60"
          >
            {saving ? "Traitement..." : "Simulation (dry-run)"}
          </button>
          <button
            type="submit"
            disabled={saving || !canRestore}
            className="rounded border border-rose-600 bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700 disabled:opacity-60"
          >
            {saving ? "Restauration..." : "Restaurer cette sauvegarde"}
          </button>
        </div>
      </form>

      {message ? <p className="mt-2 text-xs text-emerald-700">{message}</p> : null}
    </section>
  );
}
