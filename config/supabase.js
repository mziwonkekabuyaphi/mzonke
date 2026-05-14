// config/supabase.js - RANDS NEW SYSTEM ONLY

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// ===============================

// 🔐 NEW SUPABASE PROJECT ONLY

// ===============================

const SUPABASE_URL = 'https://odpugxrihfspaucsdqjj.supabase.co';

const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9kcHVneHJpaGZzcGF1Y3NkcWpqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3NTQ5MDcsImV4cCI6MjA5NDMzMDkwN30.c1xpL4p4llS8oNzdg0evCuJNaBMC1REPG0dNk47WeMU';

// ===============================

// 🚀 CREATE CLIENT

// ===============================

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ===============================

// 🌍 GLOBAL ACCESS (for your current HTML files)

// ===============================

window.supabase = supabase;
