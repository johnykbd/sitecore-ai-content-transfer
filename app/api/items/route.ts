import { NextRequest, NextResponse } from "next/server";
import { getEnvironment } from "@/lib/store/environments";
import { SitecoreClient } from "@/lib/sitecore/client";
import { browseChildren } from "@/lib/sitecore/items";
import { getSessionUser } from "@/lib/session";
import { DEMO_TREE } from "@/lib/demo-tree";

export async function GET(req: NextRequest) {
  const envId = req.nextUrl.searchParams.get("envId");
  const path = req.nextUrl.searchParams.get("path") ?? "/sitecore/content";
  const demo = req.nextUrl.searchParams.get("demo") === "true";

  if (demo) {
    return NextResponse.json({ items: DEMO_TREE[path] ?? [], demo: true });
  }

  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!envId) {
    return NextResponse.json({ error: "envId is required" }, { status: 400 });
  }
  const env = await getEnvironment(envId, user.id);
  if (!env) return NextResponse.json({ error: "Environment not found" }, { status: 404 });

  try {
    const items = await browseChildren(new SitecoreClient(env), path);
    return NextResponse.json({ items });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
