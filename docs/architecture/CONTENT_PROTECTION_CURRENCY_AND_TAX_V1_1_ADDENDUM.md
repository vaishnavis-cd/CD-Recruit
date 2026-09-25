# Proctora — Content Protection, Currency & Tax: v1.1 Addendum

## Launch scope: United States, Malaysia, India

> **Amends:** [`CONTENT_PROTECTION_CURRENCY_AND_TAX_SPECIFICATION.md`](./CONTENT_PROTECTION_CURRENCY_AND_TAX_SPECIFICATION.md) (v1) — §4.2, §4.3.3, §5.1–§5.5, Appendix B, Appendix C, §6.  
> **Everything else in v1 stands** (Part A layers 1–6, the ports, tax-quote flow, no-surcharge decision).  
> **Convention:** where this addendum and v1 disagree, this addendum wins. Amended sections are marked **REPLACES** or **ADDS**.  
> **Not legal or tax advice.** Every treatment below is an input for your CA and, for Malaysia and the US, a local adviser. Most sources I could check were secondary (advisory blogs and vendor guides), not the tax authorities themselves — see §10.

---

## 0. What changed and why

1. **Country scope** narrows to US, Malaysia, India. The tax matrix (§4.2) is rewritten around those three. Malaysia is **not** a "buyer self-accounts" country the way v1's generic B2B row implied — see §2.3.
2. **Money flows for bank transfers were under-specified.** v1 steers large payments to `MANUAL_INVOICE` but has no receipt flow, and as written that path lets one person mint credits (§5.1). Withholding tax (India TDS, Malaysia WHT) is not modeled at all (§5.2).
3. **Schema corrections** found while reviewing v1's Prisma blocks (§6): integer overflow on money totals, duplicate presentment fields, a `TaxQuote` that cannot be reproduced later, no rounding rule, and a variant-seed placement that cannot trace a leak to a session.

---

## 1. Launch scope and assumptions (ADDS)

| Item | Decision |
|---|---|
| Seller entity | Indian entity (**still needs confirmation** — everything below depends on it) |
| Buyers | Businesses only, tax ID mandatory (unchanged from v1) |
| Supported `billingCountry` | `IN`, `US`, `MY` only. Server-side allowlist (R6). Any other country returns `UNSUPPORTED_COUNTRY` from `TaxPort.quoteTax` and cannot reach checkout |
| Unsupported at launch | EU, UK, Australia, Singapore, UAE and all others. Keep a documented "not supported yet" list; do not quietly treat them as "export, 0%" |
| Currencies | `INR`, `USD` at launch. `MYR` is a decision (§3), not a default |

---

## 2. Tax matrix — REPLACES v1 §4.2

Two layers apply to every sale, and v1 blurred them:

- **Layer 1 — India side (seller):** is this a domestic supply (GST) or an export of services (zero-rated)?
- **Layer 2 — Buyer's country side:** does the buyer's country impose anything on a foreign seller (registration, tax collection) or on the buyer (self-accounting, withholding)?

### 2.1 India buyer (domestic)

| Aspect | Treatment (confirm with CA) |
|---|---|
| Tax | GST, typically 18% for SaaS/IT services. CGST + SGST if buyer's state = seller's state, else IGST |
| Capture | GSTIN, PAN, state (place of supply = buyer location) |
| Tax treatment code | `STANDARD`, lines `GST_CGST`+`GST_SGST` or `GST_IGST` |
| Watch-out: TDS | Some corporate buyers deduct TDS when paying invoices, so cash received < invoice total. Rate depends on the section the buyer applies; CA to confirm. See §5.2 |
| Watch-out: e-invoicing | Whether e-invoicing applies depends on your turnover; CA to confirm |

### 2.2 US buyer

| Aspect | Treatment (confirm with CA and a US tax adviser) |
|---|---|
| India side | Export of services, zero-rated if all five conditions hold (supplier in India; recipient outside India; place of supply outside India; payment in convertible foreign exchange or RBI-permitted INR; not the same legal entity). File a Letter of Undertaking each financial year to invoice without IGST. Keep FIRC/BRC evidence |
| US side | No federal sales tax. **State sales tax is state-by-state**: many states tax SaaS, some do not, and collection obligation starts only at economic nexus. Most states use roughly $100,000 in sales (some also/or 200 transactions); California and Texas use $500,000; New York uses $500,000 **and** 100 transactions. Thresholds change; re-check on a schedule |
| Launch treatment | `NOT_COLLECTED` (new code, §6.3) with an accurate invoice note, until nexus is reached in a state |
| After nexus | Register in that state, switch that state to `STANDARD` with `SALES_TAX` lines from an **independent** tax engine behind `TaxPort` (not Stripe Tax — it couples tax to the gateway) |
| Capture | EIN, billing state, postal code |
| Also | US buyers commonly ask foreign vendors for a **Form W-8BEN-E**. Keep a completed form ready and ask your CA whether any US withholding position applies to SaaS delivered from India (generally understood as a service performed outside the US — confirm) |

