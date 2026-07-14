import { NextRequest, NextResponse } from "next/server";
import { createSession, registerUser } from "@/lib/session";
import { importLegacyEnvironments } from "@/lib/store/environments";

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();
    const user = registerUser(email ?? "", password ?? "");
    await createSession(user.id);
    // Import environments from a pre-SQLite data/environments.json, if present.
    const imported = await importLegacyEnvironments(user.id);
    return NextResponse.json({ user, importedEnvironments: imported }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
