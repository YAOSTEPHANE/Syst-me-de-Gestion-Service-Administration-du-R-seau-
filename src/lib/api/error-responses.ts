import { NextResponse } from "next/server";

type ErrorBody = {
  message: string;
  code?: string;
  details?: unknown;
};

export function apiError(status: number, message: string, code?: string, details?: unknown) {
  const body: ErrorBody = { message };
  if (code) body.code = code;
  if (details !== undefined) body.details = details;
  return NextResponse.json(body, { status });
}

export function badRequest(message: string, code?: string, details?: unknown) {
  return apiError(400, message, code ?? "BAD_REQUEST", details);
}

export function unauthorized(message = "Non authentifié", code = "UNAUTHORIZED") {
  return apiError(401, message, code);
}

export function forbidden(message = "Accès refusé", code = "FORBIDDEN") {
  return apiError(403, message, code);
}

export function notFound(message = "Ressource introuvable", code = "NOT_FOUND") {
  return apiError(404, message, code);
}

export function conflict(message: string, code = "CONFLICT") {
  return apiError(409, message, code);
}

export function gone(message: string, code = "GONE") {
  return apiError(410, message, code);
}

export function serverError(message = "Erreur serveur", code = "INTERNAL_SERVER_ERROR") {
  return apiError(500, message, code);
}

