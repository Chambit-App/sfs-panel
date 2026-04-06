-- ============================================================================
-- SFSPanel Core Schema
-- Multi-tenant financial management platform
-- ============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- ENUMS
-- ============================================================================

CREATE TYPE tenant_status AS ENUM ('active', 'inactive', 'suspended');
CREATE TYPE tenant_plan AS ENUM ('basic', 'pro', 'enterprise');
CREATE TYPE user_role AS ENUM ('super_admin', 'tenant_admin', 'firm_manager', 'accountant', 'viewer');
CREATE TYPE account_type AS ENUM ('GELIR', 'GIDER');
CREATE TYPE cari_type AS ENUM ('MUSTERI', 'TEDARIKCI');
CREATE TYPE transaction_type AS ENUM ('GELIR', 'GIDER');
CREATE TYPE transaction_status AS ENUM ('BEKLIYOR', 'ODENDI', 'IPTAL');

-- ============================================================================
-- CORE TABLES
-- ============================================================================

-- Tenants (Customer Groups)
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    tax_no TEXT,
    status tenant_status NOT NULL DEFAULT 'active',
    plan tenant_plan NOT NULL DEFAULT 'basic',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Firms (Properties within a tenant)
CREATE TABLE firms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    tax_no TEXT,
    address TEXT,
    phone TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_firms_tenant ON firms(tenant_id);

-- User Profiles (extends Supabase auth.users)
CREATE TABLE user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
    firm_id UUID REFERENCES firms(id) ON DELETE SET NULL,
    role user_role NOT NULL DEFAULT 'viewer',
    full_name TEXT NOT NULL,
    is_super_admin BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_profiles_tenant ON user_profiles(tenant_id);
CREATE INDEX idx_user_profiles_firm ON user_profiles(firm_id);

-- ============================================================================
-- FINANCIAL MASTER DATA
-- ============================================================================

-- Chart of Accounts (Tek Duzen Hesap Plani)
CREATE TABLE chart_of_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    code TEXT NOT NULL,              -- e.g. "600.10.01"
    name TEXT NOT NULL,              -- e.g. "KONAKLAMA GELİRLERİ (%10 KDV)"
    type account_type NOT NULL,
    parent_code TEXT,                -- e.g. "600.10" for grouping
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(firm_id, code)
);

CREATE INDEX idx_coa_firm ON chart_of_accounts(firm_id);
CREATE INDEX idx_coa_type ON chart_of_accounts(firm_id, type);
CREATE INDEX idx_coa_parent ON chart_of_accounts(firm_id, parent_code);

-- Category Items (Gelir/Gider Kalemleri with payment terms)
CREATE TABLE category_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    chart_account_id UUID REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
    type account_type NOT NULL,
    name TEXT NOT NULL,
    default_payment_term_days INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(firm_id, name, type)
);

CREATE INDEX idx_category_items_firm ON category_items(firm_id);
CREATE INDEX idx_category_items_type ON category_items(firm_id, type);

-- Current Accounts (Cariler - Customers & Suppliers)
CREATE TABLE cari_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    type cari_type NOT NULL,
    name TEXT NOT NULL,
    tax_no TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    payment_term_days INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cari_firm ON cari_accounts(firm_id);
CREATE INDEX idx_cari_type ON cari_accounts(firm_id, type);

-- Bank Accounts
CREATE TABLE bank_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    bank_name TEXT NOT NULL,
    account_no TEXT,
    iban TEXT,
    currency TEXT NOT NULL DEFAULT 'TRY',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_bank_firm ON bank_accounts(firm_id);

-- ============================================================================
-- TRANSACTIONAL TABLES
-- ============================================================================

-- Transactions (Odemeler + Tahsilatlar)
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    cari_id UUID NOT NULL REFERENCES cari_accounts(id) ON DELETE RESTRICT,
    category_id UUID REFERENCES category_items(id) ON DELETE SET NULL,
    bank_id UUID REFERENCES bank_accounts(id) ON DELETE SET NULL,
    type transaction_type NOT NULL,
    invoice_no TEXT,
    invoice_date DATE NOT NULL,
    due_date DATE NOT NULL,
    payment_term_days INT NOT NULL DEFAULT 0,
    amount NUMERIC(15,2) NOT NULL CHECK (amount > 0),
    status transaction_status NOT NULL DEFAULT 'BEKLIYOR',
    description TEXT,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_txn_firm ON transactions(firm_id);
