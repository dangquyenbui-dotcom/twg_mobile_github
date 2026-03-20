# Sales Order Creation Logic — Technical Review

**For:** Jonathan Lee (IT Manager)
**From:** Mobile Development Team
**Date:** March 19, 2026
**Purpose:** Validate that the TWG Mobile SO creation logic matches the existing AccPac/PRO ERP behavior

---

## Summary

The TWG Mobile app creates Sales Orders by writing directly to the same SQL Server tables that the FoxPro batch import system (`ac_inboundcreate.prg`) uses. The logic was reverse-engineered from the FoxPro source code and implemented in Python. This document details every step so you can confirm the logic is correct.

**Key differences from the FoxPro system:**

| Aspect | FoxPro (Current) | Mobile (New) |
|--------|------------------|--------------|
| Customer | Hardcoded `TWGPARTS` | Dynamic — user searches and selects from `arcust` |
| Input source | CSV file batch import | Real-time mobile form entry |
| Item types | Simple items + BOM kits | Simple items only (no BOM) |
| Concurrency | Single-user batch | Multi-user with row-level locking |
| Warehouse | CSV lookup mapping | User selects from `icloct` dropdown |
| PO Number | `AC-{orderno}` from CSV | User-entered (required field) |
| Prefix | `AC` (hardcoded) | `MOB` (for websono traceability) |
| Transaction safety | None (single-user) | `UPDLOCK, HOLDLOCK` on SO# counter |

---

## Database Tables Written To

### Direct INSERTs

| Table | Database | What we write |
|-------|----------|---------------|
| `somast` | PRO05/PRO06 | Sales Order header (1 row per order) |
| `soaddr` | PRO05/PRO06 | Shipping address (1 row per order, adtype='D') |
| `sotran` | PRO05/PRO06 | Line items (N rows: products + SHIP-AC + DISCOUNT-AC + TAX-AC) |

### Conditional INSERTs (only when records don't exist)

| Table | Database | When |
|-------|----------|------|
| `iciloc` | PRO05/PRO06 | Item+warehouse combo doesn't have a location record |
| `iciqty` | PRO05/PRO06 | Item+warehouse combo doesn't have a serial/qty record |

### UPDATEs

| Table | Database | What we update |
|-------|----------|---------------|
| `somast` | PRO05/PRO06 | Final totals (ordamt, bordamt, taxsamt) after all lines inserted |
| `sysdata` | PROSYS | SO counter (`int1`) — incremented by 1 per order |
| `SOsysd` | PRO05/PRO06 | SO counter mirror — kept in sync with `sysdata` |
| `sysdata` | PROSYS | IC counter (`int1`) — incremented when creating `iciqty` records |
| `ICsysd` | PRO05/PRO06 | IC counter mirror — kept in sync |
| `icitem` | PRO05/PRO06 | `nserial` field — incremented when creating `iciqty` records |

### READ-ONLY lookups

| Table | Database | What we read |
|-------|----------|-------------|
| `syccomp` | PROSYS | Company currency (`currid`) |
| `arcust` | PRO05/PRO06 | Customer terms, GL link, salesman, territory |
| `icitem` | PRO05/PRO06 | Item validation, description, stock code, UOM, class |
| `iciloc` | PRO05/PRO06 | Item cost (`slsdcst`), GL accounts per warehouse |
| `iciqty` | PRO05/PRO06 | Serial number (`qserial`) |
| `icloct` | PRO05/PRO06 | Warehouse GL account extension (`icactm`) |
| `somast` | PRO05/PRO06 | SO# uniqueness check |
| `soymst` | PRO05/PRO06 | SO# uniqueness check (history) |

---

## Complete Step-by-Step Logic

### Step 0: Lookup Reference Data

**0a. Get company currency:**
```sql
SELECT currid
FROM PROSYS..syccomp
WHERE compid = '05'        -- '05' for US, '06' for CA
```
Result: `currid = 'USD'`

**0b. Get customer master data:**
```sql
SELECT custno, pterms, pdisc, pdays, pnet, gllink, salesmn, terr
FROM arcust
WHERE custno = ?            -- e.g., 'TOXCUS    ' (10-char padded)
```
If no row returned → **ERROR: Customer not found**

---

### Step 1: Validate Each Item

For each item in the order:

```sql
SELECT item, itmdesc, stkcode, itmclss, sunmsid, sumfact, nserial, taxcode
FROM icitem
WHERE item = ?              -- e.g., '167-6681FMB              ' (25-char padded)
```
If no row returned → **ERROR: Item not found**

