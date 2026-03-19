# AccPac/PRO ERP - Sales Order Creation Logic

Reverse-engineered from `ac_inboundcreate.prg` (FoxPro batch import system).
Use this document + `SO_Creation_SQL_Logic.sql` as the blueprint for building SO creation in the `twg_mobile` project.

---

## System Overview

The original FoxPro program imports Shopify/AWS orders from CSV files and creates Sales Orders in the AccPac/PRO ERP system (SQL Server backend). The mobile implementation will replicate the same database operations but triggered from a mobile device instead of CSV import.

### Key Differences for Mobile

| Aspect | FoxPro (Current) | Mobile (Target) |
|--------|------------------|-----------------|
| Customer | Hardcoded `TWGPARTS` | Dynamic from `arcust` |
| Input | CSV file batch | Real-time mobile entry |
| Item types | Simple items + BOM kits | Simple items only |
| Concurrency | Single-user batch | Multi-user simultaneous |
| Warehouse | CSV lookup mapping | User account mapping (TBD) |
| API layer | Direct SQL via ODBC | Direct SQL (no API available in PRO) |

---

## Database Connection

Connection details come from XML config files at `{WheelDr}\config{compid}.xml`:

| Config Field | Purpose |
|-------------|---------|
| `DSN` | ODBC data source name |
| `SQLUSERID` | SQL Server username |
| `SQLPASS` | SQL Server password |
| `COMPDB` | Company database name (e.g., `TWG05`) |
| `SYSDB` | System database name |
| `COMPID` | Company ID (e.g., `05`) |

Table references follow the pattern: `{CompDB}..tablename` (e.g., `TWG05..somast`).

System-level tables use: `{SysDB}..tablename` (e.g., `TWGSYS..sysdata`).

---

## Database Tables Reference

### Core SO Tables

#### `somast` - Sales Order Header
| Column | Type | Source | Description |
|--------|------|--------|-------------|
| `sono` | CHAR(10) | Generated | Sales order number (right-justified numeric string) |
| `custno` | CHAR(10) | Input | Customer number (from `arcust`) |
| `sodate` | DATETIME | System | Date SO created (today) |
| `ordate` | DATETIME | Input | Original order date |
| `shipvia` | VARCHAR | Input/Default | Shipping method (from order or customer default) |
| `fob` | VARCHAR | Default | FOB terms (from customer default) |
| `pterms` | VARCHAR | `arcust` | Payment terms code |
| `pdisc` | NUMERIC(9,3) | `arcust` | Payment discount percentage |
| `pdays` | INT | `arcust` | Payment discount days |
| `pnet` | INT | `arcust` | Net payment days |
| `ordamt` | NUMERIC(12,3) | Calculated | Total order amount |
| `bordamt` | NUMERIC(12,3) | Calculated | Base order amount (= ordamt when exchrat=1) |
| `ponum` | VARCHAR | Generated | PO number = `{prefix}-{orderno}` |
| `ornum` | VARCHAR | Blank | Sales rep order number |
| `glarec` | VARCHAR | `arcust.gllink` | GL account receivable |
| `salesmn` | VARCHAR | `arcust` | Salesman code |
| `terr` | VARCHAR | `arcust` | Territory code |
| `tosw` | CHAR(1) | Fixed `'X'` | To/Sold-to switch |
| `defloc` | CHAR(6) | Fixed `'LA'` | Default warehouse location |
| `taxst` | VARCHAR | Blank | Tax status |
| `taxrate` | NUMERIC(10,3) | 0 | Tax rate (0 when tax handled as lump-sum line) |
| `tax` | NUMERIC(10,3) | 0 | Tax amount (0 when ll_TaxRate=FALSE) |
| `btax` | NUMERIC(10,3) | 0 | Base tax (= tax) |
| `taxsamt` | NUMERIC(10,3) | Calculated | Taxable subtotal amount |
| `websono` | VARCHAR | Input | Web/mobile order ID for traceability |
| `sostat` | CHAR(1) | Calculated | `''`=active, `'V'`=void, `'C'`=closed |
| `sotype` | CHAR(1) | Default blank | Order type |
| `notes` | VARCHAR | Blank | Notes |
| `release` | CHAR(1) | Fixed `'N'` | Release flag |
| `shipcomp` | CHAR(1) | Fixed `'N'` | Shipment complete flag |
| `currid` | VARCHAR | `syccomp` | Currency code |
| `exchrat` | NUMERIC(12,3) | Fixed `1.000` | Exchange rate |
| `adduser` | VARCHAR | System | User who created |
| `adddate` | DATETIME | System | Creation datetime |
| `addtime` | VARCHAR(8) | System | Creation time `HH:MM:SS` |
| `lckuser` | VARCHAR | System | Last modified by (on updates) |
| `lckdate` | DATETIME | System | Last modified datetime |
| `lcktime` | VARCHAR(8) | System | Last modified time |
| `currhist` | CHAR(1) | Read-only | `'X'` = also exists in history table |

