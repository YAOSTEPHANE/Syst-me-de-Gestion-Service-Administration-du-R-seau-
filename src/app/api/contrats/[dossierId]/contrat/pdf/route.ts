import { NextRequest, NextResponse } from "next/server";

import { requireApiAuth } from "@/lib/auth/guards";
import {
  buildContratDocumentView,
  parseContratsGeneresPayload,
  renderContratDocumentPdf,
} from "@/lib/lonaci/contrat-document";
import { findVisibleDossierById } from "@/lib/lonaci/dossiers";
import { createContratArchiveReadStream } from "@/lib/storage/contrat-files";

interface RouteContext {
  params: Promise<{ dossierId: string }>;
}

function resolveGenereForProduit(
  payload: Record<string, unknown>,
  produitCodeParam: string | null,
) {
  const all = parseContratsGeneresPayload(payload);
  if (!all.length) return null;
  const pcode = produitCodeParam?.trim().toUpperCase();
  if (!pcode) return all[0];
  return all.find((g) => g.produitCode.trim().toUpperCase() === pcode) ?? all[0];
}

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAuth(request, {
    roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"],
    moduleKey: "DOSSIERS",
    rbac: { resource: "DOSSIERS", action: "READ" },
  });
  if ("error" in auth) {
    return auth.error;
  }

  const { dossierId } = await context.params;
  const dossier = await findVisibleDossierById(dossierId, auth.user);
  if (!dossier) {
    return NextResponse.json({ message: "Dossier introuvable." }, { status: 404 });
  }

  const produitCode = request.nextUrl.searchParams.get("produitCode");
  const genere = resolveGenereForProduit(dossier.payload ?? {}, produitCode);
  if (!genere) {
    return NextResponse.json(
      { message: "Contrat non genere. Validez la decharge definitive puis generez le contrat." },
      { status: 409 },
    );
  }

  const archivePath = genere.contratSigneArchive?.storedRelativePath?.trim();
  const ref =
    genere.contratSigneArchive?.contratReference?.trim() ||
    genere.referenceContratPreview ||
    dossier.reference;

  if (archivePath) {
    const stream = createContratArchiveReadStream(archivePath);
    const webStream = new ReadableStream({
      start(controller) {
        stream.on("data", (chunk: string | Buffer) => {
          const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
          controller.enqueue(new Uint8Array(buf));
        });
        stream.on("end", () => controller.close());
        stream.on("error", (err) => controller.error(err));
      },
    });
    const filename = `contrat-${ref.replace(/[^\w-]+/g, "_")}.pdf`;
    const viewInline = request.nextUrl.searchParams.get("view") === "1";
    return new NextResponse(webStream, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": viewInline
          ? `inline; filename="${filename}"`
          : `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const view = await buildContratDocumentView(dossierId, undefined, genere.produitCode);
  if (!view) {
    return NextResponse.json({ message: "Vue contrat indisponible." }, { status: 500 });
  }
  const pdf = await renderContratDocumentPdf(view);
  const filename = `contrat-brouillon-${ref.replace(/[^\w-]+/g, "_")}.pdf`;
  const viewInline = request.nextUrl.searchParams.get("view") === "1";
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": viewInline
        ? `inline; filename="${filename}"`
        : `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
