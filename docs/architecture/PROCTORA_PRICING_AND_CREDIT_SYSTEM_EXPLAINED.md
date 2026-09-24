# Proctora: Pricing, Credit Pools & Financial Architecture (Plain English Guide)

> **Purpose:** A complete, non-technical operational and architectural guide to how Proctora’s pricing, assessment credits, checkout flows, and financial safeguards work.  
> **Audience:** Product Managers, Engineering Leads, Operations, and Business Stakeholders.  
> **Format:** Zero technical jargon, zero database code—just crystal-clear business logic, recruiter workflows, and real-world scenarios.

---

## 1. The Core Currency: What is an Assessment Credit?

In Proctora, all billing is based on a single, transparent unit: **The Assessment Credit**.

$$\mathbf{1\text{ Credit} = 1\text{ Real Candidate Test Started}}$$

### Everything Before the Test is 100% Free
Recruiters and companies never pay for administrative setup, prep work, or candidate no-shows:
* Creating drives, configuring modules, and adding custom questions: **Free**
* Uploading candidate lists and generating invitation links: **Free**
* Candidate pre-flight equipment checks (webcam, microphone, network speed test): **Free**
* Candidate waiting in the exam lobby: **Free**
* Reconnecting after a Wi-Fi dropout or browser crash: **Free**

### Exactly When is a Credit Deducted?
A credit is deducted at the **exact second** an applicant passes their device checks, active presence is verified, and the first live test question renders on their screen.

---

## 2. When & How Purchasing Happens: The "Draft Free, Pay at Launch" Flow

To remove all friction and guesswork, **Drive Creation is completely free**. Recruiters never have to guess how many credits to buy in advance.

```
Step 1: Basics (Drive name, role, schedule)          ──► 100% FREE
Step 2: Modules (MCQ, SQL, Coding, Simulation)       ──► 100% FREE
Step 3: Questions (Select from bank or add custom)   ──► 100% FREE
Step 4: Upload Candidates (Excel/CSV upload)          ──► 100% FREE
Step 5: Review & Preview (Full test preview)          ──► 100% FREE
                           │
                           ▼
          FINAL STEP 6: "LAUNCH & DISPATCH INVITES"
    "System detected 173 valid candidate emails. How would you like to fund this drive?"
    ┌─────────────────────────────────────────────────────────────┐
    │ [●] Option 1: Buy Drive Pass (173 seats × ₹50 = ₹8,650)     │
    │ [ ] Option 2: Deduct 173 from your Talent Reserve balance   │
    │ [ ] Option 3: Apply 20 leftover credits from last drive     │
    │               + Pay balance for 153 seats (₹7,650)          │
    │ [ ] Option 4: Charge to Pre-Approved Enterprise Contract/PO │
    └─────────────────────────────────────────────────────────────┘
                           │
                           ▼
       [1-Click Pay & Dispatch Invitation Links]
```

### Why This Eliminates In-Field Friction:
1. **Zero Guesswork (Exact Seat Billing):**  
   If a college placement cell sends an Excel sheet with 173 students on Thursday night, the recruiter uploads it and pays for exactly 173 seats. No under-buying, no over-buying.
2. **Stress-Free Internal Collaboration:**  
   Recruiters can draft drives, review questions with engineering managers, and get approval days in advance without spending a single rupee upfront.
3. **What if an Enterprise Needs to Spend Budget in Advance?**  
   If a company finance team needs to spend an annual hiring budget before the fiscal quarter ends, they can go to **Billing → Add Funds / Pre-Purchase Balance**. That balance sits safely in their account and automatically funds drives whenever recruiters hit "Launch".

---

## 3. The Two Commercial Plans

Proctora provides two distinct commercial offerings designed for two very different hiring scenarios:

```
                          HOW COMPANIES BUY CREDITS
                                      │
            ┌─────────────────────────┴─────────────────────────┐
            ▼                                                   ▼
      PLAN 1: DRIVE PASS                                  PLAN 2: TALENT RESERVE
      (Event-Anchored Bulk Pack)                          (Flexible Everyday Bank)
      • High-volume single events (Campus, Hackathons)    • Year-round lateral hiring
      • Deep bulk discount per test                       • Standard flexible pricing
      • Linked directly to specific drive(s) at Launch    • Account-wide flexible balance
      • Fixed calendar window + 7-Day Makeup Window       • Floating timer starts on 1st use
```

