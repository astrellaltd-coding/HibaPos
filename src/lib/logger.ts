/**
 * Structured Logger utility for HibaPOS.
 * Outputs formatted JSON in production for log monitoring/ingestion,
 * and clean timestamped console messages during local development.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogPayload {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

function formatLog(level: LogLevel, message: string, meta?: Record<string, unknown> | Error): void {
  const isProd = process.env.NODE_ENV === "production";
  const timestamp = new Date().toISOString();

  let errorObj: LogPayload["error"] = undefined;
  let contextObj: Record<string, unknown> | undefined = undefined;

  if (meta instanceof Error) {
    errorObj = {
      name: meta.name,
      message: meta.message,
      stack: meta.stack,
    };
  } else if (meta && typeof meta === "object") {
    contextObj = meta;
  }

  const payload: LogPayload = {
    level,
    message,
    timestamp,
    ...(contextObj ? { context: contextObj } : {}),
    ...(errorObj ? { error: errorObj } : {}),
  };

  if (isProd) {
    const json = JSON.stringify(payload);
    if (level === "error") {
      console.error(json);
    } else if (level === "warn") {
      console.warn(json);
    } else {
      console.log(json);
    }
  } else {
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
    if (level === "error") {
      console.error(prefix, message, meta || "");
    } else if (level === "warn") {
      console.warn(prefix, message, meta || "");
    } else {
      console.log(prefix, message, meta || "");
    }
  }
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => formatLog("debug", msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => formatLog("info", msg, meta),
  warn: (msg: string, meta?: Record<string, unknown> | Error) => formatLog("warn", msg, meta),
  error: (msg: string, meta?: Record<string, unknown> | Error) => formatLog("error", msg, meta),
};
