/* ══ bg-video module ═════════════════════════════════════════════════
   Renders a looping background video with a still-image low-res
   fallback. Self-contained — drop new media files into this directory
   and the script picks them up.

   Markup: <div id="bg-video-root"></div>  (anywhere in <body>)
   Stylesheet: bg-video.css  (linked separately in the page <head>)

   Behavior summary:
     - Defaults to HIGH (video) on capable devices.
     - Auto-downgrades to LOW (still image) when ANY of:
         · user previously chose LOW (localStorage)
         · prefers-reduced-motion: reduce
         · navigator.connection.saveData
         · video error
         · video has not started playing within LOAD_TIMEOUT_MS
     - Toggle button in the bottom-right corner lets users flip
       between modes; choice persists across sessions.
*/

(function () {
  "use strict";

  var ROOT_ID = "bg-video-root";
  var STORAGE_KEY = "opex.bgVideoQuality";    // "high" | "low"
  var LOAD_TIMEOUT_MS = 6000;
  var BASE = "/bg-video/";

  var SOURCES = [
    { src: BASE + "bg-video.webm", type: "video/webm" },
    { src: BASE + "bg-video.mp4",  type: "video/mp4"  }
  ];
  var POSTER = BASE + "bg-video-poster.jpg";

  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
    } else {
      fn();
    }
  }

  function readStoredMode() {
    try {
      var v = localStorage.getItem(STORAGE_KEY);
      return v === "low" || v === "high" ? v : null;
    } catch (_) { return null; }
  }

  function storeMode(mode) {
    try { localStorage.setItem(STORAGE_KEY, mode); } catch (_) {}
  }

  function shouldStartLow() {
    var stored = readStoredMode();
    if (stored) return stored === "low";
    try {
      if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return true;
    } catch (_) {}
    try {
      var c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      if (c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || ""))) return true;
    } catch (_) {}
    return false;
  }

  function buildToggle(initialMode, onToggle) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "bgv-toggle";
    btn.setAttribute("aria-label", "Toggle background video quality");
    btn.setAttribute("title", "Toggle background quality (high/low)");
    btn.dataset.mode = initialMode;
    btn.innerHTML = '<span class="bgv-toggle-dot"></span><span class="bgv-toggle-label"></span>';
    var labelEl = btn.querySelector(".bgv-toggle-label");
    var paint = function (mode) {
      btn.dataset.mode = mode;
      labelEl.textContent = mode === "high" ? "HD · video" : "Still · low";
    };
    paint(initialMode);
    btn.addEventListener("click", function () {
      var next = btn.dataset.mode === "high" ? "low" : "high";
      paint(next);
      storeMode(next);
      onToggle(next);
    });
    return { el: btn, paint: paint };
  }

  function mountLowRes(root) {
    var img = root.querySelector(".bgv-poster");
    if (!img) {
      img = document.createElement("div");
      img.className = "bgv-media bgv-poster";
      img.style.backgroundImage = "url('" + POSTER + "')";
      root.appendChild(img);
    }
    // requestAnimationFrame so the opacity transition runs.
    requestAnimationFrame(function () { img.classList.add("bgv-loaded"); });
  }

  function unmountLowRes(root) {
    var img = root.querySelector(".bgv-poster");
    if (img) {
      img.classList.remove("bgv-loaded");
      setTimeout(function () { if (img.parentNode) img.parentNode.removeChild(img); }, 750);
    }
  }

  function mountVideo(root, onFail) {
    var existing = root.querySelector("video.bgv-media");
    if (existing) {
      existing.classList.add("bgv-loaded");
      return existing;
    }
    var v = document.createElement("video");
    v.className = "bgv-media";
    v.muted = true;
    v.defaultMuted = true;
    v.autoplay = true;
    v.loop = true;
    v.playsInline = true;
    v.setAttribute("muted", "");
    v.setAttribute("playsinline", "");
    v.setAttribute("webkit-playsinline", "");
    v.setAttribute("disableremoteplayback", "");
    v.preload = "auto";
    v.poster = POSTER;

    SOURCES.forEach(function (s) {
      var src = document.createElement("source");
      src.src = s.src;
      src.type = s.type;
      v.appendChild(src);
    });

    var failed = false;
    var settled = false;
    var fail = function (reason) {
      if (failed) return;
      failed = true;
      try { v.pause(); } catch (_) {}
      if (v.parentNode) v.parentNode.removeChild(v);
      if (typeof onFail === "function") onFail(reason);
    };

    var timer = setTimeout(function () {
      if (!settled) fail("timeout");
    }, LOAD_TIMEOUT_MS);

    v.addEventListener("playing", function () {
      settled = true;
      clearTimeout(timer);
      v.classList.add("bgv-loaded");
    }, { once: true });
    v.addEventListener("error", function () { fail("error"); }, { once: true });
    v.addEventListener("stalled", function () {
      // stalled fires a lot during initial buffering; only escalate if
      // we haven't started playing by the timeout.
    });

    root.insertBefore(v, root.firstChild);

    // Some browsers reject autoplay without an explicit play() promise.
    var p = v.play();
    if (p && typeof p.catch === "function") {
      p.catch(function () { fail("autoplay-rejected"); });
    }
    return v;
  }

  function unmountVideo(root) {
    var v = root.querySelector("video.bgv-media");
    if (!v) return;
    v.classList.remove("bgv-loaded");
    setTimeout(function () {
      try { v.pause(); v.removeAttribute("src"); v.load && v.load(); } catch (_) {}
      if (v.parentNode) v.parentNode.removeChild(v);
    }, 750);
  }

  function init() {
    var root = document.getElementById(ROOT_ID);
    if (!root) return;
    root.classList.add("bgv-root");

    var mode = shouldStartLow() ? "low" : "high";

    var toggleApi = buildToggle(mode, function applyMode(next) {
      if (next === "high") {
        unmountLowRes(root);
        attemptHigh();
      } else {
        unmountVideo(root);
        mountLowRes(root);
      }
    });
    document.body.appendChild(toggleApi.el);

    function attemptHigh() {
      // Show poster underneath so there's never a black flash.
      mountLowRes(root);
      mountVideo(root, function onFail() {
        // Video errored or timed out — stay on the still image and
        // flip the toggle to reflect reality.
        toggleApi.paint("low");
        storeMode("low");
      });
    }

    if (mode === "high") attemptHigh();
    else mountLowRes(root);
  }

  ready(init);
})();