---

### Step 2: Ensure Inventory Records Exist

For each item + warehouse combination:

**2a. Check iciloc (item-location record):**

```sql
SELECT slsdcst, gllink
FROM iciloc
WHERE item = ? AND loctid = ?
```

If the record exists → use `slsdcst` as the item cost and `gllink` as the GL asset account.

If NOT found → create it by copying from the `'LA'` (default) location:

```sql
-- Get GL account extension for the target warehouse
SELECT icactm FROM icloct WHERE loctid = ?
-- Extract: acctExt = characters 7-9 of icactm (e.g., '211' from '12020-211')

-- Get template record from LA location
SELECT * FROM iciloc WHERE item = ? AND loctid = 'LA    '
-- If LA record not found → ERROR: No LA location record for this item

-- Create new iciloc record (copy costs from LA, swap GL account suffix)
INSERT INTO iciloc (
    loctid, item, lsupplr,
    lavgcst, lstdcst, llstcst,
    slagcst, slsdcst, slltcst,
    plagcst, plsdcst, plltcst,
    icacct, rclacct, iclacct, icacts, icactv,
    gllink,
    adduser, adddate, addtime
) VALUES (
    @loctid, @item, @LA_lsupplr,
    @LA_lavgcst, @LA_lstdcst, @LA_llstcst,
    @LA_slagcst, @LA_slsdcst, @LA_slltcst,
    @LA_plagcst, @LA_plsdcst, @LA_plltcst,
    LEFT(@LA_icacct, 6) + @acctExt,     -- Keep first 6 chars, replace last 3
    LEFT(@LA_rclacct, 6) + @acctExt,
    LEFT(@LA_iclacct, 6) + @acctExt,
    LEFT(@LA_icacts, 6) + @acctExt,
    LEFT(@LA_icactv, 6) + @acctExt,
    @acctExt,                            -- gllink = just the 3-char extension
    @adduser, GETDATE(), @addtime
)
```

**2b. Check iciqty (item serial/quantity record):**

```sql
SELECT qserial FROM iciqty WHERE item = ? AND loctid = ?
```

If the record exists → use `qserial` as the serial number for `sotran`.

If NOT found → create it:

```sql
-- Increment item serial counter
SELECT nserial FROM icitem WHERE item = ?
-- new_nserial = nserial + 1

UPDATE icitem SET nserial = @new_nserial WHERE item = ?

-- Increment IC system counter
SELECT int1 FROM PROSYS..sysdata WHERE sysid = 'IC05        '
-- new_int1 = int1 + 1

UPDATE PROSYS..sysdata SET int1 = @new_int1 WHERE sysid = 'IC05        '
UPDATE ICsysd SET int1 = @new_int1 WHERE sysid = 'IC05        '

-- Insert iciqty record
INSERT INTO iciqty (qserial, loctid, item, qtranno, adduser, adddate, addtime)
VALUES (@new_nserial, @loctid, @item, @new_int1, @adduser, GETDATE(), @addtime)
```

**This same process is repeated for special items** (`SHIP-AC`, `DISCOUNT-AC`, `TAX-AC`) if they will be used in the order.

---

### Step 3: Generate Unique SO Number

**This is the most critical step for multi-user safety.**

```sql
-- Lock the counter row (held until COMMIT/ROLLBACK)
SELECT int1
FROM PROSYS..sysdata WITH (UPDLOCK, HOLDLOCK)
WHERE sysid = 'SO05        '
  AND LEFT(RTRIM(ISNULL(pass2, '')), 1) <> 'D'

-- Calculate new SO#
-- new_sono = int1 + 1
-- If new_sono >= 9,999,999,999 then new_sono = 1

-- Format as 10-char right-justified string
-- e.g., 9900001 → '   9900001'

-- Verify SO# doesn't exist in current or history tables
SELECT 1 FROM somast WHERE sono = @new_sono     -- must return no rows
SELECT 1 FROM soymst WHERE sono = @new_sono     -- must return no rows
-- If found in either → increment and check again (loop up to 100 times)

-- Update both counter tables
UPDATE PROSYS..sysdata SET int1 = @new_sono_int WHERE sysid = 'SO05        '
UPDATE SOsysd SET int1 = @new_sono_int WHERE sysid = 'SO05        '
```

**Why UPDLOCK, HOLDLOCK?** Without this, two users submitting orders simultaneously could read the same counter value and generate duplicate SO numbers. The lock ensures only one transaction can read+increment the counter at a time.

