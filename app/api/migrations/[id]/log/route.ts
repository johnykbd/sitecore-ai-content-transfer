import { NextRequest, NextResponse } from "next/server";
import { getMigration, readLogs } from "@/lib/store/migrations";
import { getSessionUser } from "@/lib/session";

/** Download the raw JSON log file for a managed migration. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const migration = await getMigration(id);
  if (!migration || (migration.userId && migration.userId !== user.id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const logs = await readLogs(id);
  return new NextResponse(JSON.stringify({ migration, logs }, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="migration-${id}.log.json"`,
    },
  });
}
