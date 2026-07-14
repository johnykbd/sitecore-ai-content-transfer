import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { SitecoreClient } from "@/lib/sitecore/client";
import { browseChildren } from "@/lib/sitecore/items";
import { DEMO_TREE } from "@/lib/demo-tree";
import type { EnvironmentProfile } from "@/lib/types";

/**
 * Browse a source content tree with inline credentials (one-time mode).
 * Credentials are used for this single request and not stored.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const path: string = body.path ?? "/sitecore/content";
    if (body.demo) {
      return NextResponse.json({ items: DEMO_TREE[path] ?? [], demo: true });
    }
    if (!body.baseUrl || !body.token) {
      return NextResponse.json({ error: "baseUrl and token are required" }, { status: 400 });
    }
    const now = new Date().toISOString();
    const env: EnvironmentProfile = {
      id: randomUUID(),
      name: "One-time source",
      baseUrl: String(body.baseUrl).replace(/\/$/, ""),
      authType: "token",
      clientId: "",
      clientSecret: "",
      token: body.token,
      createdAt: now,
      updatedAt: now,
    };
    const items = await browseChildren(new SitecoreClient(env), path);
    return NextResponse.json({ items });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
