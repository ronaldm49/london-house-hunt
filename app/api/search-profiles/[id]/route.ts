import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const body = await request.json();
  const {
    name,
    areas,
    min_price,
    max_price,
    is_active,
    min_bedrooms,
    max_bedrooms,
    furnished_only,
  } = body;

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (name !== undefined) {
    if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    updates.name = name.trim();
  }
  if (areas !== undefined) {
    if (!Array.isArray(areas) || areas.length === 0) {
      return NextResponse.json({ error: "At least one area is required" }, { status: 400 });
    }
    updates.areas = areas;
  }
  if (min_price !== undefined) updates.min_price = min_price;
  if (max_price !== undefined) updates.max_price = max_price;
  if (is_active !== undefined) updates.is_active = is_active;

  const validateBedCount = (v: unknown, field: string) => {
    if (v === null) return null;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0) {
      return new Error(`${field} must be a non-negative integer`);
    }
    return n;
  };

  if (min_bedrooms !== undefined) {
    const v = validateBedCount(min_bedrooms, "min_bedrooms");
    if (v instanceof Error) return NextResponse.json({ error: v.message }, { status: 400 });
    updates.min_bedrooms = v;
  }
  if (max_bedrooms !== undefined) {
    const v = validateBedCount(max_bedrooms, "max_bedrooms");
    if (v instanceof Error) return NextResponse.json({ error: v.message }, { status: 400 });
    updates.max_bedrooms = v;
  }
  if (furnished_only !== undefined) {
    updates.furnished_only = Boolean(furnished_only);
  }

  if (
    updates.min_price !== undefined &&
    updates.max_price !== undefined &&
    (updates.min_price as number) >= (updates.max_price as number)
  ) {
    return NextResponse.json({ error: "Invalid price range" }, { status: 400 });
  }
  if (
    updates.min_bedrooms !== undefined &&
    updates.max_bedrooms !== undefined &&
    updates.min_bedrooms !== null &&
    updates.max_bedrooms !== null &&
    (updates.min_bedrooms as number) > (updates.max_bedrooms as number)
  ) {
    return NextResponse.json({ error: "min_bedrooms cannot exceed max_bedrooms" }, { status: 400 });
  }

  const { data, error } = await supabaseServer
    .from("search_profiles")
    .update(updates)
    .eq("id", params.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  // Nullify search_profile_id on linked properties before deleting
  await supabaseServer
    .from("properties")
    .update({ search_profile_id: null })
    .eq("search_profile_id", params.id);

  const { error } = await supabaseServer
    .from("search_profiles")
    .delete()
    .eq("id", params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