CREATE INDEX idx_txn_cari ON transactions(cari_id);
CREATE INDEX idx_txn_type ON transactions(firm_id, type);
CREATE INDEX idx_txn_status ON transactions(firm_id, status);
CREATE INDEX idx_txn_due_date ON transactions(firm_id, due_date);
CREATE INDEX idx_txn_invoice_date ON transactions(firm_id, invoice_date);
CREATE INDEX idx_txn_bank ON transactions(bank_id);

-- Bank Transfers
CREATE TABLE bank_transfers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    from_bank_id UUID NOT NULL REFERENCES bank_accounts(id) ON DELETE RESTRICT,
    to_bank_id UUID NOT NULL REFERENCES bank_accounts(id) ON DELETE RESTRICT,
    amount NUMERIC(15,2) NOT NULL CHECK (amount > 0),
    transfer_date DATE NOT NULL,
    description TEXT,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (from_bank_id != to_bank_id)
);

CREATE INDEX idx_transfer_firm ON bank_transfers(firm_id);
CREATE INDEX idx_transfer_date ON bank_transfers(firm_id, transfer_date);

-- Budget Plans
CREATE TABLE budget_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    year INT NOT NULL CHECK (year >= 2020 AND year <= 2100),
    month INT NOT NULL CHECK (month >= 1 AND month <= 12),
    chart_account_id UUID NOT NULL REFERENCES chart_of_accounts(id) ON DELETE CASCADE,
    planned_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(firm_id, year, month, chart_account_id)
);

CREATE INDEX idx_budget_firm_year ON budget_plans(firm_id, year);

-- ============================================================================
-- COMPUTED VIEWS
-- ============================================================================

-- Bank balance computed view
CREATE OR REPLACE VIEW bank_account_balances AS
SELECT
    ba.id,
    ba.firm_id,
    ba.bank_name,
    ba.account_no,
    ba.iban,
    ba.currency,
    ba.is_active,
    COALESCE(income.total, 0) - COALESCE(expense.total, 0)
    + COALESCE(transfer_in.total, 0) - COALESCE(transfer_out.total, 0) AS balance
FROM bank_accounts ba
LEFT JOIN (
    SELECT bank_id, SUM(amount) AS total
    FROM transactions
    WHERE type = 'GELIR' AND status = 'ODENDI'
    GROUP BY bank_id
) income ON income.bank_id = ba.id
LEFT JOIN (
    SELECT bank_id, SUM(amount) AS total
    FROM transactions
    WHERE type = 'GIDER' AND status = 'ODENDI'
    GROUP BY bank_id
) expense ON expense.bank_id = ba.id
LEFT JOIN (
    SELECT to_bank_id AS bank_id, SUM(amount) AS total
    FROM bank_transfers
    GROUP BY to_bank_id
) transfer_in ON transfer_in.bank_id = ba.id
LEFT JOIN (
    SELECT from_bank_id AS bank_id, SUM(amount) AS total
    FROM bank_transfers
    GROUP BY from_bank_id
) transfer_out ON transfer_out.bank_id = ba.id;

-- Budget vs Actual view
CREATE OR REPLACE VIEW budget_vs_actual AS
SELECT
    bp.id,
    bp.firm_id,
    bp.year,
    bp.month,
    bp.chart_account_id,
    coa.code AS account_code,
    coa.name AS account_name,
    coa.type AS account_type,
    bp.planned_amount,
    COALESCE(actual.total, 0) AS actual_amount,
    COALESCE(actual.total, 0) - bp.planned_amount AS variance,
    CASE
        WHEN bp.planned_amount = 0 THEN 0
        ELSE (COALESCE(actual.total, 0) - bp.planned_amount) / bp.planned_amount
    END AS variance_pct
