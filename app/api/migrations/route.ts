import { NextRequest, NextResponse } from "next/server";
import { listMigrations } from "@/lib/store/migrations";
import { createMigration, startMigration } from "@/lib/runner";
import { getSessionUser } from "@/lib/session";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const migrations = await listMigrations(user.id);
  return NextResponse.json(migrations);
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const migration = await createMigration({
      name: body.name,
      sourceEnvId: body.sourceEnvId,
      destinationEnvId: body.destinationEnvId,
      items: body.items ?? [],
      options: {
        overwriteExisting: !!body.options?.overwriteExisting,
        includeRelatedItems: !!body.options?.includeRelatedItems,
        publishAfterTransfer: !!body.options?.publishAfterTransfer,
        dryRun: !!body.options?.dryRun,
      },
      userId: user.id,
    });
    startMigration(migration.id, "managed");
    return NextResponse.json(migration, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