### 2.3 Malaysia buyer

This is the row v1 got too generic.

| Aspect | Treatment (confirm with a Malaysian adviser) |
|---|---|
| India side | Same export-of-services logic as §2.2 |
| Malaysia side — foreign digital service regime | Malaysia has a registration regime for **foreign digital service providers** that applies to **both B2B and B2C** sales once digital-service sales to Malaysia pass **RM 500,000 in 12 months**. Above that, you register with the Royal Malaysian Customs Department and charge service tax yourself |
| Rate | Sources disagree: current guides say **8%** for digital services since 1 March 2024; older guides say 6%. Verify against the RMCD notice before coding a rate |
| Below the threshold | No seller obligation. The Malaysian buyer may have to self-account (reverse charge) on imported taxable services — that is the buyer's filing, not yours |
| Launch treatment | `NOT_COLLECTED`, with an accurate invoice note, **plus threshold monitoring** (§7) |
| Is Proctora a "digital service"? | Probably (delivered over the internet with minimal human intervention) — get this confirmed, because it drives both the registration question and the withholding question below |
| **Withholding tax (buyer-side)** | One 2026 guide reports LHDN treats foreign SaaS subscriptions as **royalty**, with **10% withholding** on the gross payment by the Malaysian payer. Classification is contested. Malaysia–India treaty rates for royalties and technical fees are also 10%, so the treaty does not lower it. Practical effect: a Malaysian buyer may pay you 90% of the invoice and remit 10% to LHDN |
| Capture | SSM registration number, TIN (if provided), billing state |

**Contract consequence for Malaysia (and any buyer who may withhold):** add a gross-up clause ("amounts are exclusive of taxes; if the buyer is legally required to withhold, buyer pays such additional amount so that Proctora receives the full invoiced amount") and get a Malaysian adviser's view on whether it is enforceable and whether the withholding position holds for your product. You may be able to claim the withheld amount as a foreign tax credit in India — CA to confirm.

### 2.4 Invoice notes for `NOT_COLLECTED` (draft wording — legal review)

- US: *"No U.S. sales tax has been collected on this invoice. The recipient is responsible for any use tax that may be due in its jurisdiction."*
- Malaysia: *"No Malaysian service tax has been charged on this invoice. The recipient may be required to self-account for service tax on imported services."*
- Export (0% GST under LUT): *"Supply of services exported from India under Letter of Undertaking. Zero-rated supply."*

The point of these notes is the transparency goal in v1 §4.3: the invoice must state what was **not** charged and why, not just show a 0.

---

## 3. Currency and price book for three markets (ADDS)

| Market | Presentment | Notes |
|---|---|---|
| India | INR | Domestic gateway. Bank transfer for large invoices |
| US | USD | Overseas cards through the international gateway feature; large invoices by wire |
| Malaysia | **USD at launch; MYR as a follow-up decision** | See below |

**Why not commit to MYR presentment on day one:**

1. **Acceptance is unconfirmed.** Razorpay says its international payments cover well over 100 currencies. The one supported-currency list I found that included MYR belongs to the *outward-remittance* product, so it does not confirm MYR acceptance. Get written confirmation.
2. **Realization matters for the export treatment.** The GST export condition requires payment in convertible foreign exchange with paperwork (FIRC/e-FIRC). Ask your bank (authorized dealer) whether inward MYR remittances are accepted and documented cleanly.
3. **Registration currency.** If you cross the Malaysian registration threshold, returns are in MYR; you will need an MYR reference value per sale anyway. That is a reporting concern, not a reason to price in MYR now.
4. Malaysian B2B buyers routinely pay USD invoices by wire. MYR presentment is a conversion nicety, not a launch blocker.

**Price book rows at launch:** `SKU × {IN/INR, US/USD, MY/USD} × {DRIVE_PASS, TALENT_RESERVE}`. Adding MYR later is a new `PriceBookEntry` version, not a schema change.