FROM budget_plans bp
JOIN chart_of_accounts coa ON coa.id = bp.chart_account_id
LEFT JOIN (
    SELECT
        t.firm_id,
        ci.chart_account_id,
        EXTRACT(YEAR FROM t.invoice_date)::INT AS year,
        EXTRACT(MONTH FROM t.invoice_date)::INT AS month,
        SUM(t.amount) AS total
    FROM transactions t
    JOIN category_items ci ON ci.id = t.category_id
    WHERE t.status != 'IPTAL'
    GROUP BY t.firm_id, ci.chart_account_id, year, month
) actual ON actual.firm_id = bp.firm_id
    AND actual.chart_account_id = bp.chart_account_id
    AND actual.year = bp.year
    AND actual.month = bp.month;

-- Cari account balance view
CREATE OR REPLACE VIEW cari_account_balances AS
SELECT
    ca.id,
    ca.firm_id,
    ca.type,
    ca.name,
    ca.tax_no,
    ca.phone,
    ca.email,
    ca.address,
    ca.payment_term_days,
    ca.is_active,
    COALESCE(SUM(CASE WHEN t.type = 'GELIR' AND t.status = 'ODENDI' THEN t.amount ELSE 0 END), 0) AS total_gelir,
    COALESCE(SUM(CASE WHEN t.type = 'GIDER' AND t.status = 'ODENDI' THEN t.amount ELSE 0 END), 0) AS total_gider,
    COALESCE(SUM(CASE WHEN t.type = 'GELIR' AND t.status = 'ODENDI' THEN t.amount ELSE 0 END), 0)
    - COALESCE(SUM(CASE WHEN t.type = 'GIDER' AND t.status = 'ODENDI' THEN t.amount ELSE 0 END), 0) AS net_balance,
    COUNT(CASE WHEN t.status = 'BEKLIYOR' AND t.due_date < CURRENT_DATE THEN 1 END) AS overdue_count,
    COALESCE(SUM(CASE WHEN t.status = 'BEKLIYOR' AND t.due_date < CURRENT_DATE THEN t.amount ELSE 0 END), 0) AS overdue_amount
FROM cari_accounts ca
LEFT JOIN transactions t ON t.cari_id = ca.id
GROUP BY ca.id, ca.firm_id, ca.type, ca.name, ca.tax_no, ca.phone, ca.email, ca.address, ca.payment_term_days, ca.is_active;

-- Daily cash flow view (for payment calendar)
CREATE OR REPLACE VIEW daily_cash_flow AS
SELECT
    t.firm_id,
    t.due_date,
    SUM(CASE WHEN t.type = 'GELIR' THEN t.amount ELSE 0 END) AS total_gelir,
    SUM(CASE WHEN t.type = 'GIDER' THEN t.amount ELSE 0 END) AS total_gider,
    SUM(CASE WHEN t.type = 'GELIR' THEN t.amount ELSE 0 END)
    - SUM(CASE WHEN t.type = 'GIDER' THEN t.amount ELSE 0 END) AS net,
    COUNT(CASE WHEN t.type = 'GELIR' THEN 1 END) AS gelir_count,
    COUNT(CASE WHEN t.type = 'GIDER' THEN 1 END) AS gider_count
FROM transactions t
WHERE t.status != 'IPTAL'
GROUP BY t.firm_id, t.due_date;

-- Monthly income/expense summary (for reports)
CREATE OR REPLACE VIEW monthly_income_expense AS
SELECT
    t.firm_id,
    EXTRACT(YEAR FROM t.invoice_date)::INT AS year,
    EXTRACT(MONTH FROM t.invoice_date)::INT AS month,
    coa.code AS account_code,
    coa.name AS account_name,
    coa.type AS account_type,
    coa.parent_code,
    SUM(t.amount) AS total_amount,
    COUNT(*) AS transaction_count
