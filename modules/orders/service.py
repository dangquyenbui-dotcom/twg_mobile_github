"""
TWG Mobile — Sales Order Creation Service
Implements the 8-step SO creation flow from the AccPac/PRO ERP.
All operations run within a single pyodbc transaction for atomicity.
"""

import re
import logging
from datetime import datetime
from flask import current_app
from db import get_raw_connection, get_company_id

logger = logging.getLogger(__name__)


class SOCreationError(Exception):
    """Raised when SO creation fails."""
    def __init__(self, code, message):
        self.code = code
        self.message = message
        super().__init__(message)


def create_sales_order(order_data, region, user):
    """
    Create a Sales Order in the AccPac/PRO ERP.
    All-or-nothing: commits on success, rolls back on any error.

    Args:
        order_data: dict with custno, loctid, ordate, ponum, shipvia, items, etc.
        region: "US" or "CA"
        user: session user dict (name, email, etc.)

    Returns:
        dict with success, sono, ordamt

    Raises:
        SOCreationError with code and message
    """
    conn = get_raw_connection(region)
    dryrun = current_app.config.get("ORDER_DRYRUN", False)
    sys_db = current_app.config.get("DB_SYS_NAME", "PROSYS")
    compid = get_company_id(region)

    try:
        cursor = conn.cursor()

        # Extract input
        custno = _pad(order_data["custno"], 10)
        loctid = _pad(order_data.get("loctid", "LA"), 6)
        ordate = order_data.get("ordate", datetime.now().strftime("%Y-%m-%d"))
        ponum = _pad(order_data.get("ponum", ""), 20)
        shipvia = order_data.get("shipvia", "")
        notes = order_data.get("notes", "")
        ship_to = order_data.get("ship_to", {})
        items = order_data.get("items", [])
        shpcost = float(order_data.get("shpcost", 0))
        exttax = float(order_data.get("exttax", 0))
        extdisc = float(order_data.get("extdisc", 0))

        adduser = _pad((user.get("name", "MOB") or "MOB")[:4], 4)
        now = datetime.now()
        addtime = now.strftime("%H:%M:%S")

        if not items:
            raise SOCreationError(2, "No line items provided")

        # ── Step 0: Lookup reference data ──
        currid = _get_currency(cursor, sys_db, compid)
        cust = _get_customer(cursor, custno)

        # ── Step 1 & 2: Validate items and ensure inventory records ──
        item_details = []
        for li in items:
            item_code = _pad(li["item"], 25)
            detail = _validate_item(cursor, item_code)
            iloc = _ensure_iciloc(cursor, item_code, loctid, sys_db, compid, adduser, now, addtime)
            iqty = _ensure_iciqty(cursor, item_code, loctid, sys_db, compid, adduser, now, addtime)
            detail["iciloc"] = iloc
            detail["iciqty"] = iqty
            detail["qty"] = float(li.get("qty", 1))
            detail["price"] = float(li.get("price", 0))
            detail["discount"] = float(li.get("discount", 0))
            item_details.append(detail)

        # Ensure special items exist for ship/disc/tax if needed
        special_items = {}
        if shpcost > 0:
            special_items["SHIP"] = _prepare_special_item(
                cursor, "SHIP-AC", loctid, sys_db, compid, adduser, now, addtime)
        if extdisc > 0:
            special_items["DISC"] = _prepare_special_item(
                cursor, "DISCOUNT-AC", loctid, sys_db, compid, adduser, now, addtime)
        if exttax > 0:
            special_items["TAX"] = _prepare_special_item(
                cursor, "TAX-AC", loctid, sys_db, compid, adduser, now, addtime)

        # ── Step 3: Generate unique SO# ──
        sono = _fetch_sono(cursor, sys_db, compid)

        # ── Step 4: Verify PO# uniqueness ──
        if ponum.strip():
            _verify_ponum(cursor, ponum, custno)

        # ── Step 5: INSERT somast ──
        _insert_somast(cursor, sono, custno, cust, currid, ordate, shipvia,
                       ponum, notes, adduser, now, addtime)

        # ── Step 6: INSERT soaddr ──
        _insert_soaddr(cursor, sono, custno, ship_to, adduser, now, addtime)

        # ── Step 7: INSERT sotran lines ──
        tranlineno = 0
        ordamt = 0.0
        taxsamt = 0.0

        # 7a. Product lines
        for detail in item_details:
            tranlineno += 1
            disc_rate = detail["discount"]
            extprice = round(detail["qty"] * detail["price"] * (1 - disc_rate / 100), 2)
            ordamt += extprice
            taxsamt += extprice  # all product lines are taxable amount basis

            _insert_sotran(cursor, sono, tranlineno, custno, detail, cust,
                           currid, loctid, ordate, disc_rate, extprice,
                           adduser, now, addtime)

        # 7b. Shipping line
        if shpcost > 0:
            tranlineno += 1
            ordamt += shpcost
            _insert_special_line(cursor, sono, tranlineno, custno,
                                 special_items["SHIP"], shpcost,
                                 cust, currid, loctid, ordate,
                                 adduser, now, addtime)

        # 7c. Discount line (negative amount)
        if extdisc > 0:
            tranlineno += 1
            disc_amount = -abs(extdisc)
            ordamt += disc_amount
            _insert_special_line(cursor, sono, tranlineno, custno,
                                 special_items["DISC"], disc_amount,
                                 cust, currid, loctid, ordate,
                                 adduser, now, addtime)

        # 7d. Tax line
        if exttax > 0:
            tranlineno += 1
            ordamt += exttax
            _insert_special_line(cursor, sono, tranlineno, custno,
                                 special_items["TAX"], exttax,
                                 cust, currid, loctid, ordate,
                                 adduser, now, addtime)

        # ── Step 8: UPDATE somast totals ──
        cursor.execute("""
            UPDATE somast
            SET ordamt = ?, bordamt = ?, taxsamt = ?,
                tax = 0, btax = 0, taxrate = 0,
                sostat = ' ', sotype = ' '
            WHERE sono = ?
        """, (ordamt, ordamt, taxsamt, sono))

        if dryrun:
            conn.rollback()
            logger.info("DRYRUN: SO# %s would be created for %s (amt=%.2f)",
                        sono.strip(), custno.strip(), ordamt)
        else:
            conn.commit()
            logger.info("SO# %s created for %s by %s (amt=%.2f)",
                        sono.strip(), custno.strip(), adduser.strip(), ordamt)

        return {
            "success": True,
            "sono": sono.strip(),
            "ordamt": ordamt,
            "dryrun": dryrun
        }

    except SOCreationError:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        logger.exception("SO creation failed: %s", str(e))
        raise SOCreationError(9, "Unexpected error: " + str(e))
    finally:
        conn.close()


