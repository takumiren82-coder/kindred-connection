import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://zoqdgipnvtxymwujuhxt.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvcWRnaXBudnR4eW13dWp1aHh0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxMTc5NzAsImV4cCI6MjA5NzY5Mzk3MH0.SfN4iuZKg8akePr2Q6MqDpjEo8zipnpLFnmeYC6gMV8";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export const GALLERY_BUCKET = "gallery";