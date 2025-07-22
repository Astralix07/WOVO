# Supabase RLS Policy for users table

-- To disable RLS (Row Level Security) on the users table, run this SQL in your Supabase SQL Editor:
ALTER TABLE users DISABLE ROW LEVEL SECURITY;

-- This will allow all select/insert/update/delete operations without any policies.
-- Only do this if you do NOT want to use RLS for security.

-- If you want to enable RLS again, use:
-- ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Allow anyone to select from users (for development only)
CREATE POLICY "Allow select for all" ON users
  FOR SELECT USING (true);

-- Allow anyone to insert into users (for development only)
CREATE POLICY "Allow insert for all" ON users
  FOR INSERT USING (true);

-- (Optional) Allow update/delete if needed
-- CREATE POLICY "Allow update for all" ON users FOR UPDATE USING (true);
-- CREATE POLICY "Allow delete for all" ON users FOR DELETE USING (true);

-- Note: For production, restrict these policies to authenticated users or add proper checks. 