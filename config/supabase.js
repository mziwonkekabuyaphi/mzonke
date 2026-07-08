// config/supabase.js - RANDS NEW SYSTEM ONLY

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// ===============================
// 🔐 NEW SUPABASE PROJECT ONLY
// ===============================

const SUPABASE_URL = 'https://odpugxrihfspaucsdqjj.supabase.co';

const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY';

// ===============================
// 🚀 CREATE CLIENT
// ===============================

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  {
    auth: {
      experimental: {
        passkey: true,
      },
    },
  }
);

// ===============================
// 🌍 GLOBAL ACCESS
// ===============================

window.supabase = supabase;
