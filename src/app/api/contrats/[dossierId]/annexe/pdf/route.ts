import { NextRequest, NextResponse } from "next/server";

import { requireApiAuth } from "@/lib/auth/guards";
import { assertDossierPartyReadable, contratPartyFromDossier } from "@/lib/lonaci/dossier-contrat-party";
import {
  buildAnnexeDocumentView,
  parseContratsGeneresPayload,
  renderAnnexeDocumentPdf,
} from "@/lib/lonaci/contrat-document";
import { findDossierById } from "@/lib/lonaci/dossiers";
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
  const dossier = await findDossierById(dossierId);
  if (!dossier || dossier.deletedAt) {
    return NextResponse.json({ message: "Dossier introuvable." }, { status: 404 });
  }

  const party = contratPartyFromDossier(dossier);
  if (!party) {
    return NextResponse.json({ message: "Dossier sans rattachement client ou PDV." }, { status: 404 });
  }
  try {
    await assertDossierPartyReadable(party, auth.user);
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (code === "AGENCE_FORBIDDEN") {
      return NextResponse.json({ message: "Acces refuse pour cette agence.", code }, { status: 403 });
    }
    if (code === "CLIENT_NOT_FOUND" || code === "CONCESSIONNAIRE_NOT_FOUND") {
      return NextResponse.json({ message: "Titulaire du dossier introuvable.", code }, { status: 404 });
    }
    return NextResponse.json({ message: "Acces refuse.", code }, { status: 403 });
  }

  const produitCode = request.nextUrl.searchParams.get("produitCode");
  const genere = resolveGenereForProduit(dossier.payload ?? {}, produitCode);
  if (!genere) {
    return NextResponse.json(
      { message: "Contrat non genere. Validez la decharge definitive puis generez le contrat." },
      { status: 409 },
    );
  }

  const archivePath = genere.annexeSigneArchive?.storedRelativePath?.trim();
  const ref =
    genere.annexeSigneArchive?.annexeReference?.trim() ||
    genere.referenceAnnexePreview ||
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
    const filename = `annexe-${ref.replace(/[^\w-]+/g, "_")}.pdf`;
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

  const view = await buildAnnexeDocumentView(dossierId, undefined, genere.produitCode);
  if (!view) {
    return NextResponse.json({ message: "Vue annexe indisponible." }, { status: 500 });
  }
  const pdf = await renderAnnexeDocumentPdf(view);
  const filename = `annexe-brouillon-${ref.replace(/[^\w-]+/g, "_")}.pdf`;
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