### Plan 1: Drive Pass (For Campus Drives & Hackathons)
* **Best for:** High-volume, short-window hiring events (e.g., 200 candidates on a Friday).
* **Discounted Event Pricing:** Offers our lowest cost per candidate test because it is purchased in bulk for an event window.
* **Tied Directly to the Event:** Created and linked directly to that specific drive at Step 6 of the creation wizard.

### Plan 2: Talent Reserve (For Everyday Lateral Hiring)
* **Best for:** Ongoing hiring throughout the year (e.g., interviewing 5 senior engineers in March, 12 in April, 8 in May).
* **Flexible Validity (6 or 12 Months):** Usable across any department, any role, and any test at any time.
* **The "Floating Clock" (Starts on First Draw):** The 6- or 12-month expiry countdown **does not start on purchase day**. It only starts ticking on the day the company tests its **very first candidate**. If a pack is bought in December but the first interview happens in February, zero days are wasted.
* **Sequential Queueing (The Jio Model):** If a company buys a 1,000-credit pack and later buys a 500-credit pack, the second pack waits in line. Its clock does not start until the first pack is completely exhausted.

---

## 4. Solving Real-World Drive Challenges

### 1. Leftover Credits & The 7-Day Makeup Window
**Scenario:** A company buys 100 Drive Pass seats for Friday. Only 80 students take the test. 20 credits remain.

* **The 7-Day Makeup Window:** The 20 leftover credits do not expire on Friday evening. They remain active in the company’s account for **7 additional days**.
* **Two Ways to Use Them:**
  * **Option A (Makeup Session / Round 2 for the Same Drive):** The recruiter can invite the 20 students who fell sick or suffered power cuts, or run a "Round 2 Coding Test" for shortlisted students.
  * **Option B (Apply to a Different Campus Drive):** If the company is visiting another college within those 7 days, they can click *"Apply 20 unused Campus Credits"* to the new drive checkout, paying only the difference.
* **Why it expires after 7 days:** This allows recruiters to handle genuine college no-shows and re-tests without creating a loophole where cheap bulk campus credits are hoarded to fund expensive lateral hiring months later.

---

### 2. Managing Multiple Campus Drives Simultaneously
**Scenario:** An enterprise visits three engineering colleges in the same week:
* Drive 1: IIT Madras (200 candidates, Sep 25)
* Drive 2: BITS Pilani (150 candidates, Sep 26)
* Drive 3: NIT Trichy (100 candidates, Sep 28)

* **Independent Seat Pools:** Each drive is funded individually at launch.
* **Isolated Counters on Dashboard:**
  * IIT Madras: `180 / 200 Seats Used`
  * BITS Pilani: `140 / 150 Seats Used`
  * NIT Trichy: `95 / 100 Seats Used`
* **Zero Contamination:** Candidates taking the IIT Madras test can only draw from IIT Madras seats. They will never accidentally consume seats from BITS Pilani or NIT Trichy.

---

### 3. Extra Candidates Arriving at the Gate (No Unsecured Lending)
We use a **100% Pre-Paid Model**. We do not offer overdraft (lending tests on credit), because unpaid debt leads to billing disputes and business risk.

**The Smooth 1-Click Top-Up Flow:**
1. **The In-Field Reality:** College lab invigilators and proctors do not have company credit cards. The HR Lead / Account Admin manages the budget.
2. **If a drive reaches 100/100 and extra students arrive:**
   * The extra candidate’s screen shows a reassuring message: *"Checking seat availability with your event coordinator..."*
   * The HR Lead immediately receives a mobile alert / dashboard notification:  
     > *"IIT Madras Drive has reached 100/100 seats. 3 extra students are waiting to enter. [Add 5 Seats for ₹250 / $10]"*
   * The HR Lead taps the button. It charges their saved corporate card or pre-funded wallet in 5 seconds.
   * The drive capacity immediately updates from 100 to 105.
   * The waiting students' screens automatically refresh and admit them into the exam.
3. **Seamless Attachment:** This top-up adds seats **directly to the ongoing drive**, keeping all rankings and candidate reports in one unified place.

---

