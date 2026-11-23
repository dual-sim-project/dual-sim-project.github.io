(function () {
  "use strict";

  var CLIPS = [
    {
      embodiment: "AgiBot G2",
      unseen: false,
      before: "assets/videos/comparison-01-sim.mp4",
      after: "assets/videos/comparison-01-real.mp4"
    },
    {
      embodiment: "AgiBot G2",
      unseen: false,
      before: "assets/videos/vr_agibot_02_sim.mp4",
      after: "assets/videos/vr_agibot_02_gen.mp4"
    },
    {
      embodiment: "ARX-X5",
      unseen: false,
      before: "assets/videos/vr_arx_01_sim.mp4",
      after: "assets/videos/vr_arx_01_gen.mp4"
    },
    {
      embodiment: "ARX-X5",
      unseen: false,
      before: "assets/videos/vr_arx_02_sim.mp4",
      after: "assets/videos/vr_arx_02_gen.mp4"
    },
    {
      embodiment: "Aloha-AgileX",
      unseen: false,
      before: "assets/videos/vr_aloha_01_sim.mp4",
      after: "assets/videos/vr_aloha_01_gen.mp4"
    },
    {
      embodiment: "Aloha-AgileX",
      unseen: false,
      before: "assets/videos/vr_aloha_02_sim.mp4",
      after: "assets/videos/vr_aloha_02_gen.mp4"
    },
    {
      embodiment: "UR5-WSG",
      unseen: false,
      before: "assets/videos/vr_ur5_01_sim.mp4",
      after: "assets/videos/vr_ur5_01_gen.mp4"
    },
    {
      embodiment: "UR5-WSG",
      unseen: false,
      before: "assets/videos/vr_ur5_02_sim.mp4",
      after: "assets/videos/vr_ur5_02_gen.mp4"
    },
    {
      embodiment: "Franka-Panda",
      unseen: true,
      before: "assets/videos/vr_franka_01_sim.mp4",
      after: "assets/videos/vr_franka_01_gen.mp4"
    },
    {
      embodiment: "Franka-Panda",
      unseen: true,
      before: "assets/videos/vr_franka_02_sim.mp4",
      after: "assets/videos/vr_franka_02_gen.mp4"
    }
  ];

  var COPIES = 3;
  var TOTAL_SLOTS = CLIPS.length * COPIES;
  var THUMB_W = 492;
  var THUMB_H = 338;
  var IDLE_SPEED = 66;
  var GLIDE_MS = 780;
  var DRAG_CLICK_THRESHOLD = 6;
  var BLIT_INTERVAL_MS = 33;

  var sectionEl = document.getElementById("visual-results");
  var bandEl = document.getElementById("gallery-carousel");
  var viewportEl = document.getElementById("gallery-carousel-viewport");
  var trackEl = document.getElementById("gallery-carousel-track");
  var prevBtn = document.getElementById("carousel-prev");
  var nextBtn = document.getElementById("carousel-next");
  var dotsEl = document.getElementById("gallery-dots");
  var pillsWrap = document.getElementById("gallery-emb-pills");
  var statusEl = document.getElementById("gallery-status");

  var playerDock = document.getElementById("gallery-player-dock");
  var livePlayer = document.getElementById("gallery-live-player");
  var liveStage = document.getElementById("gallery-live-stage");
  var videoBefore = document.getElementById("gallery-video-before");
  var videoAfter = document.getElementById("gallery-video-after");
  var slider = document.getElementById("gallery-slider");

  if (!bandEl || !viewportEl || !trackEl || !livePlayer || !videoBefore || !videoAfter || !slider) {
    return;
  }

  var prefersReducedMotion =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var slotEls = [];
  var slotCanvases = [];
  var slotContexts = [];
  var dotBtns = [];
  var pillBtns = pillsWrap ? Array.prototype.slice.call(pillsWrap.querySelectorAll(".emb-jump-pill")) : [];

  /* Shared off-DOM live playback pool (1 pair per unique clip, viewport-culled) */
  var clipPool = CLIPS.map(function (clip, idx) {
    return {
      index: idx,
      clip: clip,
      vSim: null,
      vReal: null,
      initialized: false,
      playing: false,
      lastSyncTs: 0
    };
  });

  var metrics = { idleW: 246, focusW: 458, gap: 16, pitch: 262, setWidth: 2620 };
  var scrollX = 0;
  var velocity = IDLE_SPEED;
  var focusedSlot = null;
  var isTransitioningOut = false;
  var pointerInBand = false;
  var isSliderDragging = false;
  var sectionVisible = !("IntersectionObserver" in window);
  var lastHighlightedClip = -1;
  var loadToken = 0;

  var trackDrag = {
    active: false,
    moved: false,
    pointerId: null,
    startX: 0,
    lastX: 0,
    lastTs: 0,
    releaseVelocity: 0
  };
  var suppressClickUntil = 0;

  var releaseTimer = null;
  var syncRafId = 0;
  var loopRafId = 0;
  var lastLoopTs = 0;
  var lastBlitTs = 0;

  function computeMetrics() {
    var vw = viewportEl.clientWidth || window.innerWidth || 1280;
    var idleW = vw <= 760 ? 196 : 246;
    var gap = vw <= 760 ? 12 : 16;
    var focusW = vw <= 760 ? Math.max(260, Math.min(368, vw - 44)) : 458;
    var pitch = idleW + gap;
    var setWidth = CLIPS.length * pitch;

    metrics = {
      idleW: idleW,
      focusW: focusW,
      gap: gap,
      pitch: pitch,
      setWidth: setWidth
    };

    bandEl.style.setProperty("--card-idle-w", idleW + "px");
    bandEl.style.setProperty("--card-focus-w", focusW + "px");
    bandEl.style.setProperty("--card-gap", gap + "px");
    return metrics;
  }

  function wrapScrollX(x) {
    var sw = metrics.setWidth;
    if (sw <= 0) return x;
    while (x >= 2 * sw) x -= sw;
    while (x < sw) x += sw;
    return x;
  }

  function applyTrackX(tx) {
    trackEl.style.transform = "translate3d(" + tx.toFixed(2) + "px, 0, 0)";
  }

  function formatIndex(idx) {
    var n = idx + 1;
    return (n < 10 ? "0" : "") + n + " / " + CLIPS.length;
  }

  function updateIndicators(clipIdx, isFocusedState) {
    if (clipIdx === lastHighlightedClip && !isFocusedState) {
      return;
    }
    lastHighlightedClip = clipIdx;
    var clip = CLIPS[clipIdx];

    for (var i = 0; i < dotBtns.length; i++) {
      var active = i === clipIdx;
      dotBtns[i].classList.toggle("is-active", active);
      dotBtns[i].setAttribute("aria-selected", active ? "true" : "false");
    }

    for (var p = 0; p < pillBtns.length; p++) {
      var match = pillBtns[p].getAttribute("data-emb") === clip.embodiment;
      pillBtns[p].classList.toggle("is-active", match);
      pillBtns[p].setAttribute("aria-pressed", match && isFocusedState ? "true" : "false");
    }
  }

  function safePlay(video) {
    if (!video) return;
    try {
      var p = video.play();
      if (p && typeof p.catch === "function") p.catch(function () {});
    } catch (_e) {}
  }

  function safePause(video) {
    if (!video) return;
    try {
      video.pause();
    } catch (_e) {}
  }

  /* ---- Shared Live Video Pool & Canvas Blitter for Scrolling Cards ---- */
  function drawCoverHalf(ctx, video, destX, destW, canvasW, canvasH) {
    var vw = video.videoWidth;
    var vh = video.videoHeight;
    if (!vw || !vh) return false;

    var scale = Math.max(canvasW / vw, canvasH / vh);
    var drawW = vw * scale;
    var drawH = vh * scale;
    var offsetX = (canvasW - drawW) * 0.5;
    var offsetY = (canvasH - drawH) * 0.5;

    ctx.save();
    ctx.beginPath();
    ctx.rect(destX, 0, destW, canvasH);
    ctx.clip();
    ctx.drawImage(video, offsetX, offsetY, drawW, drawH);
    ctx.restore();
    return true;
  }

  function createPoolVideo(src) {
    var v = document.createElement("video");
    v.muted = true;
    v.loop = true;
    v.playsInline = true;
    v.preload = "auto";
    v.src = src;
    return v;
  }

  function ensurePoolEntry(entry) {
    if (entry.initialized) return;
    entry.initialized = true;
    entry.vSim = createPoolVideo(entry.clip.before);
    entry.vReal = createPoolVideo(entry.clip.after);

    function paintInitial() {
      var halfW = Math.floor(THUMB_W / 2);
      for (var c = 0; c < COPIES; c++) {
        var slot = c * CLIPS.length + entry.index;
        var ctx = slotContexts[slot];
        var canvas = slotCanvases[slot];
        if (!ctx || !canvas) continue;
        var ok1 = entry.vSim.readyState >= 2 && drawCoverHalf(ctx, entry.vSim, 0, halfW, THUMB_W, THUMB_H);
        var ok2 = entry.vReal.readyState >= 2 && drawCoverHalf(ctx, entry.vReal, halfW, THUMB_W - halfW, THUMB_W, THUMB_H);
        if (ok1 || ok2) {
          canvas.classList.add("is-ready");
        }
      }
    }

    entry.vSim.addEventListener("loadeddata", paintInitial, { once: true });
    entry.vReal.addEventListener("loadeddata", paintInitial, { once: true });
    entry.vSim.load();
    entry.vReal.load();
  }

  function updateVisiblePoolAndBlit(ts) {
    if (!sectionVisible) {
      for (var k = 0; k < clipPool.length; k++) {
        if (clipPool[k].playing) {
          safePause(clipPool[k].vSim);
          safePause(clipPool[k].vReal);
          clipPool[k].playing = false;
        }
      }
      return;
    }

    var vpRect = viewportEl.getBoundingClientRect();
    var leftBound = vpRect.left - 180;
    var rightBound = vpRect.right + 180;
    var focusedClipIdx = focusedSlot !== null ? focusedSlot % CLIPS.length : -1;

    var clipNeedsPlay = new Array(CLIPS.length);
    var visibleSlots = [];

    for (var slot = 0; slot < TOTAL_SLOTS; slot++) {
      var rect = slotEls[slot].getBoundingClientRect();
      if (rect.right < leftBound || rect.left > rightBound) continue;
      var clipIdx = slot % CLIPS.length;
      if (slot === focusedSlot && livePlayer.classList.contains("is-ready")) {
        continue;
      }
      visibleSlots.push(slot);
      if (clipIdx !== focusedClipIdx || !livePlayer.classList.contains("is-ready")) {
        clipNeedsPlay[clipIdx] = true;
      }
    }

    for (var i = 0; i < clipPool.length; i++) {
      var entry = clipPool[i];
      if (clipNeedsPlay[i]) {
        ensurePoolEntry(entry);
        if (!prefersReducedMotion && !entry.playing) {
          safePlay(entry.vSim);
          safePlay(entry.vReal);
          entry.playing = true;
        }
        if (
          entry.playing &&
          ts - entry.lastSyncTs > 450 &&
          entry.vSim.readyState >= 2 &&
          entry.vReal.readyState >= 2 &&
          Number.isFinite(entry.vSim.duration) &&
          Number.isFinite(entry.vReal.duration)
        ) {
          entry.lastSyncTs = ts;
          var targetT = Math.min(entry.vReal.currentTime, Math.max(0, entry.vSim.duration - 0.04));
          if (Math.abs(entry.vSim.currentTime - targetT) > 0.24) {
            try {
              entry.vSim.currentTime = targetT;
            } catch (_e) {}
          }
        }
      } else if (entry.playing) {
        safePause(entry.vSim);
        safePause(entry.vReal);
        entry.playing = false;
      }
    }

    var halfW = Math.floor(THUMB_W / 2);
    for (var s = 0; s < visibleSlots.length; s++) {
      var vSlot = visibleSlots[s];
      var cIdx = vSlot % CLIPS.length;
      var pEntry = clipPool[cIdx];
      if (!pEntry.initialized) continue;
      var ctx = slotContexts[vSlot];
      var canvas = slotCanvases[vSlot];
      if (!ctx || !canvas) continue;
      var drew = false;
      if (pEntry.vSim && pEntry.vSim.readyState >= 2) {
        drew = drawCoverHalf(ctx, pEntry.vSim, 0, halfW, THUMB_W, THUMB_H) || drew;
      }
      if (pEntry.vReal && pEntry.vReal.readyState >= 2) {
        drew = drawCoverHalf(ctx, pEntry.vReal, halfW, THUMB_W - halfW, THUMB_W, THUMB_H) || drew;
      }
      if (drew && !canvas.classList.contains("is-ready")) {
        canvas.classList.add("is-ready");
      }
    }
  }

  /* ---- Live Dual-Video Split Player (Mounted Inside Centered Focused Card) ---- */
  function setSplit(percent) {
    var clamped = Math.max(0, Math.min(100, percent));
    livePlayer.style.setProperty("--split", clamped.toFixed(2) + "%");
    slider.value = String(Math.round(clamped));
    slider.setAttribute("aria-valuetext", Math.round(clamped) + "% Sim, " + Math.round(100 - clamped) + "% Dual-Sim");
  }

  function splitFromClientX(clientX) {
    var rect = liveStage.getBoundingClientRect();
    if (!rect.width) return 50;
    return ((clientX - rect.left) / rect.width) * 100;
  }

  function stopSyncLoop() {
    if (syncRafId) {
      window.cancelAnimationFrame(syncRafId);
      syncRafId = 0;
    }
  }

  function startSyncLoop() {
    stopSyncLoop();
    function tick() {
      syncRafId = 0;
      if (focusedSlot === null || !sectionVisible) return;

      if (
        videoAfter.readyState >= 2 &&
        videoBefore.readyState >= 2 &&
        !videoAfter.paused &&
        !videoBefore.paused &&
        Number.isFinite(videoAfter.duration) &&
        Number.isFinite(videoBefore.duration)
      ) {
        var targetTime = Math.min(videoAfter.currentTime, Math.max(0, videoBefore.duration - 0.04));
        if (Math.abs(videoBefore.currentTime - targetTime) > 0.16) {
          try {
            videoBefore.currentTime = targetTime;
          } catch (_e) {}
        }
      }
      syncRafId = window.requestAnimationFrame(tick);
    }
    syncRafId = window.requestAnimationFrame(tick);
  }

  function mountLivePlayer(slotEl, clipIdx) {
    var clip = CLIPS[clipIdx];
    var mediaEl = slotEl.querySelector(".carousel-media");
    if (!mediaEl) return;

    var myToken = ++loadToken;
    stopSyncLoop();
    livePlayer.classList.remove("is-ready");
    setSplit(50);

    videoBefore.onloadeddata = null;
    videoBefore.oncanplay = null;
    videoAfter.onloadeddata = null;
    videoAfter.oncanplay = null;
    safePause(videoBefore);
    safePause(videoAfter);

    mediaEl.appendChild(livePlayer);

    var readyBefore = false;
    var readyAfter = false;
    var started = false;

    function tryStart() {
      if (started || myToken !== loadToken || focusedSlot === null) return;
      if (!readyBefore || !readyAfter) return;
      started = true;
      videoBefore.onloadeddata = null;
      videoBefore.oncanplay = null;
      videoAfter.onloadeddata = null;
      videoAfter.oncanplay = null;
      livePlayer.classList.add("is-ready");
      if (sectionVisible) {
        safePlay(videoBefore);
        safePlay(videoAfter);
        startSyncLoop();
      }
    }

    function markBefore() {
      readyBefore = true;
      tryStart();
    }

    function markAfter() {
      readyAfter = true;
      tryStart();
    }

    videoBefore.onloadeddata = markBefore;
    videoBefore.oncanplay = markBefore;
    videoAfter.onloadeddata = markAfter;
    videoAfter.oncanplay = markAfter;

    videoBefore.muted = true;
    videoAfter.muted = true;
    videoBefore.loop = true;
    videoAfter.loop = true;
    videoBefore.src = clip.before;
    videoAfter.src = clip.after;
    videoBefore.load();
    videoAfter.load();

    if (videoBefore.readyState >= 2) readyBefore = true;
    if (videoAfter.readyState >= 2) readyAfter = true;
    tryStart();
  }

  function unmountLivePlayer() {
    loadToken++;
    stopSyncLoop();
    videoBefore.onloadeddata = null;
    videoBefore.oncanplay = null;
    videoAfter.onloadeddata = null;
    videoAfter.oncanplay = null;
    safePause(videoBefore);
    safePause(videoAfter);
    livePlayer.classList.remove("is-ready");
    if (playerDock && livePlayer.parentNode !== playerDock) {
      playerDock.appendChild(livePlayer);
    }
  }

  /* Slider pointer + input events */
  slider.addEventListener("input", function () {
    setSplit(Number(slider.value));
  });

  slider.addEventListener("pointerdown", function (e) {
    e.stopPropagation();
    isSliderDragging = true;
    livePlayer.classList.add("is-dragging");
    if (slider.setPointerCapture) {
      try { slider.setPointerCapture(e.pointerId); } catch (_e) {}
    }
    setSplit(splitFromClientX(e.clientX));
  });

  slider.addEventListener("pointermove", function (e) {
    if (!isSliderDragging) return;
    setSplit(splitFromClientX(e.clientX));
  });

  function endSliderDrag() {
    if (!isSliderDragging) return;
    isSliderDragging = false;
    livePlayer.classList.remove("is-dragging");
  }

  slider.addEventListener("pointerup", endSliderDrag);
  slider.addEventListener("pointercancel", endSliderDrag);

  /* ---- Focus / Glide / Release State Machine ---- */
  function clearReleaseTimer() {
    if (releaseTimer) {
      window.clearTimeout(releaseTimer);
      releaseTimer = null;
    }
  }

  function getVisualCenterSlot() {
    var vw = viewportEl.clientWidth || 1280;
    var centerTrackX = scrollX + vw / 2;
    var approx = Math.round((centerTrackX - metrics.idleW / 2) / metrics.pitch);
    return Math.max(0, Math.min(TOTAL_SLOTS - 1, approx));
  }

  function findNearestSlotForClip(clipIdx) {
    var refSlot = focusedSlot !== null ? focusedSlot : getVisualCenterSlot();
    var bestSlot = CLIPS.length + clipIdx;
    var bestDist = Infinity;
    for (var copy = 0; copy < COPIES; copy++) {
      var candidate = copy * CLIPS.length + clipIdx;
      var dist = Math.abs(candidate - refSlot);
      if (dist < bestDist) {
        bestDist = dist;
        bestSlot = candidate;
      }
    }
    return bestSlot;
  }

  function normalizeSlotForSafeEdges(slotIdx) {
    var shift = 0;
    if (slotIdx < 5) {
      shift = CLIPS.length;
    } else if (slotIdx > TOTAL_SLOTS - 6) {
      shift = -CLIPS.length;
    }
    if (!shift) return slotIdx;

    var deltaPx = shift * metrics.pitch;
    trackEl.classList.remove("is-gliding");

    if (focusedSlot !== null) {
      var prevSlot = focusedSlot;
      slotEls[prevSlot].classList.remove("is-focused");
      focusedSlot = prevSlot + shift;
      slotEls[focusedSlot].classList.add("is-focused");
      var vw = viewportEl.clientWidth || 1280;
      var curTx = vw / 2 - (focusedSlot * metrics.pitch + metrics.focusW / 2);
      applyTrackX(curTx);
    } else {
      scrollX += deltaPx;
      applyTrackX(-scrollX);
    }
    void trackEl.offsetWidth;
    return slotIdx + shift;
  }

  function focusSlot(rawSlotIdx, opts) {
    opts = opts || {};
    clearReleaseTimer();
    isTransitioningOut = false;
    velocity = 0;

    var slotIdx = normalizeSlotForSafeEdges(rawSlotIdx);
    if (focusedSlot === slotIdx) return;

    if (focusedSlot !== null && slotEls[focusedSlot]) {
      slotEls[focusedSlot].classList.remove("is-focused");
    }

    focusedSlot = slotIdx;
    var clipIdx = slotIdx % CLIPS.length;
    var clip = CLIPS[clipIdx];
    var slotEl = slotEls[slotIdx];

    bandEl.classList.add("is-focusing");
    bandEl.classList.toggle("is-focusing-unseen", clip.unseen);
    slotEl.classList.add("is-focused");

    var vw = viewportEl.clientWidth || 1280;
    var targetTx = vw / 2 - (slotIdx * metrics.pitch + metrics.focusW / 2);

    if (opts.instant) {
      trackEl.classList.remove("is-gliding");
    } else {
      trackEl.classList.add("is-gliding");
    }
    applyTrackX(targetTx);

    updateIndicators(clipIdx, true);
    mountLivePlayer(slotEl, clipIdx);

    if (statusEl) {
      statusEl.textContent = clip.embodiment + (clip.unseen ? " (Unseen)" : "") + ", " + formatIndex(clipIdx);
    }
  }

  function unfocus() {
    if (focusedSlot === null) return;
    clearReleaseTimer();

    var prevSlot = focusedSlot;
    var vw = viewportEl.clientWidth || 1280;
    var compactTx = vw / 2 - (prevSlot * metrics.pitch + metrics.idleW / 2);

    unmountLivePlayer();
    if (slotEls[prevSlot]) {
      slotEls[prevSlot].classList.remove("is-focused");
    }
    focusedSlot = null;
    isTransitioningOut = true;

    bandEl.classList.remove("is-focusing");
    bandEl.classList.remove("is-focusing-unseen");
    trackEl.classList.add("is-gliding");
    applyTrackX(compactTx);

    for (var p = 0; p < pillBtns.length; p++) {
      pillBtns[p].setAttribute("aria-pressed", "false");
    }

    releaseTimer = window.setTimeout(function () {
      releaseTimer = null;
      isTransitioningOut = false;
      trackEl.classList.remove("is-gliding");
      scrollX = wrapScrollX(-compactTx);
      applyTrackX(-scrollX);
      velocity = 0;
      lastLoopTs = performance.now();
    }, GLIDE_MS);
  }

  /* ---- Build Seamless 3x10 Carousel DOM & Dots ---- */
  function buildCarousel() {
    var frag = document.createDocumentFragment();

    for (var slot = 0; slot < TOTAL_SLOTS; slot++) {
      var clipIdx = slot % CLIPS.length;
      var clip = CLIPS[clipIdx];

      var card = document.createElement("article");
      card.className = "carousel-card" + (clip.unseen ? " is-unseen" : "");
      card.setAttribute("data-slot", String(slot));
      card.setAttribute("data-clip", String(clipIdx));
      card.setAttribute("tabindex", slot >= CLIPS.length && slot < 2 * CLIPS.length ? "0" : "-1");
      card.setAttribute("aria-label", clip.embodiment + (clip.unseen ? " (Unseen)" : "") + ", " + formatIndex(clipIdx) + " — click to expand and compare");

      var media = document.createElement("div");
      media.className = "carousel-media";

      var canvas = document.createElement("canvas");
      canvas.className = "carousel-thumb-canvas";
      canvas.width = THUMB_W;
      canvas.height = THUMB_H;
      slotCanvases.push(canvas);
      slotContexts.push(canvas.getContext("2d"));
      media.appendChild(canvas);

      /* Delicate split line + miniature <> handle on compact cards */
      var splitLine = document.createElement("span");
      splitLine.className = "carousel-split-line";
      splitLine.setAttribute("aria-hidden", "true");
      splitLine.innerHTML =
        '<span class="carousel-mini-handle">' +
        '<svg viewBox="0 0 14 14" width="10" height="10" fill="none">' +
        '<path d="M5 4L2.2 7 5 10" stroke="#2e6f95" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<path d="M9 4l2.8 3L9 10" stroke="#e26a38" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' +
        "</svg>" +
        "</span>";
      media.appendChild(splitLine);

      /* Subtle frosted hover CTA pill: makes click-to-expand unmistakable */
      var hoverCue = document.createElement("span");
      hoverCue.className = "carousel-hover-cue";
      hoverCue.setAttribute("aria-hidden", "true");
      hoverCue.innerHTML =
        '<svg viewBox="0 0 14 14" width="11" height="11" fill="none">' +
        '<path d="M8.5 2.5H11.5V5.5M5.5 11.5H2.5V8.5M11.3 2.7L7.8 6.2M2.7 11.3L6.2 7.8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>' +
        "</svg>" +
        "<span>Click to Compare</span>";
      media.appendChild(hoverCue);

      var foot = document.createElement("div");
      foot.className = "carousel-card-foot";

      var footLeft = document.createElement("div");
      footLeft.className = "carousel-card-id";

      var nameEl = document.createElement("span");
      nameEl.className = "carousel-emb-name";
      nameEl.textContent = clip.embodiment;
      footLeft.appendChild(nameEl);

      if (clip.unseen) {
        var unseenTag = document.createElement("span");
        unseenTag.className = "carousel-unseen-tag";
        unseenTag.textContent = "Unseen";
        footLeft.appendChild(unseenTag);
      }

      var footRight = document.createElement("div");
      footRight.className = "carousel-card-meta";

      /* Subtle resting expand icon (swaps to close button when card is focused) */
      var expandIcon = document.createElement("span");
      expandIcon.className = "carousel-expand-icon";
      expandIcon.setAttribute("aria-hidden", "true");
      expandIcon.innerHTML =
        '<svg viewBox="0 0 14 14" width="11" height="11" fill="none">' +
        '<path d="M8.5 2.5H11.5V5.5M5.5 11.5H2.5V8.5M11.3 2.7L7.8 6.2M2.7 11.3L6.2 7.8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>' +
        "</svg>";
      footRight.appendChild(expandIcon);

      var closeBtn = document.createElement("button");
      closeBtn.type = "button";
      closeBtn.className = "carousel-close-btn";
      closeBtn.setAttribute("aria-label", "Close comparison and resume gallery");
      closeBtn.innerHTML =
        '<svg viewBox="0 0 14 14" width="11" height="11" fill="none" aria-hidden="true">' +
        '<path d="M3.5 3.5L10.5 10.5M10.5 3.5L3.5 10.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' +
        "</svg>";
      closeBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        unfocus();
      });
      footRight.appendChild(closeBtn);

      foot.appendChild(footLeft);
      foot.appendChild(footRight);

      card.appendChild(media);
      card.appendChild(foot);

      (function (slotIndex, cardEl) {
        cardEl.addEventListener("click", function (e) {
          if (performance.now() < suppressClickUntil) return;
          if (e.target === slider || livePlayer.contains(e.target)) return;
          if (focusedSlot !== slotIndex) {
            focusSlot(slotIndex);
          }
        });

        cardEl.addEventListener("keydown", function (e) {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (focusedSlot === slotIndex) {
              unfocus();
            } else {
              focusSlot(slotIndex);
            }
          }
        });
      })(slot, card);

      slotEls.push(card);
      frag.appendChild(card);
    }

    trackEl.appendChild(frag);

    if (dotsEl) {
      var dotFrag = document.createDocumentFragment();
      CLIPS.forEach(function (clip, clipIdx) {
        var dot = document.createElement("button");
        dot.type = "button";
        dot.className = "gallery-dot" + (clip.unseen ? " is-unseen-dot" : "");
        dot.setAttribute("role", "tab");
        dot.setAttribute("aria-selected", "false");
        dot.setAttribute("aria-label", clip.embodiment + (clip.unseen ? " (Unseen)" : "") + " " + formatIndex(clipIdx));
        dot.addEventListener("click", function () {
          focusSlot(findNearestSlotForClip(clipIdx));
        });
        dotBtns.push(dot);
        dotFrag.appendChild(dot);
      });
      dotsEl.appendChild(dotFrag);
    }
  }

  /* ---- Drag-to-Scrub & Horizontal Trackpad Support (Idle Browsing) ---- */
  viewportEl.addEventListener("pointerdown", function (e) {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    if (focusedSlot !== null || isTransitioningOut) return;
    if (e.target === slider || livePlayer.contains(e.target)) return;

    trackDrag.active = true;
    trackDrag.moved = false;
    trackDrag.pointerId = e.pointerId;
    trackDrag.startX = e.clientX;
    trackDrag.lastX = e.clientX;
    trackDrag.lastTs = performance.now();
    trackDrag.releaseVelocity = 0;
  });

  window.addEventListener("pointermove", function (e) {
    if (!trackDrag.active || e.pointerId !== trackDrag.pointerId) return;
    var dxTotal = e.clientX - trackDrag.startX;
    if (!trackDrag.moved && Math.abs(dxTotal) >= DRAG_CLICK_THRESHOLD) {
      trackDrag.moved = true;
      viewportEl.classList.add("is-grabbing");
    }
    if (!trackDrag.moved) return;

    var now = performance.now();
    var dx = e.clientX - trackDrag.lastX;
    var dt = Math.max(0.008, (now - trackDrag.lastTs) / 1000);
    trackDrag.lastX = e.clientX;
    trackDrag.lastTs = now;

    scrollX = wrapScrollX(scrollX - dx);
    applyTrackX(-scrollX);
    trackDrag.releaseVelocity = Math.max(-900, Math.min(900, -dx / dt));
  });

  function endTrackDrag(e) {
    if (!trackDrag.active) return;
    if (e && trackDrag.pointerId !== null && e.pointerId !== trackDrag.pointerId) return;
    var didMove = trackDrag.moved;
    trackDrag.active = false;
    trackDrag.moved = false;
    trackDrag.pointerId = null;
    viewportEl.classList.remove("is-grabbing");

    if (didMove) {
      suppressClickUntil = performance.now() + 180;
      velocity = trackDrag.releaseVelocity * 0.55;
    }
  }

  window.addEventListener("pointerup", endTrackDrag);
  window.addEventListener("pointercancel", endTrackDrag);

  viewportEl.addEventListener(
    "wheel",
    function (e) {
      if (focusedSlot !== null || isTransitioningOut) return;
      var horiz = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.shiftKey ? e.deltaY : 0;
      if (!horiz) return;
      e.preventDefault();
      scrollX = wrapScrollX(scrollX + horiz);
      applyTrackX(-scrollX);
      velocity = 0;
    },
    { passive: false }
  );

  /* ---- Header Embodiment Jump Pills & Flanking Arrows ---- */
  pillBtns.forEach(function (btn) {
    btn.addEventListener("click", function () {
      var emb = btn.getAttribute("data-emb");
      var matching = [];
      for (var i = 0; i < CLIPS.length; i++) {
        if (CLIPS[i].embodiment === emb) matching.push(i);
      }
      if (!matching.length) return;

      var targetClip = matching[0];
      if (focusedSlot !== null) {
        var curClip = focusedSlot % CLIPS.length;
        var pos = matching.indexOf(curClip);
        if (pos !== -1 && matching.length > 1) {
          targetClip = matching[(pos + 1) % matching.length];
        }
      }
      focusSlot(findNearestSlotForClip(targetClip));
    });
  });

  if (prevBtn) {
    prevBtn.addEventListener("click", function () {
      var base = focusedSlot !== null ? focusedSlot : getVisualCenterSlot();
      focusSlot(base - 1);
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener("click", function () {
      var base = focusedSlot !== null ? focusedSlot : getVisualCenterSlot();
      focusSlot(base + 1);
    });
  }

  /* ---- Hover Inertia Brake & Click-Outside Release ---- */
  bandEl.addEventListener("pointerenter", function (e) {
    if (e.pointerType === "touch") return;
    pointerInBand = true;
  });

  bandEl.addEventListener("pointerleave", function (e) {
    if (e.pointerType === "touch") return;
    pointerInBand = false;
  });

  document.addEventListener("pointerdown", function (e) {
    if (focusedSlot === null || isSliderDragging) return;
    var activeCard = slotEls[focusedSlot];
    if (activeCard && activeCard.contains(e.target)) return;
    if (prevBtn && prevBtn.contains(e.target)) return;
    if (nextBtn && nextBtn.contains(e.target)) return;
    if (pillsWrap && pillsWrap.contains(e.target)) return;
    if (dotsEl && dotsEl.contains(e.target)) return;
    if (trackEl.contains(e.target)) return;
    unfocus();
  });

  if (sectionEl) {
    sectionEl.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && focusedSlot !== null) {
        unfocus();
      } else if (e.key === "ArrowLeft" && focusedSlot !== null) {
        if (document.activeElement === slider) return;
        e.preventDefault();
        focusSlot(focusedSlot - 1);
      } else if (e.key === "ArrowRight" && focusedSlot !== null) {
        if (document.activeElement === slider) return;
        e.preventDefault();
        focusSlot(focusedSlot + 1);
      }
    });
  }

  /* ---- Unified Animation Loop: Physics-Damped Scroll + Live Visible Canvas Blit ---- */
  function startMainLoop() {
    if (loopRafId) return;
    lastLoopTs = performance.now();

    function frame(ts) {
      loopRafId = window.requestAnimationFrame(frame);
      var dt = Math.min(0.05, Math.max(0, (ts - lastLoopTs) / 1000));
      lastLoopTs = ts;

      if (
        focusedSlot === null &&
        !isTransitioningOut &&
        sectionVisible &&
        !prefersReducedMotion &&
        !(trackDrag.active && trackDrag.moved)
      ) {
        var targetSpeed = pointerInBand ? 0 : IDLE_SPEED;
        var damping = pointerInBand ? 8.5 : 3.8;
        velocity += (targetSpeed - velocity) * (1 - Math.exp(-damping * dt));

        if (Math.abs(velocity) < 0.15 && targetSpeed === 0) {
          velocity = 0;
        }

        if (velocity !== 0) {
          scrollX = wrapScrollX(scrollX + velocity * dt);
          applyTrackX(-scrollX);
        }

        var centerClip = getVisualCenterSlot() % CLIPS.length;
        updateIndicators(centerClip, false);
      }

      if (ts - lastBlitTs >= BLIT_INTERVAL_MS) {
        lastBlitTs = ts;
        updateVisiblePoolAndBlit(ts);
      }
    }

    loopRafId = window.requestAnimationFrame(frame);
  }

  /* ---- Resize Handling ---- */
  window.addEventListener("resize", function () {
    computeMetrics();
    if (focusedSlot !== null) {
      var vw = viewportEl.clientWidth || 1280;
      trackEl.classList.remove("is-gliding");
      applyTrackX(vw / 2 - (focusedSlot * metrics.pitch + metrics.focusW / 2));
    } else {
      scrollX = wrapScrollX(scrollX);
      applyTrackX(-scrollX);
    }
  });

  /* ---- Visibility Observer ---- */
  if ("IntersectionObserver" in window && sectionEl) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          sectionVisible = entry.isIntersecting;
          if (focusedSlot !== null) {
            if (sectionVisible) {
              safePlay(videoBefore);
              safePlay(videoAfter);
              startSyncLoop();
            } else {
              safePause(videoBefore);
              safePause(videoAfter);
              stopSyncLoop();
            }
          }
          if (!sectionVisible) {
            updateVisiblePoolAndBlit(performance.now());
          }
        });
      },
      { rootMargin: "320px 0px", threshold: 0.01 }
    );
    io.observe(sectionEl);
  }

  /* ---- Initialize ---- */
  buildCarousel();
  computeMetrics();
  scrollX = wrapScrollX(metrics.setWidth);
  applyTrackX(-scrollX);
  updateIndicators(0, false);

  if (prefersReducedMotion) {
    focusSlot(CLIPS.length, { instant: true });
  }
  startMainLoop();
})();
