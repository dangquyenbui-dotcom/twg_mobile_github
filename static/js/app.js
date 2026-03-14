/**
 * TWG Mobile — PWA Shell & Core JS
 * Service worker registration, bottom-nav menu, offline detection,
 * pull-to-refresh with visual indicator.
 */

(function () {
    "use strict";

    // ------------------------------------------------------------------
    // Service Worker Registration
    // Pass APP_VERSION so the SW creates a version-specific cache.
    // The <meta name="app-version"> tag is set in base.html.
    // ------------------------------------------------------------------
    if ("serviceWorker" in navigator) {
        window.addEventListener("load", function () {
            var versionMeta = document.querySelector('meta[name="app-version"]');
            var version = versionMeta ? versionMeta.content : "1";
            navigator.serviceWorker
                .register("/static/sw.js?v=" + version)
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
        if (menuOverlay) menuOverlay.classList.add("open");
        if (menuPanel) menuPanel.classList.add("open");
    }

    function closeMenu() {
        if (menuOverlay) menuOverlay.classList.remove("open");
        if (menuPanel) menuPanel.classList.remove("open");
    }

    if (menuBtn) menuBtn.addEventListener("click", openMenu);
    if (menuOverlay) menuOverlay.addEventListener("click", closeMenu);
    if (menuCloseBtn) menuCloseBtn.addEventListener("click", closeMenu);

    // ------------------------------------------------------------------
    // Offline / Online Detection
    // ------------------------------------------------------------------
    var offlineBanner = document.createElement("div");
    offlineBanner.className = "offline-banner";
    offlineBanner.textContent = "You are offline \u2014 some features may be unavailable.";
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
    // Pull-to-Refresh with visual indicator
    // ------------------------------------------------------------------
    var content = document.getElementById("app-content");
    var pullStartY = 0;
    var pulling = false;
    var PULL_THRESHOLD = 80;

    // Create the visual pull indicator
    var pullIndicator = document.createElement("div");
    pullIndicator.className = "pull-indicator";
    pullIndicator.innerHTML =
        '<svg class="pull-spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">' +
        '<path d="M12 19V5M5 12l7-7 7 7"/>' +
        '</svg>';

    if (content) {
        content.parentNode.insertBefore(pullIndicator, content);

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
            "touchmove",
            function (e) {
                if (!pulling) return;
                var distance = e.touches[0].clientY - pullStartY;
                if (distance > 0 && distance <= 120) {
                    var progress = Math.min(distance / PULL_THRESHOLD, 1);
                    pullIndicator.style.transform = "translateY(" + (distance * 0.4) + "px)";
                    pullIndicator.style.opacity = progress;
                    if (progress >= 1) {
                        pullIndicator.classList.add("ready");
                    } else {
                        pullIndicator.classList.remove("ready");
                    }
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

                if (pullDistance >= PULL_THRESHOLD) {
                    pullIndicator.classList.add("refreshing");
                    pullIndicator.classList.remove("ready");
                    pullIndicator.style.transform = "translateY(32px)";
                    pullIndicator.style.opacity = "1";
                    window.location.reload();
                } else {
                    pullIndicator.style.transform = "";
                    pullIndicator.style.opacity = "0";
                    pullIndicator.classList.remove("ready");
                }
            },
            { passive: true }
        );
    }
})();
