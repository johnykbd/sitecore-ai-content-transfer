import { NextRequest, NextResponse } from "next/server";
import { getEphemeralLogs, getEphemeralMigration } from "@/lib/store/ephemeral";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const migration = getEphemeralMigration(id);
  if (!migration) {
    return NextResponse.json(
      { error: "Migration not found (one-time sessions expire and are not saved)" },
      { status: 404 }
    );
  }
  return NextResponse.json({ migration, logs: getEphemeralLogs(id) });
}