#### `soaddr` - Sales Order Address
| Column | Type | Source | Description |
|--------|------|--------|-------------|
| `sono` | CHAR(10) | Generated | Sales order number |
| `custno` | CHAR(10) | Input | Customer number |
| `adtype` | CHAR(1) | Fixed `'D'` | Address type: D=delivery/shipping |
| `company` | VARCHAR | Input | Ship-to company (or person name if no company) |
| `address1` | VARCHAR | Input | Address line 1 |
| `address2` | VARCHAR | Input | Address line 2 |
| `address3` | VARCHAR | Composed | `'email:{email},Ph:{phone}'` |
| `city` | VARCHAR | Input | City |
| `addrstate` | VARCHAR | Input | State/province |
| `zip` | VARCHAR | Input | Postal/zip code |
| `country` | VARCHAR | Input | Country |
| `email` | VARCHAR | Input | Email address |
| `phone` | VARCHAR | Formatted | Phone in `NNN/NNN-NNNN` format |
| `adduser` | VARCHAR | System | Created by |
| `adddate` | DATETIME | System | Creation datetime |
| `addtime` | VARCHAR(8) | System | Creation time |

#### `sotran` - Sales Order Line Items
| Column | Type | Source | Description |
|--------|------|--------|-------------|
| `sono` | CHAR(10) | Generated | Sales order number |
| `tranlineno` | INT(4) | Sequential | Line number (1, 2, 3...) |
| `custno` | CHAR(10) | Input | Customer number |
| `item` | CHAR(25) | Input | Item code (product, SHIP-AC, DISCOUNT-AC, or TAX-AC) |
| `descrip` | VARCHAR | `icitem.itmdesc` | Item description (sanitized) |
| `cost` | NUMERIC(12,3) | `iciloc.slsdcst` | Item cost |
| `price` | NUMERIC(12,3) | Input | Unit price |
| `qtyord` | NUMERIC | Input | Quantity ordered |
| `extprice` | NUMERIC(13,3) | Calculated | `ROUND(qtyord * price * (1 - disc/100), 2)` |
| `ordate` | DATETIME | Input | Order date |
| `rqdate` | DATETIME | Input | Requested date (= ordate) |
| `terr` | VARCHAR | `arcust` | Territory |
| `salesmn` | VARCHAR | `arcust` | Salesman |
| `isoclss` | VARCHAR | `icitem.itmclss` | Item class |
| `glsale` | VARCHAR | `arcust.gllink` | GL sales account |
| `glasst` | VARCHAR | `iciloc.gllink` | GL asset account |
| `stkcode` | CHAR(1) | `icitem` | Stock code (Y/N) |
| `taxable` | CHAR(1) | Calculated | `'Y'` if taxrate > 0, else `'N'` |
| `loctid` | CHAR(6) | Input | Warehouse location |
| `serial` | VARCHAR | `iciqty.qserial` | Serial number |
| `umfact` | NUMERIC | `icitem.sumfact` | Unit of measure conversion factor |
| `umeasur` | VARCHAR | `icitem.sunmsid` | Unit of measure ID |
| `disc` | NUMERIC(10,3) | Calculated | Discount % per line |
| `taxrate` | NUMERIC(10,3) | 0 | Tax rate per line (0 when ll_TaxRate=FALSE) |
| `currid` | VARCHAR | `syccomp` | Currency |
| `exchrat` | NUMERIC(10,3) | Fixed `1.000` | Exchange rate |
| `bcost` | NUMERIC(12,3) | = cost | Base cost |
| `bextpri` | NUMERIC(12,3) | = extprice | Base extended price |
| `bprice` | NUMERIC(12,3) | = price | Base price |
| `tprice` | NUMERIC(12,3) | = price | Translated price |
| `tqtyord` | NUMERIC | = qtyord | Translated quantity |
| `tbprice` | NUMERIC(12,3) | = price | Translated base price |
| `tcost` | NUMERIC(12,3) | = cost | Translated cost |
| `tbcost` | NUMERIC(12,3) | = cost | Translated base cost |
| `transeq` | CHAR(4) | = tranlineno | Transaction sequence (4-char padded string) |
| `origqtyord` | NUMERIC(12,3) | = qtyord | Original quantity ordered |
| `origextpri` | NUMERIC(12,3) | = extprice | Original extended price |
| `sostat` | CHAR(1) | Calculated | `''`=active, `'V'`=void |
| `sotype` | CHAR(1) | Default blank | Order type |
| `adduser` | VARCHAR | System | Created by |
| `adddate` | DATETIME | System | Creation datetime |
| `addtime` | VARCHAR(8) | System | Creation time |
| `taxdist` | VARCHAR | Blank | Tax distribution |
| `currhist` | CHAR(1) | Read-only | `'X'` = also in history table |

