-- =============================================================================
-- SALES ORDER CREATION - SQL LOGIC
-- Reverse-engineered from ac_inboundcreate.prg (FoxPro)
-- For use in twg_mobile project
-- =============================================================================
--
-- This documents the exact SQL operations needed to create a Sales Order
-- in AccPac/PRO ERP. All table references use the pattern: {CompDB}..tablename
-- where CompDB comes from config XML (e.g., 'TWG05..somast').
--
-- CONFIGURATION CONSTANTS (from FoxPro #Define):
--   Prefix      = 'AC'  (or per-company)
--   ShipItem    = 'SHIP-AC'       (padded to 25 chars)
--   DiscItem    = 'DISCOUNT-AC'   (padded to 25 chars)
--   TaxItem     = 'TAX-AC'        (padded to 25 chars)
--   DiscRate    = TRUE   (calculate discount as rate, not fixed amount)
--   TaxRate     = FALSE  (don't calculate tax per line; use lump-sum TAX line)
--   Currency    = from syccomp.currid
--   ExchangeRate= 1.000
-- =============================================================================


-- =============================================================================
-- STEP 0: LOOKUP REFERENCE DATA
-- These SELECTs gather master data needed throughout the process.
-- =============================================================================

-- 0a. Get company currency
SELECT currid, usdcurr
FROM {SysDB}..syccomp WITH (NOLOCK)
WHERE compid = @compid;
-- Store: @currid = currid

-- 0b. Get customer master data (for the selected customer)
SELECT custno, pterms, pdisc, pdays, pnet, gllink, salesmn, terr
FROM {CompDB}..arcust
WHERE custno = @custno;
-- Store: @pterms, @pdisc, @pdays, @pnet, @gllink, @salesmn, @terr


-- =============================================================================
-- STEP 1: VALIDATE ITEM
-- Before adding any line item, verify it exists in inventory master.
-- =============================================================================

SELECT *
FROM {CompDB}..icitem
WHERE item = @item;
-- If no rows returned -> ERROR: 'item#Invalid'
-- Store: @itmdesc, @stkcode, @itmclss, @sunmsid (umeasur), @sumfact (umfact),
--        @taxcode, @webprice, @nserial


-- =============================================================================
-- STEP 2: ENSURE ITEM-LOCATION RECORDS EXIST (iciloc + iciqty)
-- For each item + warehouse combo, these records must exist.
-- If missing, create them by copying from the 'LA' (default) location.
-- =============================================================================

-- 2a. Check if iciloc exists for item+location
SELECT *
FROM {CompDB}..iciloc
WHERE item = @item AND loctid = @loctid;

-- If NOT found, create it:
--   First get the GL account extension from the target location:
SELECT icactm
FROM {CompDB}..icloct
WHERE loctid = @loctid;
-- Store: @acctExt = SUBSTRING(icactm, 7, 3)

--   Then get template from 'LA' location:
SELECT *
FROM {CompDB}..iciloc
WHERE item = @item AND loctid = 'LA';
-- If LA record not found -> ERROR (cannot proceed)

--   Insert new iciloc record:
INSERT INTO {CompDB}..iciloc
(loctid, item, lsupplr, lavgcst, lstdcst, llstcst,
 slagcst, slsdcst, slltcst, plagcst, plsdst, plltcst,
 icacct, rclacct, iclacct, icacts, icactv, gllink,
 itemstat, iftype, adduser, adddate, addtime)
VALUES (
    @loctid, @item, @LA_lsupplr,
    @LA_lavgcst, @LA_lstdcst, @LA_llstcst,
    @LA_slagcst, @LA_slsdcst, @LA_slltcst,
    @LA_plagcst, @LA_plsdcst, @LA_plltcst,
    LEFT(@LA_icacct,6) + @acctExt,    -- GL accounts: keep first 6 chars,
    LEFT(@LA_rclacct,6) + @acctExt,   -- replace last 3 with target location ext
    LEFT(@LA_iclacct,6) + @acctExt,
    LEFT(@LA_icacts,6) + @acctExt,
    LEFT(@LA_icactv,6) + @acctExt,
    @acctExt,                          -- gllink = just the extension
    @LA_itemstat, @LA_iftype, @userid, GETDATE(), CONVERT(VARCHAR(8), GETDATE(), 108)
);
COMMIT;

-- Re-read to get the new record:
SELECT *
FROM {CompDB}..iciloc
WHERE item = @item AND loctid = @loctid;
-- Store: @slsdcst (cost), @iciloc_gllink (glasst)


-- 2b. Check if iciqty exists for item+location
SELECT *
FROM {CompDB}..iciqty
WHERE item = @item AND loctid = @loctid;

-- If NOT found, create it:
--   Increment item serial number:
SELECT nserial FROM {CompDB}..icitem WHERE item = @item;
-- @new_nserial = nserial + 1

UPDATE {CompDB}..icitem
SET nserial = @new_nserial
WHERE item = @item;
COMMIT;

--   Increment system IC counter:
SELECT int1 FROM {SysDB}..sysdata WHERE sysid = @IC_sysid;  -- e.g., 'IC05'
-- @new_int1 = int1 + 1

UPDATE {SysDB}..sysdata SET int1 = @new_int1 WHERE sysid = @IC_sysid;
COMMIT;

UPDATE {CompDB}..ICsysd SET int1 = @new_int1 WHERE sysid = @IC_sysid;
COMMIT;

--   Insert iciqty record:
INSERT INTO {CompDB}..iciqty
(qserial, loctid, item, qtranno, adduser, adddate, addtime)
VALUES (
    @new_nserial, @loctid, @item, @new_int1,
    @userid, GETDATE(), CONVERT(VARCHAR(8), GETDATE(), 108)
);
COMMIT;

-- Re-read to get qserial:
SELECT qserial
FROM {CompDB}..iciqty
WHERE item = @item AND loctid = @loctid;
-- Store: @qserial


-- =============================================================================
-- STEP 3: GENERATE SALES ORDER NUMBER (fetch_sono)
-- Atomic: read counter, increment, verify unique, update.
-- =============================================================================

-- Read current SO counter:
SELECT int1
FROM {SysDB}..sysdata WITH (NOLOCK)
WHERE sysid = @SO_sysid        -- e.g., 'SO05'
  AND LEFT(pass2, 1) <> 'D';
-- @new_sono = STR(int1 + 1)
-- If @new_sono >= 9999999999 then @new_sono = 1

-- Update both counter tables:
UPDATE {SysDB}..sysdata
SET int1 = @new_sono
WHERE sysid = @SO_sysid AND LEFT(pass2, 1) <> 'D';
COMMIT;

UPDATE {CompDB}..SOsysd
SET int1 = @new_sono
WHERE sysid = @SO_sysid AND LEFT(pass2, 1) <> 'D';
COMMIT;

-- Verify SO# doesn't already exist (check both current and history):
SELECT sono FROM {CompDB}..somast WHERE sono = @new_sono;
SELECT sono FROM {CompDB}..soymst WHERE sono = @new_sono;
-- If found in either -> increment @new_sono and repeat the whole loop
-- Continue until a unique SO# is found


-- =============================================================================
-- STEP 4: VERIFY PO# UNIQUENESS (verifyponumExist)
-- The PO# (prefix + '-' + order#) must not already exist.
-- =============================================================================

-- @ponum = LEFT(@prefix + '-' + @orderno + SPACE(N), N)  -- padded to ponum field length

-- Check somast (current orders):
SELECT *
FROM {CompDB}..somast
WHERE ponum = @ponum AND custno = @custno;
COMMIT;

-- If not found, check soymst (history):
SELECT *
FROM {CompDB}..soymst
WHERE ponum = @ponum AND custno = @custno;
COMMIT;

-- If found in EITHER table:
--   @existing_sono = sono
--   @existing_sostat = sostat  (V=void, C=closed)
--   -> DO NOT create new SO. Mark order as history/void/closed.
--   -> RETURN (skip Steps 5-8)


-- =============================================================================
-- STEP 5: INSERT SOMAST (Sales Order Header)
-- =============================================================================

INSERT INTO {CompDB}..somast
(sono, custno, sodate, ordate, shipvia, fob,
 pterms, pdisc, pdays, pnet,
 ordamt, ponum, ornum, glarec,
 salesmn, terr, tosw, defloc, taxst,
 adduser, adddate, addtime,
 currid, exchrat, bordamt,
 taxrate, tax, taxsamt, btax,
 websono, sostat, sotype, notes, release, shipcomp)
VALUES (
    @sono,                              -- generated SO#
    @custno,                            -- customer# (from arcust)
    GETDATE(),                          -- sodate = today
    @ordate,                            -- order date (from mobile input)
    ISNULL(@freight, @default_shipvia), -- shipvia: from order or customer default
    @fob,                               -- FOB (from customer default)
    @pterms,                            -- payment terms (from arcust)
    @pdisc,                             -- payment discount % (from arcust)
    @pdays,                             -- payment days (from arcust)
    @pnet,                              -- net days (from arcust)
    @ordamt,                            -- total order amount (calculated after all lines)
    @ponum,                             -- PO# = prefix + '-' + order#
    '',                                 -- ornum (sales rep order#, blank)
    @gllink,                            -- GL account (from arcust.gllink)
    @salesmn,                           -- salesman (from arcust)
    @terr,                              -- territory (from arcust)
    'X',                                -- tosw = 'X' (always)
    'LA',                               -- defloc = 'LA' (default location)
    '',                                 -- taxst (blank)
    @userid,                            -- adduser
    GETDATE(),                          -- adddate
    CONVERT(VARCHAR(8), GETDATE(), 108),-- addtime (HH:MM:SS)
    @currid,                            -- currency (from syccomp)
    1.000,                              -- exchange rate (always 1)
    @ordamt,                            -- bordamt = ordamt (base = same, exchrat=1)
    0.000,                              -- taxrate (0 when ll_TaxRate=FALSE)
    0.000,                              -- tax (0 when ll_TaxRate=FALSE, else calculated)
    @taxsamt,                           -- taxable amount (sum of taxable extprices)
    0.000,                              -- btax = tax (base)
    @websono,                           -- web/mobile order ID for traceability
    @sostat,                            -- '' = active, 'V' = void
    @sotype,                            -- order type (usually blank)
    '',                                 -- notes
    'N',                                -- release = 'N'
    'N'                                 -- shipcomp = 'N'
);
COMMIT;


-- =============================================================================
-- STEP 6: INSERT SOADDR (Shipping Address)
-- =============================================================================

INSERT INTO {CompDB}..soaddr
(custno, sono, adtype, company, address1, address2, address3,
 city, addrstate, zip, country,
 email, phone,
 adduser, adddate, addtime)
VALUES (
    @custno,
    @sono,
    'D',                                -- adtype = 'D' (delivery)
    @company,                           -- ship-to company name
    @address1,                          -- address line 1
    @address2,                          -- address line 2
    'email:' + @email + ',Ph:' + @phone, -- address3 = email + phone combined
    @city,
    @state,
    @zip,
    @country,
    @email,
    @phone_formatted,                   -- NNN/NNN-NNNN format
    @userid,
    GETDATE(),
    CONVERT(VARCHAR(8), GETDATE(), 108)
);
COMMIT;


-- =============================================================================
-- STEP 7: INSERT SOTRAN (Line Items)
-- Repeat for EACH product line item. @tranlineno starts at 1, increments per line.
-- =============================================================================

-- 7a. PRODUCT LINE (non-BOM item only, per your requirement)
--
-- Before inserting, ensure iciloc and iciqty exist (Step 2 above).
--
-- Calculate discount rate:
--   @disc_rate = 0
--   IF @extprice > 0 AND @extdisc > 0:
--     @disc_rate = ROUND(ABS(@extdisc) / @extprice * 100, 3)
--
-- Calculate extended price:
--   @extprice_calc = ROUND(@qtyord * @price * (1 - @disc_rate/100), 2)
--
-- Accumulate running totals (used in Step 5 ordamt and Step 8):
--   @ln_taxsamt += IF(@taxrate > 0 AND taxable='Y', @extprice_calc, 0)
--   @ln_discAmt += @qtyord * @price - @extprice_calc
--   @ln_tax     += ROUND(@extprice_calc * @taxrate / 100, 2)
--   @ln_ordamt  += @extprice_calc + ROUND(@extprice_calc * @taxrate / 100, 2)

INSERT INTO {CompDB}..sotran
(sono, tranlineno, custno, item, descrip,
 cost, price, qtyord, extprice,
 ordate, rqdate,
 terr, salesmn, isoclss, glsale, glasst,
 stkcode, taxable, loctid, serial,
 umfact, umeasur,
 disc, taxrate,
 adduser, adddate, addtime,
 currid, exchrat,
 bcost, bextpri, bprice,
 tprice, tqtyord, tbprice,
 tcost, tbcost,
 transeq,
 origqtyord, origextpri,
 sostat, sotype)
VALUES (
    @sono,
    @tranlineno,                        -- sequential: 1, 2, 3...
    @custno,
    @item,                              -- item code
    @itmdesc,                           -- item description (sanitized)
    @slsdcst,                           -- cost (from iciloc.slsdcst)
    @price,                             -- unit price
    @qtyord,                            -- quantity ordered
    @extprice_calc,                     -- ROUND(qtyord * price * (1 - disc/100), 2)
    @ordate,                            -- order date
    @ordate,                            -- requested date = order date
    @terr,                              -- territory (from arcust)
    @salesmn,                           -- salesman (from arcust)
    @itmclss,                           -- item class (from icitem)
    @gllink,                            -- GL sale account (from arcust.gllink)
    @iciloc_gllink,                     -- GL asset account (from iciloc.gllink)
    @stkcode,                           -- stock code Y/N (from icitem)
    IIF(@taxrate > 0, 'Y', 'N'),       -- taxable flag
    @loctid,                            -- warehouse location
    @qserial,                           -- serial# (from iciqty)
    @sumfact,                           -- unit of measure factor (from icitem)
    @sunmsid,                           -- unit of measure (from icitem)
    @disc_rate,                         -- discount % (0 if ll_DiscRate=FALSE)
    0.000,                              -- taxrate per line (0 when ll_TaxRate=FALSE)
    @userid,
    GETDATE(),
    CONVERT(VARCHAR(8), GETDATE(), 108),
    @currid,
    1.000,                              -- exchange rate
    @slsdcst,                           -- bcost = cost (base)
    @extprice_calc,                     -- bextpri = extprice (base, exchrat=1)
    @price,                             -- bprice = price (base)
    @price,                             -- tprice = price (translated)
    @qtyord,                            -- tqtyord
    @price,                             -- tbprice
    @slsdcst,                           -- tcost
    @slsdcst,                           -- tbcost
    RIGHT('   ' + CAST(@tranlineno AS VARCHAR(4)), 4), -- transeq (4-char padded)
    @qtyord,                            -- origqtyord
    @extprice_calc,                     -- origextpri
    @sostat,                            -- '' or 'V'
    @sotype                             -- order type
);
COMMIT;

-- Then update additional fields that weren't in the initial INSERT:
UPDATE {CompDB}..sotran
SET stkcode   = @stkcode,
    taxable   = IIF(@taxrate > 0, 'Y', 'N'),
    taxdist   = '',
    loctid    = @loctid,
    serial    = @qserial,
    exchrat   = 1.000,
    bcost     = @slsdcst,
    bextpri   = @extprice_calc,
    bprice    = @price,
    tprice    = @price,
    tqtyord   = @qtyord,
    tbprice   = @price,
    tcost     = @slsdcst,
    tbcost    = @slsdcst,
    origqtyord = @qtyord,
    origextpri = @extprice_calc,
    disc      = @disc_rate,
    taxrate   = 0.000,
    sostat    = @sostat,
    sotype    = @sotype
WHERE custno = @custno
  AND sono = @sono
  AND tranlineno = @tranlineno;
COMMIT;


-- =============================================================================
-- STEP 7b: SHIPPING CHARGE LINE (if shipping cost > 0)
-- Item code = 'SHIP-AC' (padded to 25 chars)
-- =============================================================================

-- First lookup SHIP-AC item's master data:
SELECT * FROM {CompDB}..icitem  WHERE item = @shipItem;
SELECT * FROM {CompDB}..iciloc  WHERE item = @shipItem AND loctid = @loctid;
SELECT * FROM {CompDB}..iciqty  WHERE item = @shipItem AND loctid = @loctid;

-- @tranlineno += 1

INSERT INTO {CompDB}..sotran
(sono, tranlineno, custno, item, descrip,
 cost, price, qtyord, extprice,
 ordate, rqdate, terr, salesmn, isoclss, glsale, glasst,
 stkcode, taxable, loctid, serial,
 umfact, umeasur, disc, taxrate,
 adduser, adddate, addtime, currid, exchrat,
 bcost, bextpri, bprice, tprice, tqtyord, tbprice, tcost, tbcost,
 transeq, origqtyord, origextpri, sostat, sotype)
VALUES (
    @sono, @tranlineno, @custno,
    @shipItem,                          -- 'SHIP-AC...'
    @ship_itmdesc,                      -- description from icitem
    @ship_slsdcst,                      -- cost from iciloc
    @shpcost,                           -- price = shipping cost amount
    1,                                  -- qty = 1
    @shpcost,                           -- extprice = shipping cost
    @ordate, @ordate,
    @terr, @salesmn, @ship_itmclss, @gllink, @ship_iciloc_gllink,
    @ship_stkcode,
    IIF(@shptaxrate > 0, 'Y', 'N'),    -- taxable
    @loctid, @ship_qserial,
    @ship_sumfact, @ship_sunmsid,
    0,                                  -- disc = 0 (no discount on shipping)
    0.000,                              -- taxrate (0 when ll_TaxRate=FALSE)
    @userid, GETDATE(), CONVERT(VARCHAR(8), GETDATE(), 108),
    @currid, 1.000,
    @ship_slsdcst, @shpcost, @shpcost, @shpcost, 1, @shpcost,
    @ship_slsdcst, @ship_slsdcst,
    RIGHT('   ' + CAST(@tranlineno AS VARCHAR(4)), 4),
    1, @shpcost, @sostat, @sotype
);
COMMIT;

-- Running total update:
--   @ln_ordamt += @shpcost


-- =============================================================================
-- STEP 7c: DISCOUNT LINE (if total discount > 0)
-- Item code = 'DISCOUNT-AC' (padded to 25 chars)
-- Only created when ll_DiscRate=TRUE AND extdisc <> discAmt (rounding diff)
-- OR when ll_DiscRate=FALSE AND extdisc > 0
-- =============================================================================

-- Lookup DISCOUNT-AC item:
SELECT * FROM {CompDB}..icitem  WHERE item = @discItem;
SELECT * FROM {CompDB}..iciloc  WHERE item = @discItem AND loctid = @loctid;
SELECT * FROM {CompDB}..iciqty  WHERE item = @discItem AND loctid = @loctid;

-- @tranlineno += 1
-- @disc_amount = @extdisc + @itemdisc  (or @extdisc + @discAmt for discExtra)

INSERT INTO {CompDB}..sotran
(sono, tranlineno, custno, item, descrip,
 cost, price, qtyord, extprice,
 ordate, rqdate, terr, salesmn, isoclss, glsale, glasst,
 stkcode, taxable, loctid, serial,
 umfact, umeasur, disc, taxrate,
 adduser, adddate, addtime, currid, exchrat,
 bcost, bextpri, bprice, tprice, tqtyord, tbprice, tcost, tbcost,
 transeq, origqtyord, origextpri, sostat, sotype)
VALUES (
    @sono, @tranlineno, @custno,
    @discItem,                          -- 'DISCOUNT-AC...'
    @disc_itmdesc,
    @disc_slsdcst,
    @disc_amount,                       -- price = discount amount
    1,                                  -- qty = 1
    @disc_amount,                       -- extprice = discount amount
    @ordate, @ordate,
    @terr, @salesmn, @disc_itmclss, @gllink, @disc_iciloc_gllink,
    @disc_stkcode,
    @disc_taxcode,                      -- taxable from icitem.taxcode (not calculated)
    @loctid, @disc_qserial,
    @disc_sumfact, @disc_sunmsid,
    0,                                  -- disc = 0
    0,                                  -- taxrate = 0
    @userid, GETDATE(), CONVERT(VARCHAR(8), GETDATE(), 108),
    @currid, 1.000,
    @disc_slsdcst, @disc_amount, @disc_amount, @disc_amount, 1, @disc_amount,
    @disc_slsdcst, @disc_slsdcst,
    RIGHT('   ' + CAST(@tranlineno AS VARCHAR(4)), 4),
    1, @disc_amount, '', @sotype        -- sostat always '' for discount line
);
COMMIT;


-- =============================================================================
-- STEP 7d: TAX LINE (if total tax > 0 AND ll_TaxRate=FALSE)
-- Item code = 'TAX-AC' (padded to 25 chars)
-- Only when tax is NOT calculated per-line (ll_TaxRate=FALSE)
-- =============================================================================

-- Lookup TAX-AC item:
SELECT * FROM {CompDB}..icitem  WHERE item = @taxItem;
SELECT * FROM {CompDB}..iciloc  WHERE item = @taxItem AND loctid = @loctid;
SELECT * FROM {CompDB}..iciqty  WHERE item = @taxItem AND loctid = @loctid;

-- @tranlineno += 1

INSERT INTO {CompDB}..sotran
(sono, tranlineno, custno, item, descrip,
 cost, price, qtyord, extprice,
 ordate, rqdate, terr, salesmn, isoclss, glsale, glasst,
 stkcode, taxable, loctid, serial,
 umfact, umeasur, disc, taxrate,
 adduser, adddate, addtime, currid, exchrat,
 bcost, bextpri, bprice, tprice, tqtyord, tbprice, tcost, tbcost,
 transeq, origqtyord, origextpri, sostat, sotype)
VALUES (
    @sono, @tranlineno, @custno,
    @taxItem,                           -- 'TAX-AC...'
    @tax_itmdesc,
    @tax_slsdcst,
    @exttax,                            -- price = tax amount
    1,                                  -- qty = 1
    @exttax,                            -- extprice = tax amount
    @ordate, @ordate,
    @terr, @salesmn, @tax_itmclss, @gllink, @tax_iciloc_gllink,
    @tax_stkcode,
    @tax_taxcode,                       -- taxable from icitem.taxcode
    @loctid, @tax_qserial,
    @tax_sumfact, @tax_sunmsid,
    0,                                  -- disc = 0
    0,                                  -- taxrate = 0
    @userid, GETDATE(), CONVERT(VARCHAR(8), GETDATE(), 108),
    @currid, 1.000,
    @tax_slsdcst, @exttax, @exttax, @exttax, 1, @exttax,
    @tax_slsdcst, @tax_slsdcst,
    RIGHT('   ' + CAST(@tranlineno AS VARCHAR(4)), 4),
    1, @exttax, '', @sotype             -- sostat always '' for tax line
);
COMMIT;


-- =============================================================================
-- STEP 8: UPDATE SOMAST TOTALS
-- After all sotran lines are inserted, update the header with final totals.
-- =============================================================================

-- Determine sostat: if ANY sotran line has sostat=' ' (active), then header=' '
-- If ALL lines are 'V' (void), then header='V'

-- @sostat = ' ' if any active lines exist, else 'V'
-- (Check: SELECT COUNT(*) FROM t_sotran WHERE sostat = ' ')

UPDATE {CompDB}..somast
SET tax      = 0.000,                   -- 0 when ll_TaxRate=FALSE
    btax     = 0.000,                   -- 0 when ll_TaxRate=FALSE
    taxsamt  = @ln_taxsamt,             -- sum of taxable extended prices
    ordamt   = @ln_ordamt,              -- total order amount
    bordamt  = @ln_ordamt,              -- base order amount (same, exchrat=1)
    sostat   = @sostat,                 -- '' or 'V'
    sotype   = @sotype
WHERE sono = @sono;
COMMIT;


-- =============================================================================
-- COMPLETE EXECUTION ORDER SUMMARY
-- =============================================================================
--
-- For each Sales Order from mobile:
--
-- 1. SELECT reference data:
--    - syccomp (currency)
--    - arcust  (customer terms, GL, salesman, territory)
--
-- 2. For EACH line item:
--    a. Validate item exists in icitem
--    b. Ensure iciloc exists for item+warehouse (create from LA if missing)
--    c. Ensure iciqty exists for item+warehouse (create if missing)
--    d. Calculate discount rate, extended price
--    e. Accumulate running totals
--
-- 3. Verify PO# doesn't exist in somast or soymst
--    - If exists: ABORT, do not create duplicate
--
-- 4. Generate unique SO# (fetch_sono):
--    - Read sysdata.int1, increment
--    - Verify not in somast or soymst
--    - Update sysdata.int1 and SOsysd.int1
--
-- 5. INSERT somast (header) with initial values
-- 6. INSERT soaddr (shipping address)
-- 7. INSERT sotran lines:
--    a. Product lines (one per item)
--    b. Shipping line (SHIP-AC) if shpcost > 0
--    c. Discount line (DISCOUNT-AC) if discount > 0
--    d. Tax line (TAX-AC) if tax > 0
-- 8. UPDATE somast with final calculated totals
--
-- =============================================================================


-- =============================================================================
-- HELPER: PHONE NUMBER FORMATTING
-- =============================================================================
-- Input:  raw phone string
-- Logic:  extract digits only
--         if 10 digits: NNN/NNN-NNNN
--         if 11 digits starting with '1': strip leading 1, then NNN/NNN-NNNN
-- SQL equivalent:
--   DECLARE @digits VARCHAR(20) = (extract only 0-9 chars from @phone)
--   IF LEN(@digits) = 11 AND LEFT(@digits,1) = '1'
--     SET @digits = SUBSTRING(@digits, 2, 10)
--   IF LEN(@digits) = 10
--     SET @phone_formatted = LEFT(@digits,3) + '/' + SUBSTRING(@digits,4,3) + '-' + RIGHT(@digits,4)


-- =============================================================================
-- HELPER: STRING SANITIZATION (chkchar equivalent)
-- =============================================================================
-- Strip all characters outside ASCII 32-126 range
-- Escape single quotes: ' -> '' (for SQL injection prevention)
-- In SQL Server, use parameterized queries instead of manual escaping!


-- =============================================================================
-- KEY FIELD SIZE REFERENCE (from FoxPro field definitions)
-- =============================================================================
-- sono:        10 chars (numeric string, right-justified with spaces)
-- custno:      10 chars (padded with spaces)
-- item:        25 chars (padded with spaces)
-- ponum:       varies (check via SELECT TOP 1 LEN(ponum) FROM somast)
-- descrip:     varies
-- loctid:       6 chars
-- tranlineno:   4 numeric
-- All money fields: NUMERIC(12,3) or similar
-- Dates:       DATETIME
-- Times:       VARCHAR(8) in HH:MM:SS format