---

### Step 4: Verify PO Number Uniqueness

```sql
-- Check current orders
SELECT sono FROM somast WHERE ponum = ? AND custno = ?

-- Check history
SELECT sono FROM soymst WHERE ponum = ? AND custno = ?
```

If found in either table → **ERROR: Duplicate PO#. Existing SO# {sono}**

This prevents the same PO from creating duplicate orders for the same customer.

---

### Step 5: INSERT somast (Order Header)

```sql
INSERT INTO somast (
    sono, custno, sodate, ordate, shipvia, fob,
    pterms, pdisc, pdays, pnet,
    ordamt, ponum, ornum, glarec,
    salesmn, terr, tosw, defloc, taxst,
    adduser, adddate, addtime,
    currid, exchrat, bordamt,
    taxrate, tax, taxsamt, btax,
    websono, sostat, sotype, release, shipcomp
) VALUES (
    @sono,                              -- Generated SO# (10 chars, right-justified)
    @custno,                            -- From user selection
    GETDATE(),                          -- sodate = now
    @ordate,                            -- Order date from form
    @shipvia,                           -- Ship via from form (padded to 12 chars)
    '',                                 -- fob (blank - not from arcust)
    @arcust_pterms,                     -- Payment terms from arcust
    @arcust_pdisc,                      -- Payment discount % from arcust
    @arcust_pdays,                      -- Payment days from arcust
    @arcust_pnet,                       -- Net days from arcust
    0,                                  -- ordamt = 0 (updated in Step 8)
    @ponum,                             -- PO# from form (padded to 20 chars)
    '',                                 -- ornum = blank
    @arcust_gllink,                     -- GL account receivable from arcust
    @arcust_salesmn,                    -- Salesman from arcust
    @arcust_terr,                       -- Territory from arcust
    'X',                                -- tosw = 'X' (always)
    'LA',                               -- defloc = 'LA' (always)
    '',                                 -- taxst = blank
    @adduser,                           -- First 4 chars of user name
    GETDATE(),                          -- adddate
    @addtime,                           -- addtime (HH:MM:SS format)
    @currid,                            -- Currency from syccomp (e.g., 'USD')
    1.000,                              -- Exchange rate (always 1)
    0,                                  -- bordamt = 0 (updated in Step 8)
    0,                                  -- taxrate = 0 (tax is lump-sum, not per-line)
    0,                                  -- tax = 0
    0,                                  -- taxsamt = 0 (updated in Step 8)
    0,                                  -- btax = 0
    'MOB-' + @sono_trimmed,            -- websono for traceability (padded to 20 chars)
    ' ',                                -- sostat = active (space)
    ' ',                                -- sotype = blank
    'N',                                -- release = 'N'
    'N'                                 -- shipcomp = 'N'
)
```

---

### Step 6: INSERT soaddr (Shipping Address)

```sql
INSERT INTO soaddr (
    custno, sono, adtype, company, address1, address2, address3,
    city, addrstate, zip, country,
    email, phone,
    adduser, adddate, addtime
) VALUES (
    @custno,
    @sono,
    'D',                                -- adtype = 'D' (delivery/shipping)
    @ship_company,                      -- From form (padded to 60 chars)
    @ship_address1,                     -- From form (padded to 60 chars)
    @ship_address2,                     -- From form (padded to 60 chars)
    'email:' + @email + ',Ph:' + @phone,-- address3 combined format (padded to 60)
    @ship_city,                         -- Padded to 20 chars
    @ship_state,                        -- Padded to 10 chars
    @ship_zip,                          -- Padded to 10 chars
    @ship_country,                      -- Padded to 15 chars (default 'US')
    @email,                             -- Padded to 50 chars
    @phone_formatted,                   -- NNN/NNN-NNNN format (padded to 20 chars)
    @adduser, GETDATE(), @addtime
)
```

**Phone formatting logic:**
1. Strip all non-digit characters
2. If 11 digits starting with '1': remove leading '1'
3. If 10 digits: format as `NNN/NNN-NNNN` (e.g., `919/755-3699`)
4. Otherwise: leave as-is

---

### Step 7: INSERT sotran Lines

#### 7a. Product Lines (one per item)

For each item, calculate:
- `extprice = ROUND(qty * price * (1 - discount% / 100), 2)`
- Accumulate `ordamt += extprice`
- Accumulate `taxsamt += extprice` (all product lines contribute to taxable amount)