# ═══════════════════════════════════════════════════════════════════════
# Internal helper functions
# ═══════════════════════════════════════════════════════════════════════

def _pad(val, length):
    """Right-pad a string with spaces to the given length."""
    s = str(val or "")
    return s.ljust(length)[:length]


def _get_currency(cursor, sys_db, compid):
    """Step 0a: Get company currency from syccomp."""
    cursor.execute(
        "SELECT currid FROM %s..syccomp WHERE compid = ?" % sys_db,
        (_pad(compid, 10),)
    )
    row = cursor.fetchone()
    if not row:
        raise SOCreationError(9, "Company %s not found in syccomp" % compid)
    return row.currid.strip()


def _get_customer(cursor, custno):
    """Step 0b: Get customer master data."""
    cursor.execute("""
        SELECT custno, pterms, pdisc, pdays, pnet, gllink, salesmn, terr
        FROM arcust WHERE custno = ?
    """, (custno,))
    row = cursor.fetchone()
    if not row:
        raise SOCreationError(4, "Customer %s not found" % custno.strip())
    return {
        "custno": row.custno, "pterms": row.pterms, "pdisc": row.pdisc,
        "pdays": row.pdays, "pnet": row.pnet, "gllink": row.gllink,
        "salesmn": row.salesmn, "terr": row.terr
    }


def _validate_item(cursor, item_code):
    """Step 1: Validate item exists in icitem."""
    cursor.execute("""
        SELECT item, itmdesc, stkcode, itmclss, sunmsid, sumfact, nserial, taxcode
        FROM icitem WHERE item = ?
    """, (item_code,))
    row = cursor.fetchone()
    if not row:
        raise SOCreationError(2, "Item %s not found" % item_code.strip())
    return {
        "item": row.item, "itmdesc": _sanitize(row.itmdesc),
        "stkcode": row.stkcode, "itmclss": row.itmclss,
        "sunmsid": row.sunmsid, "sumfact": row.sumfact,
        "nserial": row.nserial, "taxcode": row.taxcode
    }


