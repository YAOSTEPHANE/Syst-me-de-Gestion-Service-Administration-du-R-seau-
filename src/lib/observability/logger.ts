export type LogLevel = "info" | "warn" | "error";

export interface LogContext {
  event: string;
  requestId?: string;
  [key: string]: unknown;
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({ event: "LOGGER_SERIALIZE_ERROR" });
  }
}

function write(level: LogLevel, message: string, context: LogContext) {
  const payload = {
    ts: new Date().toISOString(),
    level,
    message,
    ...context,
  };
  const line = safeJson(payload);
  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.log(line);
}

export const logger = {
  info(message: string, context: LogContext) {
    write("info", message, context);
  },
  warn(message: string, context: LogContext) {
    write("warn", message, context);
  },
  error(message: string, context: LogContext) {
    write("error", message, context);
  },
};

