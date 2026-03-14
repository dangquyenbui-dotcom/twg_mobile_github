/**
 * TWG Mobile — PWA Shell & Core JS
 * Service worker registration, bottom-nav menu, offline detection.
 */

(function () {
    "use strict";

    // ------------------------------------------------------------------
    // Service Worker Registration
    // ------------------------------------------------------------------
    if ("serviceWorker" in navigator) {
        window.addEventListener("load", function () {
            navigator.serviceWorker
                .register("/static/sw.js")
                .then(function (reg) {
                    console.log("[TWG] Service worker registered:", reg.scope);
                })
                .catch(function (err) {
                    console.warn("[TWG] Service worker registration failed:", err);
                });
        });
    }

    // ------------------------------------------------------------------
    // Slide-Up Menu Panel
    // ------------------------------------------------------------------
    var menuBtn = document.getElementById("nav-menu-btn");
    var menuOverlay = document.getElementById("menu-overlay");
    var menuPanel = document.getElementById("menu-panel");
    var menuCloseBtn = document.getElementById("menu-close-btn");

    function openMenu(e) {
        if (e) e.preventDefault();
        menuOverlay.classList.add("open");
        menuPanel.classList.add("open");
    }

    function closeMenu() {
        menuOverlay.classList.remove("open");
        menuPanel.classList.remove("open");
    }

    if (menuBtn) menuBtn.addEventListener("click", openMenu);
    if (menuOverlay) menuOverlay.addEventListener("click", closeMenu);
    if (menuCloseBtn) menuCloseBtn.addEventListener("click", closeMenu);

    // ------------------------------------------------------------------
    // Offline / Online Detection
    // ------------------------------------------------------------------
    var offlineBanner = document.createElement("div");
    offlineBanner.className = "offline-banner";
    offlineBanner.textContent = "You are offline — some features may be unavailable.";
    document.body.appendChild(offlineBanner);

    function updateOnlineStatus() {
        if (!navigator.onLine) {
            offlineBanner.classList.add("visible");
        } else {
            offlineBanner.classList.remove("visible");
        }
    }

    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);
    updateOnlineStatus();

    // ------------------------------------------------------------------
    // Pull-to-Refresh (basic — triggers page reload)
    // ------------------------------------------------------------------
    var content = document.getElementById("app-content");
    var pullStartY = 0;
    var pulling = false;

    if (content) {
        content.addEventListener(
            "touchstart",
            function (e) {
                if (content.scrollTop === 0) {
                    pullStartY = e.touches[0].clientY;
                    pulling = true;
                }
            },
            { passive: true }
        );

        content.addEventListener(
            "touchend",
            function (e) {
                if (!pulling) return;
                var pullDistance = e.changedTouches[0].clientY - pullStartY;
                pulling = false;
                if (pullDistance > 80) {
                    window.location.reload();
                }
            },
            { passive: true }
        );
    }
})();
