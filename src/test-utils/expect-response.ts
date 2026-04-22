import assert from "node:assert";

/** Affirme qu'un route handler a renvoyé une `Response` (souvent typée `Response | undefined`). */
export function expectResponse(res: Response | undefined): asserts res is Response {
  assert(res !== undefined, "le handler doit renvoyer une Response");
}
