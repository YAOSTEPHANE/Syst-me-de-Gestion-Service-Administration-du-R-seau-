export type PdfContentDisposition = "attachment" | "inline";

export interface PdfResponseOptions {
  filename: string;
  disposition?: PdfContentDisposition;
  status?: number;
  headers?: HeadersInit;
}

function ensurePdfExtension(filename: string): string {
  return filename.toLocaleLowerCase("fr-FR").endsWith(".pdf") ? filename : `${filename}.pdf`;
}

export function safePdfFilename(input: string): string {
  const normalized = input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/[-_.]{2,}/g, "-")
    .replace(/^[-_.]+|[-_.]+$/g, "")
    .slice(0, 120);
  return ensurePdfExtension(normalized || "document");
}

function encodeRfc5987(value: string): string {
  return encodeURIComponent(value).replace(/['()*]/g, (character) => {
    return `%${character.charCodeAt(0).toString(16).toUpperCase()}`;
  });
}

export function createPdfResponse(buffer: Buffer, options: PdfResponseOptions): Response {
  const filename = safePdfFilename(options.filename);
  const disposition = options.disposition ?? "attachment";
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/pdf");
  headers.set(
    "Content-Disposition",
    `${disposition}; filename="${filename}"; filename*=UTF-8''${encodeRfc5987(filename)}`,
  );
  headers.set("Content-Length", String(buffer.byteLength));
  if (!headers.has("Cache-Control")) {
    headers.set("Cache-Control", "no-store");
  }
  if (!headers.has("X-Content-Type-Options")) {
    headers.set("X-Content-Type-Options", "nosniff");
  }
  if (!headers.has("Content-Security-Policy")) {
    headers.set("Content-Security-Policy", "sandbox");
  }

  return new Response(new Uint8Array(buffer), {
    status: options.status ?? 200,
    headers,
  });
}
