// src/app/api/trips/increment/route.ts
//
// Increments the authenticated user's server-side trip counter.
// Called by tripGate.incrementTripsUsed() after a trip is successfully saved.
// Uses a security-definer Postgres function so the user cannot write
// user_trip_counts directly via the anon key.
//
// Required env vars:
//   SUPABASE_SERVICE_ROLE_KEY
//   NEXT_PUBLIC_SUPABASE_URL

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export async function POST(req: NextRequest) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Call the security-definer Postgres function
  const { data, error: rpcError } = await supabaseAdmin.rpc("increment_trip_count", {
    p_user_id: user.id,
  });

  if (rpcError) {
    console.error("[trips/increment]", rpcError);
    return NextResponse.json({ error: "Failed to increment." }, { status: 500 });
  }

  return NextResponse.json({ trips_used: data as number });
}