FROM transactions t
JOIN category_items ci ON ci.id = t.category_id
JOIN chart_of_accounts coa ON coa.id = ci.chart_account_id
WHERE t.status != 'IPTAL'
GROUP BY t.firm_id, year, month, coa.code, coa.name, coa.type, coa.parent_code;

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Get current user's tenant_id
CREATE OR REPLACE FUNCTION get_user_tenant_id()
RETURNS UUID AS $$
    SELECT tenant_id FROM user_profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Get current user's firm_id (null = tenant-level)
CREATE OR REPLACE FUNCTION get_user_firm_id()
RETURNS UUID AS $$
    SELECT firm_id FROM user_profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Check if current user is super admin
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN AS $$
    SELECT COALESCE(
        (SELECT is_super_admin FROM user_profiles WHERE id = auth.uid()),
        false
    )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Get the active tenant for super admin (stored in user metadata)
CREATE OR REPLACE FUNCTION get_active_tenant_id()
RETURNS UUID AS $$
BEGIN
    -- Super admins can switch tenants via JWT claim or app_metadata
    IF is_super_admin() THEN
        RETURN COALESCE(
            (auth.jwt() -> 'app_metadata' ->> 'active_tenant_id')::UUID,
            get_user_tenant_id()
        );
    ELSE
        RETURN get_user_tenant_id();
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Auto-calculate due_date trigger
CREATE OR REPLACE FUNCTION calculate_due_date()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.due_date IS NULL OR NEW.due_date = NEW.invoice_date THEN
        NEW.due_date := NEW.invoice_date + NEW.payment_term_days;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_transaction_due_date
    BEFORE INSERT OR UPDATE ON transactions
    FOR EACH ROW
    EXECUTE FUNCTION calculate_due_date();

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tenants_updated_at BEFORE UPDATE ON tenants FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_firms_updated_at BEFORE UPDATE ON firms FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_user_profiles_updated_at BEFORE UPDATE ON user_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_cari_updated_at BEFORE UPDATE ON cari_accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_transactions_updated_at BEFORE UPDATE ON transactions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_budget_updated_at BEFORE UPDATE ON budget_plans FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE firms ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE chart_of_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE category_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE cari_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_plans ENABLE ROW LEVEL SECURITY;

-- Tenants: super admin sees all, others see own tenant
CREATE POLICY tenant_select ON tenants FOR SELECT USING (
    is_super_admin() OR id = get_user_tenant_id()
);
CREATE POLICY tenant_manage ON tenants FOR ALL USING (is_super_admin());

-- Firms: super admin sees all firms, others see own tenant's firms
CREATE POLICY firm_select ON firms FOR SELECT USING (
    is_super_admin() OR tenant_id = get_user_tenant_id()
);
CREATE POLICY firm_insert ON firms FOR INSERT WITH CHECK (
    is_super_admin() OR (tenant_id = get_user_tenant_id() AND
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('tenant_admin')))
);
CREATE POLICY firm_update ON firms FOR UPDATE USING (
    is_super_admin() OR (tenant_id = get_user_tenant_id() AND
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('tenant_admin')))
);
CREATE POLICY firm_delete ON firms FOR DELETE USING (is_super_admin());

-- User profiles: own profile always readable, tenant admins see tenant users, super admins see all
CREATE POLICY user_select ON user_profiles FOR SELECT USING (
    id = auth.uid()
    OR tenant_id = (SELECT tenant_id FROM user_profiles WHERE id = auth.uid())
    OR (SELECT is_super_admin FROM user_profiles WHERE id = auth.uid()) = true
);
CREATE POLICY user_manage ON user_profiles FOR ALL USING (
    (SELECT is_super_admin FROM user_profiles WHERE id = auth.uid()) = true
    OR (tenant_id = (SELECT tenant_id FROM user_profiles WHERE id = auth.uid())
        AND (SELECT role FROM user_profiles WHERE id = auth.uid()) = 'tenant_admin')
);

-- Firm-scoped tables: access if firm belongs to active tenant
-- And if user has firm_id set, restrict to that firm only

