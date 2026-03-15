/**
 * TWG Mobile — Order Entry Wizard
 * Multi-step wizard: Customer → Details → Items → Review
 */
(function () {
    "use strict";

    // ── State ──
    var currentStep = 1;
    var selectedCustomer = null;
    var lineItems = [];
    var editingIndex = -1; // -1 = adding new, >= 0 = editing existing
    var orderDirty = false; // tracks if user has entered any data

    // ── Mock data ──
    var customers = {
        "CUST-1042": { name: "Acme Wheel Supply", id: "CUST-1042", address: "1234 Commerce St", city: "Dallas", state: "TX", zip: "75201", terms: "NET30", salesperson: "JD", territory: "SOUTH" },
        "CUST-2187": { name: "Pacific Rim Tires", id: "CUST-2187", address: "5678 Harbor Blvd", city: "Los Angeles", state: "CA", zip: "90012", terms: "NET30", salesperson: "MK", territory: "WEST" },
        "CUST-0839": { name: "Midwest Auto Parts", id: "CUST-0839", address: "910 Lake Shore Dr", city: "Chicago", state: "IL", zip: "60601", terms: "NET60", salesperson: "RB", territory: "CENTRAL" },
        "CUST-1550": { name: "Southeast Distributors", id: "CUST-1550", address: "2200 Peachtree Rd", city: "Atlanta", state: "GA", zip: "30309", terms: "NET30", salesperson: "JD", territory: "SOUTH" },
        "CUST-3201": { name: "Northeast Wheel Co.", id: "CUST-3201", address: "88 Congress St", city: "Boston", state: "MA", zip: "02110", terms: "NET30", salesperson: "TL", territory: "EAST" }
    };

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

        // Scroll the active panel's scrollable area to top
        var activePanel = document.querySelector('.wizard-panel.active .page-padding');
        if (activePanel) activePanel.scrollTop = 0;

        if (step === 4) populateReview();
    }

    // Step indicator clicks (only completed steps)
    stepBtns.forEach(function (btn) {
        btn.addEventListener("click", function () {
            var s = parseInt(btn.getAttribute("data-step"));
            if (btn.classList.contains("completed")) goToStep(s);
        });
    });

    // Next buttons
    document.querySelectorAll(".wizard-next-btn[data-goto]").forEach(function (btn) {
        btn.addEventListener("click", function () {
            goToStep(parseInt(btn.getAttribute("data-goto")));
        });
    });

    // Back buttons — these go back within the wizard, no confirmation needed
    document.querySelectorAll(".wizard-back-btn[data-goto]").forEach(function (btn) {
        btn.addEventListener("click", function () {
            goToStep(parseInt(btn.getAttribute("data-goto")));
        });
    });

    // ── Leave-page protection ──

    // Browser back button / navigation
    // Push a state so we can intercept the back button
    if (window.history && window.history.pushState) {
        window.history.pushState({ wizardActive: true }, "");
        window.addEventListener("popstate", function (e) {
            if (hasUnsavedData()) {
                // Push state again to prevent leaving
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

    // Page refresh / close tab
    window.addEventListener("beforeunload", function (e) {
        if (hasUnsavedData()) {
            e.preventDefault();
            e.returnValue = "";
        }
    });

    // Bottom nav links — intercept clicks when order has data
    var navLinks = document.querySelectorAll(".bottom-nav .nav-item");
    navLinks.forEach(function (link) {
        link.addEventListener("click", function (e) {
            // Allow clicking the already-active Orders tab (does nothing)
            if (link.classList.contains("active")) {
                e.preventDefault();
                return;
            }
            if (hasUnsavedData()) {
                e.preventDefault();
                var href = link.getAttribute("href");
                TWG.confirm("Discard Order?", "You have unsaved changes. Are you sure you want to leave?").then(function (ok) {
                    if (ok) {
                        orderDirty = false;
                        window.location.href = href;
                    }
                });
            }
        });
    });

    // ── Step 1: Customer Selection ──
    var customerItems = document.querySelectorAll(".customer-item");
    var selectedCard = document.getElementById("selectedCustomerCard");
    var recentCard = document.getElementById("recentCustomers");
    var searchInput = document.getElementById("customerSearch");
    var step1Next = document.getElementById("step1Next");

    function selectCustomer(custId) {
        var cust = customers[custId];
        if (!cust) return;
        selectedCustomer = cust;
        markDirty();

        document.getElementById("selectedAvatar").textContent = cust.name[0];
        document.getElementById("selectedName").textContent = cust.name;
        document.getElementById("selectedId").textContent = cust.id;
        document.getElementById("selectedAddress").textContent = cust.address + ", " + cust.city + ", " + cust.state + " " + cust.zip;

        selectedCard.style.display = "";
        recentCard.style.display = "none";
        var searchResults = document.getElementById("searchResults");
        if (searchResults) searchResults.style.display = "none";
        if (searchInput) searchInput.value = "";
        step1Next.disabled = false;

        prefillShipping(cust);
    }

    customerItems.forEach(function (item) {
        item.addEventListener("click", function () {
            selectCustomer(item.getAttribute("data-customer-id"));
        });
    });

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

    // Customer search
    if (searchInput) {
        searchInput.addEventListener("input", function () {
            var q = searchInput.value.trim().toLowerCase();
            var searchResults = document.getElementById("searchResults");
            var searchList = document.getElementById("searchResultsList");
            if (!q) {
                searchResults.style.display = "none";
                recentCard.style.display = selectedCustomer ? "none" : "";
                return;
            }
            var matches = [];
            for (var key in customers) {
                var c = customers[key];
                if (c.name.toLowerCase().indexOf(q) >= 0 || c.id.toLowerCase().indexOf(q) >= 0) {
                    matches.push(c);
                }
            }
            if (matches.length) {
                searchList.innerHTML = matches.map(function (c) {
                    return '<div class="list-item customer-item" data-customer-id="' + c.id + '">' +
                        '<div class="profile-avatar" style="width:40px;height:40px;font-size:16px;">' + c.name[0] + '</div>' +
                        '<div class="list-item-body"><div class="list-item-title">' + c.name + '</div>' +
                        '<div class="list-item-subtitle">' + c.id + ' &bull; ' + c.city + ', ' + c.state + '</div></div>' +
                        '<div class="list-item-trailing"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5l7 7-7 7"/></svg></div></div>';
                }).join("");
                searchList.querySelectorAll(".customer-item").forEach(function (el) {
                    el.addEventListener("click", function () {
                        selectCustomer(el.getAttribute("data-customer-id"));
                    });
                });
                searchResults.style.display = "";
                recentCard.style.display = "none";
            } else {
                searchList.innerHTML = '<div class="list-item"><div class="list-item-body"><div class="list-item-subtitle">No matches found</div></div></div>';
                searchResults.style.display = "";
                recentCard.style.display = "none";
            }
        });
    }

    // ── Step 2: Pre-fill shipping ──
    function prefillShipping(cust) {
        setVal("shipCompany", cust.name);
        setVal("shipAddress", cust.address);
        setVal("shipCity", cust.city);
        setVal("shipState", cust.state);
        setVal("shipZip", cust.zip);
        setVal("salesperson", cust.salesperson || "");
        setVal("territory", cust.territory || "");
        var termsEl = document.getElementById("termsId");
        if (termsEl && cust.terms) termsEl.value = cust.terms;
        var dateEl = document.getElementById("orderDate");
        if (dateEl) dateEl.value = new Date().toISOString().split("T")[0];
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

    // ── Step 3: Line Items ──
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

    function resetItemModal() {
        pendingItem = null;
        editingIndex = -1;
        // Show search, hide detail form
        if (itemSearchBar) itemSearchBar.style.display = "";
        if (itemSearchResults) itemSearchResults.style.display = "";
        if (itemDetailForm) itemDetailForm.style.display = "none";
        if (itemSearchInput) itemSearchInput.value = "";
        // Reset all item results to visible
        if (itemSearchResults) {
            var allItems = itemSearchResults.querySelectorAll(".item-result");
            allItems.forEach(function (el) { el.style.display = ""; });
        }
    }

    function openItemModal(editIdx) {
        editingIndex = (typeof editIdx === "number") ? editIdx : -1;
        addItemModal.classList.add("open");
        document.body.style.overflow = "hidden";

        if (editingIndex >= 0) {
            // Edit mode
            var item = lineItems[editingIndex];
            document.getElementById("itemModalTitle").textContent = "Edit Item";
            confirmAddBtn.textContent = "Update Item";
            pendingItem = { itemNo: item.itemNo, desc: item.desc, price: item.price, uom: item.uom };

            // Hide search, show form directly
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
            // Add mode
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
        // Reset keyboard-adjusted modal styles
        var sheet = document.querySelector(".modal-sheet");
        if (sheet) {
            sheet.style.maxHeight = "";
            sheet.style.bottom = "";
        }
        // Blur any focused input to dismiss keyboard
        if (document.activeElement) document.activeElement.blur();
    }

    if (addItemFab) addItemFab.addEventListener("click", function () { openItemModal(); });
    if (closeItemModalBtn) closeItemModalBtn.addEventListener("click", closeModal);

    // Close modal on overlay tap (outside the sheet)
    if (addItemModal) {
        addItemModal.addEventListener("click", function (e) {
            if (e.target === addItemModal) closeModal();
        });
    }

    // Item search results — use event delegation
    if (itemSearchResults) {
        itemSearchResults.addEventListener("click", function (e) {
            var el = e.target.closest(".item-result");
            if (!el) return;
            var no = el.getAttribute("data-item-no");
            var desc = el.getAttribute("data-desc");
            var price = parseFloat(el.getAttribute("data-price"));
            var uom = el.getAttribute("data-uom");
            pendingItem = { itemNo: no, desc: desc, price: price, uom: uom };

            // Show item detail form, hide search
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

    // Change item button — go back to search from detail form
    var changeItemBtn = document.getElementById("changeItemBtn");
    if (changeItemBtn) {
        changeItemBtn.addEventListener("click", function () {
            pendingItem = null;
            itemDetailForm.style.display = "none";
            if (itemSearchBar) itemSearchBar.style.display = "";
            if (itemSearchResults) itemSearchResults.style.display = "";
            if (itemSearchInput) {
                itemSearchInput.value = "";
                // Reset all items visible
                var allItems = itemSearchResults.querySelectorAll(".item-result");
                allItems.forEach(function (el) { el.style.display = ""; });
            }
        });
    }

    // Item search filtering
    if (itemSearchInput) {
        itemSearchInput.addEventListener("input", function () {
            var q = itemSearchInput.value.trim().toLowerCase();
            // If the detail form is visible and user starts typing, go back to search
            if (itemDetailForm.style.display !== "none") {
                itemDetailForm.style.display = "none";
                itemSearchResults.style.display = "";
                pendingItem = null;
            }
            var items = itemSearchResults.querySelectorAll(".item-result");
            items.forEach(function (el) {
                var no = (el.getAttribute("data-item-no") || "").toLowerCase();
                var desc = (el.getAttribute("data-desc") || "").toLowerCase();
                el.style.display = (!q || no.indexOf(q) >= 0 || desc.indexOf(q) >= 0) ? "" : "none";
            });
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

        // Bind edit/delete with event delegation on the list container
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

    // ── Step 4: Review ──
    function populateReview() {
        if (selectedCustomer) {
            document.getElementById("revCustomer").textContent = selectedCustomer.name;
            document.getElementById("revCustId").textContent = selectedCustomer.id;
        }

        var company = getVal("shipCompany");
        var city = getVal("shipCity");
        var state = getVal("shipState");
        var zip = getVal("shipZip");
        document.getElementById("revShipTo").textContent = company + (city ? ", " + city : "") + (state ? ", " + state : "") + (zip ? " " + zip : "");
        document.getElementById("revPO").textContent = getVal("poNumber") || "—";

        var shipVia = document.getElementById("shipVia");
        document.getElementById("revShipVia").textContent = shipVia ? (shipVia.options[shipVia.selectedIndex].text || "—") : "—";
        document.getElementById("revDate").textContent = getVal("orderDate") || "—";

        var termsEl = document.getElementById("termsId");
        document.getElementById("revTerms").textContent = termsEl ? (termsEl.options[termsEl.selectedIndex].text || "—") : "—";

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

    // Place order
    var placeOrderBtn = document.getElementById("placeOrderBtn");
    if (placeOrderBtn) {
        placeOrderBtn.addEventListener("click", function () {
            TWG.confirm("Place Order", "Submit this order for processing?").then(function (ok) {
                if (ok) {
                    // Clear dirty state so navigation doesn't prompt again
                    orderDirty = false;
                    selectedCustomer = null;
                    lineItems = [];
                    TWG.alert("Order Submitted", "Your order has been submitted successfully.");
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
        var div = document.createElement("div");
        div.textContent = str;
        return div.innerHTML;
    }

    // ── iOS Virtual Keyboard: resize modal to fit visible area ──
    var modalSheet = document.querySelector(".modal-sheet");
    if (window.visualViewport && modalSheet) {
        var onViewportResize = function () {
            if (!addItemModal.classList.contains("open")) return;
            var vv = window.visualViewport;
            // On iOS, when keyboard opens, visualViewport.height shrinks
            // but the fixed-position modal still uses the full window height.
            // We cap modal max-height to the visible viewport.
            var keyboardOffset = window.innerHeight - vv.height;
            if (keyboardOffset > 50) {
                // Keyboard is open
                modalSheet.style.maxHeight = vv.height + "px";
                modalSheet.style.bottom = keyboardOffset + "px";
            } else {
                // Keyboard closed
                modalSheet.style.maxHeight = "";
                modalSheet.style.bottom = "";
            }
        };
        window.visualViewport.addEventListener("resize", onViewportResize);
        window.visualViewport.addEventListener("scroll", onViewportResize);
    }

    // Scroll focused input into view inside modal (fallback for older iOS)
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