```sql
INSERT INTO sotran (
    sono, tranlineno, custno, item, descrip,
    cost, price, qtyord, extprice,
    ordate, rqdate,
    terr, salesmn, isoclss, glsale, glasst,
    stkcode, taxable, loctid, serial,
    umfact, umeasur,
    disc, taxrate,
    adduser, adddate, addtime,
    currid, exchrat,
    bcost, bextpri, bprice,
    tprice, tqtyord, tbprice, tcost, tbcost,
    transeq, origqtyord, origextpri,
    sostat, sotype
) VALUES (
    @sono,
    @tranlineno,                        -- Sequential: 1, 2, 3...
    @custno,
    @item,                              -- 25-char padded item code
    @itmdesc,                           -- Item description from icitem (sanitized)
    @iciloc_slsdcst,                    -- Cost from iciloc.slsdcst
    @price,                             -- Unit price from user input
    @qty,                               -- Quantity from user input
    @extprice,                          -- ROUND(qty * price * (1 - disc/100), 2)
    @ordate, @ordate,                   -- ordate = rqdate
    @arcust_terr,                       -- Territory from arcust
    @arcust_salesmn,                    -- Salesman from arcust
    @icitem_itmclss,                    -- Item class from icitem
    @arcust_gllink,                     -- GL sales account from arcust.gllink
    @iciloc_gllink,                     -- GL asset account from iciloc.gllink
    @icitem_stkcode,                    -- Stock code from icitem (Y/N)
    'N',                                -- taxable = 'N' (tax is lump-sum, not per-line)
    @loctid,                            -- Warehouse location (6 chars)
    @iciqty_qserial,                    -- Serial number from iciqty
    @icitem_sumfact,                    -- UOM factor from icitem
    @icitem_sunmsid,                    -- UOM ID from icitem
    @disc_rate,                         -- Discount % (0 if no discount)
    0,                                  -- taxrate = 0 (per-line tax disabled)
    @adduser, GETDATE(), @addtime,
    @currid, 1.000,                     -- Currency and exchange rate
    @iciloc_slsdcst,                    -- bcost = cost (base = same, exchrat=1)
    @extprice,                          -- bextpri = extprice
    @price,                             -- bprice = price
    @price, @qty, @price,              -- tprice, tqtyord, tbprice (translated = same)
    @iciloc_slsdcst, @iciloc_slsdcst,  -- tcost, tbcost = cost
    RIGHT('   ' + @tranlineno, 4),     -- transeq (4-char padded, e.g., '   1')
    @qty, @extprice,                    -- origqtyord, origextpri
    ' ', ' '                            -- sostat=active, sotype=blank
)
```

#### 7b. Shipping Line (if shipping cost > 0)

```sql
-- tranlineno += 1
-- ordamt += shpcost
-- Item = 'SHIP-AC' (padded to 25 chars)
-- Same INSERT structure as 7a, but:
--   item = SHIP-AC
--   descrip = from icitem for SHIP-AC
--   price = shipping cost amount
--   qtyord = 1
--   extprice = shipping cost amount
--   disc = 0
--   taxable = from icitem.taxcode for SHIP-AC
```

#### 7c. Discount Line (if total discount > 0)

```sql
-- tranlineno += 1
-- ordamt += disc_amount (negative value)
-- Item = 'DISCOUNT-AC' (padded to 25 chars)
-- Same INSERT structure, but:
--   price = -abs(discount amount)
--   qtyord = 1
--   extprice = -abs(discount amount)
--   sostat = ' ' (always active, even if other lines voided)
```

#### 7d. Tax Line (if total tax > 0)

```sql
-- tranlineno += 1
-- ordamt += tax amount
-- Item = 'TAX-AC' (padded to 25 chars)
-- Same INSERT structure, but:
--   price = tax amount
--   qtyord = 1
--   extprice = tax amount
```

---

### Step 8: UPDATE somast Totals

After all `sotran` lines are inserted:

```sql
UPDATE somast
SET ordamt   = @total_ordamt,          -- Sum of ALL line extprices (products + ship + disc + tax)
    bordamt  = @total_ordamt,          -- Base order amount (= ordamt when exchrat=1)
    taxsamt  = @total_taxsamt,         -- Sum of taxable product line extprices only
    tax      = 0,                      -- 0 because tax is lump-sum TAX-AC line, not per-line
    btax     = 0,                      -- Base tax = 0
    taxrate  = 0,                      -- Tax rate = 0 (per-line tax disabled)
    sostat   = ' ',                    -- Active
    sotype   = ' '                     -- Blank
WHERE sono = @sono
```

