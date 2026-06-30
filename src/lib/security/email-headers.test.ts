import { describe, expect, it } from "vitest";

import { sanitizeEmailAddressList, sanitizeEmailHeaderValue } from "./email-headers";

describe("sanitizeEmailHeaderValue", () => {
  it("supprime les CRLF", () => {
    expect(sanitizeEmailHeaderValue("Sujet\r\nBcc: evil@x.com")).toBe("Sujet Bcc: evil@x.com");
  });
});

describe("sanitizeEmailAddressList", () => {
  it("filtre les adresses invalides après sanitization", () => {
    expect(sanitizeEmailAddressList(["a@b.com", "bad", "c@d.com\r\n"])).toEqual(["a@b.com", "c@d.com"]);
  });
});