def _ensure_iciloc(cursor, item, loctid, sys_db, compid, adduser, now, addtime):
    """Step 2a: Ensure iciloc exists for item+location, create from LA if missing."""
    cursor.execute(
        "SELECT slsdcst, gllink FROM iciloc WHERE item = ? AND loctid = ?",
        (item, loctid)
    )
    row = cursor.fetchone()
    if row:
        return {"slsdcst": row.slsdcst or 0, "gllink": (row.gllink or "").strip()}

    # Need to create from LA template
    cursor.execute(
        "SELECT icactm FROM icloct WHERE loctid = ?", (loctid,)
    )
    loct = cursor.fetchone()
    if not loct:
        raise SOCreationError(5, "Location %s not found in icloct" % loctid.strip())
    acct_ext = (loct.icactm or "")[6:9].strip() if len(loct.icactm or "") >= 9 else "000"

    la_loc = _pad("LA", 6)
    cursor.execute(
        "SELECT * FROM iciloc WHERE item = ? AND loctid = ?",
        (item, la_loc)
    )
    la_row = cursor.fetchone()
    if not la_row:
        raise SOCreationError(5, "No LA location record for item %s" % item.strip())

    # Get column names for the LA row
    la_cols = [desc[0] for desc in cursor.description]
    la_dict = dict(zip(la_cols, la_row))

    # GL account fields: keep first 6 chars, replace last 3 with target extension
    gl_fields = ["icacct", "rclacct", "iclacct", "icacts", "icactv"]
    for gf in gl_fields:
        val = la_dict.get(gf, "") or ""
        if len(val) >= 6:
            la_dict[gf] = val[:6] + _pad(acct_ext, 3)

    cursor.execute("""
        INSERT INTO iciloc (loctid, item, lsupplr, lavgcst, lstdcst, llstcst,
            slagcst, slsdcst, slltcst, plagcst, plsdcst, plltcst,
            icacct, rclacct, iclacct, icacts, icactv, gllink,
            adduser, adddate, addtime)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        loctid, item, la_dict.get("lsupplr", ""),
        la_dict.get("lavgcst", 0), la_dict.get("lstdcst", 0), la_dict.get("llstcst", 0),
        la_dict.get("slagcst", 0), la_dict.get("slsdcst", 0), la_dict.get("slltcst", 0),
        la_dict.get("plagcst", 0), la_dict.get("plsdcst", 0), la_dict.get("plltcst", 0),
        la_dict.get("icacct", ""), la_dict.get("rclacct", ""), la_dict.get("iclacct", ""),
        la_dict.get("icacts", ""), la_dict.get("icactv", ""),
        _pad(acct_ext, 3),
        adduser, now, addtime
    ))

    return {"slsdcst": la_dict.get("slsdcst", 0) or 0, "gllink": acct_ext}


def _ensure_iciqty(cursor, item, loctid, sys_db, compid, adduser, now, addtime):
    """Step 2b: Ensure iciqty exists for item+location, create if missing."""
    cursor.execute(
        "SELECT qserial FROM iciqty WHERE item = ? AND loctid = ?",
        (item, loctid)
    )
    row = cursor.fetchone()
    if row:
        return {"qserial": row.qserial}

    # Increment item serial number
    cursor.execute("SELECT nserial FROM icitem WHERE item = ?", (item,))
    ic_row = cursor.fetchone()
    new_nserial = (ic_row.nserial or 0) + 1 if ic_row else 1

    cursor.execute("UPDATE icitem SET nserial = ? WHERE item = ?", (new_nserial, item))

    # Increment IC system counter
    ic_sysid = _pad("IC" + compid, 12)
    cursor.execute(
        "SELECT int1 FROM %s..sysdata WHERE sysid = ?" % sys_db,
        (ic_sysid,)
    )
    sd_row = cursor.fetchone()
    new_int1 = (sd_row.int1 or 0) + 1 if sd_row else 1

    cursor.execute(
        "UPDATE %s..sysdata SET int1 = ? WHERE sysid = ?" % sys_db,
        (new_int1, ic_sysid)
    )
    cursor.execute(
        "UPDATE ICsysd SET int1 = ? WHERE sysid = ?",
        (new_int1, ic_sysid)
    )

    # Insert iciqty
    qserial = _pad(str(new_nserial), 20)
    qtranno = _pad(str(new_int1), 10)
    cursor.execute("""
        INSERT INTO iciqty (qserial, loctid, item, qtranno, adduser, adddate, addtime)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (qserial, loctid, item, qtranno, adduser, now, addtime))

    return {"qserial": qserial}


