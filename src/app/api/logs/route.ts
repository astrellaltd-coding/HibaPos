import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-handler";
import { promises as fs } from "fs";
import path from "path";
import { queryTechnicalLogs } from "@/lib/services/technical-logger";

export const GET = withAuth(
  async (req) => {
    const url = new URL(req.url);
    const lines = Math.min(Number(url.searchParams.get("lines") ?? "300"), 2000);
    const source = url.searchParams.get("source") ?? undefined;
    const level = (url.searchParams.get("level") as "INFO" | "WARN" | "ERROR" | undefined) ?? undefined;

    // Read dev.log file (fallback for local development logs)
    const logPath = path.join(process.cwd(), "dev.log");
    let fileContent = "";
    try {
      fileContent = await fs.readFile(logPath, "utf8");
    } catch {
      fileContent = "";
    }
    const all = fileContent.split("\n").filter(Boolean);
    const tail = all.slice(-lines);

    // Read structured technical logs from database
    const dbLogs = await queryTechnicalLogs({ level, source, limit: lines });
    const formattedDbLogs = dbLogs.map((l) =>
      `[${l.createdAt.toISOString()}] [${l.level}] [${l.source}] ${l.message}${l.stackTrace ? "\n" + l.stackTrace : ""}`
    );

    return NextResponse.json({
      lines: [...formattedDbLogs, ...tail],
      total: all.length + dbLogs.length,
      dbLogs: dbLogs.map((l) => ({
        id: l.id,
        createdAt: l.createdAt.toISOString(),
        level: l.level,
        source: l.source,
        message: l.message,
        stackTrace: l.stackTrace,
      })),
    });
  },
  { roles: ["SUPER_ADMIN"] }
);
