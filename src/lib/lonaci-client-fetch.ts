/**
 * Appels `fetch` depuis le navigateur vers les routes `/api/*` de Infinitecore Systeme.
 * Centralise `credentials: "include"` et `cache: "no-store"` pour les cookies de session
 * et des données non mises en cache par le client.
 */
export function lonaciFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, {
    credentials: "include",
    cache: "no-store",
    ...init,
  });
}
