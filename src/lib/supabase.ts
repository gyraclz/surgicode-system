import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  "https://ofvyvyyieazpkcycxefg.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9mdnl2eXlpZWF6cGtjeWN4ZWZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyMzEyOTksImV4cCI6MjA5MjgwNzI5OX0.B9AvYM6j4V5OiB2qjc3uRDi6KKNms1eUuhw5nAKAUzY"
);