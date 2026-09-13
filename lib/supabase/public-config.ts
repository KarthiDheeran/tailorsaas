// Only public connection settings belong here. Never include a service-role key.
export function getSupabasePublicConfig(): { url: string; key: string } {
  if (typeof document !== "undefined") {
    const value = document.getElementById("supabase-public-config")?.textContent;
    if (value) return JSON.parse(value) as { url: string; key: string };
  }
  return {
    url: process.env.LOCAL_SUPABASE_PUBLIC_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
    key: process.env.LOCAL_SUPABASE_PUBLIC_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  };
}
