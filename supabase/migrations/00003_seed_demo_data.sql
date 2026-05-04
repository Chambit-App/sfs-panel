-- ============================================================================
-- Seed demo data for SFSPanel
-- ============================================================================
-- Creates one tenant + one firm with realistic Turkish hospitality data so
-- the dashboard, reports, budget, bank, and consolidated pages have content
-- to render in production. Idempotent: skipped entirely if the demo tenant
-- already exists.
-- ============================================================================

DO $$
DECLARE
  v_tenant_id UUID;
  v_firm_id UUID;

  -- Chart of accounts (gelir 600s, gider 700s)
  v_coa_konaklama UUID;
  v_coa_yiyecek UUID;
  v_coa_diger_gelir UUID;
  v_coa_personel UUID;
  v_coa_kira UUID;
  v_coa_elektrik UUID;
  v_coa_su UUID;
  v_coa_dogalgaz UUID;
  v_coa_temizlik UUID;
  v_coa_pazarlama UUID;

  -- Category items
  v_cat_oda UUID;
  v_cat_restaurant UUID;
  v_cat_minibar UUID;
  v_cat_maas UUID;
  v_cat_kira_bd UUID;
  v_cat_elektrik_fat UUID;
  v_cat_su_fat UUID;
  v_cat_dogalgaz_fat UUID;
  v_cat_temizlik_malz UUID;
  v_cat_reklam UUID;

  -- Cariler
  v_cari_acente1 UUID;
  v_cari_acente2 UUID;
  v_cari_kurumsal UUID;
  v_cari_personel_t UUID;
  v_cari_emlakci UUID;
  v_cari_bedas UUID;
  v_cari_iski UUID;
  v_cari_igdas UUID;
  v_cari_temizlik_t UUID;
  v_cari_ajans UUID;

  -- Bankalar
  v_bank_vakif UUID;
  v_bank_is UUID;
  v_bank_garanti UUID;
