import { afterEach, describe, expect, it, vi } from "vitest";

import { logger } from "./logger";

describe("logger", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("écrit un log info JSON structuré", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    logger.info("hello", { event: "TEST_LOG", foo: "bar" });
    expect(spy).toHaveBeenCalledTimes(1);
    const line = String(spy.mock.calls[0][0]);
    const parsed = JSON.parse(line) as { level: string; message: string; event: string; foo: string };
    expect(parsed.level).toBe("info");
    expect(parsed.message).toBe("hello");
    expect(parsed.event).toBe("TEST_LOG");
    expect(parsed.foo).toBe("bar");
  });

  it("écrit un log error via console.error", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    logger.error("boom", { event: "TEST_ERR" });
    expect(spy).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(String(spy.mock.calls[0][0])) as { level: string; message: string };
    expect(parsed.level).toBe("error");
    expect(parsed.message).toBe("boom");
  });
});

