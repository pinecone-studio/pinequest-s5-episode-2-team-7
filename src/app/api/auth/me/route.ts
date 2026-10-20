import { NextResponse } from "next/server";
import { Errors, requireUser, route } from "@/lib/api/http";
import { getUser } from "@/lib/services/users";

export const GET = route(async (request) => {
  const auth = await requireUser(request);
  const user = await getUser(auth.userId);
  if (!user) throw Errors.unauthorized();
  return NextResponse.json({ user });
});
