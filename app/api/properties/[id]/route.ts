import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

const VALID_CATEGORIES = new Set(["bin", "wishlist", "called", "offered", null]);

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await request.json();
  const update: Record<string, unknown> = {};

  if ("category" in body) {
    if (!VALID_CATEGORIES.has(body.category)) {
      return NextResponse.json(
        { error: "Invalid category. Must be bin, wishlist, called, or null." },
        { status: 400 }
      );
    }
    update.category = body.category;
  }

  if ("notes" in body) {
    if (body.notes !== null && typeof body.notes !== "string") {
      return NextResponse.json(
        { error: "Notes must be a string or null." },
        { status: 400 }
      );
    }
    update.notes = body.notes;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json(
      { error: "No valid fields to update." },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseServer
    .from("properties")
    .update(update)
    .eq("id", params.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
