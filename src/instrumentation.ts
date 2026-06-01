export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;
  try {
    const { initMongoSrvStandardUri } = await import("@/lib/mongodb-srv-standard");
    await initMongoSrvStandardUri();
  } catch (err) {
    console.warn(
      "[instrumentation] Conversion Mongo srv→standard ignorée :",
      err instanceof Error ? err.message : err,
    );
  }
}
