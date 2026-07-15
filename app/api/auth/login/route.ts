import { NextRequest, NextResponse } from "next/server";
import { authenticateUser, createSession } from "@/lib/session";

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();
    const user = await authenticateUser(email ?? "", password ?? "");
    await createSession(user.id);
    return NextResponse.json({ user });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 401 });
  }
}
