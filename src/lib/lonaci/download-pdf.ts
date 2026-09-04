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
  // L’onglet doit être créé pendant le clic utilisateur, avant tout `await`,
  // sinon les navigateurs considèrent l’ouverture comme une pop-up différée.
  const opened = window.open("", "_blank");
  if (!opened) {
    throw new Error("Ouverture du PDF bloquée par le navigateur. Autorisez les pop-ups ou utilisez Télécharger.");
  }
  opened.opener = null;

  try {
    const res = await lonaciFetch(url);
    if (!res.ok) {
      throw new Error(await readPdfErrorMessage(res));
    }
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    opened.location.replace(objectUrl);
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 120_000);
  } catch (error) {
    opened.close();
    throw error;
  }
}

/** Lance l'impression d'un PDF authentifié via une iframe cachée. */
export async function printLonaciPdf(url: string): Promise<void> {
  const res = await lonaciFetch(url);
  if (!res.ok) {
    throw new Error(await readPdfErrorMessage(res));
  }
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);

  await new Promise<void>((resolve, reject) => {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("title", "Impression courrier LONACI");
    iframe.style.position = "fixed";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.style.opacity = "0";
    iframe.style.pointerEvents = "none";

    const cleanup = () => {
      window.setTimeout(() => {
        iframe.remove();
        URL.revokeObjectURL(objectUrl);
      }, 120_000);
    };

    iframe.onload = () => {
      window.setTimeout(() => {
        const win = iframe.contentWindow;
        if (!win) {
          cleanup();
          reject(new Error("Impression impossible."));
          return;
        }
        win.focus();
        win.print();
        cleanup();
        resolve();
      }, 300);
    };

    iframe.onerror = () => {
      iframe.remove();
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Impression impossible."));
    };

    document.body.appendChild(iframe);
    iframe.src = objectUrl;
  });
}
