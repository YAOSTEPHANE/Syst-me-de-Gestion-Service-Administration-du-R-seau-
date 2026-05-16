import { lonaciFetch } from "@/lib/lonaci-client-fetch";

/**
 * Télécharge un PDF authentifié (session cookie) — évite les échecs des liens `<a href>` sans credentials.
 */
export async function downloadLonaciPdf(url: string, filename: string): Promise<void> {
  const res = await lonaciFetch(url);
  if (!res.ok) {
    let message = "Téléchargement impossible.";
    try {
      const body = (await res.json()) as { message?: string };
      if (body?.message) message = body.message;
    } catch {
      // réponse non JSON (ex. HTML)
    }
    throw new Error(message);
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
