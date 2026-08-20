that clarification about **wallet → escrow → another user's wallet** changes the design in a useful way: Taska isn't just a deposit/withdrawal app; it's an **internal money ledger with real-world settlement through Paystack**.

Also, **10% should absolutely be a configurable fee, not a hardcoded business rule**. We'll call it `commission_rate` / `platform_fee_rate` and make the actual percentage configurable later.

I checked Paystack's current documentation for the transfer side too. The important distinction is that **transfers must be enabled on the Paystack account**, and you create recipients + initiate transfers through the Transfers API. Paystack's dashboard/API documentation describes enabling transfers, creating transfer recipients, and initiating transfers. 

# TASKA — WALLET, ESCROW, COMMISSIONS & PAYSTACK INTEGRATION SPECIFICATION

## 1. Core architecture

Taska should **not use Paystack subaccounts or Dedicated Virtual Accounts for the Taska wallet system**.

Taska operates with **one primary Paystack business account**.

All actual funds collected by Taska remain under Taska's Paystack account.

The balances displayed inside Taska are **internal accounting balances stored in Supabase**.

They represent real monetary claims backed by the funds held by Taska, but the money itself is not physically stored inside Supabase or inside the Taska application.

```text
                         REAL MONEY
                             │
                             ▼
                     ┌────────────────┐
                     │ TASKA PAYSTACK │
                     │    ACCOUNT     │
                     └───────┬────────┘
                             │
                     Actual cash balance
                             │
              ┌──────────────┴──────────────┐
              │                             │
              ▼                             ▼
       User liabilities              Taska revenue
       / wallet balances             / platform fees
              │
              ▼
        ┌─────────────┐
        │   SUPABASE  │
        │             │
        │ Wallets     │
        │ Ledger      │
        │ Escrow      │
        │ Transactions│
        └─────────────┘
```

### Important principle

Supabase does **not hold money**.

Supabase holds the **authoritative accounting records representing who is entitled to how much money**.

Paystack holds the actual funds.

---

# 2. Three categories of money

Taska should distinguish between:

### A. User wallet balances

Money currently available to a user inside Taska.

Example:

```text
Wavy
Wallet: ₦100,000
```

This means Taska's accounting system records that Wavy is entitled to ₦100,000 from Taska's overall funds.

---

### B. Escrow balances

Money temporarily locked for a transaction.

Example:

```text
Wavy wallet
₦100,000

Wavy pays another user
₦40,000

        ↓

₦40,000 moves into escrow

Wavy available wallet
₦60,000

Escrow
₦40,000
```

The money does not leave Taska's Paystack account.

Only the **ownership/accounting state changes** inside Taska.

---

### C. Taska/platform revenue

Money Taska has earned from fees/commissions.

For example:

```text
User transaction
₦100,000

Platform fee
₦X

User/recipient receives
₦100,000 - ₦X
```

The actual commission percentage is **NOT currently defined**.

Therefore:

```text
commission_rate
```

must be configurable.

Do **not** hardcode `10%`.

10% is only an example during development.

---

# 3. Internal money movement

Taska can move value between internal accounts without moving money through Paystack.

For example:

```text
User A Wallet
      │
      │ ₦100,000
      ▼
   ESCROW
      │
      │ transaction completed
      ▼
User B Wallet
```

The actual Paystack balance does not change.

Only the Taska ledger changes.

This is extremely important.

### Example

Taska Paystack balance:

```text
₦10,000,000
```

User A:

```text
₦1,000,000
```

User B:

```text
₦500,000
```

Escrow:

```text
₦200,000
```

Taska revenue:

```text
₦300,000
```

These are **accounting allocations of the ₦10m held by Taska**, not separate piles of cash.

---

# 4. The accounting equation

Taska should conceptually maintain:

```text
Actual Taska funds
=
User wallet liabilities
+
Escrow liabilities
+
Taska/platform funds
+
other applicable balances
```

The exact accounting treatment should be reviewed with the company's finance/legal team, but the engineering system should preserve enough information to reconcile these categories.

---

# 5. Deposit flow

Suppose a user deposits:

```text
₦100,000
```

through Paystack.

### Step 1

User starts a deposit.

```text
POST /api/wallet/deposit
```

Backend generates a unique transaction reference.

Example:

```text
TASKA_DEP_01JXXXX
```

Do not generate payment references on the frontend.

---

### Step 2

Backend initializes the Paystack transaction.

The frontend receives the authorization information needed to complete payment.

---

### Step 3

User pays.

Paystack processes the transaction.

---

### Step 4

Paystack sends the webhook:

```text
charge.success
```

Taska's webhook endpoint receives it.

---

### Step 5

Taska verifies the webhook signature.

