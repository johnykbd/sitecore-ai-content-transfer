import { NextRequest, NextResponse } from "next/server";
import { createOneTimeMigration, startMigration } from "@/lib/runner";

/**
 * One-time migrations: environment URLs and access tokens are provided
 * inline, kept in server memory only, and never persisted. No account
 * required, no logs written to disk.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const migration = await createOneTimeMigration({
      name: body.name,
      source: {
        name: body.source?.name || "Source",
        baseUrl: body.source?.baseUrl ?? "",
        token: body.source?.token ?? "",
      },
      destination: {
        name: body.destination?.name || "Destination",
        baseUrl: body.destination?.baseUrl ?? "",
        token: body.destination?.token ?? "",
      },
      items: body.items ?? [],
      options: {
        overwriteExisting: !!body.options?.overwriteExisting,
        includeRelatedItems: !!body.options?.includeRelatedItems,
        publishAfterTransfer: !!body.options?.publishAfterTransfer,
        dryRun: !!body.options?.dryRun,
      },
    });
    startMigration(migration.id, "onetime");
    return NextResponse.json(migration, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
