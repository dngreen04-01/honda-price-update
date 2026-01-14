-- User Management Migration
-- Run this in Supabase SQL Editor
-- =================================

-- ============================================
-- PART 1: USER MANAGEMENT TABLES
-- ============================================

-- User roles lookup table
CREATE TABLE IF NOT EXISTS user_roles (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed initial roles
INSERT INTO user_roles (name, description) VALUES
  ('superuser', 'Full administrative access - can invite users and manage all settings'),
  ('admin', 'Administrative access - can manage data but cannot invite users'),
  ('viewer', 'Read-only access to dashboard data')
ON CONFLICT (name) DO NOTHING;

-- User profiles table (linked to Supabase auth.users)
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  role_id INTEGER NOT NULL REFERENCES user_roles(id) DEFAULT 3,
  invited_by UUID REFERENCES user_profiles(id),
  invited_at TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for user_profiles
CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON user_profiles(email);
CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON user_profiles(role_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_invited_by ON user_profiles(invited_by);

-- User invitations table (tracks pending invitations)
CREATE TABLE IF NOT EXISTS user_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  role_id INTEGER NOT NULL REFERENCES user_roles(id) DEFAULT 3,
  invited_by UUID NOT NULL REFERENCES user_profiles(id),
  status TEXT CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')) DEFAULT 'pending',
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for user_invitations
CREATE INDEX IF NOT EXISTS idx_user_invitations_email ON user_invitations(email);
CREATE INDEX IF NOT EXISTS idx_user_invitations_status ON user_invitations(status);
CREATE INDEX IF NOT EXISTS idx_user_invitations_invited_by ON user_invitations(invited_by);

-- Apply updated_at trigger to user_profiles
CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- PART 2: HELPER FUNCTIONS
-- ============================================

-- Get current user's role name
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT AS $$
DECLARE
  user_role TEXT;
BEGIN
  SELECT r.name INTO user_role
  FROM user_profiles p
  JOIN user_roles r ON p.role_id = r.id
  WHERE p.id = auth.uid() AND p.is_active = true;

  RETURN COALESCE(user_role, 'anonymous');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if current user has at least the specified role level
-- Role hierarchy: superuser > admin > viewer
CREATE OR REPLACE FUNCTION has_role(required_role TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  user_role TEXT;
BEGIN
  user_role := get_user_role();

  -- Role hierarchy check
  IF required_role = 'viewer' THEN
    RETURN user_role IN ('superuser', 'admin', 'viewer');
  ELSIF required_role = 'admin' THEN
    RETURN user_role IN ('superuser', 'admin');
  ELSIF required_role = 'superuser' THEN
    RETURN user_role = 'superuser';
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if current user is superuser
CREATE OR REPLACE FUNCTION is_superuser()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN has_role('superuser');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- PART 3: AUTO-CREATE PROFILE TRIGGER
-- ============================================

-- Trigger function to create profile when a new user signs up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  superuser_email TEXT;
  default_role_id INTEGER;
  inviter_id UUID;
  invite_record RECORD;
BEGIN
  -- Get superuser email from app settings (set via Supabase vault/secrets)
  -- Fallback to checking raw_app_meta_data if not set
  BEGIN
    superuser_email := current_setting('app.superuser_email', true);
  EXCEPTION WHEN OTHERS THEN
    superuser_email := NULL;
  END;

  -- Check if this user was invited
  SELECT * INTO invite_record
  FROM user_invitations
  WHERE email = NEW.email
    AND status = 'pending'
    AND expires_at > NOW()
  ORDER BY created_at DESC
  LIMIT 1;

  -- Determine role based on email or invitation
  IF superuser_email IS NOT NULL AND NEW.email = superuser_email THEN
    -- This is the superuser
    SELECT id INTO default_role_id FROM user_roles WHERE name = 'superuser';
    inviter_id := NULL;
  ELSIF invite_record.id IS NOT NULL THEN
    -- User was invited - use the role from invitation
    default_role_id := invite_record.role_id;
    inviter_id := invite_record.invited_by;

    -- Update invitation status to accepted
    UPDATE user_invitations
    SET status = 'accepted', accepted_at = NOW()
    WHERE id = invite_record.id;
  ELSE
    -- No invitation found - this shouldn't happen with invite-only
    -- Default to viewer role (most restrictive)
    SELECT id INTO default_role_id FROM user_roles WHERE name = 'viewer';
    inviter_id := NULL;
  END IF;

  -- Create the user profile
  INSERT INTO user_profiles (id, email, role_id, invited_by, invited_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(default_role_id, 3), -- fallback to viewer (id=3) if role not found
    inviter_id,
    CASE WHEN invite_record.id IS NOT NULL THEN invite_record.created_at ELSE NULL END
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================
-- PART 4: ROW LEVEL SECURITY - USER TABLES
-- ============================================

-- Enable RLS on user management tables
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_invitations ENABLE ROW LEVEL SECURITY;

-- user_roles: All authenticated users can read roles
CREATE POLICY "Authenticated users can read roles"
  ON user_roles FOR SELECT
  TO authenticated
  USING (true);

-- user_profiles: Users can view their own profile
CREATE POLICY "Users can view own profile"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- user_profiles: Superusers can view all profiles
CREATE POLICY "Superusers can view all profiles"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (is_superuser());

-- user_profiles: Users can update their own profile (limited fields)
CREATE POLICY "Users can update own display_name"
  ON user_profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- user_profiles: Superusers can update any profile
CREATE POLICY "Superusers can update any profile"
  ON user_profiles FOR UPDATE
  TO authenticated
  USING (is_superuser())
  WITH CHECK (is_superuser());

-- user_invitations: Only superusers can manage invitations
CREATE POLICY "Superusers can manage invitations"
  ON user_invitations FOR ALL
  TO authenticated
  USING (is_superuser())
  WITH CHECK (is_superuser());

-- ============================================
-- PART 5: ROW LEVEL SECURITY - APPLICATION TABLES
-- ============================================

-- Enable RLS on all application tables
ALTER TABLE domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopify_catalog_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE reconcile_results ENABLE ROW LEVEL SECURITY;

-- domains: All authenticated users can read
CREATE POLICY "Authenticated users can read domains"
  ON domains FOR SELECT
  TO authenticated
  USING (has_role('viewer'));

-- domains: Admins+ can manage
CREATE POLICY "Admins can manage domains"
  ON domains FOR ALL
  TO authenticated
  USING (has_role('admin'))
  WITH CHECK (has_role('admin'));

-- product_pages: All authenticated users can read
CREATE POLICY "Authenticated users can read product_pages"
  ON product_pages FOR SELECT
  TO authenticated
  USING (has_role('viewer'));

-- product_pages: Admins+ can manage
CREATE POLICY "Admins can manage product_pages"
  ON product_pages FOR ALL
  TO authenticated
  USING (has_role('admin'))
  WITH CHECK (has_role('admin'));

-- price_history: All authenticated users can read
CREATE POLICY "Authenticated users can read price_history"
  ON price_history FOR SELECT
  TO authenticated
  USING (has_role('viewer'));

-- price_history: Admins+ can manage
CREATE POLICY "Admins can manage price_history"
  ON price_history FOR ALL
  TO authenticated
  USING (has_role('admin'))
  WITH CHECK (has_role('admin'));

-- offers: All authenticated users can read
CREATE POLICY "Authenticated users can read offers"
  ON offers FOR SELECT
  TO authenticated
  USING (has_role('viewer'));

-- offers: Admins+ can manage
CREATE POLICY "Admins can manage offers"
  ON offers FOR ALL
  TO authenticated
  USING (has_role('admin'))
  WITH CHECK (has_role('admin'));

-- shopify_catalog_cache: All authenticated users can read
CREATE POLICY "Authenticated users can read shopify_catalog_cache"
  ON shopify_catalog_cache FOR SELECT
  TO authenticated
  USING (has_role('viewer'));

-- shopify_catalog_cache: Admins+ can manage
CREATE POLICY "Admins can manage shopify_catalog_cache"
  ON shopify_catalog_cache FOR ALL
  TO authenticated
  USING (has_role('admin'))
  WITH CHECK (has_role('admin'));

-- reconcile_results: All authenticated users can read
CREATE POLICY "Authenticated users can read reconcile_results"
  ON reconcile_results FOR SELECT
  TO authenticated
  USING (has_role('viewer'));

-- reconcile_results: Admins+ can manage
CREATE POLICY "Admins can manage reconcile_results"
  ON reconcile_results FOR ALL
  TO authenticated
  USING (has_role('admin'))
  WITH CHECK (has_role('admin'));

-- ============================================
-- PART 6: INITIAL SUPERUSER SETUP
-- ============================================

-- After running this migration, manually create the superuser profile
-- by running this with your actual email:
--
-- INSERT INTO user_profiles (id, email, role_id)
-- SELECT
--   au.id,
--   au.email,
--   (SELECT id FROM user_roles WHERE name = 'superuser')
-- FROM auth.users au
-- WHERE au.email = 'YOUR_EMAIL_HERE'
-- ON CONFLICT (id) DO UPDATE SET role_id = (SELECT id FROM user_roles WHERE name = 'superuser');

-- ============================================
-- ROLLBACK SCRIPT (if needed)
-- ============================================
--
-- -- Drop policies first
-- DROP POLICY IF EXISTS "Authenticated users can read roles" ON user_roles;
-- DROP POLICY IF EXISTS "Users can view own profile" ON user_profiles;
-- DROP POLICY IF EXISTS "Superusers can view all profiles" ON user_profiles;
-- DROP POLICY IF EXISTS "Users can update own display_name" ON user_profiles;
-- DROP POLICY IF EXISTS "Superusers can update any profile" ON user_profiles;
-- DROP POLICY IF EXISTS "Superusers can manage invitations" ON user_invitations;
-- DROP POLICY IF EXISTS "Authenticated users can read domains" ON domains;
-- DROP POLICY IF EXISTS "Admins can manage domains" ON domains;
-- DROP POLICY IF EXISTS "Authenticated users can read product_pages" ON product_pages;
-- DROP POLICY IF EXISTS "Admins can manage product_pages" ON product_pages;
-- DROP POLICY IF EXISTS "Authenticated users can read price_history" ON price_history;
-- DROP POLICY IF EXISTS "Admins can manage price_history" ON price_history;
-- DROP POLICY IF EXISTS "Authenticated users can read offers" ON offers;
-- DROP POLICY IF EXISTS "Admins can manage offers" ON offers;
-- DROP POLICY IF EXISTS "Authenticated users can read shopify_catalog_cache" ON shopify_catalog_cache;
-- DROP POLICY IF EXISTS "Admins can manage shopify_catalog_cache" ON shopify_catalog_cache;
-- DROP POLICY IF EXISTS "Authenticated users can read reconcile_results" ON reconcile_results;
-- DROP POLICY IF EXISTS "Admins can manage reconcile_results" ON reconcile_results;
--
-- -- Disable RLS
-- ALTER TABLE user_roles DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE user_profiles DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE user_invitations DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE domains DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE product_pages DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE price_history DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE offers DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE shopify_catalog_cache DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE reconcile_results DISABLE ROW LEVEL SECURITY;
--
-- -- Drop trigger and functions
-- DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
-- DROP TRIGGER IF EXISTS update_user_profiles_updated_at ON user_profiles;
-- DROP FUNCTION IF EXISTS handle_new_user();
-- DROP FUNCTION IF EXISTS is_superuser();
-- DROP FUNCTION IF EXISTS has_role(TEXT);
-- DROP FUNCTION IF EXISTS get_user_role();
--
-- -- Drop tables
-- DROP TABLE IF EXISTS user_invitations;
-- DROP TABLE IF EXISTS user_profiles;
-- DROP TABLE IF EXISTS user_roles;
