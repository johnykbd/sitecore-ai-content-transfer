import { NextRequest, NextResponse } from "next/server";
import { getMigration, readLogs } from "@/lib/store/migrations";
import { getSessionUser } from "@/lib/session";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const migration = await getMigration(id);
  if (!migration || (migration.userId && migration.userId !== user.id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const includeLogs = req.nextUrl.searchParams.get("logs") !== "false";
  const logs = includeLogs ? await readLogs(id) : [];
  return NextResponse.json({ migration, logs });
}
