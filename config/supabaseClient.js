import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const URL = "https://your-project.supabase.co";
const KEY = "your-anon-public-key";

export const supabase = createClient(URL, KEY);

export const getUser = () => supabase.auth.getUser();
export const logout = () => supabase.auth.signOut();