**Fee absorption stands (v1 §3.2).** With three markets, the fee cost you must clear is: domestic card/UPI fees (IN), international card fee + forex markup (US, MY small payments), bank charges (wires). Use the realized per-payment fee data (v1 §3.3.4) to calibrate after the first 30–60 days; do not trust the third-party rate figures quoted in v1 beyond a starting estimate.

---

## 4. Gateway routing — REPLACES v1 Appendix C

Razorpay's own FAQ for international payments states that **only cards issued by overseas banks are supported — no wire transfers** through the gateway. So "bank transfer" for US/MY is a **separate rail** (SWIFT to your account, or a virtual receiving account product), reconciled by finance, not a gateway route.

**Evaluation order (first match wins; thresholds live in Settings, not code):**

| # | Condition | Route |
|---|---|---|
| 1 | Account flagged Enterprise / contract / PO | `MANUAL_INVOICE` (bank transfer) |
| 2 | Amount ≥ configured large-payment threshold (per currency) | `MANUAL_INVOICE`; card offered only as fallback |
| 3 | `billingCountry = IN`, currency INR | Razorpay domestic (UPI / cards / netbanking) |
| 4 | `billingCountry ∈ {US, MY}` | Razorpay international (overseas cards) |
| 5 | Razorpay international unavailable or declined | Offer bank transfer; do not silently retry on a second card gateway |

**Stripe adapter: defer.** v1's router lists Stripe as an option, but I could not verify that Stripe will onboard an Indian entity for this use. Build `PaymentGatewayPort` + Razorpay + manual adapters now; the port keeps Stripe possible later. That removes one adapter from the MVP scope.

**Reconcile against gateway settlement reports yourself**, per v1. Also confirm per channel that a FIRC/e-FIRC (or equivalent) is produced for export receipts — one third-party source says standard Razorpay international payments may not issue an automatic digital one, unlike the export-account product. Verify.

---

## 5. Manual receipts and withholding — NEW (fills two gaps in v1)

### 5.1 The R8 loophole in `MANUAL_INVOICE`

R8 says every manual money action needs two distinct actors. But in the pricing spec's DB constraints, a `GRANT` with `grant_source = 'PURCHASE'` only requires a `payment_id`. A `Payment` row with `provider = MANUAL_INVOICE` and `status = CAPTURED` therefore mints credits with **one** person's data entry. v1's `verifyCapture` does not apply (no webhook; bank transfers settle asynchronously).

**Fix:**

1. Add `PAYMENT_RECEIPT` to `ManualRequestKind`. Payload: bank reference (UTR / SWIFT ref), amount received, currency, value date, withholding and bank-charge components (§5.2).
2. A `MANUAL_INVOICE` payment is created `CREATED`; it moves to `CAPTURED` only through an **executed, approved** `PAYMENT_RECEIPT` request (`requested_by ≠ approved_by`, already DB-enforced on `manual_billing_request`).
3. Bank reference is unique per provider (`@@unique([provider, providerPaymentId])` already covers it if you store it there).
4. Nightly reconciliation matches every manual capture to a bank-statement line.
5. Belt-and-braces DB guard, mirroring your `guard_session_start` pattern:

```sql
CREATE OR REPLACE FUNCTION guard_manual_payment_capture() RETURNS trigger AS $$
BEGIN
  IF NEW.provider = 'MANUAL_INVOICE'
     AND NEW.status = 'CAPTURED'
     AND (TG_OP = 'INSERT' OR OLD.status <> 'CAPTURED')
     AND COALESCE(current_setting('proctora.request_id', true), '') = '' THEN
    RAISE EXCEPTION 'Manual payment % may only be captured via an approved PAYMENT_RECEIPT request', NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_guard_manual_capture
  BEFORE INSERT OR UPDATE OF status ON payment
  FOR EACH ROW EXECUTE FUNCTION guard_manual_payment_capture();
```

(As with the other GUC-based guards, this stops side-door writes, not someone with direct superuser access — that is what the append-only ledger and WORM export are for.)

### 5.2 Withholding tax and short payments

Real bank-transfer receipts rarely equal the invoice: an Indian corporate deducts TDS, a Malaysian corporate may withhold 10%, banks take charges. v1 has no place to record this, so reconciliation would show unexplained shortfalls.

**ADD to `Payment`:**