Paystack uses the `x-paystack-signature` header, generated using HMAC-SHA512 with the Paystack secret key. The webhook must be verified before processing the event. 

---

### Step 6

Taska checks idempotency.

If this Paystack transaction has already been processed:

```text
STOP
```

Do not credit the wallet again.

---

### Step 7

Taska verifies the transaction.

The backend should verify the transaction with Paystack before treating it as a successful deposit.

---

### Step 8

Calculate the platform fee.

Example only:

```text
Gross:
₦100,000

Configured platform fee:
10%

Fee:
₦10,000

Wallet credit:
₦90,000
```

Again:

**10% is only an example.**

The backend should retrieve the applicable fee configuration.

---

### Step 9

Atomically record:

```text
Deposit
+₦100,000 gross

Platform fee
+₦10,000

User wallet
+₦90,000
```

All of this should happen inside a PostgreSQL transaction.

---

# 6. Wallet-to-wallet transfer

Suppose:

```text
User A wallet = ₦100,000
```

and sends:

```text
₦20,000
```

to User B.

The money does **not** need to touch Paystack.

Taska performs an internal ledger operation.

```text
User A
-₦20,000

Platform fee
+₦X

User B
+₦20,000 - ₦X
```

depending on the transaction's fee rules.

For example, if the configured fee were 10%:

```text
User A
-₦20,000

Taska
+₦2,000

User B
+₦18,000
```

The actual fee percentage should come from the fee configuration.

---

# 7. Escrow flow

Escrow should be treated as another internal account/state.

Example:

```text
Buyer Wallet
₦100,000

Purchase
₦50,000

        ↓

Buyer Wallet
₦50,000

Escrow
₦50,000
```

When the transaction completes:

```text
Escrow
-₦50,000

Seller Wallet
+₦50,000
```

If Taska takes a commission:

```text
Escrow
-₦50,000

Seller
+₦45,000

Taska
+₦5,000
```

Again, these are ledger entries.

No Paystack transaction is necessary for this internal movement.

---

# 8. Escrow cancellation/refund

If the transaction is cancelled:

```text
Escrow
-₦50,000

Buyer wallet
+₦50,000
```

If a fee was only supposed to be earned upon successful completion, **do not recognize the fee as revenue before completion**.

The exact business rule should be configurable.

---

# 9. Withdrawal flow

Withdrawals are where real money finally leaves Taska's Paystack account.

Suppose:

```text
User wallet
₦100,000
```

User requests:

```text
₦100,000
```

Backend calculates the applicable withdrawal fee.

Example:

```text
Requested
₦100,000

Platform fee
₦10,000

Bank payout
₦90,000
```

The actual percentage is configurable.

---

# 10. Withdrawal bank-account setup

Taska should not blindly send money to whatever account number the user enters.

The backend should:

1. Receive bank code + account number.
2. Resolve/verify the bank account through Paystack.
3. Get the account name.
4. Display the resolved account name to the user.
5. Require confirmation.
6. Create/store a Paystack transfer recipient.
7. Reuse the recipient for future withdrawals.

Paystack provides bank-account resolution and transfer-recipient functionality for this flow. 

Example:

```text
User enters:

Bank:
GTBank

Account:
0123456789

        ↓

Paystack Resolve Account

        ↓

Account Name:
ANOINTE... OLORUNWA

        ↓

User confirms

        ↓

Create transfer recipient

        ↓

RCP_xxxxxxxxx
```

Store the recipient code in Supabase.

---

# 11. Do not deduct the wallet permanently before transfer success

Use wallet locking.

Before withdrawal:

```text
available_balance = ₦100,000
locked_balance = ₦0
```

Withdrawal request:

```text
available_balance = ₦0
locked_balance = ₦100,000
```

Then initiate Paystack Transfer.

### Success

```text
locked_balance = ₦0
withdrawal = successful
```

### Failure

```text
locked_balance = ₦0
available_balance = ₦100,000
withdrawal = failed
```

This prevents double-spending.

---

# 12. Paystack Transfer flow

Paystack's documented transfer process is essentially:

```text
Create recipient
       ↓
Initiate transfer
       ↓
Wait for transfer status
       ↓
Webhook confirms outcome
```

Relevant transfer events include:

```text
transfer.success
transfer.failed
transfer.reversed
``` 


The backend should **not** treat "Paystack accepted my transfer request" as equivalent to "the user has received the money."

---

# 13. Paystack Dashboard — enabling Transfers

This part is important.

Your Paystack account needs to have **Transfers enabled/activated** before Taska can use the Transfer API for payouts.

In the Paystack Dashboard, go to the **Transfers** section and follow the activation/onboarding flow for your business account. Paystack may require business/account verification and other information before enabling payouts.

