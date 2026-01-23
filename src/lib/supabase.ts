
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://vmuwemrvoriopjwppkph.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZtdXdlbXJ2b3Jpb3Bqd3Bwa3BoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg5NjM4MzIsImV4cCI6MjA4NDUzOTgzMn0.K4IIX9xdoiVmhB5HfGahDXuhFMSLwFGfpo1WjBVftLQ';

export const supabase = createClient(supabaseUrl, supabaseKey);