def _prepare_special_item(cursor, item_name, loctid, sys_db, compid, adduser, now, addtime):
    """Validate and ensure inventory records for special items (SHIP-AC, etc.)."""
    item_code = _pad(item_name, 25)
    detail = _validate_item(cursor, item_code)
    iloc = _ensure_iciloc(cursor, item_code, loctid, sys_db, compid, adduser, now, addtime)
    iqty = _ensure_iciqty(cursor, item_code, loctid, sys_db, compid, adduser, now, addtime)
    detail["iciloc"] = iloc
    detail["iciqty"] = iqty
    return detail


def _fetch_sono(cursor, sys_db, compid):
    """Step 3: Generate unique SO# with row locking."""
    so_sysid = _pad("SO" + compid, 12)

    # Lock the counter row for the duration of this transaction
    cursor.execute("""
        SELECT int1 FROM %s..sysdata WITH (UPDLOCK, HOLDLOCK)
        WHERE sysid = ? AND LEFT(RTRIM(ISNULL(pass2,'')), 1) <> 'D'
    """ % sys_db, (so_sysid,))
    row = cursor.fetchone()
    if not row:
        raise SOCreationError(3, "SO counter not found or disabled for company %s" % compid)

    new_sono_int = int(row.int1 or 0) + 1
    if new_sono_int >= 9999999999:
        new_sono_int = 1

    # Verify the SO# doesn't already exist (loop if needed)
    for _ in range(100):
        sono = str(new_sono_int).rjust(10)
        cursor.execute("SELECT 1 FROM somast WHERE sono = ?", (sono,))
        if cursor.fetchone():
            new_sono_int += 1
            continue
        cursor.execute("SELECT 1 FROM soymst WHERE sono = ?", (sono,))
        if cursor.fetchone():
            new_sono_int += 1
            continue
        break
    else:
        raise SOCreationError(3, "Could not find unused SO# after 100 attempts")

    sono = str(new_sono_int).rjust(10)

    # Update both counter tables
    cursor.execute(
        "UPDATE %s..sysdata SET int1 = ? WHERE sysid = ?" % sys_db,
        (new_sono_int, so_sysid)
    )
    cursor.execute(
        "UPDATE SOsysd SET int1 = ? WHERE sysid = ?",
        (new_sono_int, so_sysid)
    )

    return sono


def _verify_ponum(cursor, ponum, custno):
    """Step 4: Verify PO# is unique for this customer."""
    cursor.execute(
        "SELECT sono FROM somast WHERE ponum = ? AND custno = ?",
        (ponum, custno)
    )
    row = cursor.fetchone()
    if row:
        raise SOCreationError(1, "Duplicate PO#. Existing SO# %s" % row.sono.strip())

    cursor.execute(
        "SELECT sono FROM soymst WHERE ponum = ? AND custno = ?",
        (ponum, custno)
    )
    row = cursor.fetchone()
    if row:
        raise SOCreationError(1, "Duplicate PO# (history). Existing SO# %s" % row.sono.strip())


def _insert_somast(cursor, sono, custno, cust, currid, ordate, shipvia,
                   ponum, notes, adduser, now, addtime):
    """Step 5: INSERT somast header."""
    cursor.execute("""
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
            ?, ?, ?, ?, ?, '',
            ?, ?, ?, ?,
            0, ?, '', ?,
            ?, ?, 'X', 'LA', '',
            ?, ?, ?,
            ?, 1.000, 0,
            0, 0, 0, 0,
            ?, ' ', ' ', 'N', 'N'
        )
    """, (
        sono, custno, now, ordate, _pad(shipvia, 12),
        cust["pterms"], cust["pdisc"], cust["pdays"], cust["pnet"],
        ponum, cust["gllink"],
        cust["salesmn"], cust["terr"],
        adduser, now, addtime,
        currid,
        _pad("MOB-" + sono.strip(), 20)  # websono = mobile reference
    ))


