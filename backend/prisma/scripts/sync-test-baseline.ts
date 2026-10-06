import { Client } from "pg";

async function syncBaseline() {
  const dbUrl = process.env.DATABASE_URL || "postgresql://cdrecruit:cdrecruit123@127.0.0.1:5434/cdrecruit_test?schema=public";
  const pg = new Client({ connectionString: dbUrl });
  await pg.connect();

  try {
    await pg.query("ALTER TABLE billing.session_billing_evidence DISABLE TRIGGER ALL");
    await pg.query("ALTER TABLE billing.billing_audit_event DISABLE TRIGGER ALL");
    await pg.query("ALTER TABLE billing.credit_ledger_entry DISABLE TRIGGER ALL");
    await pg.query("ALTER TABLE billing.credit_pool DISABLE TRIGGER ALL");

    await pg.query("DELETE FROM billing.billing_audit_event WHERE subject_id LIKE 'pool-ledger-%' OR subject_id LIKE 'ba-ledger-%'");
    await pg.query("DELETE FROM billing.credit_ledger_entry WHERE billing_account_id LIKE 'ba-ledger-%'");
    await pg.query("DELETE FROM public.session WHERE organization_id LIKE 'org-ledger-%'");
    await pg.query("DELETE FROM billing.manual_billing_request WHERE id LIKE 'req-ledger-%'");
    await pg.query("DELETE FROM billing.credit_pool WHERE billing_account_id LIKE 'ba-ledger-%'");
    await pg.query("DELETE FROM public.organization WHERE id LIKE 'org-ledger-%'");
    await pg.query("DELETE FROM billing.billing_account WHERE id LIKE 'ba-ledger-%'");

    // Check if Globex exists
    const globexOrgRes = await pg.query("SELECT id FROM public.organization WHERE slug = 'globex-corp'");
    if (globexOrgRes.rows.length === 0) {
      const globexBaId = "b026e179-8d9e-447f-85da-8312c75099fe";
      const globexOrgId = "b2222222-2222-2222-2222-222222222222";
      const globexPoolId = "faa7f15c-3259-4f18-abfb-af91cfc4d1eb";

      await pg.query(`
        INSERT INTO billing.billing_account (id, name, billing_country, currency, status, overdraft_limit, overdraft_used, created_at, updated_at)
        VALUES ($1, 'Globex Industries', 'IN', 'INR', 'ACTIVE', 0, 0, clock_timestamp(), clock_timestamp())
        ON CONFLICT (id) DO NOTHING;
      `, [globexBaId]);

      await pg.query(`
        INSERT INTO public.organization (id, name, slug, billing_account_id, created_at)
        VALUES ($1, 'Globex Industries', 'globex-corp', $2, clock_timestamp())
        ON CONFLICT (id) DO NOTHING;
      `, [globexOrgId, globexBaId]);

      await pg.query(`
        INSERT INTO billing.credit_pool (
          id, billing_account_id, pool_type, name, source, total_credits,
          cached_remaining, status, unit_price_minor, currency, expires_at
        ) VALUES (
          $1, $2, 'TALENT_RESERVE', 'Promotional Trial Pool', 'TRIAL', 50,
          50, 'ACTIVE', 5000, 'INR', clock_timestamp() + interval '365 days'
        ) ON CONFLICT (id) DO NOTHING;
      `, [globexPoolId, globexBaId]);

      await pg.query(`
        INSERT INTO billing.credit_ledger_entry (
          id, billing_account_id, organization_id, credit_pool_id,
          entry_type, amount, balance_after, grant_source, reason,
          idempotency_key, actor_id, shadow, created_at
        ) VALUES (
          '46eec7cf-fd3c-4764-8973-4c80d225c06f', $1, $2, $3,
          'GRANT', 50, 50, 'TRIAL', 'PROMOTIONAL_SEED_GRANT',
          'seed:grant:trial:faa7f15c-3259-4f18-abfb-af91cfc4d1eb', 'system', false, clock_timestamp()
        ) ON CONFLICT (id) DO NOTHING;
      `, [globexBaId, globexOrgId, globexPoolId]);
      console.log("Seeded Globex Industries into cdrecruit_test");
    }

    await pg.query("ALTER TABLE billing.credit_pool ENABLE TRIGGER ALL");
    await pg.query("ALTER TABLE billing.credit_ledger_entry ENABLE TRIGGER ALL");
    await pg.query("ALTER TABLE billing.billing_audit_event ENABLE TRIGGER ALL");
    await pg.query("ALTER TABLE billing.session_billing_evidence ENABLE TRIGGER ALL");

    console.log("cdrecruit_test synced and cleaned successfully.");
  } finally {
    await pg.end();
  }
}

syncBaseline().catch((err) => {
  console.error(err);
  process.exit(1);
});