```prisma
enum WithholdingType { NONE IN_TDS MY_WHT OTHER }

  receivedAmountMinor              BigInt?          @map("received_amount_minor")     // cash received, presentment currency
  withholdingType                  WithholdingType  @default(NONE) @map("withholding_type")
  withholdingTaxMinor              BigInt?          @map("withholding_tax_minor")
  withholdingCertificateReceivedAt DateTime?        @map("withholding_certificate_received_at")
  bankChargesMinor                 BigInt?          @map("bank_charges_minor")
```

**Credit-grant rule (decision for sign-off):** grant when `received + withholding + bank charges ≥ total_amount − tolerance`, with the withholding recorded through the same maker-checker request. The certificate is finance's chase item, **not** a gate on credits. Recommendation:

- India TDS: statutory, cannot be refused — accept and record.
- Malaysia WHT: covered by the gross-up clause (§2.3); if a buyer withholds anyway and does not gross up, the shortfall is a receivable, and credits are granted only against the amount actually covered.

---

## 6. Schema corrections to v1 §5 — REPLACES the affected parts

### 6.1 Money totals need `BigInt` (correction)

Postgres `INT` maxes at 2,147,483,647. In paise that is about **₹2.14 crore**; a large enterprise pre-fund can exceed it and fail at insert. Use `BigInt` for `subtotalMinor`, `totalTaxMinor`, `totalAmountMinor`, `taxAmountMinor`, `taxableBaseMinor`, settlement/fee/received fields. `unitPriceMinor` and credit counts can stay `Int`. In TypeScript use `bigint` end to end; do not let money pass through `number` in JSON (serialize as strings).

### 6.2 Duplicate presentment fields (correction)

`presentmentAmountMinor` and `totalAmountMinor` mean the same thing. Two fields with one meaning will diverge. Keep `totalAmountMinor` and `presentmentCurrency`; drop `presentmentAmountMinor`. (If you keep both, add a reconciliation assertion that they are equal.)

### 6.3 Enums (REPLACES v1 §5.2 / §4.4 enums)

```prisma
enum TaxIdType {
  GSTIN
  PAN
  EIN
  MY_SSM
  MY_TIN
  OTHER
}

enum TaxTreatment {
  STANDARD
  ZERO_RATED
  REVERSE_CHARGE
  EXEMPT
  NOT_COLLECTED     // seller not registered / below threshold; tax not charged, invoice explains why
}
```

- `NOT_COLLECTED` is distinct from `ZERO_RATED`. Zero-rated is a tax status (India export). `NOT_COLLECTED` is "we have no obligation here yet" (most US states, Malaysia below RM 500,000). Mixing them would make invoices say something untrue.
- Removed `VAT_EU`, `VAT_UK`, `ABN`. Add them back when those countries launch.
- **Validation expectations differ:** GSTIN can be validated against the GST portal (via a provider). I am not aware of a public real-time EIN validator, so for US buyers `tax_id_validation_status` will be format-checked at best (`NOT_CHECKED` otherwise) — do not build a flow that assumes `VALID`. Malaysia: SSM number lookup is possible; treat TIN as captured-not-validated until you confirm a validation route.
- `BillingAccount.billingCountry`: add a check constraint `IN ('IN','US','MY')`.

### 6.4 `TaxQuote` must be reproducible (ADDS)

v1's quote stores totals and a JSON of lines but not the inputs, so you cannot later show why a quote came out as it did. Add:

```prisma
  ruleSetVersion         String   @map("rule_set_version")       // version of your tax rules at quote time
  buyerCountry           String   @map("buyer_country")
  buyerState             String?  @map("buyer_state")
  buyerTaxIdType         TaxIdType? @map("buyer_tax_id_type")
  buyerTaxId             String?  @map("buyer_tax_id")
  taxIdValidationStatus  TaxIdValidationStatus @map("tax_id_validation_status")
  priceBookVersion       Int      @map("price_book_version")
```

### 6.5 Rounding policy (ADDS — missing in v1)

Without one, v1's nightly assertion "sum of tax lines = total tax" will flake by a paisa.

- Compute each tax line in minor units, round half-up **per line**.
- `total_tax_minor` = sum of the rounded lines. Never recompute from the total.
- India intra-state: compute CGST and SGST separately (each half rate on the base), not 18% then split.
- One rounding function, unit-tested, used by quote and invoice.

### 6.6 Other corrections

