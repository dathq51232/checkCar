// ========================================
// GropĐ — Database Connection (Supabase)
// ========================================
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || 'https://bywdgwqwtnopqhjdwknp.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ5d2Rnd3F3dG5vcHFoamR3a25wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwNzYzMTQsImV4cCI6MjA4ODY1MjMxNH0.mhVjS6AQspd3JPfa5qXZuAB91TQlkVfjZ7vCbTPLOKw';

// Initialize the Supabase client
const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = supabase;