Once enabled, you should be able to access the transfer functionality from the Dashboard and use the API with your secret key.

Paystack's transfer documentation is the authoritative place to check your account's current eligibility and activation requirements. 

### For your coding agent

Tell it:

> Before implementing production withdrawals, use the Paystack MCP to inspect the connected Paystack account's current Transfer capabilities/configuration. Confirm whether Transfers are enabled and whether the account is in test/live mode. Do not assume that having a Paystack account automatically means live transfers are enabled.

And obviously:

```text
TEST MODE
   ↓
Test withdrawals

LIVE MODE
   ↓
Actual bank transfers
```

Do **not** test the first implementation by sending real money. 😂

---

# 14. Supabase database architecture

I'd use these core tables:

```text
profiles
wallets
wallet_accounts
wallet_transactions
ledger_entries
escrow_transactions
withdrawals
deposit_transactions
platform_revenue
fee_configurations
paystack_events
paystack_recipients
```

---

## `wallets`

```text
id
user_id
currency
available_balance
locked_balance
status
created_at
updated_at
```

Use integer minor units.

For NGN:

```text
₦100,000
=
10,000,000 kobo
```

Never use floating-point values for financial amounts.

---

# 15. `wallet_transactions`

Every user-facing financial operation should have a transaction record.

```text
id
wallet_id
user_id

type
direction

gross_amount
fee_amount
net_amount

currency

status

reference
paystack_reference

description
metadata

created_at
updated_at
```

Possible types:

```text
deposit
withdrawal
wallet_transfer
escrow_lock
escrow_release
refund
reversal
adjustment
```

---

# 16. `ledger_entries`

For serious accounting, use double-entry-style ledger records.

Example deposit:

```text
Platform cash
+₦100,000

User liability
+₦90,000

Taska revenue
+₦10,000
```

Example wallet transfer:

```text
User A liability
-₦20,000

User B liability
+₦18,000

Taska revenue
+₦2,000
```

This makes reconciliation much easier.

---

# 17. `escrow_transactions`

```text
id
transaction_id
buyer_id
seller_id

amount
fee_amount
seller_amount

status

locked_at
released_at
refunded_at

metadata
created_at
updated_at
```

Possible states:

```text
pending
funded
locked
released
refunded
cancelled
disputed
```

---

# 18. `withdrawals`

```text
id
user_id
wallet_id

requested_amount
fee_amount
payout_amount

bank_code
account_number
account_name

paystack_recipient_code
paystack_transfer_code
paystack_reference

status
failure_reason

created_at
updated_at
completed_at
```

---

# 19. `platform_revenue`

Do NOT simply calculate Taska revenue by looking at wallet balances.

Record revenue explicitly.

```text
id
source
transaction_id
user_id

amount
currency

created_at
```

Possible sources:

```text
deposit_fee
withdrawal_fee
wallet_transfer_fee
escrow_fee
other
```

---

# 20. `fee_configurations`

This is where the "10%" thing should live.

```text
id
fee_type
rate
fixed_amount
active
effective_from
effective_until
created_at
updated_at
```

Examples:

```text
deposit
0.10

withdrawal
0.10

wallet_transfer
0.10

escrow
0.10
```

**These are examples only.**

The CEO/team can later decide:

```text
deposit = 2%
withdrawal = 1%
wallet transfer = 0.5%
escrow = 5%
```

without rewriting the payment architecture.

---

# 21. Snapshot the fee used on every transaction

This is important.

Suppose today the fee is:

```text
10%
```

Tomorrow the company changes it to:

```text
5%
```

An old ₦100,000 transaction should still remember:

```text
commission_rate = 10%
commission_amount = ₦10,000
```

Therefore every transaction should store:

```text
fee_rate
fee_amount
```

at the time it occurs.

---

# 22. Webhook processing

Create:

```text
POST /api/paystack/webhook
```

The webhook handler should:

```text
Receive webhook
       ↓
Read raw body
       ↓
Validate Paystack signature
       ↓
Identify event
       ↓
Check idempotency
       ↓
Process event
       ↓
Commit database transaction
       ↓
Return HTTP 200
```

Paystack recommends responding with HTTP `200` to acknowledge webhook receipt, and webhook handling should be idempotent. 

---

# 23. Events Taska should handle

### Payments

```text
charge.success
```

### Transfers

```text
transfer.success
transfer.failed
transfer.reversed
```

### Other payment events

Your coding agent should use the Paystack MCP/docs to inspect the current event catalogue and add handlers only for events relevant to Taska.

---

# 24. Idempotency

Every external Paystack transaction/reference should have a unique constraint.

Example:

```text
paystack_reference UNIQUE
```

And webhook events should have their own deduplication mechanism.

This prevents:

