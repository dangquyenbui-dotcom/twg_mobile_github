"""
TWG Mobile — Orders SQL Queries
All order-related database queries live here — no inline SQL in routes.
"""

from db import execute_query


def search_customers(query, region=None, limit=20):
    """Search customers by name, customer number, or phone."""
    sql = """
        SELECT TOP (?)
            RTRIM(custno) AS custno,
            RTRIM(company) AS company,
            RTRIM(address1) AS address1,
            RTRIM(city) AS city,
            RTRIM(addrstate) AS state,
            RTRIM(zip) AS zip,
            RTRIM(phone) AS phone,
            RTRIM(pterms) AS pterms,
            RTRIM(salesmn) AS salesmn,
            RTRIM(terr) AS terr,
            RTRIM(gllink) AS gllink,
            pdisc, pdays, pnet
        FROM arcust WITH (NOLOCK)
        WHERE custno LIKE ? OR company LIKE ? OR phone LIKE ?
        ORDER BY company
    """
    pattern = "%" + query + "%"
    return execute_query(sql, (limit, pattern, pattern, pattern), region)


def get_customer_detail(custno, region=None):
    """Get full customer record for pre-filling order details."""
    sql = """
        SELECT
            RTRIM(custno) AS custno,
            RTRIM(company) AS company,
            RTRIM(contact) AS contact,
            RTRIM(address1) AS address1,
            RTRIM(address2) AS address2,
            RTRIM(city) AS city,
            RTRIM(addrstate) AS state,
            RTRIM(zip) AS zip,
            RTRIM(country) AS country,
            RTRIM(phone) AS phone,
            RTRIM(CAST(email AS varchar(120))) AS email,
            RTRIM(pterms) AS pterms,
            pdisc, pdays, pnet,
            RTRIM(salesmn) AS salesmn,
            RTRIM(terr) AS terr,
            RTRIM(gllink) AS gllink
        FROM arcust WITH (NOLOCK)
        WHERE custno = ?
    """
    rows = execute_query(sql, (custno,), region)
    return rows[0] if rows else None


def search_items(query, loctid="LA", region=None, limit=20):
    """Search inventory items by item code or description."""
    sql = """
        SELECT TOP (?)
            RTRIM(i.item) AS item,
            RTRIM(i.itmdesc) AS descrip,
            RTRIM(i.stkcode) AS stkcode,
            RTRIM(i.itmclss) AS itmclss,
            RTRIM(i.sunmsid) AS umeasur,
            i.sumfact AS umfact,
            i.webprice,
            ISNULL(il.slsdcst, 0) AS cost
        FROM icitem i WITH (NOLOCK)
        LEFT JOIN iciloc il WITH (NOLOCK)
            ON il.item = i.item AND il.loctid = ?
        WHERE (i.item LIKE ? OR i.itmdesc LIKE ?)
          AND i.stkcode = 'Y'
        ORDER BY i.item
    """
    pattern = "%" + query + "%"
    return execute_query(sql, (limit, loctid, pattern, pattern), region)


def get_warehouses(region=None):
    """List all warehouse locations."""
    sql = """
        SELECT
            RTRIM(loctid) AS loctid,
            RTRIM(locdesc) AS locdesc
        FROM icloct WITH (NOLOCK)
        ORDER BY loctid
    """
    return execute_query(sql, (), region)