BEGIN
  -- Skip if demo already seeded
  IF EXISTS (SELECT 1 FROM tenants WHERE name = 'Demo Otelcilik A.Ş.') THEN
    RAISE NOTICE 'Demo data already seeded, skipping.';
    RETURN;
  END IF;

  -- Tenant + firm
  INSERT INTO tenants (name, tax_no, status, plan)
  VALUES ('Demo Otelcilik A.Ş.', '1234567890', 'active', 'pro')
  RETURNING id INTO v_tenant_id;

  INSERT INTO firms (tenant_id, name, tax_no, address, phone)
  VALUES (v_tenant_id, 'Demo Otel İstanbul', '1234567890',
          'Beyoğlu / İstanbul', '+90 212 555 0100')
  RETURNING id INTO v_firm_id;

  -- Chart of accounts: 600 (gelir), 700 (gider)
  INSERT INTO chart_of_accounts (firm_id, code, name, type, parent_code) VALUES
    (v_firm_id, '600.10', 'Konaklama Gelirleri', 'GELIR', '600'),
    (v_firm_id, '600.20', 'Yiyecek & İçecek Gelirleri', 'GELIR', '600'),
    (v_firm_id, '600.90', 'Diğer Gelirler', 'GELIR', '600'),
    (v_firm_id, '700.10', 'Personel Giderleri', 'GIDER', '700'),
    (v_firm_id, '700.20', 'Kira Giderleri', 'GIDER', '700'),
    (v_firm_id, '700.30', 'Elektrik Giderleri', 'GIDER', '700'),
    (v_firm_id, '700.40', 'Su Giderleri', 'GIDER', '700'),
    (v_firm_id, '700.50', 'Doğalgaz Giderleri', 'GIDER', '700'),
    (v_firm_id, '700.60', 'Temizlik & Sarf Giderleri', 'GIDER', '700'),
    (v_firm_id, '700.70', 'Pazarlama Giderleri', 'GIDER', '700');

  SELECT id INTO v_coa_konaklama   FROM chart_of_accounts WHERE firm_id = v_firm_id AND code = '600.10';
  SELECT id INTO v_coa_yiyecek     FROM chart_of_accounts WHERE firm_id = v_firm_id AND code = '600.20';
  SELECT id INTO v_coa_diger_gelir FROM chart_of_accounts WHERE firm_id = v_firm_id AND code = '600.90';
  SELECT id INTO v_coa_personel    FROM chart_of_accounts WHERE firm_id = v_firm_id AND code = '700.10';
  SELECT id INTO v_coa_kira        FROM chart_of_accounts WHERE firm_id = v_firm_id AND code = '700.20';
  SELECT id INTO v_coa_elektrik    FROM chart_of_accounts WHERE firm_id = v_firm_id AND code = '700.30';
  SELECT id INTO v_coa_su          FROM chart_of_accounts WHERE firm_id = v_firm_id AND code = '700.40';
  SELECT id INTO v_coa_dogalgaz    FROM chart_of_accounts WHERE firm_id = v_firm_id AND code = '700.50';
  SELECT id INTO v_coa_temizlik    FROM chart_of_accounts WHERE firm_id = v_firm_id AND code = '700.60';
  SELECT id INTO v_coa_pazarlama   FROM chart_of_accounts WHERE firm_id = v_firm_id AND code = '700.70';

  -- Category items
  INSERT INTO category_items (firm_id, chart_account_id, type, name, default_payment_term_days) VALUES
    (v_firm_id, v_coa_konaklama, 'GELIR', 'Oda Satışı', 0),
    (v_firm_id, v_coa_yiyecek,   'GELIR', 'Restaurant', 0),
    (v_firm_id, v_coa_yiyecek,   'GELIR', 'Minibar', 0),
    (v_firm_id, v_coa_personel,  'GIDER', 'Maaş Ödemesi', 0),
    (v_firm_id, v_coa_kira,      'GIDER', 'Bina Kirası', 5),
    (v_firm_id, v_coa_elektrik,  'GIDER', 'Elektrik Faturası', 15),
    (v_firm_id, v_coa_su,        'GIDER', 'Su Faturası', 15),
    (v_firm_id, v_coa_dogalgaz,  'GIDER', 'Doğalgaz Faturası', 15),
    (v_firm_id, v_coa_temizlik,  'GIDER', 'Temizlik Malzemesi', 30),
    (v_firm_id, v_coa_pazarlama, 'GIDER', 'Reklam', 30);

  SELECT id INTO v_cat_oda           FROM category_items WHERE firm_id = v_firm_id AND name = 'Oda Satışı'         AND type = 'GELIR';
  SELECT id INTO v_cat_restaurant    FROM category_items WHERE firm_id = v_firm_id AND name = 'Restaurant'         AND type = 'GELIR';
  SELECT id INTO v_cat_minibar       FROM category_items WHERE firm_id = v_firm_id AND name = 'Minibar'            AND type = 'GELIR';
  SELECT id INTO v_cat_maas          FROM category_items WHERE firm_id = v_firm_id AND name = 'Maaş Ödemesi'       AND type = 'GIDER';
  SELECT id INTO v_cat_kira_bd       FROM category_items WHERE firm_id = v_firm_id AND name = 'Bina Kirası'        AND type = 'GIDER';
  SELECT id INTO v_cat_elektrik_fat  FROM category_items WHERE firm_id = v_firm_id AND name = 'Elektrik Faturası'  AND type = 'GIDER';
  SELECT id INTO v_cat_su_fat        FROM category_items WHERE firm_id = v_firm_id AND name = 'Su Faturası'        AND type = 'GIDER';
  SELECT id INTO v_cat_dogalgaz_fat  FROM category_items WHERE firm_id = v_firm_id AND name = 'Doğalgaz Faturası'  AND type = 'GIDER';
  SELECT id INTO v_cat_temizlik_malz FROM category_items WHERE firm_id = v_firm_id AND name = 'Temizlik Malzemesi' AND type = 'GIDER';
  SELECT id INTO v_cat_reklam        FROM category_items WHERE firm_id = v_firm_id AND name = 'Reklam'             AND type = 'GIDER';

  -- Cari accounts
  INSERT INTO cari_accounts (firm_id, type, name, tax_no, phone, email, payment_term_days) VALUES
    (v_firm_id, 'MUSTERI',  'Booking.com Türkiye',     '1112223334', '+90 212 555 0001', 'tr@booking.com',     30),
    (v_firm_id, 'MUSTERI',  'Etstur Acentesi',         '2223334445', '+90 212 555 0002', 'kurumsal@etstur.com', 15),
    (v_firm_id, 'MUSTERI',  'ABC Holding A.Ş.',        '3334445556', '+90 212 555 0003', 'finans@abcholding.com', 0),
    (v_firm_id, 'TEDARIKCI', 'Personel (Maaş)',         NULL,         NULL,              NULL,                  0),
    (v_firm_id, 'TEDARIKCI', 'Beyoğlu Emlak Ltd.',      '4445556667', '+90 212 555 0010', NULL,                  0),
    (v_firm_id, 'TEDARIKCI', 'BEDAŞ',                   NULL,         '186',             NULL,                  15),
    (v_firm_id, 'TEDARIKCI', 'İSKİ',                    NULL,         '185',             NULL,                  15),
    (v_firm_id, 'TEDARIKCI', 'İGDAŞ',                   NULL,         '187',             NULL,                  15),
    (v_firm_id, 'TEDARIKCI', 'Temizlik Toptan A.Ş.',    '5556667778', '+90 212 555 0020', NULL,                 30),
    (v_firm_id, 'TEDARIKCI', 'Reklam Ajansı Ltd.',      '6667778889', '+90 212 555 0030', NULL,                 30);

  SELECT id INTO v_cari_acente1     FROM cari_accounts WHERE firm_id = v_firm_id AND name = 'Booking.com Türkiye';
  SELECT id INTO v_cari_acente2     FROM cari_accounts WHERE firm_id = v_firm_id AND name = 'Etstur Acentesi';
  SELECT id INTO v_cari_kurumsal    FROM cari_accounts WHERE firm_id = v_firm_id AND name = 'ABC Holding A.Ş.';
  SELECT id INTO v_cari_personel_t  FROM cari_accounts WHERE firm_id = v_firm_id AND name = 'Personel (Maaş)';
  SELECT id INTO v_cari_emlakci     FROM cari_accounts WHERE firm_id = v_firm_id AND name = 'Beyoğlu Emlak Ltd.';
  SELECT id INTO v_cari_bedas       FROM cari_accounts WHERE firm_id = v_firm_id AND name = 'BEDAŞ';
  SELECT id INTO v_cari_iski        FROM cari_accounts WHERE firm_id = v_firm_id AND name = 'İSKİ';
  SELECT id INTO v_cari_igdas       FROM cari_accounts WHERE firm_id = v_firm_id AND name = 'İGDAŞ';
  SELECT id INTO v_cari_temizlik_t  FROM cari_accounts WHERE firm_id = v_firm_id AND name = 'Temizlik Toptan A.Ş.';
  SELECT id INTO v_cari_ajans       FROM cari_accounts WHERE firm_id = v_firm_id AND name = 'Reklam Ajansı Ltd.';

  -- Bank accounts
  INSERT INTO bank_accounts (firm_id, bank_name, account_no, iban, currency) VALUES
    (v_firm_id, 'Vakıfbank',     '00158007310000001', 'TR330006400000100015800731', 'TRY'),
    (v_firm_id, 'İş Bankası',    '40010110123456789', 'TR640006400000140010110123', 'TRY'),
    (v_firm_id, 'Garanti BBVA',  '12345678',          'TR830006200000400012345678', 'TRY');

  SELECT id INTO v_bank_vakif   FROM bank_accounts WHERE firm_id = v_firm_id AND bank_name = 'Vakıfbank';
  SELECT id INTO v_bank_is      FROM bank_accounts WHERE firm_id = v_firm_id AND bank_name = 'İş Bankası';
  SELECT id INTO v_bank_garanti FROM bank_accounts WHERE firm_id = v_firm_id AND bank_name = 'Garanti BBVA';

  -- Transactions: spread across previous month, current month, and a few future
  -- (current_date is 2026-05-04 per system date)
  INSERT INTO transactions (firm_id, cari_id, category_id, bank_id, type, invoice_no, invoice_date, due_date, payment_term_days, amount, status, description) VALUES
    -- Previous month (April 2026) - paid
    (v_firm_id, v_cari_acente1, v_cat_oda,         v_bank_vakif,   'GELIR', 'BK-2604-001', '2026-04-03', '2026-04-03', 0,   145000.00, 'ODENDI',   'Booking.com Nisan 1. hafta'),
    (v_firm_id, v_cari_acente2, v_cat_oda,         v_bank_is,      'GELIR', 'ETS-2604-002','2026-04-12', '2026-04-12', 0,   98000.00,  'ODENDI',   'Etstur Nisan 2. hafta'),
    (v_firm_id, v_cari_acente1, v_cat_oda,         v_bank_vakif,   'GELIR', 'BK-2604-003', '2026-04-22', '2026-04-22', 0,   132000.00, 'ODENDI',   'Booking.com Nisan 3. hafta'),
    (v_firm_id, v_cari_kurumsal,v_cat_restaurant,  v_bank_garanti, 'GELIR', 'AB-2604-001', '2026-04-15', '2026-04-15', 0,   24500.00,  'ODENDI',   'ABC Holding etkinlik'),

    (v_firm_id, v_cari_personel_t, v_cat_maas,         v_bank_is,      'GIDER', 'MAS-2604',    '2026-04-30', '2026-04-30', 0,    220000.00, 'ODENDI', 'Nisan personel maaşları'),
    (v_firm_id, v_cari_emlakci,    v_cat_kira_bd,      v_bank_vakif,   'GIDER', 'KIR-2604',    '2026-04-05', '2026-04-05', 0,    85000.00,  'ODENDI', 'Nisan kirası'),
    (v_firm_id, v_cari_bedas,      v_cat_elektrik_fat, v_bank_garanti, 'GIDER', 'ELK-2604',    '2026-04-10', '2026-04-25', 15,   42000.00,  'ODENDI', 'Nisan elektrik'),
    (v_firm_id, v_cari_igdas,      v_cat_dogalgaz_fat, v_bank_garanti, 'GIDER', 'DGZ-2604',    '2026-04-10', '2026-04-25', 15,   18500.00,  'ODENDI', 'Nisan doğalgaz'),
    (v_firm_id, v_cari_iski,       v_cat_su_fat,       v_bank_garanti, 'GIDER', 'SU-2604',     '2026-04-10', '2026-04-25', 15,   6800.00,   'ODENDI', 'Nisan su'),
    (v_firm_id, v_cari_temizlik_t, v_cat_temizlik_malz,v_bank_is,      'GIDER', 'TMZ-2604',    '2026-04-08', '2026-05-08', 30,   12500.00,  'ODENDI', 'Nisan temizlik malzemeleri'),

    -- Current month (May 2026)
    (v_firm_id, v_cari_acente1, v_cat_oda,         v_bank_vakif,   'GELIR', 'BK-2605-001', '2026-05-02', '2026-05-02', 0,   158000.00, 'ODENDI', 'Booking.com Mayıs 1. hafta'),
    (v_firm_id, v_cari_acente2, v_cat_oda,         v_bank_is,      'GELIR', 'ETS-2605-001','2026-05-03', '2026-05-03', 0,   112000.00, 'ODENDI', 'Etstur Mayıs 1. hafta'),
    (v_firm_id, v_cari_kurumsal,v_cat_restaurant,  v_bank_garanti, 'GELIR', 'AB-2605-001', '2026-05-04', '2026-05-04', 0,   31200.00,  'ODENDI', 'ABC Holding toplantı'),

    -- Pending (BEKLIYOR) - some overdue, some upcoming
    (v_firm_id, v_cari_acente1, v_cat_oda,         NULL,           'GELIR', 'BK-2605-002', '2026-05-04', '2026-04-28', 0,   89000.00,  'BEKLIYOR', 'Booking.com geç ödeme - vadesi geçti'),
    (v_firm_id, v_cari_kurumsal,v_cat_restaurant,  NULL,           'GELIR', 'AB-2605-002', '2026-05-04', '2026-05-10', 6,   15600.00,  'BEKLIYOR', 'Yaklaşan tahsilat'),

    (v_firm_id, v_cari_bedas,   v_cat_elektrik_fat,NULL,           'GIDER', 'ELK-2605',    '2026-05-04', '2026-05-15', 11,  46500.00,  'BEKLIYOR', 'Mayıs elektrik faturası'),
    (v_firm_id, v_cari_igdas,   v_cat_dogalgaz_fat,NULL,           'GIDER', 'DGZ-2605',    '2026-05-04', '2026-05-15', 11,  14200.00,  'BEKLIYOR', 'Mayıs doğalgaz'),
    (v_firm_id, v_cari_iski,    v_cat_su_fat,      NULL,           'GIDER', 'SU-2605',     '2026-05-04', '2026-04-29', 0,   7200.00,   'BEKLIYOR', 'Nisan-Mayıs su faturası - vadesi geçti'),
    (v_firm_id, v_cari_emlakci, v_cat_kira_bd,     NULL,           'GIDER', 'KIR-2605',    '2026-05-04', '2026-05-05', 1,   85000.00,  'BEKLIYOR', 'Mayıs kirası'),
    (v_firm_id, v_cari_ajans,   v_cat_reklam,      NULL,           'GIDER', 'REK-2605',    '2026-05-04', '2026-06-03', 30,  18000.00,  'BEKLIYOR', 'Mayıs reklam kampanyası'),

    -- March 2026 - additional history for trend chart
    (v_firm_id, v_cari_acente1, v_cat_oda,         v_bank_vakif,   'GELIR', 'BK-2603-001', '2026-03-05', '2026-03-05', 0,   126000.00, 'ODENDI', 'Booking.com Mart'),
    (v_firm_id, v_cari_acente2, v_cat_oda,         v_bank_is,      'GELIR', 'ETS-2603-001','2026-03-15', '2026-03-15', 0,   84000.00,  'ODENDI', 'Etstur Mart'),
    (v_firm_id, v_cari_personel_t, v_cat_maas,    v_bank_is,      'GIDER', 'MAS-2603',    '2026-03-31', '2026-03-31', 0,   215000.00, 'ODENDI', 'Mart maaşları'),
    (v_firm_id, v_cari_emlakci,    v_cat_kira_bd, v_bank_vakif,   'GIDER', 'KIR-2603',    '2026-03-05', '2026-03-05', 0,   85000.00,  'ODENDI', 'Mart kirası'),
    (v_firm_id, v_cari_bedas,      v_cat_elektrik_fat, v_bank_garanti, 'GIDER', 'ELK-2603','2026-03-10', '2026-03-25', 15,  38000.00,  'ODENDI', 'Mart elektrik');

  -- Bank transfers
  INSERT INTO bank_transfers (firm_id, from_bank_id, to_bank_id, amount, transfer_date, description) VALUES
    (v_firm_id, v_bank_vakif,   v_bank_is,      150000.00, '2026-04-15', 'Maaş hesabına aktarım'),
    (v_firm_id, v_bank_garanti, v_bank_vakif,    50000.00, '2026-04-20', 'Operasyon hesabı takviyesi'),
    (v_firm_id, v_bank_is,      v_bank_garanti,  25000.00, '2026-04-28', 'Fatura ödemeleri için'),
    (v_firm_id, v_bank_vakif,   v_bank_is,      200000.00, '2026-05-01', 'Mayıs maaş aktarımı'),
    (v_firm_id, v_bank_garanti, v_bank_vakif,    35000.00, '2026-05-03', 'Cari operasyon');

  -- Budget plans for current year (monthly targets per major chart account)
  INSERT INTO budget_plans (firm_id, year, month, chart_account_id, planned_amount)
  SELECT v_firm_id, 2026, m, coa_id, amt FROM (VALUES
    (v_coa_konaklama,  280000.00),
    (v_coa_yiyecek,     45000.00),
    (v_coa_personel,   220000.00),
    (v_coa_kira,        85000.00),
    (v_coa_elektrik,    45000.00),
    (v_coa_su,           7500.00),
    (v_coa_dogalgaz,    20000.00),
    (v_coa_temizlik,    13000.00),
    (v_coa_pazarlama,   20000.00)
  ) AS t(coa_id, amt)
  CROSS JOIN generate_series(1, 12) AS m;

  RAISE NOTICE 'Demo data seeded: tenant=%, firm=%', v_tenant_id, v_firm_id;
END $$;