### 4. The Fallthrough Safety Net (Customer Choice)
If a company already owns a flexible Talent Reserve bank and runs a campus drive:
* In the Drive Settings, the recruiter has an optional toggle:  
  > **[ON / OFF] Automatically draw from Talent Reserve if this Drive Pass runs out.**
* **If set to ON:** If candidate #101 arrives, the system quietly draws 1 credit from their existing Talent Reserve pool. The candidate starts instantly with zero delay.
* **If set to OFF:** Candidate #101 enters the brief waiting room, and the HR Lead receives the 1-click top-up prompt.

---

## 5. Refunds, Glitches & The Digital Passbook (Ledger)

Recruiters should never have to fight for a refund when technology fails.

### What is Refunded?
* **Automatic Infrastructure Reversals:** If a server outage, container failure, or platform error interrupts a candidate's exam, our monitoring detects it automatically and refunds the credit.
* **Courtesy Waivers (Hardware Failures):** If a student's webcam fails midway, the recruiter can grant a single free re-attempt (capped at 5% of drive volume to prevent abuse).

### Where Does the Refund Reflect?
Everything is recorded in a permanent digital ledger (like an unalterable bank passbook):
1. **On the Drive Dashboard:** The available seat counter immediately increases by `+1` (e.g., from 0 back to 1 available seat).
2. **On the Transaction History Page:** A clear, human-readable record appears:  
   > *`Sep 25, 11:15 AM — Credit Returned for Candidate Rahul Sharma (Reason: Platform Server Disconnect) — Balance: +1 Credit`*
3. **If the Drive Has Already Expired:** If the drive has ended and the 7-day makeup window has passed, the refunded credit does not disappear—it is issued as an account credit voucher valid for their next drive.

---

## 6. Built-In Safeguards & Fair-Play Guarantees

### 1. Network Disconnect Protection (Zero Double-Billing)
If a candidate has a weak Wi-Fi connection in a hostel or campus computer lab, their browser may reload, or their connection may drop 4 times. **The system recognizes the active ongoing session and charges zero extra credits.** One candidate taking one test will only ever be charged once.

### 2. Active Presence Check (No Ghost Charges)
If an applicant opens their laptop, enters the exam lobby, and walks away without starting the test, **they are never billed**. The system requires active mouse movement, camera presence, and a deliberate click to start the exam before any credit is deducted.

### 3. The Two-Person Rule for Manual Adjustments (Maker-Checker)
To prevent internal fraud or rogue staff from gifting credits:
* No single employee or support agent can manually grant or modify credits.
* One staff member requests the credit adjustment, and an authorized manager must approve it before credits appear in the customer's balance.

### 4. Behind-the-Scenes Anti-Spam Protection
Companies can freely upload their candidate lists without dealing with confusing math formulas. We maintain a generous, silent backend ceiling (e.g., max 5,000 links per drive) purely to stop automated spambots from flooding email servers, with zero friction for genuine recruiters.

### 5. Regional Pricing & Currency Protection
Pricing is anchored to the customer's verified **Company Legal Entity & Tax ID** (e.g., GSTIN in India, EIN in the US), preventing foreign currency arbitrage.

---

## 7. Summary Comparison Matrix

| Feature | Plan 1: Drive Pass | Plan 2: Talent Reserve |
| :--- | :--- | :--- |
| **Primary Use Case** | Single-day events (Campus drives, Hackathons) | Everyday lateral hiring throughout the year |
| **Pricing Level** | Deep bulk discount per test | Standard flexible pricing |
| **When It is Purchased** | **At Step 6 of Drive Creation** (Exact seat count) | In advance from Billing tab (Packs of 100, 500, 1000) |
| **Validity Period** | Fixed event date + **7-day makeup window** | **6 or 12 months** (Timer starts on first use) |
| **Where It Can Be Used** | Tied to specific drive(s); usable for another drive within 7 days | Usable across all drives, roles, and teams |
| **Leftover Credits** | Active for 7 days for makeups or another drive, then lapses | Retained in your account until package expiration |
| **Top-Up Method** | Instant 1-click addition directly to the ongoing drive | Purchase another pack (queues sequentially behind active pack) |
| **Fallthrough Support** | Can optionally draw from Talent Reserve when full | N/A (acts as the master backup pool) |
