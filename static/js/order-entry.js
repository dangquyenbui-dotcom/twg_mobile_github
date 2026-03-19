/**
 * TWG Mobile — Order Entry Wizard
 * Multi-step wizard: Customer → Details → Items → Review
 * Connects to Flask API for live customer/item search from AccPac/PRO ERP.
 */
(function () {
    "use strict";

    // ── State ──
    var currentStep = 1;
    var selectedCustomer = null; // full customer object from API
    var lineItems = [];
    var editingIndex = -1;
    var orderDirty = false;
    var searchTimer = null; // debounce timer for search inputs

    // ── Elements ──
    var stepBtns = document.querySelectorAll(".wizard-step");
    var panels = document.querySelectorAll(".wizard-panel");

    // ── Dirty tracking ──
    function markDirty() { orderDirty = true; }

    function hasUnsavedData() {
        return orderDirty || selectedCustomer !== null || lineItems.length > 0;
    }

    // ── Navigation ──
    function goToStep(step) {
        if (step < 1 || step > 4) return;
        currentStep = step;

        stepBtns.forEach(function (btn) {
            var s = parseInt(btn.getAttribute("data-step"));
            btn.classList.remove("active", "completed");
            if (s === step) btn.classList.add("active");
            else if (s < step) btn.classList.add("completed");
        });

        panels.forEach(function (p) {
            p.classList.toggle("active", parseInt(p.getAttribute("data-panel")) === step);
        });

        var activePanel = document.querySelector('.wizard-panel.active .page-padding');
        if (activePanel) activePanel.scrollTop = 0;

        if (step === 4) populateReview();
    }

    stepBtns.forEach(function (btn) {
        btn.addEventListener("click", function () {
            var s = parseInt(btn.getAttribute("data-step"));
            if (btn.classList.contains("completed")) goToStep(s);
        });
    });

    document.querySelectorAll(".wizard-next-btn[data-goto]").forEach(function (btn) {
        btn.addEventListener("click", function () {
            goToStep(parseInt(btn.getAttribute("data-goto")));
        });
    });

    document.querySelectorAll(".wizard-back-btn[data-goto]").forEach(function (btn) {
        btn.addEventListener("click", function () {
            goToStep(parseInt(btn.getAttribute("data-goto")));
        });
    });

    // ── Leave-page protection ──
    if (window.history && window.history.pushState) {
        window.history.pushState({ wizardActive: true }, "");
        window.addEventListener("popstate", function () {
            if (hasUnsavedData()) {
                window.history.pushState({ wizardActive: true }, "");
                TWG.confirm("Discard Order?", "You have unsaved changes. Are you sure you want to leave?").then(function (ok) {
                    if (ok) {
                        orderDirty = false;
                        selectedCustomer = null;
                        lineItems = [];
                        window.history.back();
                    }
                });
            }
        });
    }

    window.addEventListener("beforeunload", function (e) {
        if (hasUnsavedData()) {
            e.preventDefault();
            e.returnValue = "";
        }
    });

    var navLinks = document.querySelectorAll(".bottom-nav .nav-item");
    navLinks.forEach(function (link) {
        link.addEventListener("click", function (e) {
            if (link.classList.contains("active")) { e.preventDefault(); return; }
            var href = link.getAttribute("href");
            if (!href || href === "#") return;
            if (hasUnsavedData()) {
                e.preventDefault();
                TWG.confirm("Discard Order?", "You have unsaved changes. Are you sure you want to leave?").then(function (ok) {
                    if (ok) {
                        orderDirty = false;
                        selectedCustomer = null;
                        lineItems = [];
                        window.location.href = href;
                    }
                });
            }
        });
    });

    // ══════════════════════════════════════════════════════════════════════
    // Step 1: Customer Selection — Live API Search
    // ══════════════════════════════════════════════════════════════════════

    var selectedCard = document.getElementById("selectedCustomerCard");
    var recentCard = document.getElementById("recentCustomers");
    var searchInput = document.getElementById("customerSearch");
    var searchResults = document.getElementById("searchResults");
    var searchList = document.getElementById("searchResultsList");
    var step1Next = document.getElementById("step1Next");

    function selectCustomer(custno) {
        // Fetch full customer detail from API
        fetch("/orders/api/customers/" + encodeURIComponent(custno))
            .then(function (r) { return r.json(); })
            .then(function (cust) {
                if (cust.error) return;
                selectedCustomer = cust;
                markDirty();

                document.getElementById("selectedAvatar").textContent = (cust.company || "?")[0];
                document.getElementById("selectedName").textContent = cust.company || "";
                document.getElementById("selectedId").textContent = cust.custno;
                document.getElementById("selectedAddress").textContent =
                    (cust.address1 || "") + ", " + (cust.city || "") + ", " + (cust.state || "") + " " + (cust.zip || "");

                selectedCard.style.display = "";
                recentCard.style.display = "none";
                if (searchResults) searchResults.style.display = "none";
                if (searchInput) searchInput.value = "";
                step1Next.disabled = false;

                prefillShipping(cust);
            });
    }

    var changeBtn = document.getElementById("changeCustomerBtn");
    if (changeBtn) {
        changeBtn.addEventListener("click", function () {
            selectedCustomer = null;
            selectedCard.style.display = "none";
            recentCard.style.display = "";
            step1Next.disabled = true;
        });
    }

    step1Next.addEventListener("click", function () {
        if (selectedCustomer) goToStep(2);
    });

    // Customer search — debounced API call
    if (searchInput) {
        searchInput.addEventListener("input", function () {
            var q = searchInput.value.trim();
            if (searchTimer) clearTimeout(searchTimer);

            if (q.length < 2) {
                searchResults.style.display = "none";
                recentCard.style.display = selectedCustomer ? "none" : "";
                return;
            }

            searchTimer = setTimeout(function () {
                fetch("/orders/api/customers/search?q=" + encodeURIComponent(q))
                    .then(function (r) { return r.json(); })
                    .then(function (data) {
                        if (!data.length) {
                            searchList.innerHTML = '<div class="list-item"><div class="list-item-body"><div class="list-item-subtitle">No matches found</div></div></div>';
                        } else {
                            searchList.innerHTML = data.map(function (c) {
                                return '<div class="list-item customer-item" data-customer-id="' + escapeAttr(c.custno) + '">' +
                                    '<div class="profile-avatar" style="width:40px;height:40px;font-size:16px;">' + escapeHtml((c.company || "?")[0]) + '</div>' +
                                    '<div class="list-item-body"><div class="list-item-title">' + escapeHtml(c.company) + '</div>' +
                                    '<div class="list-item-subtitle">' + escapeHtml(c.custno) + ' &bull; ' + escapeHtml(c.city || "") + ', ' + escapeHtml(c.state || "") + '</div></div>' +
                                    '<div class="list-item-trailing"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5l7 7-7 7"/></svg></div></div>';
                            }).join("");
                            searchList.querySelectorAll(".customer-item").forEach(function (el) {
                                el.addEventListener("click", function () {
                                    selectCustomer(el.getAttribute("data-customer-id"));
                                });
                            });
                        }
                        searchResults.style.display = "";
                        recentCard.style.display = "none";
                    });
            }, 300);
        });
    }

    // ══════════════════════════════════════════════════════════════════════
    // Step 2: Pre-fill shipping from customer + load warehouses
    // ══════════════════════════════════════════════════════════════════════

    function prefillShipping(cust) {
        setVal("shipCompany", cust.company || "");
        setVal("shipAddress", cust.address1 || "");
        setVal("shipCity", cust.city || "");
        setVal("shipState", cust.state || "");
        setVal("shipZip", cust.zip || "");
        setVal("salesperson", cust.salesmn || "");
        setVal("territory", cust.terr || "");
        // Set terms from customer record
        var termsEl = document.getElementById("termsId");
        if (termsEl && cust.pterms) {
            // Try to match the pterms value; if not found, add as option
            var found = false;
            for (var i = 0; i < termsEl.options.length; i++) {
                if (termsEl.options[i].value === cust.pterms || termsEl.options[i].text === cust.pterms) {
                    termsEl.selectedIndex = i;
                    found = true;
                    break;
                }
            }
            if (!found) {
                var opt = document.createElement("option");
                opt.value = cust.pterms;
                opt.text = cust.pterms;
                opt.selected = true;
                termsEl.appendChild(opt);
            }
        }
        var dateEl = document.getElementById("orderDate");
        if (dateEl && !dateEl.value) dateEl.value = new Date().toISOString().split("T")[0];
    }

    function setVal(id, val) {
        var el = document.getElementById(id);
        if (el) el.value = val;
    }

    // Track changes on step 2 inputs
    var step2Inputs = document.querySelectorAll('[data-panel="2"] .form-input');
    step2Inputs.forEach(function (inp) {
        inp.addEventListener("input", markDirty);
        inp.addEventListener("change", markDirty);
    });

    // Collapsible additional options
    var moreToggle = document.getElementById("moreOptionsToggle");
    var moreBody = document.getElementById("moreOptionsBody");
    if (moreToggle && moreBody) {
        moreToggle.addEventListener("click", function () {
            var open = moreBody.classList.toggle("open");
            moreToggle.classList.toggle("open", open);
        });
    }

    // Load warehouses from API
    var warehouseSelect = document.getElementById("warehouse");
    if (warehouseSelect) {
        fetch("/orders/api/warehouses")
            .then(function (r) { return r.json(); })
            .then(function (data) {
                warehouseSelect.innerHTML = "";
                data.forEach(function (w) {
                    var opt = document.createElement("option");
                    opt.value = w.loctid;
                    opt.text = w.loctid + (w.locdesc ? " - " + w.locdesc : "");
                    warehouseSelect.appendChild(opt);
                });
                // Restore last used warehouse from localStorage
                var last = localStorage.getItem("twg_last_warehouse");
                if (last) warehouseSelect.value = last;
                if (!warehouseSelect.value) warehouseSelect.value = "LA";
            });
        warehouseSelect.addEventListener("change", function () {
            localStorage.setItem("twg_last_warehouse", warehouseSelect.value);
        });
    }

    // ══════════════════════════════════════════════════════════════════════
    // Step 3: Line Items — Live API Item Search
    // ══════════════════════════════════════════════════════════════════════

    var addItemFab = document.getElementById("addItemFab");
    var addItemModal = document.getElementById("addItemModal");
    var closeItemModalBtn = document.getElementById("closeItemModal");
    var itemDetailForm = document.getElementById("itemDetailForm");
    var itemSearchResults = document.getElementById("itemSearchResults");
    var itemSearchInput = document.getElementById("itemSearch");
    var itemSearchBar = document.getElementById("modalSearchBar");
    var confirmAddBtn = document.getElementById("confirmAddItem");
    var emptyState = document.getElementById("itemsEmptyState");
    var lineItemsList = document.getElementById("lineItemsList");
    var subtotalBar = document.getElementById("subtotalBar");
    var step3Next = document.getElementById("step3Next");

    var pendingItem = null;
    var itemSearchTimer = null;

    function getSelectedWarehouse() {
        var el = document.getElementById("warehouse");
        return el ? el.value : "LA";
    }

    function resetItemModal() {
        pendingItem = null;
        editingIndex = -1;
        if (itemSearchBar) itemSearchBar.style.display = "";
        if (itemSearchResults) {
            itemSearchResults.style.display = "";
            itemSearchResults.innerHTML = '<div style="text-align:center;padding:24px 16px;color:var(--color-text-secondary);font-size:14px;">Type to search items by code or description</div>';
        }
        if (itemDetailForm) itemDetailForm.style.display = "none";
        if (itemSearchInput) itemSearchInput.value = "";
    }

    function openItemModal(editIdx) {
        editingIndex = (typeof editIdx === "number") ? editIdx : -1;
        addItemModal.classList.add("open");
        document.body.style.overflow = "hidden";

        if (editingIndex >= 0) {
            var item = lineItems[editingIndex];
            document.getElementById("itemModalTitle").textContent = "Edit Item";
            confirmAddBtn.textContent = "Update Item";
            pendingItem = { itemNo: item.itemNo, desc: item.desc, price: item.price, uom: item.uom };

            if (itemSearchBar) itemSearchBar.style.display = "none";
            if (itemSearchResults) itemSearchResults.style.display = "none";
            itemDetailForm.style.display = "";

            document.getElementById("selItemName").textContent = item.desc;
            document.getElementById("selItemNo").textContent = item.itemNo;
            setVal("itemQty", item.qty);
            setVal("itemPrice", item.price.toFixed(2));
            setVal("itemUom", item.uom);
            setVal("itemDiscount", item.discount || "0");
            calcLineTotal();
        } else {
            document.getElementById("itemModalTitle").textContent = "Add Item";
            confirmAddBtn.textContent = "Add to Order";
            resetItemModal();
        }
    }

    function closeModal() {
        addItemModal.classList.remove("open");
        document.body.style.overflow = "";
        editingIndex = -1;
        pendingItem = null;
        var sheet = document.querySelector(".modal-sheet");
        if (sheet) { sheet.style.maxHeight = ""; sheet.style.bottom = ""; }
        if (document.activeElement) document.activeElement.blur();
    }

    if (addItemFab) addItemFab.addEventListener("click", function () { openItemModal(); });
    if (closeItemModalBtn) closeItemModalBtn.addEventListener("click", closeModal);

    if (addItemModal) {
        addItemModal.addEventListener("click", function (e) {
            if (e.target === addItemModal) closeModal();
        });
    }

    // Item search results — event delegation for dynamically rendered results
    if (itemSearchResults) {
        itemSearchResults.addEventListener("click", function (e) {
            var el = e.target.closest(".item-result");
            if (!el) return;
            var no = el.getAttribute("data-item-no");
            var desc = el.getAttribute("data-desc");
            var price = parseFloat(el.getAttribute("data-price"));
            var uom = el.getAttribute("data-uom");
            pendingItem = { itemNo: no, desc: desc, price: price, uom: uom };

            document.getElementById("selItemName").textContent = desc;
            document.getElementById("selItemNo").textContent = no;
            setVal("itemQty", "1");
            setVal("itemPrice", price.toFixed(2));
            setVal("itemUom", uom);
            setVal("itemDiscount", "0");
            itemDetailForm.style.display = "";
            itemSearchResults.style.display = "none";
            if (itemSearchBar) itemSearchBar.style.display = "none";
            calcLineTotal();
        });
    }

    var changeItemBtn = document.getElementById("changeItemBtn");
    if (changeItemBtn) {
        changeItemBtn.addEventListener("click", function () {
            pendingItem = null;
            itemDetailForm.style.display = "none";
            if (itemSearchBar) itemSearchBar.style.display = "";
            if (itemSearchResults) itemSearchResults.style.display = "";
            if (itemSearchInput) itemSearchInput.value = "";
        });
    }

    // Item search — debounced API call
    if (itemSearchInput) {
        itemSearchInput.addEventListener("input", function () {
            var q = itemSearchInput.value.trim();
            if (itemSearchTimer) clearTimeout(itemSearchTimer);

            // If detail form is visible and user starts typing, go back to search
            if (itemDetailForm.style.display !== "none") {
                itemDetailForm.style.display = "none";
                itemSearchResults.style.display = "";
                pendingItem = null;
            }

            if (q.length < 2) {
                itemSearchResults.innerHTML = '<div style="text-align:center;padding:24px 16px;color:var(--color-text-secondary);font-size:14px;">Type to search items by code or description</div>';
                return;
            }

            itemSearchTimer = setTimeout(function () {
                var loctid = getSelectedWarehouse();
                fetch("/orders/api/items/search?q=" + encodeURIComponent(q) + "&loctid=" + encodeURIComponent(loctid))
                    .then(function (r) { return r.json(); })
                    .then(function (data) {
                        if (!data.length) {
                            itemSearchResults.innerHTML = '<div class="list-item"><div class="list-item-body"><div class="list-item-subtitle">No items found</div></div></div>';
                        } else {
                            itemSearchResults.innerHTML = data.map(function (item) {
                                var price = item.webprice || item.cost || 0;
                                var um = item.umeasur || "EA";
                                return '<div class="list-item item-result" data-item-no="' + escapeAttr(item.item) + '" data-desc="' + escapeAttr(item.descrip) + '" data-price="' + price + '" data-uom="' + escapeAttr(um) + '">' +
                                    '<div class="list-item-body">' +
                                    '<div class="list-item-title">' + escapeHtml(item.descrip) + '</div>' +
                                    '<div class="list-item-subtitle">' + escapeHtml(item.item) + ' &bull; $' + Number(price).toFixed(2) + '/' + escapeHtml(um) + '</div>' +
                                    '</div></div>';
                            }).join("");
                        }
                    });
            }, 300);
        });
    }

    // Calculate line total
    function calcLineTotal() {
        var qty = parseInt(document.getElementById("itemQty").value) || 0;
        var price = parseFloat(document.getElementById("itemPrice").value) || 0;
        var disc = parseFloat(document.getElementById("itemDiscount").value) || 0;
        var total = qty * price * (1 - disc / 100);
        document.getElementById("itemLineTotal").textContent = "$" + total.toFixed(2);
    }

    var qtyInput = document.getElementById("itemQty");
    var priceInput = document.getElementById("itemPrice");
    var discInput = document.getElementById("itemDiscount");
    if (qtyInput) qtyInput.addEventListener("input", calcLineTotal);
    if (priceInput) priceInput.addEventListener("input", calcLineTotal);
    if (discInput) discInput.addEventListener("input", calcLineTotal);

    // Confirm add/update item
    if (confirmAddBtn) {
        confirmAddBtn.addEventListener("click", function () {
            if (!pendingItem) return;
            var qty = parseInt(document.getElementById("itemQty").value) || 1;
            var price = parseFloat(document.getElementById("itemPrice").value) || 0;
            var disc = parseFloat(document.getElementById("itemDiscount").value) || 0;
            var uom = document.getElementById("itemUom").value;
            var total = qty * price * (1 - disc / 100);

            var item = {
                itemNo: pendingItem.itemNo,
                desc: pendingItem.desc,
                qty: qty,
                uom: uom,
                price: price,
                discount: disc,
                total: total
            };

            if (editingIndex >= 0) {
                lineItems[editingIndex] = item;
            } else {
                lineItems.push(item);
            }

            markDirty();
            closeModal();
            renderLineItems();
        });
    }

    // Render line items
    function renderLineItems() {
        if (!lineItems.length) {
            emptyState.style.display = "";
            lineItemsList.innerHTML = "";
            subtotalBar.style.display = "none";
            step3Next.disabled = true;
            return;
        }

        emptyState.style.display = "none";
        step3Next.disabled = false;

        var html = "";
        var subtotal = 0;
        lineItems.forEach(function (item, i) {
            subtotal += item.total;
            html += '<div class="line-item-card" data-index="' + i + '">' +
                '<div class="line-item-row">' +
                    '<div class="line-item-info">' +
                        '<div class="line-item-desc">' + escapeHtml(item.desc) + '</div>' +
                        '<div class="line-item-meta">' + escapeHtml(item.itemNo) + ' &bull; ' + item.qty + ' ' + item.uom + ' @ $' + item.price.toFixed(2) +
                        (item.discount ? ' (-' + item.discount + '%)' : '') + '</div>' +
                    '</div>' +
                    '<div class="line-item-total">$' + item.total.toFixed(2) + '</div>' +
                '</div>' +
                '<div class="line-item-actions">' +
                    '<button class="line-item-edit" data-index="' + i + '">Edit</button>' +
                    '<button class="line-item-delete" data-index="' + i + '">Remove</button>' +
                '</div>' +
            '</div>';
        });
        lineItemsList.innerHTML = html;

        subtotalBar.style.display = "";
        document.getElementById("runningSubtotal").textContent = "$" + subtotal.toFixed(2);

        lineItemsList.querySelectorAll(".line-item-edit").forEach(function (btn) {
            btn.addEventListener("click", function () {
                openItemModal(parseInt(btn.getAttribute("data-index")));
            });
        });
        lineItemsList.querySelectorAll(".line-item-delete").forEach(function (btn) {
            btn.addEventListener("click", function () {
                var idx = parseInt(btn.getAttribute("data-index"));
                TWG.confirm("Remove Item", "Remove " + lineItems[idx].desc + " from this order?").then(function (ok) {
                    if (ok) {
                        lineItems.splice(idx, 1);
                        renderLineItems();
                    }
                });
            });
        });
    }

    // ══════════════════════════════════════════════════════════════════════
    // Step 4: Review & Place Order
    // ══════════════════════════════════════════════════════════════════════

    function populateReview() {
        if (selectedCustomer) {
            document.getElementById("revCustomer").textContent = selectedCustomer.company || "—";
            document.getElementById("revCustId").textContent = selectedCustomer.custno || "—";
        }

        var company = getVal("shipCompany");
        var city = getVal("shipCity");
        var state = getVal("shipState");
        var zip = getVal("shipZip");
        document.getElementById("revShipTo").textContent = company + (city ? ", " + city : "") + (state ? ", " + state : "") + (zip ? " " + zip : "");
        document.getElementById("revPO").textContent = getVal("poNumber") || "—";

        var shipVia = document.getElementById("shipVia");
        document.getElementById("revShipVia").textContent = (shipVia && shipVia.value) ? shipVia.options[shipVia.selectedIndex].text : "—";
        document.getElementById("revDate").textContent = getVal("orderDate") || "—";

        var termsEl = document.getElementById("termsId");
        document.getElementById("revTerms").textContent = termsEl ? (termsEl.options[termsEl.selectedIndex].text || "—") : "—";

        var whEl = document.getElementById("warehouse");
        document.getElementById("revWarehouse").textContent = whEl ? whEl.value : "—";

        var revItems = document.getElementById("revItemsList");
        var subtotal = 0;
        if (lineItems.length) {
            revItems.innerHTML = lineItems.map(function (item) {
                subtotal += item.total;
                return '<div class="list-item"><div class="list-item-body">' +
                    '<div class="list-item-title">' + escapeHtml(item.desc) + '</div>' +
                    '<div class="list-item-subtitle">' + item.qty + ' ' + item.uom + ' @ $' + item.price.toFixed(2) + '</div>' +
                    '</div><div class="list-item-trailing">$' + item.total.toFixed(2) + '</div></div>';
            }).join("");
        } else {
            revItems.innerHTML = '<div class="list-item"><div class="list-item-body"><div class="list-item-subtitle">No items</div></div></div>';
        }

        var taxRate = parseFloat(document.getElementById("taxRate").value) || 0;
        var tax = subtotal * (taxRate / 100);
        var total = subtotal + tax;
        document.getElementById("revSubtotal").textContent = "$" + subtotal.toFixed(2);
        document.getElementById("revTax").textContent = "$" + tax.toFixed(2);
        document.getElementById("revTotal").textContent = "$" + total.toFixed(2);
    }

    // Build the order payload for the API
    function buildOrderPayload() {
        var taxRate = parseFloat(document.getElementById("taxRate").value) || 0;
        var subtotal = 0;
        var items = lineItems.map(function (li) {
            subtotal += li.total;
            return { item: li.itemNo, qty: li.qty, price: li.price, discount: li.discount || 0 };
        });
        var exttax = Math.round(subtotal * (taxRate / 100) * 100) / 100;
        var discPct = parseFloat(document.getElementById("discountPct").value) || 0;
        var extdisc = Math.round(subtotal * (discPct / 100) * 100) / 100;

        return {
            custno: selectedCustomer ? selectedCustomer.custno : "",
            loctid: getVal("warehouse") || "LA",
            ordate: getVal("orderDate"),
            ponum: getVal("poNumber"),
            shipvia: getVal("shipVia"),
            notes: getVal("orderComment"),
            ship_to: {
                company: getVal("shipCompany"),
                address1: getVal("shipAddress"),
                address2: "",
                city: getVal("shipCity"),
                state: getVal("shipState"),
                zip: getVal("shipZip"),
                country: "US",
                email: selectedCustomer ? (selectedCustomer.email || "") : "",
                phone: selectedCustomer ? (selectedCustomer.phone || "") : ""
            },
            items: items,
            shpcost: 0,
            exttax: exttax,
            extdisc: extdisc
        };
    }

    // Place order
    var placeOrderBtn = document.getElementById("placeOrderBtn");
    if (placeOrderBtn) {
        placeOrderBtn.addEventListener("click", function () {
            // Validate required fields
            if (!getVal("poNumber")) {
                TWG.alert("Missing PO Number", "Please enter a PO number in the Order Details step.");
                return;
            }
            TWG.confirm("Place Order", "Submit this order for processing?").then(function (ok) {
                if (ok) {
                    placeOrderBtn.disabled = true;
                    placeOrderBtn.textContent = "Submitting...";
                    var payload = buildOrderPayload();
                    fetch("/orders/api/create", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(payload)
                    })
                    .then(function (r) { return r.json(); })
                    .then(function (data) {
                        if (data.success) {
                            orderDirty = false;
                            selectedCustomer = null;
                            lineItems = [];
                            TWG.alert("Order Created", "SO# " + data.sono + " has been created successfully.\nTotal: $" + Number(data.ordamt).toFixed(2));
                        } else {
                            TWG.alert("Error", data.error || "Failed to create order.");
                        }
                    })
                    .catch(function () {
                        TWG.alert("Connection Error", "Could not reach server. Please try again.");
                    })
                    .then(function () {
                        placeOrderBtn.disabled = false;
                        placeOrderBtn.innerHTML = '<svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 13l4 4L19 7"/></svg> Place Order';
                    });
                }
            });
        });
    }

    // ── Helpers ──
    function getVal(id) {
        var el = document.getElementById(id);
        return el ? el.value.trim() : "";
    }

    function escapeHtml(str) {
        if (!str) return "";
        var div = document.createElement("div");
        div.textContent = str;
        return div.innerHTML;
    }

    function escapeAttr(str) {
        if (!str) return "";
        return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    // ── iOS Virtual Keyboard: resize modal to fit visible area ──
    var modalSheet = document.querySelector(".modal-sheet");
    if (window.visualViewport && modalSheet) {
        var onViewportResize = function () {
            if (!addItemModal.classList.contains("open")) return;
            var vv = window.visualViewport;
            var keyboardOffset = window.innerHeight - vv.height;
            if (keyboardOffset > 50) {
                modalSheet.style.maxHeight = vv.height + "px";
                modalSheet.style.bottom = keyboardOffset + "px";
            } else {
                modalSheet.style.maxHeight = "";
                modalSheet.style.bottom = "";
            }
        };
        window.visualViewport.addEventListener("resize", onViewportResize);
        window.visualViewport.addEventListener("scroll", onViewportResize);
    }

    if (addItemModal) {
        addItemModal.addEventListener("focusin", function (e) {
            if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") {
                setTimeout(function () {
                    e.target.scrollIntoView({ behavior: "smooth", block: "center" });
                }, 300);
            }
        });
    }
})();
