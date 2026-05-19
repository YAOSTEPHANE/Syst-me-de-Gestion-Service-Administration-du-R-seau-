import { badRequest, forbidden, notFound } from "@/lib/api/error-responses";

export function ribWorkflowErrorResponse(err: unknown) {
  const code = err instanceof Error ? err.message : "UNKNOWN";
  switch (code) {
    case "CONCESSIONNAIRE_NOT_FOUND":
      return notFound("Concessionnaire introuvable.", code);
    case "FORBIDDEN":
      return forbidden("Accès refusé.", code);
    case "RIB_DEMANDE_NOT_ALLOWED":
      return badRequest(
        "Une demande RIB est déjà en cours ou le PDV est déjà bancarisé.",
        code,
      );
    case "RIB_ATTACH_NOT_ALLOWED":
      return badRequest("Le RIB ne peut être attaché qu'en statut EN ATTENTE DE RIB.", code);
    case "RIB_VALIDATE_NOT_ALLOWED":
      return badRequest("Validation possible uniquement lorsque le RIB est fourni.", code);
    case "BANCARISATION_INTEGRATE_NOT_ALLOWED":
      return badRequest(
        "Intégration possible uniquement après validation du RIB (RIB VALIDÉ).",
        code,
      );
    case "COMPTE_BANCAIRE_REQUIRED":
      return badRequest("Le numéro de compte bancaire est obligatoire.", code);
    default:
      return badRequest("Opération impossible.", "RIB_WORKFLOW_ERROR");
  }
}