def _insert_soaddr(cursor, sono, custno, ship_to, adduser, now, addtime):
    """Step 6: INSERT soaddr shipping address."""
    phone = _format_phone(ship_to.get("phone", ""))
    email = ship_to.get("email", "") or ""
    addr3 = "email:%s,Ph:%s" % (email, phone)

    cursor.execute("""
        INSERT INTO soaddr (
            custno, sono, adtype, company, address1, address2, address3,
            city, addrstate, zip, country,
            email, phone,
            adduser, adddate, addtime
        ) VALUES (?, ?, 'D', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        custno, sono,
        _pad(ship_to.get("company", ""), 60),
        _pad(ship_to.get("address1", ""), 60),
        _pad(ship_to.get("address2", ""), 60),
        _pad(addr3, 60),
        _pad(ship_to.get("city", ""), 20),
        _pad(ship_to.get("state", ""), 10),
        _pad(ship_to.get("zip", ""), 10),
        _pad(ship_to.get("country", "US"), 15),
        _pad(email, 50),
        _pad(phone, 20),
        adduser, now, addtime
    ))


def _insert_sotran(cursor, sono, tranlineno, custno, detail, cust,
                   currid, loctid, ordate, disc_rate, extprice,
                   adduser, now, addtime):
    """Step 7a: INSERT a product sotran line."""
    cost = detail["iciloc"]["slsdcst"] or 0
    qserial = detail["iciqty"]["qserial"]
    transeq = str(tranlineno).rjust(4)

    cursor.execute("""
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
            tprice, tqtyord, tbprice,
            tcost, tbcost,
            transeq,
            origqtyord, origextpri,
            sostat, sotype
        ) VALUES (
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?,
            ?, ?, ?, ?, ?,
            ?, 'N', ?, ?,
            ?, ?,
            ?, 0,
            ?, ?, ?,
            ?, 1.000,
            ?, ?, ?,
            ?, ?, ?,
            ?, ?,
            ?,
            ?, ?,
            ' ', ' '
        )
    """, (
        sono, tranlineno, custno, detail["item"], detail["itmdesc"],
        cost, detail["price"], detail["qty"], extprice,
        ordate, ordate,
        cust["terr"], cust["salesmn"], detail["itmclss"], cust["gllink"],
        detail["iciloc"]["gllink"],
        detail["stkcode"], loctid, qserial,
        detail["sumfact"] or 1, detail["sunmsid"],
        disc_rate,
        adduser, now, addtime,
        currid,
        cost, extprice, detail["price"],
        detail["price"], detail["qty"], detail["price"],
        cost, cost,
        transeq,
        detail["qty"], extprice
    ))


def _insert_special_line(cursor, sono, tranlineno, custno, detail,
                         amount, cust, currid, loctid, ordate,
                         adduser, now, addtime):
    """Step 7b/c/d: INSERT a special line (SHIP-AC, DISCOUNT-AC, TAX-AC)."""
    cost = detail["iciloc"]["slsdcst"] or 0
    qserial = detail["iciqty"]["qserial"]
    transeq = str(tranlineno).rjust(4)

    cursor.execute("""
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
            tprice, tqtyord, tbprice,
            tcost, tbcost,
            transeq,
            origqtyord, origextpri,
            sostat, sotype
        ) VALUES (
            ?, ?, ?, ?, ?,
            ?, ?, 1, ?,
            ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?,
            0, 0,
            ?, ?, ?,
            ?, 1.000,
            ?, ?, ?,
            ?, 1, ?,
            ?, ?,
            ?,
            1, ?,
            ' ', ' '
        )
    """, (
        sono, tranlineno, custno, detail["item"], detail["itmdesc"],
        cost, amount, amount,
        ordate, ordate,
        cust["terr"], cust["salesmn"], detail["itmclss"], cust["gllink"],
        detail["iciloc"]["gllink"],
        detail["stkcode"], (detail.get("taxcode") or "N").strip(),
        loctid, qserial,
        detail["sumfact"] or 1, detail["sunmsid"],
        adduser, now, addtime,
        currid,
        cost, amount, amount,
        amount, amount,
        cost, cost,
        transeq,
        amount
    ))


def _format_phone(phone):
    """Format phone as NNN/NNN-NNNN."""
    if not phone:
        return ""
    digits = re.sub(r"\D", "", str(phone))
    if len(digits) == 11 and digits[0] == "1":
        digits = digits[1:]
    if len(digits) == 10:
        return "%s/%s-%s" % (digits[:3], digits[3:6], digits[6:])
    return phone


def _sanitize(text):
    """Strip non-printable ASCII characters."""
    if not text:
        return ""
    return "".join(c for c in str(text) if 32 <= ord(c) <= 126)
