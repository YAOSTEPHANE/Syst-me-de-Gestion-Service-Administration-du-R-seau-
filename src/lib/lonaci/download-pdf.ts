import { lonaciFetch } from "@/lib/lonaci-client-fetch";

async function readPdfErrorMessage(res: Response): Promise<string> {
  let message = "Téléchargement impossible.";
  try {
    const body = (await res.json()) as { message?: string };
    if (body?.message) message = body.message;
  } catch {
    // réponse non JSON (ex. HTML)
  }
  return message;
}

/**
 * Télécharge un PDF authentifié (session cookie) — évite les échecs des liens `<a href>` sans credentials.
 */
export async function downloadLonaciPdf(url: string, filename: string): Promise<void> {
  const res = await lonaciFetch(url);
  if (!res.ok) {
    throw new Error(await readPdfErrorMessage(res));
  }
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

/** Ouvre un PDF authentifié dans un nouvel onglet (aperçu navigateur). */
export async function openLonaciPdfInTab(url: string): Promise<void> {
  const res = await lonaciFetch(url);
  if (!res.ok) {
    throw new Error(await readPdfErrorMessage(res));
  }
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const opened = window.open(objectUrl, "_blank", "noopener,noreferrer");
  if (!opened) {
    URL.revokeObjectURL(objectUrl);
    throw new Error("Ouverture du PDF bloquée par le navigateur. Autorisez les pop-ups ou utilisez Télécharger.");
  }
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 120_000);
}