### Lookup / Master Tables

#### `arcust` - Customer Master
| Column | Used For |
|--------|----------|
| `custno` | Customer number (primary key) |
| `pterms` | Payment terms code |
| `pdisc` | Payment discount % |
| `pdays` | Discount days |
| `pnet` | Net days |
| `gllink` | GL account link (used for `glarec`, `glsale`) |
| `salesmn` | Default salesman code |
| `terr` | Default territory code |

#### `icitem` - Inventory Item Master
| Column | Used For |
|--------|----------|
| `item` | Item code (25 chars, primary key) |
| `itmdesc` | Item description |
| `webprice` | Web/catalog price (for validation) |
| `stkcode` | Stock code Y/N |
| `itmclss` | Item class (maps to `isoclss` on sotran) |
| `sunmsid` | Unit of measure ID |
| `sumfact` | Unit of measure factor |
| `nserial` | Next serial number counter |
| `taxcode` | Tax code (used as `taxable` for special items like DISCOUNT, TAX) |

#### `iciloc` - Item by Location
| Column | Used For |
|--------|----------|
| `item` | Item code |
| `loctid` | Warehouse location (6 chars) |
| `slsdcst` | Sales/default cost (used as `cost`, `bcost`, `tcost`, `tbcost`) |
| `gllink` | GL link (used as `glasst` on sotran) |
| `icacct`, `rclacct`, `iclacct`, `icacts`, `icactv` | GL accounts (first 6 chars + location ext) |
| `lsupplr` | Last supplier |
| `lavgcst`, `lstdcst`, `llstcst` | Last average/standard/latest cost |
| `slagcst`, `slltcst` | Sales average/latest cost |
| `plagcst`, `plsdcst`, `plltcst` | Prior average/standard/latest cost |

#### `iciqty` - Item Serial Quantity
| Column | Used For |
|--------|----------|
| `item` | Item code |
| `loctid` | Warehouse location |
| `qserial` | Serial number (used as `serial` on sotran) |
| `qtranno` | Transaction number |

#### `icloct` - Inventory Locations
| Column | Used For |
|--------|----------|
| `loctid` | Location ID (6 chars) |
| `icactm` | GL account master - chars 7-9 = account extension for new iciloc records |

#### `syccomp` - Company Master
| Column | Used For |
|--------|----------|
| `compid` | Company ID |
| `currid` | Default currency code |
| `usdcurr` | USD currency flag |

