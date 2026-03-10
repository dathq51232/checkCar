const supabaseUrl = 'https://bywdgwqwtnopqhjdwknp.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ5d2Rnd3F3dG5vcHFoamR3a25wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwNzYzMTQsImV4cCI6MjA4ODY1MjMxNH0.mhVjS6AQspd3JPfa5qXZuAB91TQlkVfjZ7vCbTPLOKw';

// Initialize the Supabase client
const supabase = supabase.createClient(supabaseUrl, supabaseKey);
