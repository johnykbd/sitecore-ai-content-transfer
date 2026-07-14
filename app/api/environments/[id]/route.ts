import { NextRequest, NextResponse } from "next/server";
import { deleteEnvironment, getEnvironment, redactEnvironment } from "@/lib/store/environments";
import { clearTokenCache } from "@/lib/sitecore/auth";
import { getSessionUser } from "@/lib/session";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const env = await getEnvironment(id, user.id);
  if (!env) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(redactEnvironment(env));
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  await deleteEnvironment(id, user.id);
  clearTokenCache(id);
  return NextResponse.json({ ok: true });
}
