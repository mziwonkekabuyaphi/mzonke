const SUPABASE_URL = "https://https://qrjlgfajglvkbifhlebc.supabase.co/";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFyamxnZmFqZ2x2a2JpZmhsZWJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxMjAzOTAsImV4cCI6MjA5MjY5NjM5MH0.dBj6kPPyBE7LwrZZudyNkUsFcq_8NJBIXCJcNH41ajY";

const supabase = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

// helper functions (optional)
export const getEvents = () => supabase.from('events').select('*');
export const getTickets = () => supabase.from('tickets').select('*');

export default supabase;
