-- ============================================================================
-- Fix infinite recursion in user_profiles RLS policies
-- ============================================================================
-- The original policies in 00001_core_schema.sql referenced user_profiles
-- in inline subqueries, which re-triggered RLS evaluation on the same row
-- and caused "infinite recursion detected in policy for relation
-- user_profiles" at query time.
--
-- The fix routes those checks through SECURITY DEFINER helper functions
-- (already defined in 00001), which bypass RLS during their own execution.
-- ============================================================================

DROP POLICY IF EXISTS user_select ON user_profiles;
DROP POLICY IF EXISTS user_manage ON user_profiles;

CREATE OR REPLACE FUNCTION get_user_role() RETURNS user_role AS $$
    SELECT role FROM user_profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE POLICY user_select ON user_profiles FOR SELECT USING (
    id = auth.uid()
    OR is_super_admin()
    OR tenant_id = get_user_tenant_id()
);

CREATE POLICY user_manage ON user_profiles FOR ALL USING (
    is_super_admin()
    OR (tenant_id = get_user_tenant_id() AND get_user_role() = 'tenant_admin')
);
