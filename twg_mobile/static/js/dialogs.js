/**
 * TWG Mobile — Custom Dialog System
 * Replaces native browser alert/confirm with TWG-branded dialogs.
 *
 * Usage:
 *   TWG.alert("Title", "Message").then(function() { ... });
 *   TWG.confirm("Title", "Message").then(function(ok) { if (ok) { ... } });
 */

var TWG = TWG || {};

(function () {
    "use strict";

    var overlay = document.getElementById("dialog-overlay");
    var titleEl = document.getElementById("dialog-title");
    var messageEl = document.getElementById("dialog-message");
    var actionsEl = document.getElementById("dialog-actions");

    // Pending resolve callback
    var _resolve = null;

    function show(title, message, buttons) {
        titleEl.textContent = title;
        messageEl.textContent = message;
        actionsEl.innerHTML = "";

        buttons.forEach(function (btn) {
            var el = document.createElement("button");
            el.className = "dialog-btn " + (btn.className || "");
            el.textContent = btn.label;
            el.addEventListener("click", function () {
                hide();
                if (_resolve) _resolve(btn.value);
            });
            actionsEl.appendChild(el);
        });

        overlay.classList.add("open");
    }

    function hide() {
        overlay.classList.remove("open");
        _resolve = null;
    }

    /**
     * Show an alert dialog with a single OK button.
     * Returns a Promise that resolves when OK is tapped.
     */
    TWG.alert = function (title, message) {
        return new Promise(function (resolve) {
            _resolve = resolve;
            show(title, message, [
                { label: "OK", value: true, className: "dialog-btn--primary" },
            ]);
        });
    };

    /**
     * Show a confirm dialog with Cancel / Confirm buttons.
     * Returns a Promise that resolves with true (confirm) or false (cancel).
     */
    TWG.confirm = function (title, message) {
        return new Promise(function (resolve) {
            _resolve = resolve;
            show(title, message, [
                { label: "Cancel", value: false, className: "" },
                { label: "Confirm", value: true, className: "dialog-btn--primary" },
            ]);
        });
    };

    /**
     * Show a destructive confirm dialog (red confirm button).
     */
    TWG.confirmDanger = function (title, message) {
        return new Promise(function (resolve) {
            _resolve = resolve;
            show(title, message, [
                { label: "Cancel", value: false, className: "" },
                { label: "Delete", value: true, className: "dialog-btn--danger" },
            ]);
        });
    };

    // Close on overlay tap (outside the dialog box)
    if (overlay) {
        overlay.addEventListener("click", function (e) {
            if (e.target === overlay) {
                hide();
                if (_resolve) _resolve(false);
            }
        });
    }
})();
