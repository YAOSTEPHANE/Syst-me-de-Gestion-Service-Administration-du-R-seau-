"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { FileText, Save } from "lucide-react";

import ProduitPiecesEditor, {
  piecesFromStored,
  piecesToApiPayload,
  type ProduitPieceDraft,
} from "@/components/lonaci/produit-pieces-editor";
import { Button } from "@/components/lonaci/ui/button";
import { FeedbackState } from "@/components/lonaci/ui/feedback-state";
import { PageHeader } from "@/components/lonaci/ui/headers";
import { Surface } from "@/components/lonaci/ui/surface";
import { CESSION_CHECKLIST_DEFAULT_ITEMS } from "@/lib/lonaci/cession-checklist-defaults";
import { friendlyErrorMessage } from "@/lib/lonaci/friendly-messages";
import { notify } from "@/lib/toast";

export default function AdminCessionChecklistPanel() {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<ProduitPieceDraft[]>([]);
  const [isDefault, setIsDefault] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/admin/cessions/checklist-template", {
        credentials: "include",
        cache: "no-store",
      });
      if (res.status === 401 || res.status === 403) {
        setVisible(false);
        return;
      }
      if (!res.ok) throw new Error("Chargement impossible");
      const data = (await res.json()) as {
        items?: Array<{ id: string; libelle: string; obligatoire?: boolean }>;
        isDefault?: boolean;
        updatedAt?: string | null;
      };
      const stored = piecesFromStored(data.items);
      setItems(stored.length > 0 ? stored : piecesFromStored(CESSION_CHECKLIST_DEFAULT_ITEMS));
      setIsDefault(data.isDefault ?? true);
      setUpdatedAt(data.updatedAt ?? null);
      setVisible(true);
    } catch (e) {
      setVisible(false);
      setError(friendlyErrorMessage(e instanceof Error ? e.message : "Erreur"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const payload = piecesToApiPayload(items);
    if (!payload.length) {
      notify.error("Ajoutez au moins une pièce avec un libellé valide.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/cessions/checklist-template", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: payload }),
      });
      const body = (await res.json().catch(() => null)) as {
        message?: string;
        items?: Array<{ id: string; libelle: string; obligatoire?: boolean }>;
        isDefault?: boolean;
        updatedAt?: string | null;
      } | null;
      if (!res.ok) {
        throw new Error(body?.message ?? "Enregistrement impossible");
      }
      setItems(piecesFromStored(body?.items));
      setIsDefault(body?.isDefault ?? false);
      setUpdatedAt(body?.updatedAt ?? null);
      notify.success("Liste des documents cession enregistrée.");
      window.dispatchEvent(new Event("lonaci:cession-checklist-updated"));
    } catch (err) {
      const message = friendlyErrorMessage(err instanceof Error ? err.message : "Erreur");
      setError(message);
      notify.error(message);
    } finally {
      setSaving(false);
    }
  }

  function restoreDefaults() {
    setItems(piecesFromStored(CESSION_CHECKLIST_DEFAULT_ITEMS));
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Chargement du référentiel documents…</p>;
  }

  if (!visible) {
    return (
      <FeedbackState
        tone="warning"
        title="Accès restreint"
        description="La configuration des documents cession est réservée au rôle CHEF_SERVICE."
      />
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Référentiel"
        title="Documents cession"
        description="Définissez les pièces communes à toute demande de cession. Les documents spécifiques au produit restent gérés dans le référentiel Produits. Les modifications resynchronisent les dossiers en cours."
        actions={
          <Button variant="secondary" size="sm" leadingIcon={FileText} onClick={restoreDefaults}>
            Restaurer le modèle par défaut
          </Button>
        }
      />

      {isDefault ? (
        <FeedbackState
          tone="info"
          title="Modèle par défaut"
          description="Aucune configuration personnalisée n'est encore enregistrée. Enregistrez pour figer la liste dans l'administration."
        />
      ) : null}

      {updatedAt ? (
        <p className="text-xs text-slate-500">
          Dernière mise à jour : {new Date(updatedAt).toLocaleString("fr-FR")}
        </p>
      ) : null}

      {error ? <FeedbackState tone="danger" title="Erreur" description={error} /> : null}

      <Surface padding="md">
        <form onSubmit={onSubmit} className="space-y-4">
          <ProduitPiecesEditor
            items={items}
            onChange={setItems}
            disabled={saving}
            showClientCategories={false}
            helpText="Pièces communes à toutes les cessions. Les pièces liées au produit (RIB, etc.) s'ajoutent automatiquement selon le code produit du dossier."
          />
          <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-4">
            <Button type="submit" leadingIcon={Save} loading={saving}>
              Enregistrer la liste
            </Button>
          </div>
        </form>
      </Surface>
    </div>
  );
}
