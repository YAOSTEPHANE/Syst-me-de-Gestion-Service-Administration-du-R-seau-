"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { FileText, Save } from "lucide-react";

import { Button } from "@/components/lonaci/ui/button";
import { FeedbackState } from "@/components/lonaci/ui/feedback-state";
import { PageHeader } from "@/components/lonaci/ui/headers";
import { Surface } from "@/components/lonaci/ui/surface";
import { MODULE_COURRIER_DEFAULTS } from "@/lib/lonaci/module-courrier-defaults";
import { MODULE_COURRIER_PLACEHOLDERS, type ModuleCourrierId } from "@/lib/lonaci/module-courrier-types";
import { friendlyErrorMessage } from "@/lib/lonaci/friendly-messages";
import { notify } from "@/lib/toast";

type Props = {
  moduleId: ModuleCourrierId;
  title: string;
  description: string;
};

const fieldClass =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-200";

export default function AdminModuleCourrierPanel({ moduleId, title, description }: Props) {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDefault, setIsDefault] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [destinataire, setDestinataire] = useState("");
  const [objet, setObjet] = useState("");
  const [corps, setCorps] = useState("");
  const [signatureLabel, setSignatureLabel] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/admin/module-courriers/${encodeURIComponent(moduleId)}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (res.status === 401 || res.status === 403) {
        setVisible(false);
        return;
      }
      if (!res.ok) throw new Error("Chargement impossible");
      const data = (await res.json()) as {
        template?: {
          destinataire: string;
          objet: string;
          corps: string;
          signatureLabel: string;
        };
        isDefault?: boolean;
        updatedAt?: string | null;
      };
      const template = data.template ?? MODULE_COURRIER_DEFAULTS[moduleId];
      setDestinataire(template.destinataire);
      setObjet(template.objet);
      setCorps(template.corps);
      setSignatureLabel(template.signatureLabel);
      setIsDefault(data.isDefault ?? true);
      setUpdatedAt(data.updatedAt ?? null);
      setVisible(true);
    } catch (e) {
      setVisible(false);
      setError(friendlyErrorMessage(e instanceof Error ? e.message : "Erreur"));
    } finally {
      setLoading(false);
    }
  }, [moduleId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/module-courriers/${encodeURIComponent(moduleId)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destinataire, objet, corps, signatureLabel }),
      });
      const body = (await res.json().catch(() => null)) as {
        message?: string;
        template?: {
          destinataire: string;
          objet: string;
          corps: string;
          signatureLabel: string;
        };
        isDefault?: boolean;
        updatedAt?: string | null;
      } | null;
      if (!res.ok) {
        throw new Error(body?.message ?? "Enregistrement impossible");
      }
      const template = body?.template ?? MODULE_COURRIER_DEFAULTS[moduleId];
      setDestinataire(template.destinataire);
      setObjet(template.objet);
      setCorps(template.corps);
      setSignatureLabel(template.signatureLabel);
      setIsDefault(body?.isDefault ?? false);
      setUpdatedAt(body?.updatedAt ?? null);
      notify.success("Modèle de courrier enregistré.");
      window.dispatchEvent(new Event(`lonaci:courrier-${moduleId}-updated`));
    } catch (err) {
      const message = friendlyErrorMessage(err instanceof Error ? err.message : "Erreur");
      setError(message);
      notify.error(message);
    } finally {
      setSaving(false);
    }
  }

  function restoreDefaults() {
    const template = MODULE_COURRIER_DEFAULTS[moduleId];
    setDestinataire(template.destinataire);
    setObjet(template.objet);
    setCorps(template.corps);
    setSignatureLabel(template.signatureLabel);
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Chargement du modèle de courrier…</p>;
  }

  if (!visible) {
    return (
      <FeedbackState
        tone="warning"
        title="Accès restreint"
        description="La rédaction des courriers est réservée au rôle CHEF_SERVICE."
      />
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Courrier"
        title={title}
        description={description}
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
          description="Aucun courrier personnalisé n'est encore enregistré. Le PDF reprend ce modèle jusqu'à enregistrement."
        />
      ) : null}

      {updatedAt ? (
        <p className="text-xs text-slate-500">
          Dernière mise à jour : {new Date(updatedAt).toLocaleString("fr-FR")}
        </p>
      ) : null}

      <Surface padding="md" className="border border-slate-200 bg-white">
        <p className="text-xs text-slate-600">
          Mise en page PDF : à gauche nom, prénoms, contacts et code terminal ; à droite la date ; puis
          destinataire, objet, corps du texte et signature de l&apos;intéressé.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {MODULE_COURRIER_PLACEHOLDERS.map((placeholder) => (
            <code
              key={placeholder.key}
              className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] text-slate-700"
              title={placeholder.label}
            >
              {placeholder.key}
            </code>
          ))}
        </div>
      </Surface>

      {error ? <FeedbackState tone="danger" title="Erreur" description={error} /> : null}

      <Surface padding="md">
        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
              Destinataire (personne à qui s&apos;adresse le courrier)
            </span>
            <textarea
              value={destinataire}
              onChange={(e) => setDestinataire(e.target.value)}
              rows={3}
              className={fieldClass}
              disabled={saving}
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">Objet</span>
            <input
              value={objet}
              onChange={(e) => setObjet(e.target.value)}
              className={fieldClass}
              disabled={saving}
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">Corps du texte</span>
            <textarea
              value={corps}
              onChange={(e) => setCorps(e.target.value)}
              rows={12}
              className={`${fieldClass} font-mono text-[13px] leading-6`}
              disabled={saving}
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
              Libellé de signature
            </span>
            <input
              value={signatureLabel}
              onChange={(e) => setSignatureLabel(e.target.value)}
              className={fieldClass}
              disabled={saving}
            />
          </label>
          <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-4">
            <Button type="submit" leadingIcon={Save} loading={saving}>
              Enregistrer le courrier
            </Button>
          </div>
        </form>
      </Surface>
    </div>
  );
}