#### `sysdata` - System Data Counters
| Column | Used For |
|--------|----------|
| `sysid` | Counter ID: `'SO{compid}'` for SO#, `'IC{compid}'` for IC# |
| `int1` | Current counter value (next SO# = int1 + 1) |
| `pass2` | Status flag (LEFT(pass2,1) must not be `'D'` = disabled) |

#### `SOsysd` / `ICsysd` - Module-specific System Data
Same structure as `sysdata`, must be kept in sync when counters are updated.

### History Tables

| Current | History | Purpose |
|---------|---------|---------|
| `somast` | `soymst` | SO header history |
| `sotran` | `soytrn` | SO line item history |

History tables have the same structure. When `currhist='X'` on a record, it exists in both current and history tables. Updates must be applied to both.

---

## Special Item Codes

These pseudo-items represent non-product charges on the order:

| Item Code | Padded (25 chars) | Purpose | Qty | Price |
|-----------|-------------------|---------|-----|-------|
| `SHIP-{prefix}` | `'SHIP-AC                  '` | Shipping charge line | 1 | shipping cost |
| `DISCOUNT-{prefix}` | `'DISCOUNT-AC              '` | Order discount line | 1 | discount amount |
| `TAX-{prefix}` | `'TAX-AC                   '` | Tax charge line | 1 | tax amount |

These items must exist in `icitem`, `iciloc`, and `iciqty` before use.

---

## Complete SO Creation Flow

```
MOBILE INPUT
  |
  v
[Step 0] Lookup reference data
  |  SELECT syccomp -> @currid
  |  SELECT arcust  -> @pterms, @pdisc, @pdays, @pnet, @gllink, @salesmn, @terr
  v
[Step 1] Validate each item
  |  SELECT icitem WHERE item = @item
  |  ERROR if not found
  |  WARN if stkcode='Y' AND webprice > order price
  v
[Step 2] Ensure inventory records exist (per item + warehouse)
  |  SELECT iciloc WHERE item + loctid
  |    -> If missing: copy from 'LA' location, adjust GL account suffix
  |  SELECT iciqty WHERE item + loctid
  |    -> If missing: create, increment icitem.nserial + sysdata/ICsysd counters
  v
[Step 3] Generate unique SO# (fetch_sono)
  |  READ  sysdata.int1 WHERE sysid = 'SO{compid}'
  |  INCREMENT by 1
  |  VERIFY not in somast or soymst (loop until unique)
  |  UPDATE sysdata.int1 and SOsysd.int1
  |  ** MUST BE TRANSACTIONAL FOR MULTI-USER **
  v
[Step 4] Verify PO# uniqueness
  |  @ponum = '{prefix}-{orderno}'
  |  CHECK somast WHERE ponum + custno
  |  CHECK soymst WHERE ponum + custno
  |  If found -> ABORT (duplicate order)
  v
[Step 5] INSERT somast (order header)
  |  Initial values from arcust + syccomp
  |  ordamt = 0 (updated in Step 8)
  v
[Step 6] INSERT soaddr (shipping address)
  |  adtype = 'D'
  |  address3 = 'email:{email},Ph:{phone}'
  |  Phone formatted: NNN/NNN-NNNN
  v
[Step 7] INSERT sotran lines
  |  7a. Product lines (per item):
  |      tranlineno = 1, 2, 3...
  |      extprice = ROUND(qtyord * price * (1 - disc/100), 2)
  |      Accumulate: ordamt, taxsamt, discAmt, tax
  |
  |  7b. Shipping line (if shpcost > 0):
  |      item = 'SHIP-AC', qty=1, price=shpcost
  |
  |  7c. Discount line (if discount > 0):
  |      item = 'DISCOUNT-AC', qty=1, price=disc_amount
  |
  |  7d. Tax line (if tax > 0):
  |      item = 'TAX-AC', qty=1, price=tax_amount
  v
[Step 8] UPDATE somast totals
  |  ordamt  = sum of all line extprices (incl. ship/disc/tax)
  |  bordamt = ordamt (exchrat=1)
  |  taxsamt = sum of taxable extprices
  |  sostat  = '' if any active lines, 'V' if all voided
  v
DONE
```

---

## Business Rules

### Discount Calculation (`ll_DiscRate = TRUE`)
- Discount is calculated as a **rate** (percentage), not a fixed amount.
- Rate formula: `disc_rate = ROUND(ABS(extdisc) / extprice * 100, 3)`
- Applied per line: `extprice = ROUND(qtyord * price * (1 - disc_rate/100), 2)`
- If the calculated line-level discount total differs from the order-level discount, a separate DISCOUNT-AC line captures the rounding difference via `sotran_discExtra`.

### Tax Handling (`ll_TaxRate = FALSE`)
- Tax is **NOT** calculated per line item.
- Instead, the total tax amount is added as a single `TAX-AC` line.
- `somast.taxrate`, `somast.tax`, `somast.btax` are all set to 0.
- `sotran.taxrate` on product lines is set to 0.
- `somast.taxsamt` still tracks the taxable subtotal.

### Currency
- All orders use the company's default currency from `syccomp.currid`.
- Exchange rate is always `1.000`.
- All "base" fields (`bordamt`, `btax`, `bcost`, `bextpri`, `bprice`) equal their non-base counterparts.
- All "translated" fields (`tprice`, `tqtyord`, `tbprice`, `tcost`, `tbcost`) also equal their source fields.

### Order Status
| `sostat` | Meaning |
|----------|---------|
| `''` (blank/space) | Active order |
| `'V'` | Voided |
| `'C'` | Closed |
| `'X'` | Cancelled/deleted (on sotran lines) |

### PO Number Generation
- Format: `{prefix}-{orderno}` padded to the `ponum` field width.
- Example: `'AC-12345'` padded to field length.
- Must be unique across `somast` + `soymst` for the given customer.

### SO Number Generation (Critical for Multi-User)
1. Read `sysdata.int1` where `sysid = 'SO{compid}'` and `LEFT(pass2,1) <> 'D'`.
2. New SO# = `int1 + 1` (wraps to 1 if >= 9,999,999,999).
3. Update `sysdata.int1` AND `SOsysd.int1` with new value.
4. Verify SO# doesn't exist in `somast` or `soymst`.
5. If it exists, increment and repeat.
6. **For mobile multi-user: wrap in `BEGIN TRANSACTION` with row locking to prevent duplicates.**

### Item-Location Record Creation (`iciloc`)
When an item is ordered for a warehouse that doesn't have an `iciloc` record:
1. Read the `icloct` record for the target location to get the GL account extension (`SUBSTRING(icactm, 7, 3)`).
2. Copy cost and GL fields from the `'LA'` (default) location's `iciloc` record.
3. Replace the last 3 characters of each GL account field with the target location's extension.
4. The `gllink` field is set to just the extension.

### Item Serial/Quantity Record Creation (`iciqty`)
When an item+location combo doesn't have an `iciqty` record:
1. Increment `icitem.nserial` by 1 for the item.
2. Increment `sysdata.int1` AND `ICsysd.int1` for the IC counter.
3. Insert `iciqty` with the new serial number and transaction number.

### Phone Number Formatting
- Strip all non-digit characters.
- If 11 digits starting with `'1'`: remove leading `'1'`.
- If 10 digits: format as `NNN/NNN-NNNN`.
- Otherwise: leave as-is.

### String Sanitization
- Remove all characters outside ASCII 32-126 (keep only printable ASCII).
- Escape single quotes: `'` becomes `''` for SQL string literals.
- **For mobile: use parameterized queries instead of manual escaping.**

---

## Mobile-Specific Considerations

### What the Mobile App Needs to Provide
| Data | Description |
|------|-------------|
| `custno` | Selected customer (from `arcust` lookup) |
| `loctid` | Warehouse location (from user account mapping - TBD) |
| `ordate` | Order date |
| Items[] | Array of `{item, qty, price}` per line |
| Shipping address | company, addr1, addr2, city, state, zip, country, email, phone |
| `shpcost` | Shipping cost (0 if none) |
| `exttax` | Total tax amount (0 if none) |
| `extdisc` | Total discount amount (0 if none) |
| `freight` | Carrier/shipping method name (optional) |
| `websono` | Mobile order reference ID |

### What the System Derives Automatically
| Data | Source |
|------|--------|
| `sono` | Generated from `sysdata` counter |
| `ponum` | `{prefix}-{orderno}` |
| `currid` | `syccomp.currid` |
| `pterms`, `pdisc`, `pdays`, `pnet` | `arcust` |
| `gllink`, `salesmn`, `terr` | `arcust` |
| `cost` (per item) | `iciloc.slsdcst` |
| `serial` (per item) | `iciqty.qserial` |
| `itmclss`, `stkcode`, `umfact`, `umeasur` | `icitem` |
| `disc_rate` | Calculated from extdisc/extprice |
| `extprice` | `ROUND(qty * price * (1 - disc/100), 2)` |
| `ordamt` | Sum of all line extprices |

### Concurrency Warning
The FoxPro system runs as a single-user batch process. The SO# generation and counter updates have no transaction isolation. For mobile with multiple simultaneous users, you **must**:
1. Use `BEGIN TRANSACTION` / `COMMIT` around SO# generation.
2. Use `SELECT ... WITH (UPDLOCK, HOLDLOCK)` when reading the counter.
3. Consider a stored procedure for the fetch_sono logic.

---

## Files in This Directory

| File | Description |
|------|-------------|
| `ac_inboundcreate.prg` | Original FoxPro source code (3,338 lines) |
| `ac_inboundcreate.exe` | Compiled executable |
| `ac_inboundcreate.FXP` | Compiled FoxPro bytecode |
| `AC_inboundcreate.PJT` | FoxPro project table |
| `AC_inboundcreate.pjx` | FoxPro project metadata |
| `SO_Creation_SQL_Logic.sql` | Reverse-engineered SQL statements for SO creation |
| `README.md` | This file |

---

## Quick Reference: FoxPro Configuration Constants

```
#Define lc_prefix     'AC'           -- Company prefix
#Define lc_custno     'TWGPARTS  '   -- Hardcoded customer (mobile: dynamic)
#Define ll_email      .F.            -- Email notifications disabled
#Define ll_Archive    .T.            -- Archive input files
#Define ll_testing    .F.            -- Testing mode (uses compid 99)
#Define ll_taxRate    .F.            -- Tax NOT per-line (use TAX-AC lump sum)
#Define ll_discRate   .T.            -- Discount calculated as rate %
#Define ll_MSG        .F.            -- GUI messages disabled

Special Items:
  lc_discItem = 'DISCOUNT-AC' (padded to 25)
  lc_taxItem  = 'TAX-AC'      (padded to 25)
  lc_shpItem  = 'SHIP-AC'     (padded to 25)

Default location: 'LA'
Exchange rate:    1.000
tosw:             'X'
release:          'N'
shipcomp:         'N'
```

---

## FoxPro Source Code Key Line References

| Procedure | Line | Purpose |
|-----------|------|---------|
| `importRawData` | 239 | CSV import, validation, dedup |
| `ConvertRaw2SO` | 467 | Main conversion loop |
| `warehouse_setup` | 830 | Load warehouse mapping CSV |
| `Prep_tempTables` | 935 | Load reference data (arcust, syccomp, table structures) |
| `t_somast_create` | 992 | Populate SO header temp record |
| `t_soaddr_create` | 1035 | Populate SO address temp record |
| `t_sotran_nonBOM_create` | 1059 | Populate non-BOM line item |
| `t_sotran_BOM_create` | 1118 | Populate BOM component lines (not needed for mobile) |
| `iciloc_create` | 1178 | Create missing item-location record |
| `iciqty_create` | 1254 | Create missing item-serial record |
| `sotran_shipchrg` | 1370 | Create shipping charge line |
| `sotran_disc` | 1480 | Create discount line |
| `sotran_discExtra` | 1596 | Create discount rounding adjustment line |
| `sotran_tax` | 1706 | Create tax line |
| `order_create` | 1812 | Orchestrate ship/disc/tax lines + finalize totals |
| `verifyponumExist` | 1971 | Check PO# uniqueness in somast + soymst |
| `updateSOMAST` | 2045 | INSERT or UPDATE somast in SQL Server |
| `updateSOTRAN` | 2201 | INSERT, UPDATE, or VOID sotran lines in SQL Server |
| `updateSOADDR` | 2638 | INSERT or UPDATE soaddr in SQL Server |
| `fetch_sono` | 2771 | Generate next unique SO# |
| `chkchar` | 2975 | Sanitize strings (ASCII 32-126, escape quotes) |
| `OpenSqlData` | 2899 | Open SQL Server connection via ODBC DSN |