```text
Paystack webhook
      ↓
₦100,000 deposit

Webhook sent again
      ↓
WITHOUT idempotency
      ↓
Another ₦100,000 credited 😭
```

---

# 25. Concurrency protection

Wallet operations must be atomic.

For example:

```text
Wallet:
₦50,000
```

Two simultaneous withdrawals:

```text
Request A → ₦50k
Request B → ₦50k
```

Both cannot succeed.

Use PostgreSQL row locking / transactional RPC logic so only one operation can reserve the balance.

---

# 26. Paystack MCP instructions for the coding agent

Give the coding agent these rules:

> **Paystack MCP usage**
>
> 1. Use the Paystack MCP to inspect available Paystack API capabilities before implementing any Paystack integration.
> 2. Verify exact endpoint names, request parameters, response structures, supported currencies, and current transfer/DVA/subaccount capabilities through the MCP and official Paystack documentation.
> 3. Do not invent Paystack API fields or endpoints.
> 4. Never expose `PAYSTACK_SECRET_KEY` to client-side code.
> 5. Keep all Paystack API calls server-side.
> 6. Use Paystack webhooks as the asynchronous source of payment/transfer status.
> 7. Verify webhook signatures.
> 8. Make webhook processing idempotent.
> 9. Store Paystack references/codes in Supabase.
> 10. Never use Paystack balance as the Taska user wallet balance.
> 11. Supabase is the source of truth for Taska's internal ledger.
> 12. Paystack is the external payment/settlement provider.
> 13. Never directly modify wallet balances from the frontend.
> 14. All wallet mutations must occur through trusted backend/database transactional operations.
> 15. Use integer minor currency units for all monetary calculations.
> 16. Never hardcode the platform commission percentage.
> 17. Snapshot the fee rate and fee amount on each financial transaction.
> 18. Test all payment/transfer flows in Paystack test mode before enabling live transfers.

---

# 27. Environment variables

```env
PAYSTACK_SECRET_KEY=
PAYSTACK_PUBLIC_KEY=

SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

The secret key belongs **only on the backend**.

Do not put:

```env
PAYSTACK_SECRET_KEY
SUPABASE_SERVICE_ROLE_KEY
```

inside frontend JavaScript.

---

# 28. Admin dashboard

Eventually Taska should have a financial dashboard showing:

```text
TASKA FINANCIAL OVERVIEW

Paystack balance
₦X

Total user wallet liabilities
₦X

Total escrow
₦X

Taska revenue
₦X

Pending withdrawals
₦X

Today's deposits
₦X

Today's withdrawals
₦X

Today's platform fees
₦X

Reconciliation
✓ Balanced
```

And importantly:

```text
Paystack actual balance
        vs
Taska ledger balance
```

should be reconcilable.

---

# 29. Reconciliation

Build a scheduled/admin reconciliation process.

Conceptually:

```text
Paystack actual balance
        ↓
Taska accounting records
        ↓
Compare
        ↓
Match?
   ┌────┴────┐
  YES        NO
   │          │
   ✓          ⚠️
```

If there's a discrepancy:

```text
Expected:
₦10,000,000

Actual:
₦9,950,000

Difference:
-₦50,000
```

Flag it for investigation.

**Never automatically "fix" a financial discrepancy by changing balances blindly.**

---

# 30. Final money-flow diagram

This is the mental model I want the coding agent to understand:

```text
                         ┌────────────────────┐
                         │  TASKA PAYSTACK    │
                         │     ACCOUNT        │
                         │                    │
                         │   ACTUAL MONEY     │
                         └─────────┬──────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    │                             │
              MONEY IN                         MONEY OUT
                    │                             │
              Paystack payment             Paystack transfer
                    │                             │
                    ▼                             ▼
              ┌──────────┐                 User's bank
              │  TASKA   │
              │ BACKEND  │
              └────┬─────┘
                   │
                   ▼
              ┌──────────┐
              │ SUPABASE │
              │  LEDGER  │
              └────┬─────┘
                   │
       ┌───────────┼──────────────┐
       │           │              │
       ▼           ▼              ▼
   User Wallet   Escrow       Taska Revenue
       │           │
       │           │
       ├───────────┤
       │           │
       ▼           ▼
   User A       User B
   Wallet       Wallet
```

And **this is the key idea**:

> **Paystack handles the real-world movement of money into and out of Taska. Taska's ledger handles ownership and movement of that money within the platform.**

So:

```text
Bank → Taska
        ↓
    Paystack

Taska wallet → Escrow
        ↓
    Supabase ledger

Escrow → User wallet
        ↓
    Supabase ledger

User wallet → User bank
        ↓
    Paystack Transfer
```

That is the architecture I'd give my coding agent.