# Proctora — Content Protection, Multi-Currency & Tax Architecture Specification

> **Document Status:** Architecture Specification & Implementation Guidance (v1)  
> **Target System:** Proctora Assessment Platform (`backend/api`, `frontend/admin-web`, `frontend/candidate-web`)  
> **Classification:** Content Security, International Commerce & Tax Compliance  
> **Effective Date:** September 2026  
> **Prerequisite Reading:** [PRICING_AND_CREDIT_POOL_SPECIFICATION.md](./PRICING_AND_CREDIT_POOL_SPECIFICATION.md), [SECURITY.md](./SECURITY.md)  
> **Important:** Tax and legal guidance in this document are inputs for your CA and legal counsel, not legal advice.  
> **⚠️ Amended by:** [v1.1 Addendum](./CONTENT_PROTECTION_CURRENCY_AND_TAX_V1_1_ADDENDUM.md) — narrows launch scope to US/MY/IN, replaces §4.2 tax matrix, §5.1–§5.5 schema, Appendix B & C, and §6 sign-offs. Where v1.1 and this document disagree, v1.1 wins.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Part A — Question Bank Content Protection](#2-part-a--question-bank-content-protection)
3. [Part B — Currency Independence & Gateway Fees](#3-part-b--currency-independence--gateway-fees)
4. [Part C — Cross-Country Tax Handling](#4-part-c--cross-country-tax-handling)
5. [Schema Changes](#5-schema-changes)
6. [Sign-Offs Required](#6-sign-offs-required)

---

## 1. Executive Summary

Three strategic concerns raised by management:

| # | Concern | Core Problem | Design Principle |
|---|---------|-------------|-----------------|
| A | Question bank leakage | Tenants and candidates can leak, resell, or dump question content | Prevention is overclaimed — the goal is that a leaked item is **low-value**, **traceable**, and **quickly retired** |
| B | Currency dependence | FX conversion charges, surcharging legality, and gateway lock-in | Own the **price book** and **presentment currency**; treat gateways as swappable adapters |
| C | Tax across countries | Complex multi-jurisdiction tax rules, transparency to customers | Own **tax logic** behind a port; never couple tax to the gateway; amount shown must be true and apparent |

All three share the same architectural shape: **own the parts that are core to your business (content, price book, tax logic) and treat gateways and tax engines as swappable adapters.**

---

## 2. Part A — Question Bank Content Protection

### 2.1 Threat Model

"Tenants leaking" is only one vector. In practice, dumps mostly come from:

| Vector | Description | Exposure in Campus Model |
|--------|-------------|------------------------|
| **Candidate memory** | Photos, retyping after test, screenshots | High — same test at one college on Sep 25 and another on Sep 26 means students can talk in between |
| **Coordinator pass-through** | Sharing questions between batches | Medium — coordinators see questions during drive setup |
| **Tenant bulk access** | Recruiters browsing and exporting the bank | High if we give the full bank; addressable by design |
| **Platform breach** | Database compromise | Standard infosec — separate concern |

A design that guards only the tenant side misses most of the leakage surface.

### 2.2 Protection Layers (in order of leverage)

#### Layer 1: Don't Give Tenants the Bank

> This is the highest-leverage change. "We give the entire question bank" is a design choice, not a given.

Split content into two classes:

| Class | Ownership | Visibility | Access Model |
|-------|-----------|-----------|-------------|
| **Library Items** | Proctora-owned | Recruiters see competency map, rubric summary, item stats. **Never** browse stems, answer keys, hidden test cases, or full rubrics. | Select by blueprint (module, skill, difficulty, count). Preview via watermarked PREVIEW sessions on a small fixed sample, rate-limited and logged. |
| **Custom Items** | Tenant-authored | Fully visible to that tenant | Their content, their risk to protect |

**Impact on Admin IA:** The Question Bank page changes from "browse everything" to **"Library by Blueprint + My Questions"**. Reviewers who need to see a question to judge an answer see the stem in the Reports popup only for that session, watermarked with the viewer's identity. Exports carry question IDs and titles rather than full text.

#### Layer 2: Shorten the Half-Life of Any Leaked Item

| Mechanism | How It Works | Cost |
|-----------|-------------|------|
| **Random draw** | Draw N from M per blueprint slot, randomize order per candidate | Pool depth must be ≥ 2× draw size |
| **Parameterized variants** | SQL seed data, coding constants, hidden-test generators, MCQ numbers, scenario personas — different variant seed per drive | Authoring load; variants need calibration to stay comparable |
| **Exposure caps** | Item retires after K appearances across drives | Requires `exposure_count` tracking per question |
| **Auto-retirement** | Item expires after T days or after pass-rate anomaly | Needs the Question Insights data already planned |

> **Key constraint:** Variants are generated offline with human review, consistent with the no-live-LLM principle. With one pilot role and a small bank, pool depth will be thin at MVP — which makes Layer 3 critical early.

#### Layer 3: Make Leaks Traceable

| Technique | Survives | Detail |
|-----------|---------|--------|
| Watermark overlay (existing) | Screenshots | Already in PREVIEW sessions |
| **Per-session variant tokens** | Retyping, memory dumps | Unique names and values embedded in stems and datasets (e.g., unique employee names in SQL schemas, unique constants in coding problems). A dump found online maps back to `session → drive → tenant`. Store seeds, not copies. |

#### Layer 4: Detect Quickly

- Watch per-item pass-rate and solve-time drift (the Question Insights data already planned)
- Cluster identical unusual solutions across candidates
- Periodic scans of Telegram, GitHub, Reddit, dump sites for item text and variant tokens
- Takedown-and-retire routine when a leak is confirmed

#### Layer 5: Contract and Access Control

- Content is **licensed, not sold**, with a leak clause and termination rights
- Candidate non-disclosure added to the consent screen (legal recourse, not prevention — needs legal review)
- Narrow `CONTENT_ADMIN` permission — no bulk export or API for library items
- Alerts on unusual question-view volume
- Entries in the audit log already planned

#### Layer 6: Fix the Prefetch Vulnerability

> **Current issue:** The candidate UX doc prefetches the resolved question set during Buffer/Grace, putting the whole test in the browser before time starts.

**Fix:** Prefetch encrypted and release the decryption key at module start on server time, or fetch per module. Answer keys and hidden test cases stay server-side always.

### 2.3 Implementation Sequence

```
┌─────────────────────────────────────────────────────────────┐
│  Phase 1 (MVP):  Layer 1 (Library/Custom split) + Layer 6  │
│                  (encrypted prefetch)                       │
│  Phase 2:        Layer 3 (variant tokens, traceability)     │
│  Phase 3:        Layer 4 (detection pipeline)               │
│  Ongoing:        Layer 2 (pool depth growth)                │
│  Day 0:          Layer 5 (contracts — legal review)         │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Part B — Currency Independence & Gateway Fees

### 3.1 Three Meanings of "Currency"

| Concept | Definition | Who Controls |
|---------|-----------|-------------|
| **Presentment** | What the customer sees and pays | You (via price book) |
| **Settlement** | What lands in your bank account | Gateway + your bank |
| **Reporting** | What your books say | Your accounting system |

Gateways bundle these. You want to **own presentment** and **record the other two per payment**.

> The credit ledger is already currency-neutral (R1: whole-number credits). Keep money out of it entirely.

### 3.2 No Surcharging

Surcharging cannot be a single global setting:

| Jurisdiction | Surcharging Rule |
|-------------|-----------------|
| EU & UK | Largely prohibited |
| US | Permitted in most states |
| Australia | Capped at merchant's actual cost |
| India | Barred on debit cards |

Visa's own rules also cap surcharges at the merchant's cost of acceptance and at 3%. A surprise fee at checkout collides with the transparency goal in Part C.

**Decision: Treat gateway fees and FX spread as cost of goods. Build the price book to clear them.**

### 3.3 Architecture

#### 3.3.1 Fixed Local-Currency Prices

Set prices per SKU per currency instead of converting an INR base live. The existing `PriceBookEntry` already supports `billingCountry` + `currency` — this is a **process change**, not a schema change.

FX risk is yours. Re-price on a schedule or when drift crosses a threshold.

#### 3.3.2 Steer Large Payments Off Cards

| Payment Size | Recommended Channel | Approximate Cost |
|-------------|-------------------|-----------------|
| Small top-ups | Card (Razorpay/Stripe) | ~3% + forex markup |
| Large invoices (campus drives, enterprise pre-fund) | Bank transfer / `MANUAL_INVOICE` | ~1% or flat fee |

`MANUAL_INVOICE` is already in the `PaymentProvider` enum.

#### 3.3.3 Set Presentment Currency Yourself

Don't let the gateway or bank convert at checkout. Razorpay supports local-currency pricing across ~100 currencies, settling converted to INR at the processing bank's rate on payment date. Customer sees a stable price; conversion cost lands on you as a known line.

#### 3.3.4 Record Per Payment (Schema Change)

Every `Payment` must now capture:

| Field | Purpose |
|-------|---------|
| `presentment_amount_minor` + `presentment_currency` | What the customer was charged |
| `settlement_amount_minor` + `settlement_currency` | What arrived in your bank |
| `fx_rate` + `fx_rate_source` | Conversion rate and its origin |
| `gateway_fee_minor` | Gateway processing fee |
| `fx_fee_minor` | Foreign exchange fee |

This gives realized margin per currency and feeds price calibration (Decision 13 after shadow mode).

#### 3.3.5 Refunds

Assume gateway fees aren't returned unless confirmed otherwise. State in terms which currency a refund is made in.

### 3.4 Gateway Independence Architecture

```
┌───────────────────────────────────────────────────────────┐
│                  PaymentGatewayPort                        │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐       │
│  │ Razorpay  │  │  Stripe  │  │  Bank Transfer    │       │
│  │ Adapter   │  │  Adapter │  │  Adapter          │       │
│  └──────────┘  └──────────┘  └───────────────────┘       │
│                                                           │
│  Router: country × currency × amount × method             │
│                                                           │
│  Output: Normalized "PaymentCaptured" event               │
│  → Feeds existing grant-only-on-verified-capture          │
└───────────────────────────────────────────────────────────┘
```

**Two lock-ins to plan for:**

1. **Saved-card tokens** — not portable between gateways. Make prepaid wallet or bank transfer the primary top-up path; treat saved cards as a per-gateway convenience.
2. **Gateway's tax product** — Stripe Tax couples tax to the gateway. See Part C for the independent approach.

---

## 4. Part C — Cross-Country Tax Handling

### 4.1 Assumption

The selling entity is **Indian**. Confirm this first — it determines the entire tax matrix.

### 4.2 Scope Decision: B2B Only at Launch, Tax ID Mandatory

The existing spec already ties `billingCountry` to legal entity + tax ID. This collapses most of the matrix:

| Buyer | Typical Treatment (confirm with CA) | Required Capture |
|-------|--------------------------------------|-----------------|
| **India** | Domestic GST, typically 18% for SaaS. CGST+SGST within seller's state, IGST across states. Some corporates deduct TDS on invoice payments. | GSTIN, state |
| **Business abroad** | Export of services, zero-rated if all 5 conditions hold: supplier in India, recipient outside India, place of supply outside India, payment in convertible foreign exchange or RBI-permitted INR, separate legal entities. File LUT annually to avoid paying IGST upfront. Missing FIRC/BRC paperwork costs export benefit. | Buyer country, proof of foreign location |
| **EU/UK** | Buyer self-accounts (reverse charge) if valid VAT ID. Validate ID, keep evidence. Invoice shows 0% with reason. Minority of countries require registration even for B2B. Keep those on "unsupported" list. | Tax ID + validation record |
| **US** | State by state. Many states tax SaaS; collection depends on economic nexus thresholds. Exemption certificates apply. | State; track revenue per state |
| **No tax ID, outside India** | **Don't sell at MVP.** B2C digital sales trigger registration duties. | n/a |

> **Note on gateway choice:** Export conditions require payment in foreign exchange with paperwork. Standard Razorpay international payments may not produce automatic digital FIRA, unlike their export account product. Verify with Razorpay.

### 4.3 Making the Amount True and Apparent

#### 4.3.1 Price Book is Tax-Exclusive

Checkout and top-up prompt show:

```
┌─────────────────────────────────────────┐
│  Subtotal:           $500.00            │
│  GST (0% - Export of services, LUT):    │
│                      $0.00              │
│  ─────────────────────────────────       │
│  Total:              $500.00 USD        │
└─────────────────────────────────────────┘
```

Each tax line shows: type, rate, and reason.

#### 4.3.2 Server-Side Tax Quote

- Tax quote has an ID and a short TTL lock
- The amount sent to the gateway **equals** the quoted total
- The invoice is built from the same quote
- Mismatch between quote and payment blocks the charge
- Nightly "Payment proof" check asserts: `quote = payment = invoice` and `net_of_tax = credits × unit_price`

#### 4.3.3 Replace Single `taxMinor` with Stored Tax Lines

The current `Payment.taxMinor` field is insufficient. Replace with a related `PaymentTaxLine` model:

| Field | Purpose |
|-------|---------|
| `jurisdiction` | e.g., "IN-KA" (Karnataka), "US-CA" (California) |
| `tax_type` | GST_CGST, GST_SGST, GST_IGST, VAT, SALES_TAX, NONE |
| `rate_bps` | Rate in basis points (1800 = 18%) |
| `taxable_base_minor` | Amount the rate is applied to |
| `tax_amount_minor` | Computed tax amount |
| `treatment` | STANDARD, ZERO_RATED, REVERSE_CHARGE, EXEMPT |
| `buyer_tax_id` | Snapshot of the buyer's tax ID at purchase |
| `buyer_tax_id_validated_at` | Timestamp of validation |

#### 4.3.4 Immutable Invoices

- Sequential numbering per legal entity
- Credit notes for refunds (reverse tax proportionally)
- Tax attaches at purchase of prepaid credits, not at consumption (confirm with CA)
- Lapsed credits don't unwind tax; refunds do, via credit note

#### 4.3.5 Tax Never Enters the Credit Ledger

This protects R1 (whole-number credits) and R2 (ledger as single source of truth).

### 4.4 `BillingAccount` Schema Gaps

The current `BillingAccount` model needs additional fields:

| Missing Field | Purpose |
|---------------|---------|
| `billing_address_line1` | Legal address |
| `billing_address_line2` | Legal address continued |
| `billing_state_province` | Required for intra/inter-state GST determination |
| `billing_postal_code` | Required for US nexus |
| `tax_id_type` | GSTIN, EIN, VAT_EU, ABN, etc. |
| `tax_id_validated_at` | When the tax ID was last validated |
| `tax_id_validation_status` | VALID, INVALID, PENDING, NOT_CHECKED |

### 4.5 Price Display Fix

Two places in existing docs show prices with no tax:
- "173 seats × ₹50 = ₹8,650"
- "Add 5 Seats for ₹250 / $10"

The top-up prompt is the most critical — it charges a saved card in one tap and **must** show the tax-inclusive total before charge.

### 4.6 Tax Engine Options

| Option | When It Fits | Tradeoff |
|--------|-------------|----------|
| **Own rules behind `TaxPort`**: India GST, export zero-rating, reverse-charge with ID validation, supported-country list | MVP, handful of jurisdictions | You maintain the rules. Keeps gateway independence. |
| **Independent tax engine** behind the same port | US nexus or many countries | Stripe Tax: 0.5% per txn no-code, or $0.50 via API. Independent engines priced separately. |
| **Merchant of Record (MoR)** | Self-serve to small foreign buyers with no tax IDs | ~5% + 50¢ per txn. MoR takes on tax collection, remittance, and liability. Deepest vendor dependency. Invoice comes from them. Enterprise PO/wire flows fit poorly. |

**Recommended approach:** Start with own rules behind `TaxPort`. Treat MoR as an escape hatch only.

**Practical note:** At pilot volume, most purchases will be enterprise/campus invoices. Automate the quote and display (what makes amounts transparent), and let finance issue invoices from accounting software fed by `Payment` records until volume justifies full automation.

---

## 5. Schema Changes

### 5.1 Enhanced `Payment` Model

```prisma
model Payment {
  id                       String          @id @default(uuid())
  billingAccountId         String          @map("billing_account_id")
  provider                 PaymentProvider
  providerPaymentId        String          @map("provider_payment_id")
  providerOrderId          String?         @map("provider_order_id")
  status                   PaymentStatus
  priceBookEntryId         String          @map("price_book_entry_id")
  quantityCredits          Int             @map("quantity_credits")
  unitPriceMinor           Int             @map("unit_price_minor")

  // --- Presentment (what customer saw/paid) ---
  presentmentAmountMinor   Int             @map("presentment_amount_minor")
  presentmentCurrency      String          @map("presentment_currency")

  // --- Settlement (what landed in our bank) ---
  settlementAmountMinor    Int?            @map("settlement_amount_minor")
  settlementCurrency       String?         @map("settlement_currency")

  // --- FX tracking ---
  fxRate                   Decimal?        @map("fx_rate") @db.Decimal(12, 6)
  fxRateSource             String?         @map("fx_rate_source")

  // --- Fee tracking ---
  gatewayFeeMinor          Int?            @map("gateway_fee_minor")
  fxFeeMinor               Int?            @map("fx_fee_minor")

  // --- Tax (replaces single taxMinor) ---
  taxQuoteId               String?         @map("tax_quote_id")
  subtotalMinor            Int             @map("subtotal_minor")
  totalTaxMinor            Int             @map("total_tax_minor")
  totalAmountMinor         Int             @map("total_amount_minor")

  // --- Invoice ---
  invoiceNumber            String?         @unique @map("invoice_number")
  invoiceIssuedAt          DateTime?       @map("invoice_issued_at")

  // --- Refund currency ---
  refundCurrency           String?         @map("refund_currency")

  capturedAt               DateTime?       @map("captured_at")
  createdAt                DateTime        @default(now()) @map("created_at")

  billingAccount           BillingAccount  @relation(fields: [billingAccountId], references: [id], onDelete: Restrict)
  pools                    CreditPool[]
  ledgerEntries            CreditLedgerEntry[]
  taxLines                 PaymentTaxLine[]

  @@unique([provider, providerPaymentId])
  @@map("payment")
}
```

### 5.2 New `PaymentTaxLine` Model

```prisma
enum TaxType {
  GST_CGST
  GST_SGST
  GST_IGST
  VAT
  SALES_TAX
  SERVICE_TAX
  NONE
}

enum TaxTreatment {
  STANDARD
  ZERO_RATED
  REVERSE_CHARGE
  EXEMPT
}

enum TaxIdType {
  GSTIN
  EIN
  VAT_EU
  VAT_UK
  ABN
  OTHER
}

enum TaxIdValidationStatus {
  VALID
  INVALID
  PENDING
  NOT_CHECKED
}

model PaymentTaxLine {
  id                    String        @id @default(uuid())
  paymentId             String        @map("payment_id")
  jurisdiction          String
  taxType               TaxType       @map("tax_type")
  rateBps               Int           @map("rate_bps")
  taxableBaseMinor      Int           @map("taxable_base_minor")
  taxAmountMinor        Int           @map("tax_amount_minor")
  treatment             TaxTreatment
  buyerTaxId            String?       @map("buyer_tax_id")
  buyerTaxIdValidatedAt DateTime?     @map("buyer_tax_id_validated_at")
  createdAt             DateTime      @default(now()) @map("created_at")

  payment               Payment       @relation(fields: [paymentId], references: [id], onDelete: Restrict)

  @@index([paymentId])
  @@map("payment_tax_line")
}
```

### 5.3 Enhanced `BillingAccount` Model (additions)

```prisma
model BillingAccount {
  // ... existing fields ...

  // --- Address (new) ---
  billingAddressLine1     String?       @map("billing_address_line1")
  billingAddressLine2     String?       @map("billing_address_line2")
  billingStateProvince    String?       @map("billing_state_province")
  billingPostalCode       String?       @map("billing_postal_code")

  // --- Tax ID enhancement (replaces simple taxId) ---
  taxIdType               TaxIdType?    @map("tax_id_type")
  taxIdValidatedAt        DateTime?     @map("tax_id_validated_at")
  taxIdValidationStatus   TaxIdValidationStatus? @map("tax_id_validation_status")

  // ... existing relations ...
}
```

### 5.4 New `TaxQuote` Model

```prisma
model TaxQuote {
  id                    String        @id @default(uuid())
  billingAccountId      String        @map("billing_account_id")
  priceBookEntryId      String        @map("price_book_entry_id")
  quantityCredits       Int           @map("quantity_credits")
  subtotalMinor         Int           @map("subtotal_minor")
  totalTaxMinor         Int           @map("total_tax_minor")
  totalAmountMinor      Int           @map("total_amount_minor")
  currency              String
  taxLinesSnapshot      Json          @map("tax_lines_snapshot")
  lockedUntil           DateTime      @map("locked_until")
  consumedByPaymentId   String?       @unique @map("consumed_by_payment_id")
  createdAt             DateTime      @default(now()) @map("created_at")

  @@index([billingAccountId, createdAt])
  @@map("tax_quote")
}
```

### 5.5 Question Content Protection Schema Additions

```prisma
enum QuestionVisibility {
  LIBRARY
  CUSTOM
}

// Add to existing Question model:
// visibility          QuestionVisibility  @default(CUSTOM)
// exposureCount       Int                 @default(0) @map("exposure_count")
// maxExposures        Int?                @map("max_exposures")
// retiredAt           DateTime?           @map("retired_at")
// variantGroupId      String?             @map("variant_group_id")
// variantSeed         String?             @map("variant_seed")
```

---

## 6. Sign-Offs Required

| # | Decision | Owner | Status |
|---|----------|-------|--------|
| 1 | Confirm the seller entity and jurisdiction; get CA sign-off on the tax matrix in §4.2 | CA / Legal | ⬜ Pending |
| 2 | B2B only with mandatory tax ID at launch | Product / Legal | ⬜ Pending |
| 3 | Launch currency set (e.g., INR and USD first) | Product / Finance | ⬜ Pending |
| 4 | No surcharging — fees go into the price book; large invoices steered to bank transfer | Finance | ⬜ Pending |
| 5 | Own tax rules behind a `TaxPort` now; independent engine at nexus threshold; MoR as escape hatch only | Engineering / Finance | ⬜ Pending |
| 6 | Library vs Custom split for the Question Bank — no recruiter access to library stems | Product / Engineering | ⬜ Pending |
| 7 | Candidate non-disclosure in the consent flow | Legal | ⬜ Pending |

---

## Appendix A: Port Interfaces (TypeScript sketch)

### PaymentGatewayPort

```typescript
interface PaymentGatewayPort {
  createOrder(params: CreateOrderParams): Promise<GatewayOrder>;
  verifyCapture(params: VerifyCaptureParams): Promise<CaptureResult>;
  initiateRefund(params: RefundParams): Promise<RefundResult>;
}

interface CaptureResult {
  providerPaymentId: string;
  presentmentAmountMinor: number;
  presentmentCurrency: string;
  settlementAmountMinor: number;
  settlementCurrency: string;
  fxRate: number | null;
  fxRateSource: string | null;
  gatewayFeeMinor: number | null;
  fxFeeMinor: number | null;
  capturedAt: Date;
}
```

### TaxPort

```typescript
interface TaxPort {
  quoteTax(params: TaxQuoteParams): Promise<TaxQuoteResult>;
  validateTaxId(taxIdType: TaxIdType, taxId: string): Promise<TaxIdValidation>;
}

interface TaxQuoteParams {
  billingAccountId: string;
  priceBookEntryId: string;
  quantityCredits: number;
  buyerCountry: string;
  buyerState: string | null;
  buyerTaxIdType: TaxIdType | null;
  buyerTaxId: string | null;
}

interface TaxQuoteResult {
  quoteId: string;
  subtotalMinor: number;
  taxLines: TaxLine[];
  totalTaxMinor: number;
  totalAmountMinor: number;
  currency: string;
  lockedUntil: Date;
}

interface TaxLine {
  jurisdiction: string;
  taxType: TaxType;
  rateBps: number;
  taxableBaseMinor: number;
  taxAmountMinor: number;
  treatment: TaxTreatment;
  reason: string;  // Human-readable, e.g., "Export of services, 0% GST under LUT"
}
```

### ContentAccessPort

```typescript
interface ContentAccessPort {
  /** Returns questions by blueprint — stems hidden for LIBRARY items */
  selectByBlueprint(params: BlueprintParams): Promise<BlueprintSelection>;

  /** Returns encrypted question payload for candidate delivery */
  getEncryptedQuestionSet(sessionId: string, moduleIndex: number): Promise<EncryptedPayload>;

  /** Releases decryption key at module start time */
  releaseModuleKey(sessionId: string, moduleIndex: number): Promise<string>;

  /** Returns stem for report viewing — watermarked with viewer identity */
  getWatermarkedStem(questionId: string, viewerId: string): Promise<WatermarkedContent>;
}
```

---

## Appendix B: Nightly Reconciliation Extensions

Add these assertions to the existing nightly reconciliation job (§9.4 of the Pricing spec):

```
Assert: For every Payment where status = CAPTURED:
  1. tax_quote.total_amount_minor = payment.total_amount_minor
  2. SUM(tax_lines.tax_amount_minor) = payment.total_tax_minor
  3. payment.subtotal_minor = quantity_credits × unit_price_minor
  4. payment.total_amount_minor = subtotal_minor + total_tax_minor
  5. settlement_amount_minor is populated within T+2 business days
  6. gateway_fee_minor + fx_fee_minor is within expected bounds for provider
```

---

## Appendix C: Gateway Router Decision Matrix

```
┌──────────────────────────────────────────────────────────────┐
│                    Gateway Router Logic                       │
├──────────────┬───────────┬──────────┬────────────────────────┤
│ Country      │ Currency  │ Amount   │ Route                  │
├──────────────┼───────────┼──────────┼────────────────────────┤
│ India        │ INR       │ Any      │ Razorpay (domestic)    │
│ India        │ INR       │ > ₹1L    │ Prefer MANUAL_INVOICE  │
│ International│ USD/EUR/… │ < $500   │ Razorpay (intl) or     │
│              │           │          │ Stripe                 │
│ International│ USD/EUR/… │ > $500   │ Prefer MANUAL_INVOICE  │
│ Any          │ Any       │ Enterprise│ MANUAL_INVOICE        │
└──────────────┴───────────┴──────────┴────────────────────────┘
```
