import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET() {
  const { data, error } = await supabaseServer
    .from("search_profiles")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const body = await request.json();
  const { name, areas, min_price, max_price } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (!Array.isArray(areas) || areas.length === 0) {
    return NextResponse.json({ error: "At least one area is required" }, { status: 400 });
  }
  if (typeof min_price !== "number" || typeof max_price !== "number" || min_price >= max_price) {
    return NextResponse.json({ error: "Invalid price range" }, { status: 400 });
  }

  const { data, error } = await supabaseServer
    .from("search_profiles")
    .insert({ name: name.trim(), areas, min_price, max_price })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