---

### Transaction Boundary

**Everything from Step 0 through Step 8 runs within a single SQL Server transaction:**

```
BEGIN TRANSACTION (implicit via autocommit=False)
    Step 0: SELECT syccomp, arcust
    Step 1: SELECT icitem (validate)
    Step 2: SELECT/INSERT iciloc, iciqty (ensure records exist)
    Step 3: SELECT/UPDATE sysdata, SOsysd (SO# generation with UPDLOCK)
    Step 4: SELECT somast, soymst (PO# uniqueness check)
    Step 5: INSERT somast
    Step 6: INSERT soaddr
    Step 7: INSERT sotran (multiple rows)
    Step 8: UPDATE somast
COMMIT

-- On ANY error at any step:
ROLLBACK   -- Nothing is written. No partial orders. Clean slate.
```

---

## Configuration Constants

These match the FoxPro `#Define` constants:

| Constant | Value | Meaning |
|----------|-------|---------|
| `ll_TaxRate` | `FALSE` | Tax is NOT calculated per-line; uses lump-sum TAX-AC line |
| `ll_DiscRate` | `TRUE` | Discount is calculated as a rate (percentage), not fixed amount |
| Exchange rate | `1.000` | Always 1 (no currency conversion) |
| `tosw` | `'X'` | To/Sold-to switch (always X) |
| `defloc` | `'LA'` | Default warehouse location |
| `release` | `'N'` | Release flag |
| `shipcomp` | `'N'` | Ship complete flag |
| Special items | `SHIP-AC`, `DISCOUNT-AC`, `TAX-AC` | Padded to 25 chars |

---

## Field Size Reference

| Field | Type | Size | Notes |
|-------|------|------|-------|
| `sono` | char | 10 | Right-justified numeric string (e.g., `'   9900001'`) |
| `custno` | char | 10 | Right-padded with spaces |
| `item` | char | 25 | Right-padded with spaces |
| `ponum` | char | 20 | Right-padded with spaces |
| `loctid` | char | 6 | Right-padded with spaces |
| `adduser` | char | 4 | First 4 chars of user name |
| `addtime` | char | 8 | `HH:MM:SS` format |
| `tranlineno` | int | 4 | Sequential line number |
| `transeq` | char | 4 | Right-justified string of tranlineno |
| `descrip` | char | 120 | Item description (sanitized to ASCII 32-126) |
| Money fields | money | &mdash; | SQL Server `money` type |

---

## Example: Real Order Created on Sandbox

**Input:**
- Customer: TOXCUS (Toxic Customs, LLC)
- Warehouse: LA
- PO#: TEST-MOBILE-001
- Item: 167-6681FMB (ION 167 Matte Black wheel), qty=4, price=$125.00, 5% discount
- Shipping: $15.00

**Result:**

| Table | Key Fields | Values |
|-------|-----------|--------|
| `somast` | sono=`'   9900001'`, custno=`'TOXCUS    '` | ordamt=490.00, ponum=`'TEST-MOBILE-001     '`, sostat=`' '`, websono=`'MOB-9900001         '` |
| `soaddr` | sono=`'   9900001'`, adtype=`'D'` | company=`'Toxic Customs LLC'`, city=`'Raleigh'`, state=`'NC'`, phone=`'919/755-3699'` |
| `sotran` line 1 | tranlineno=1, item=`'167-6681FMB'` | qty=4, price=125.00, disc=5.000, extprice=475.00 |
| `sotran` line 2 | tranlineno=2, item=`'SHIP-AC'` | qty=1, price=15.00, extprice=15.00 |

**Calculation:** 4 x $125.00 x 0.95 = $475.00 + $15.00 shipping = **$490.00 total**

---

## Questions for Jonathan

1. Is the `iciloc` creation logic correct? (Copy costs from LA, swap GL account suffix using `icloct.icactm` chars 7-9)
2. Is `tosw = 'X'` correct for mobile-originated orders?
3. Should `defloc` always be `'LA'`, or should it match the user-selected warehouse?
4. The FoxPro system sets `fob` from the customer record, but `arcust` doesn't have a `fob` column — is it derived from somewhere else?
5. Should the `adduser` field use the ERP user ID (4 chars) or something else for mobile users?
6. Are there any triggers or stored procedures on `somast`/`sotran` that fire on INSERT that we should be aware of?
7. Is there anything the FoxPro system does after creating the SO that we should also do (e.g., update `arcust` fields, send notifications)?