- **Explicitly list dropped legacy `Payment` fields** (`amountMinor`, `taxMinor`, `currency`). If no payment rows exist yet (Phase 4 is unbuilt), no backfill is needed — say so in the migration note.
- **`fxRate`:** the Prisma column is `Decimal` but the `CaptureResult` interface uses `number`. Use `string` (or Decimal) in the port to avoid float drift.
- **Invoice numbering authority:** if finance issues invoices from accounting software (v1's practical note), `invoiceNumber` is imported, not generated. Add `invoiceSource (PROCTORA | EXTERNAL)` and keep **one** numbering authority per series per legal entity. Two systems both numbering the same series is how gaps and duplicates start.

### 6.7 Content protection corrections (Part A)

**(a) Seeds must be per session, not per question.** v1 §5.5 adds `variantSeed` to `Question`. That gives one seed per question and cannot map a leaked string back to a session, which is the whole point of Layer 3. Add:

```prisma
model SessionQuestionAssignment {
  id              String   @id @default(uuid())
  sessionId       String   @map("session_id")        // plain UUID, no FK
  driveId         String   @map("drive_id")           // plain UUID, no FK
  organizationId  String   @map("organization_id")    // plain UUID, no FK
  questionId      String   @map("question_id")
  questionVersion Int      @map("question_version")
  variantSeed     String   @map("variant_seed")
  canaryToken     String   @map("canary_token")       // derived from seed; what you search for
  issuedAt        DateTime @default(now()) @map("issued_at")

  @@index([canaryToken])
  @@index([sessionId])
  @@index([driveId])
  @@map("session_question_assignment")
}
```

- No foreign keys and no candidate identifiers, so retention purges of candidate PII do not delete forensic trace data (same reasoning as R5). Session → candidate is resolved through the separately controlled identity mapping.
- Written at **session start**, which also satisfies the "snapshot question version at session start" decision already made.
- `DRIVE_QUESTION` becomes **blueprint slots** (module, skill, difficulty, count) for LIBRARY items; concrete questions are drawn into `SessionQuestionAssignment` at session start. Otherwise recruiters can still read the exact question list from the Drive.

**(b) Enforce Library/Custom ownership in the database, not just the UI:**

```sql
ALTER TABLE question ADD CONSTRAINT chk_question_visibility_owner CHECK (
     (visibility = 'LIBRARY' AND organization_id IS NULL)
  OR (visibility = 'CUSTOM'  AND organization_id IS NOT NULL));
-- plus a trigger forbidding UPDATE of visibility, and write access to LIBRARY rows only for platform staff roles.
```

(Requires an `organization_id` on `question`; add it if absent.) Also drop the `@default(CUSTOM)`: force the creation path to set visibility explicitly so a platform author cannot accidentally leave a Library item tenant-visible.

**(c) Pull minimal Layer 3 into Phase 1.** v1 says a thin pool at MVP makes traceability critical early, then schedules it for Phase 2. That is inconsistent: the pilot is when the bank is smallest. Ship a minimal version in Phase 1 — one canary value per session in each SQL dataset and coding stem, plus `SessionQuestionAssignment`. It is cheap; variant calibration and detection scanning can stay in Phase 2–3.

---

## 7. Threshold monitoring (ADDS — needed because launch treatment is `NOT_COLLECTED`)

`NOT_COLLECTED` is only safe if someone notices when it stops being true.

| Watch | Threshold | Alert at | Data source | Owner |
|---|---|---|---|---|
| US, per state | State's own threshold (most $100k; CA/TX $500k; NY $500k + 100 tx) | 70% | Payments grouped by `billingStateProvince` | Finance / CA |
| Malaysia | RM 500,000 digital-service sales, rolling 12 months | 60% | Payments where `billingCountry = MY`, converted to MYR | Finance / Malaysian adviser |
| India LUT | Valid for the current financial year | 30 days before FY end (March) | Calendar / compliance checklist | Finance |
| Export evidence | FIRC/e-FIRC (or equivalent) present for every export receipt | Nightly | `Payment` + document flag | Finance |

Implement as a reporting view plus a nightly job that posts to the Super Admin panel; no new transactional tables needed.

---

## 8. Appendix B additions — REPLACES v1 Appendix B list

For every `Payment` with `status = CAPTURED`:

1. `tax_quote.total_amount_minor = payment.total_amount_minor`
2. `SUM(tax_lines.tax_amount_minor) = payment.total_tax_minor` (rounding policy §6.5)
3. `payment.subtotal_minor = quantity_credits × unit_price_minor`
4. `payment.total_amount_minor = subtotal_minor + total_tax_minor`
5. `settlement_amount_minor` populated within the provider's expected window (set per provider; do not hardcode T+2)
6. `gateway_fee_minor + fx_fee_minor` within expected bounds for the provider
7. **Manual payments:** an executed `PAYMENT_RECEIPT` request exists with `requested_by ≠ approved_by`
8. **Manual payments:** `received + withholding + bank_charges ≥ total − tolerance`
9. **Manual payments:** matched to a bank-statement line
10. Invoice number unique within (legal entity, series); no gaps in the series

---

## 9. Sign-offs — REPLACES v1 §6

| # | Decision | Owner | Status |
|---|---|---|---|
| 1 | Confirm seller entity and jurisdiction; CA sign-off on §2 matrix | CA / Legal | ⬜ |
| 2 | B2B only, tax ID mandatory; allowlist `IN`, `US`, `MY` | Product / Legal | ⬜ |
| 3 | Launch currencies: INR + USD; Malaysia priced in USD until MYR acceptance and realization are confirmed in writing (gateway + bank) | Product / Finance | ⬜ |
| 4 | No surcharging; fees in the price book; large invoices by bank transfer | Finance | ⬜ |
| 5 | Own tax rules behind `TaxPort` now; independent engine when the first US state reaches 70% of its threshold; MoR as escape hatch only | Engineering / Finance | ⬜ |
| 6 | Library vs Custom split; no recruiter access to Library stems; DB-enforced ownership | Product / Engineering | ⬜ |
| 7 | Candidate non-disclosure in consent flow | Legal | ⬜ |
| 8 | **Malaysia:** is Proctora a "digital service"; SST rate (6% vs 8%); withholding classification; gross-up clause enforceability | Malaysian adviser / CA | ⬜ |
| 9 | **Withholding policy:** accept India TDS; gross-up clause for foreign withholding; credits granted against covered amount | Finance / Legal | ⬜ |
| 10 | **Manual receipts:** `PAYMENT_RECEIPT` maker-checker + DB guard (closes the R8 loophole) | Engineering / Finance | ⬜ |
| 11 | **Threshold monitoring** owner and alert levels (§7) | Finance | ⬜ |
| 12 | Defer Stripe adapter; build port + Razorpay + manual only | Engineering | ⬜ |
| 13 | Invoice numbering authority: Proctora vs accounting software (one system per series) | Finance | ⬜ |
| 14 | Pull minimal per-session canary tokens into Phase 1 | Product / Engineering | ⬜ |
| 15 | US: W-8BEN-E ready; CA view on any US withholding position | CA | ⬜ |

---

## 10. Source basis and what I could not verify

**Checked (secondary sources, retrieved for this addendum):**

- Malaysia foreign digital service regime, RM 500,000 threshold, B2B + B2C scope: VATabout Malaysia guide (updated Mar 2026); Anrok Malaysia page; Commenda SST guide.
- Malaysia withholding on SaaS as royalty (LHDN Practice Note 3/2023, 10%): gotchaa-lab.com 2026 guide. **Single secondary source — treat as a flag, not a conclusion.**
- India–Malaysia treaty rates (royalty 10%, technical fees 10%): horizonhubconsulting.com.
- US economic nexus thresholds: Numeral state-by-state handbook (2026); SaaS taxability examples: fungies.io and beancount.io guides.
- Razorpay international payments (overseas cards only, no wires; 100+ currencies): razorpay.com/docs/payments/international-payments/faqs.
- GST export-of-services conditions and LUT: Tally Solutions (Jan 2026) and incorpx.io.

**Not verified — get answers before relying on them:**

1. Whether Razorpay accepts **MYR** presentment for your account, and whether your bank accepts and documents inward MYR remittances.
2. Whether **Stripe** will onboard your entity (hence deferred).
3. Malaysian SST **rate** for your service (sources conflict: 6% vs 8%) and whether it qualifies as a taxable digital service.
4. Malaysian **withholding** position for SaaS; the contested classification is the key risk.
5. Whether standard Razorpay international payments generate an automatic **FIRC/e-FIRC**.
6. Any **US withholding** position for SaaS delivered from India, and each state's current SaaS taxability and thresholds (they change).
7. Third-party gateway fee figures used in v1 are indicative only; use realized per-payment data instead.

Primary sources to hand your advisers: Royal Malaysian Customs Department (service tax on digital services), LHDN/IRBM (withholding, Practice Note 3/2023), each US state's Department of Revenue, and CBIC/GST portal guidance for LUT and export of services.
