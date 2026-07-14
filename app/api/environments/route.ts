import { NextRequest, NextResponse } from "next/server";
import {
  listEnvironments,
  redactEnvironment,
  saveEnvironment,
} from "@/lib/store/environments";
import { getSessionUser } from "@/lib/session";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const envs = await listEnvironments(user.id);
  return NextResponse.json(envs.map(redactEnvironment));
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const authType = body.authType === "token" ? "token" : "clientCredentials";
    if (!body.name || !body.baseUrl) {
      return NextResponse.json({ error: "name and baseUrl are required" }, { status: 400 });
    }
    if (authType === "clientCredentials" && !body.clientId) {
      return NextResponse.json(
        { error: "clientId is required for client-credentials auth" },
        { status: 400 }
      );
    }
    // "********" means "unchanged" on edit
    if (body.clientSecret === "********") body.clientSecret = "";
    if (body.token === "********") body.token = "";
    const env = await saveEnvironment(
      {
        id: body.id || undefined,
        name: body.name,
        baseUrl: String(body.baseUrl).replace(/\/$/, ""),
        authType,
        clientId: body.clientId ?? "",
        clientSecret: body.clientSecret ?? "",
        token: body.token || undefined,
        authority: body.authority || undefined,
        audience: body.audience || undefined,
        tag: body.tag || undefined,
      },
      user.id
    );
    return NextResponse.json(redactEnvironment(env));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
