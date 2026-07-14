import { NextRequest, NextResponse } from "next/server";
import { getEnvironment } from "@/lib/store/environments";
import { clearTokenCache, getAccessToken } from "@/lib/sitecore/auth";
import { getSessionUser } from "@/lib/session";

/** Test the credentials for an environment profile. */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const env = await getEnvironment(id, user.id);
  if (!env) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    clearTokenCache(env.id);
    const started = Date.now();
    await getAccessToken(env);
    return NextResponse.json({ ok: true, latencyMs: Date.now() - started });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 502 });
  }
}
