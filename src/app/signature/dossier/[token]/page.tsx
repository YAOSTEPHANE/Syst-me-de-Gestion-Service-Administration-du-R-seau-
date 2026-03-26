"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type SignatureResponse = {
  signature: {
    status: "PENDING" | "SIGNED" | "EXPIRED";
    expiresAt: string;
    signedAt: string | null;
    signerName: string | null;
  };
  dossier: {
    id: string;
    reference: string;
    status: string;
    produitCode: string;
    dateOperation: string;
  };
  concessionnaire: {
    codePdv: string;
    nomComplet: string;
    raisonSociale: string;
  } | null;
};

export default function DossierSignaturePage({ params }: { params: { token: string } }) {
  const token = params.token;
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [data, setData] = useState<SignatureResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signerName, setSignerName] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/signatures/dossier/${encodeURIComponent(token)}`, { cache: "no-store" });
        const payload = (await res.json().catch(() => null)) as SignatureResponse | { message?: string } | null;
        if (!res.ok) {
          setError((payload as { message?: string } | null)?.message ?? "Lien de signature invalide.");
          setData(null);
          return;
        }
        setData(payload as SignatureResponse);
      } catch {
        setError("Erreur réseau");
        setData(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const isPending = data?.signature.status === "PENDING";
  const isSigned = data?.signature.status === "SIGNED";
  const isExpired = data?.signature.status === "EXPIRED";

  const title = useMemo(() => {
    if (isSigned) return "Contrat déjà signé";
    if (isExpired) return "Lien expiré";
    return "Signature électronique du contrat";
  }, [isSigned, isExpired]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSuccess(null);
    setError(null);
    if (!isPending) return;
    if (!signerName.trim()) {
      setError("Veuillez saisir votre nom et prénom.");
      return;
    }
    if (!accepted) {
      setError("Veuillez accepter les conditions de signature.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/signatures/dossier/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signerName: signerName.trim(), accepted: true }),
      });
      const payload = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) {
        setError(payload?.message ?? "Signature impossible.");
        return;
      }
      setSuccess(payload?.message ?? "Signature enregistrée.");
      const refresh = await fetch(`/api/signatures/dossier/${encodeURIComponent(token)}`, { cache: "no-store" });
      const refreshed = (await refresh.json().catch(() => null)) as SignatureResponse | null;
      if (refresh.ok && refreshed) setData(refreshed);
    } catch {
      setError("Erreur réseau");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>

        {loading ? <p className="mt-3 text-sm text-slate-600">Chargement...</p> : null}
        {error ? <p className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
        {success ? <p className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</p> : null}

        {data ? (
          <div className="mt-4 space-y-3 text-sm text-slate-700">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p>
                <strong>Dossier:</strong> {data.dossier.reference}
              </p>
              <p>
                <strong>Produit:</strong> {data.dossier.produitCode || "—"}
              </p>
              <p>
                <strong>Point de vente:</strong> {data.concessionnaire?.nomComplet || data.concessionnaire?.raisonSociale || "—"}
              </p>
              <p>
                <strong>Code PDV:</strong> {data.concessionnaire?.codePdv || "—"}
              </p>
            </div>

            {isSigned ? (
              <p className="rounded-md bg-emerald-50 px-3 py-2 text-emerald-700">
                Signé le {data.signature.signedAt ? new Date(data.signature.signedAt).toLocaleString("fr-FR") : "—"} par{" "}
                {data.signature.signerName ?? "—"}.
              </p>
            ) : null}

            {isExpired ? (
              <p className="rounded-md bg-amber-50 px-3 py-2 text-amber-800">
                Ce lien a expiré. Veuillez contacter votre gestionnaire LONACI pour demander un nouveau lien.
              </p>
            ) : null}

            {isPending ? (
              <form onSubmit={onSubmit} className="space-y-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-700">Nom et prénom du signataire</span>
                  <input
                    value={signerName}
                    onChange={(e) => setSignerName(e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    placeholder="Ex: Kouassi Jean"
                    required
                  />
                </label>

                <label className="flex items-start gap-2 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={accepted}
                    onChange={(e) => setAccepted(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>Je reconnais signer ce contrat électroniquement avec mon consentement.</span>
                </label>

                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-md bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700 disabled:opacity-70"
                >
                  {submitting ? "Signature en cours..." : "Signer électroniquement"}
                </button>
              </form>
            ) : null}
          </div>
        ) : null}
      </section>
    </main>
  );
}