CREATE OR REPLACE FUNCTION can_access_firm(target_firm_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    user_firm UUID;
    target_tenant UUID;
BEGIN
    -- Super admin can access any firm
    IF is_super_admin() THEN
        RETURN true;
    END IF;

    -- Get user's firm restriction
    SELECT firm_id INTO user_firm FROM user_profiles WHERE id = auth.uid();

    -- If user is firm-scoped, must match exactly
    IF user_firm IS NOT NULL THEN
        RETURN target_firm_id = user_firm;
    END IF;

    -- Tenant-level user: any firm in their tenant
    SELECT tenant_id INTO target_tenant FROM firms WHERE id = target_firm_id;
    RETURN target_tenant = get_user_tenant_id();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Chart of Accounts
CREATE POLICY coa_select ON chart_of_accounts FOR SELECT USING (can_access_firm(firm_id));
CREATE POLICY coa_insert ON chart_of_accounts FOR INSERT WITH CHECK (can_access_firm(firm_id));
CREATE POLICY coa_update ON chart_of_accounts FOR UPDATE USING (can_access_firm(firm_id));
CREATE POLICY coa_delete ON chart_of_accounts FOR DELETE USING (can_access_firm(firm_id));

-- Category Items
CREATE POLICY cat_select ON category_items FOR SELECT USING (can_access_firm(firm_id));
CREATE POLICY cat_insert ON category_items FOR INSERT WITH CHECK (can_access_firm(firm_id));
CREATE POLICY cat_update ON category_items FOR UPDATE USING (can_access_firm(firm_id));
CREATE POLICY cat_delete ON category_items FOR DELETE USING (can_access_firm(firm_id));

-- Cari Accounts
CREATE POLICY cari_select ON cari_accounts FOR SELECT USING (can_access_firm(firm_id));
CREATE POLICY cari_insert ON cari_accounts FOR INSERT WITH CHECK (can_access_firm(firm_id));
CREATE POLICY cari_update ON cari_accounts FOR UPDATE USING (can_access_firm(firm_id));
CREATE POLICY cari_delete ON cari_accounts FOR DELETE USING (can_access_firm(firm_id));

-- Bank Accounts
CREATE POLICY bank_select ON bank_accounts FOR SELECT USING (can_access_firm(firm_id));
CREATE POLICY bank_insert ON bank_accounts FOR INSERT WITH CHECK (can_access_firm(firm_id));
CREATE POLICY bank_update ON bank_accounts FOR UPDATE USING (can_access_firm(firm_id));
CREATE POLICY bank_delete ON bank_accounts FOR DELETE USING (can_access_firm(firm_id));

-- Transactions
CREATE POLICY txn_select ON transactions FOR SELECT USING (can_access_firm(firm_id));
CREATE POLICY txn_insert ON transactions FOR INSERT WITH CHECK (can_access_firm(firm_id));
CREATE POLICY txn_update ON transactions FOR UPDATE USING (can_access_firm(firm_id));
CREATE POLICY txn_delete ON transactions FOR DELETE USING (
    can_access_firm(firm_id) AND
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('super_admin', 'tenant_admin', 'firm_manager'))
);

-- Bank Transfers
CREATE POLICY bt_select ON bank_transfers FOR SELECT USING (can_access_firm(firm_id));
CREATE POLICY bt_insert ON bank_transfers FOR INSERT WITH CHECK (can_access_firm(firm_id));
CREATE POLICY bt_update ON bank_transfers FOR UPDATE USING (can_access_firm(firm_id));
CREATE POLICY bt_delete ON bank_transfers FOR DELETE USING (
    can_access_firm(firm_id) AND
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('super_admin', 'tenant_admin', 'firm_manager'))
);

-- Budget Plans
CREATE POLICY budget_select ON budget_plans FOR SELECT USING (can_access_firm(firm_id));
CREATE POLICY budget_insert ON budget_plans FOR INSERT WITH CHECK (can_access_firm(firm_id));
CREATE POLICY budget_update ON budget_plans FOR UPDATE USING (can_access_firm(firm_id));
CREATE POLICY budget_delete ON budget_plans FOR DELETE USING (
    can_access_firm(firm_id) AND
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('super_admin', 'tenant_admin', 'firm_manager'))
);
