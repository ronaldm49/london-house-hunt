import { supabase } from "@/lib/supabase";
import { SearchProfile } from "@/types/property";
import SearchProfileManager from "@/components/settings/SearchProfileManager";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Settings | London House Hunt",
};

export default async function SettingsPage() {
  const { data } = await supabase
    .from("search_profiles")
    .select("*")
    .order("created_at", { ascending: true });

  return (
    <div className="min-h-screen relative z-10">
      <SearchProfileManager initialProfiles={(data ?? []) as SearchProfile[]} />
    </div>
  );
}
