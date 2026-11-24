"use strict";

(function () {
  const canvas = document.getElementById("transport-canvas");
  if (!canvas || !window.DualSimFig) return;

  const F = window.DualSimFig;
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const W = 1200;
  const H = 550;
  const ctx = F.setupHiDPI(canvas, W, H);

  // Offline pre-generated PPTX Column-1 Head View frames (exact 0.7*Sim+0.3*Noise inside M, Noise outside M)
  const IMGS = F.loadImages({
    sim: "assets/figures/elements/head_sim.jpg",
    src: "assets/figures/elements/head_source.jpg",
    t25: "assets/figures/elements/head_tau_025.jpg",
    t50: "assets/figures/elements/head_tau_050.jpg",
    t75: "assets/figures/elements/head_tau_075.jpg",
    real: "assets/figures/elements/head_real.jpg"
  });

  // 6 evenly spaced columns matching exact 16:10 head-view aspect ratio (180 x 112.5)
  const COL_W = 180;
  const COL_GAP = 18;
  const START_X = (W - (COL_W * 6 + COL_GAP * 5)) * 0.5; // 15
  const CLOUD_Y = 136;
  const FRAME_Y = 224;
  const FRAME_H = 112.5;
  const CURVE_Y = 350;
  const CURVE_H = 124;
  const LABEL_Y = 498;

  function colX(i) {
    return START_X + i * (COL_W + COL_GAP);
  }
  function colCx(i) {
    return colX(i) + COL_W * 0.5;
  }

  // Draw a crisp video frame using our offline pre-generated keyframes!
  function drawKeyframeVideo(x, y, w, h, opts) {
    const { mode = "snapshot", snapshotImg = null, tauVal = 0, borderColor, borderWidth, shadowBlur, shadowY, shadowAlpha } = opts;
    if (mode === "snapshot" && snapshotImg) {
      F.drawVideoFrame(ctx, {
        x, y, w, h, radius: 7,
        simImg: snapshotImg, mode: "sim",
        borderColor, borderWidth, shadowBlur, shadowY, shadowAlpha
      });
      return;
    }
    if (mode === "perturb") {
      F.drawVideoFrame(ctx, {
        x, y, w, h, radius: 7,
        simImg: IMGS.sim, sourceImg: IMGS.src, mode: "perturb", t: tauVal,
        borderColor, borderWidth, shadowBlur, shadowY, shadowAlpha
      });
      return;
    }
    // Smooth continuous crossfade between adjacent offline pre-generated frames (src -> t25 -> t50 -> t75 -> real)
    const stops = [IMGS.src, IMGS.t25, IMGS.t50, IMGS.t75, IMGS.real];
    const scaled = F.clamp01(tauVal) * 4;
    const i0 = Math.min(3, Math.floor(scaled));
    const localT = scaled - i0;
    F.drawVideoFrame(ctx, {
      x, y, w, h, radius: 7,
      sourceImg: stops[i0], realImg: stops[i0 + 1], mode: "transport", t: localT,
      borderColor, borderWidth, shadowBlur, shadowY, shadowAlpha
    });
  }

  // Quadratic Bezier helpers
  function quadPt(p0, p1, p2, t) {
    const mt = 1 - t;
    return [
      mt * mt * p0[0] + 2 * mt * t * p1[0] + t * t * p2[0],
      mt * mt * p0[1] + 2 * mt * t * p1[1] + t * t * p2[1]
    ];
  }
  function quadTan(p0, p1, p2, t) {
    const dx = 2 * (1 - t) * (p1[0] - p0[0]) + 2 * t * (p2[0] - p1[0]);
    const dy = 2 * (1 - t) * (p1[1] - p0[1]) + 2 * t * (p2[1] - p1[1]);
    return Math.atan2(dy, dx);
  }

  function drawPartialQuad(p0, p1, p2, frac, strokeStyle, lineWidth, headColor, showHeadAtEnd) {
    const u = F.clamp01(frac);
    if (u <= 0.005) return;
    const steps = 48;
    const maxS = Math.max(1, Math.round(steps * u));
    ctx.save();
    ctx.beginPath();
    for (let i = 0; i <= maxS; i++) {
      const s = i / steps;
      const [px, py] = quadPt(p0, p1, p2, Math.min(u, s));
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = "round";
    ctx.stroke();

    const [ex, ey] = quadPt(p0, p1, p2, u);
    const ang = quadTan(p0, p1, p2, u);
    if (showHeadAtEnd || u >= 0.98) {
      F.drawArrowHead(ctx, ex, ey, ang, 8.5, headColor);
    } else {
      ctx.beginPath();
      ctx.arc(ex, ey, 7.5, 0, Math.PI * 2);
      ctx.fillStyle = headColor;
      ctx.globalAlpha *= 0.25;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(ex, ey, 4.2, 0, Math.PI * 2);
      ctx.fillStyle = headColor;
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.restore();
  }

  // Exact manifold cloud physics across the 6 columns:
  // Col 0 (Simulation): separated & compact (mix=0), dot in Sim (dotSide=0)
  // Col 1 (Hybrid source tau=0): expanded & overlapping (mix=1), dot in overlap intersection (dotSide=0.48)
  // Col 2..4 (tau=0.25, 0.50, 0.75): contracting & separating again (mix=0.72 -> 0.46 -> 0.22), dot crossing into Real
  // Col 5 (Edited output tau=1): separated & compact again (mix=0), dot cleanly inside Real (dotSide=1.0)!
  const COL_CLOUD_PARAMS = [
    { mix: 0.000, dotSide: 0.00, labelMode: "sim",    imgKey: "sim" },
    { mix: 1.000, dotSide: 0.48, labelMode: "source", imgKey: "src" },
    { mix: 0.733, dotSide: 0.61, labelMode: "",       imgKey: "t25" },
    { mix: 0.473, dotSide: 0.74, labelMode: "",       imgKey: "t50" },
    { mix: 0.224, dotSide: 0.87, labelMode: "",       imgKey: "t75" },
    { mix: 0.000, dotSide: 1.00, labelMode: "final",  imgKey: "real" }
  ];

  // Draw a complete static/stamped column snapshot (enlarged manifold clouds + offline video + crisp curves + label)
  function drawColumnSnapshot(colIdx, opts) {
    const {
      tauVal = 0,
      isSim = false,
      label = "",
      opacity = 1,
      cloudOpacity = null,
      drawFrac = 1,
      showGT = 0,
      highlightFinal = 0
    } = opts;

    if (opacity <= 0.005) return;
    const x = colX(colIdx);
    const cx = colCx(colIdx);
    const cp = COL_CLOUD_PARAMS[colIdx];

    ctx.save();
    ctx.globalAlpha *= F.clamp01(opacity);

    // 1. Enlarged Soft Radial Mist Manifold Clouds
    const cOp = cloudOpacity === null ? 1 : F.clamp01(cloudOpacity);
    if (cOp > 0.005) {
      ctx.save();
      ctx.globalAlpha *= cOp;
      F.drawDistributionClouds(ctx, {
        cx, cy: CLOUD_Y,
        mix: cp.mix,
        dotSide: cp.dotSide,
        labelMode: cp.labelMode
      });
      ctx.restore();
    }

    // 2. Offline Pre-Generated Video Frame
    drawKeyframeVideo(x, FRAME_Y, COL_W, FRAME_H, {
      mode: "snapshot",
      snapshotImg: IMGS[cp.imgKey],
      borderColor: highlightFinal > 0.2
        ? `rgba(226, 106, 56, ${(0.22 + 0.42 * highlightFinal).toFixed(2)})`
        : "rgba(20, 32, 41, 0.13)",
      borderWidth: highlightFinal > 0.2 ? 1.6 : 1.0,
      shadowBlur: 10, shadowY: 3, shadowAlpha: 0.11
    });

    // 3. Sculptural 3-DoF Proprioceptive State Trajectories (Smooth Wavelets -> Exact Sim dashed comparison at tau=1)
    F.drawStateTriplet(ctx, {
      x: x + 4, y: CURVE_Y, w: COL_W - 8, h: CURVE_H,
      noiseLevel: isSim ? 0 : (1 - tauVal),
      editProgress: isSim ? 0 : tauVal,
      drawFrac,
      showRef: showGT,
      noiseAmpPx: 3.4,
      lineWidth: 2.0,
      ribbonHalf: 5.0
    });

    // 4. Column Caption
    if (colIdx === 5 && highlightFinal > 0.1) {
      ctx.save();
      ctx.globalAlpha *= highlightFinal;
      ctx.fillStyle = "#fff3ec";
      ctx.strokeStyle = "#f4c8b2";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(x + 8, LABEL_Y - 17, COL_W - 16, 25, 12.5);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    const colLabelColor = colIdx === 5 ? "#b9481a" : "#1c2d3a";
    const colWeight = (colIdx === 0 || colIdx === 1 || colIdx === 5) ? 650 : 550;
    if (label.indexOf("\u03c4") !== -1) {
      const idxTau = label.indexOf("\u03c4");
      const prefix = label.slice(0, idxTau);
      const suffix = label.slice(idxTau + 1);
      const parts = [];
      if (prefix) parts.push({ text: prefix, weight: colWeight });
      parts.push({ text: "\u03c4", italic: true, weight: 600, sizeDelta: 1 });
      parts.push({ text: suffix, math: true, weight: 550, sizeDelta: 0.4 });
      F.drawMathText(ctx, parts, cx, LABEL_Y, {
        align: "center",
        baseSize: 13.5,
        baseWeight: colWeight,
        baseColor: colLabelColor
      });
    } else {
      ctx.fillStyle = colLabelColor;
      ctx.font = colWeight + ' 13.5px "Segoe UI Variable Text", "SF Pro Text", system-ui, sans-serif';
      ctx.textAlign = "center";
      ctx.fillText(label, cx, LABEL_Y);
    }

    ctx.restore();
  }

  // Draw the elevated live traveling unit during Perturb (Col 0->1) or Conditional Transport (Col 1->5)
  function drawTravelingUnit(opts) {
    const {
      x, liftY = -5,
      mode = "transport", // "perturb" | "transport"
      progress = 0,       // p for perturb, tau for transport
      badgeText = "",
      opacity = 1
    } = opts;

    if (opacity <= 0.005) return;
    const cx = x + COL_W * 0.5;
    const isTransport = mode === "transport";

    ctx.save();
    ctx.globalAlpha *= F.clamp01(opacity);

    // Subtle frosted translucent card envelope around the moving video+state unit
    ctx.save();
    ctx.shadowColor = isTransport ? "rgba(226, 106, 56, 0.22)" : "rgba(46, 111, 149, 0.20)";
    ctx.shadowBlur = 22;
    ctx.shadowOffsetY = 9;
    ctx.fillStyle = "rgba(255, 255, 255, 0.96)";
    ctx.beginPath();
    ctx.roundRect(x - 7, FRAME_Y + liftY - 9, COL_W + 14, (CURVE_Y + CURVE_H - FRAME_Y) + 18, 13);
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = isTransport ? "rgba(226, 106, 56, 0.58)" : "rgba(46, 111, 149, 0.52)";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.roundRect(x - 7, FRAME_Y + liftY - 9, COL_W + 14, (CURVE_Y + CURVE_H - FRAME_Y) + 18, 13);
    ctx.stroke();

    // Live moving video frame (crossfading smoothly between offline pre-generated keyframes)
    drawKeyframeVideo(x, FRAME_Y + liftY, COL_W, FRAME_H, {
      mode,
      tauVal: progress,
      borderColor: "rgba(20, 32, 41, 0.14)", borderWidth: 1,
      shadowBlur: 0, shadowAlpha: 0
    });

    // Live moving & continuously evolving proprioceptive state curves (Smooth Wavelets!)
    F.drawStateTriplet(ctx, {
      x: x + 4, y: CURVE_Y + liftY, w: COL_W - 8, h: CURVE_H,
      noiseLevel: isTransport ? (1 - progress) : progress,
      editProgress: isTransport ? progress : 0,
      drawFrac: 1,
      showRef: 0,
      noiseAmpPx: 3.4,
      lineWidth: 2.0,
      ribbonHalf: 5.0
    });

    // Floating status pill right above the moving frame
    if (badgeText) {
      const pw = 84, ph = 21;
      ctx.fillStyle = isTransport ? "#e26a38" : "#2e6f95";
      ctx.beginPath();
      ctx.roundRect(cx - pw * 0.5, FRAME_Y + liftY - 22, pw, ph, 10.5);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.font = '650 11.5px "Segoe UI Variable Text", "SF Pro Text", system-ui, sans-serif';
      ctx.textAlign = "center";
      ctx.fillText(badgeText, cx, FRAME_Y + liftY - 7.5);
    }

    ctx.restore();
  }

  /* ============================================================
     PLAY-ONCE TRAVELING CHOREOGRAPHY (Ends cleanly at 11.4s and holds permanently)
     ============================================================ */
  const FINAL_T = 11.4;

  const MILESTONES = [
    { col: 2, tau: 0.25, label: "\u03c4 = 0.25" },
    { col: 3, tau: 0.50, label: "\u03c4 = 0.50" },
    { col: 4, tau: 0.75, label: "\u03c4 = 0.75" }
  ];

  function renderAt(t) {
    ctx.clearRect(0, 0, W, H);
    ctx.save();

    /* --- PHASE 1 (0.0 -> 1.25s): Simulation (Col 0) --- */
    const pSimEnter = F.easeOutCubic(F.phase(t, 0.0, 0.55));
    const pSimDraw = F.easeOutCubic(F.phase(t, 0.20, 1.15));
    drawColumnSnapshot(0, {
      isSim: true,
      label: "Simulation",
      opacity: pSimEnter,
      drawFrac: pSimDraw
    });

    /* --- PHASE 2 (1.25 -> 3.05s): Perturb Glide (Col 0 -> Col 1) --- */
    const pPerturbArch = F.easeInOutCubic(F.phase(t, 1.25, 2.75));
    const pPerturbMove = F.easeInOutCubic(F.phase(t, 1.35, 2.95));

    if (pPerturbArch > 0.005) {
      ctx.save();
      ctx.globalAlpha *= F.easeOutCubic(F.phase(t, 1.25, 1.65));
      ctx.fillStyle = "#225c82";
      ctx.font = 'italic 600 16px "Palatino Linotype", "Book Antiqua", Georgia, serif';
      ctx.textAlign = "center";
      ctx.fillText("Perturb", (colCx(0) + colCx(1)) * 0.5, 52);
      ctx.restore();

      drawPartialQuad(
        [colCx(0) + 34, 82],
        [(colCx(0) + colCx(1)) * 0.5, 50],
        [colCx(1) - 34, 84],
        pPerturbArch, "#2e6f95", 2.1, "#2e6f95", true
      );
    }

    if (t >= 2.90) {
      const pStamp0 = F.easeOutCubic(F.phase(t, 2.90, 3.25));
      drawColumnSnapshot(1, {
        tauVal: 0.0,
        label: "Hybrid source  \u03c4 = 0",
        opacity: pStamp0
      });
    }

    /* --- PHASE 3 (3.35 -> 9.85s): Continuous Traveling Conditional Transport (Col 1 -> Col 5) --- */
    const TRANS_START = 3.35;
    const TRANS_END = 9.85;
    const rawTau = F.phase(t, TRANS_START, TRANS_END);
    const liveTau = rawTau <= 0 ? 0 : rawTau >= 1 ? 1 : (0.18 * F.easeInOutCubic(rawTau) + 0.82 * rawTau);

    if (t >= TRANS_START - 0.15) {
      const titleOp = F.easeOutCubic(F.phase(t, TRANS_START - 0.15, TRANS_START + 0.35));
      ctx.save();
      ctx.globalAlpha *= titleOp;
      const serifTitleFam = '"Palatino Linotype", "Book Antiqua", "Iowan Old Style", Georgia, serif';
      F.drawMathText(ctx, [
        { text: "Conditional Transport", italic: true, weight: 700, family: serifTitleFam, color: "#1c2d3a" },
        { text: "   ", math: true, weight: 500 },
        { text: "x", italic: true, weight: 600, color: "#1f4d6b" },
        { text: "\u03c4", italic: true, sub: true, weight: 500, color: "#1f4d6b" },
        { text: " = (", math: true, weight: 500, color: "#3b5060" },
        { text: "z", italic: true, weight: 600, color: "#1f4d6b" },
        { text: "\u03c4", italic: true, sub: true, weight: 500, color: "#1f4d6b" },
        { text: ", ", math: true, weight: 500, color: "#3b5060" },
        { text: "q", italic: true, weight: 600, color: "#1f4d6b" },
        { text: "\u03c4", italic: true, sub: true, weight: 500, color: "#1f4d6b" },
        { text: ")", math: true, weight: 500, color: "#3b5060" }
      ], (colCx(1) + colCx(5)) * 0.5, 32, { align: "center", baseSize: 17.5, baseWeight: 600 });
      ctx.restore();

      const archG = ctx.createLinearGradient(colCx(1), 0, colCx(5), 0);
      archG.addColorStop(0, "#2e6f95");
      archG.addColorStop(0.55, "#3d8299");
      archG.addColorStop(1, "#e26a38");

      drawPartialQuad(
        [colCx(1) + 46, 78],
        [(colCx(1) + colCx(5)) * 0.5, 28],
        [colCx(5) - 44, 80],
        liveTau, archG, 2.3, "#e26a38", liveTau >= 0.985
      );
    }

    // Stroboscopic Milestones: peel smoothly out of the passing traveling unit right at ms.tau (zero pop-in delay!)
    MILESTONES.forEach((ms) => {
      if (liveTau >= ms.tau) {
        const settleOp = F.easeOutCubic(F.clamp01((liveTau - ms.tau) / 0.055));
        drawColumnSnapshot(ms.col, {
          tauVal: ms.tau,
          label: ms.label,
          opacity: settleOp,
          cloudOpacity: settleOp
        });
      }
    });

    // Final Column 5 (Edited output tau = 1) locks in when traveling unit reaches tau = 1
    if (t >= TRANS_END - 0.05) {
      const pFinal = F.easeOutCubic(F.phase(t, TRANS_END - 0.05, TRANS_END + 0.35));
      const pGT = F.easeOutCubic(F.phase(t, TRANS_END + 0.10, TRANS_END + 0.95));
      drawColumnSnapshot(5, {
        tauVal: 1.0,
        label: "Edited output  \u03c4 = 1",
        opacity: pFinal,
        showGT: pGT * 0.95,
        highlightFinal: pFinal
      });

      // Legend ("— Edited   --- Sim") cleanly below Col 5
      const pLeg = F.easeOutCubic(F.phase(t, TRANS_END + 0.45, TRANS_END + 1.0));
      if (pLeg > 0.005) {
        ctx.save();
        ctx.globalAlpha *= pLeg;
        const lx = colX(5) + 18;
        const ly = 532;
        ctx.strokeStyle = "#0e8575";
        ctx.lineWidth = 2.2;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(lx, ly - 4);
        ctx.lineTo(lx + 26, ly - 4);
        ctx.stroke();

        ctx.fillStyle = "#344a58";
        ctx.font = "650 12.5px Inter, system-ui, sans-serif";
        ctx.textAlign = "left";
        ctx.fillText("Edited", lx + 32, ly);

        ctx.strokeStyle = "#6b7d8b";
        ctx.lineWidth = 1.6;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(lx + 86, ly - 4);
        ctx.lineTo(lx + 112, ly - 4);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillText("Sim", lx + 118, ly);
        ctx.restore();
      }
    }

    /* --- ACTIVE ELEVATED TRAVELING UNITS + SEAMLESS LIVE MORPHING PROBABILITY CLOUD --- */
    if (t >= 1.35 && t < 3.05) {
      const tx = F.lerp(colX(0), colX(1), pPerturbMove);
      const tcx = tx + COL_W * 0.5;
      const lift = -6 * Math.sin(pPerturbMove * Math.PI);
      const outFade = t > 2.90 ? 1 - F.phase(t, 2.90, 3.05) : 1;

      // Live expanding & diluting cloud peeling smoothly out of Col 0 -> landing directly into Col 1!
      const cloudFade = F.easeOutCubic(F.phase(pPerturbMove, 0.0, 0.16)) * outFade;
      if (cloudFade > 0.01) {
        ctx.save();
        ctx.globalAlpha *= cloudFade;
        F.drawDistributionClouds(ctx, {
          cx: tcx, cy: CLOUD_Y,
          mix: pPerturbMove,
          dotSide: F.lerp(0.0, 0.48, pPerturbMove),
          backdrop: false
        });
        ctx.restore();
      }

      drawTravelingUnit({
        x: tx,
        liftY: lift,
        mode: "perturb",
        progress: pPerturbMove,
        badgeText: "Perturb",
        opacity: outFade
      });
    }

    if (t >= TRANS_START && t < TRANS_END + 0.25) {
      const tx = F.lerp(colX(1), colX(5), liveTau);
      const tcx = tx + COL_W * 0.5;
      const enterLift = F.easeOutCubic(F.phase(t, TRANS_START, TRANS_START + 0.35));
      const exitDrop = t > TRANS_END - 0.15 ? 1 - F.easeInOutCubic(F.phase(t, TRANS_END - 0.15, TRANS_END + 0.20)) : 1;
      const lift = -6.5 * enterLift * exitDrop;
      const cardOp = t > TRANS_END ? 1 - F.phase(t, TRANS_END, TRANS_END + 0.25) : 1;

      // Live contracting & separating cloud peeling continuously out of Col 1 -> leaving 0.25/0.50/0.75 behind -> landing in Col 5!
      const liveCloudFade = F.easeOutCubic(F.phase(liveTau, 0.0, 0.06)) * cardOp;
      if (liveCloudFade > 0.01) {
        ctx.save();
        ctx.globalAlpha *= liveCloudFade;
        F.drawDistributionClouds(ctx, {
          cx: tcx, cy: CLOUD_Y,
          mix: Math.pow(1 - liveTau, 1.08),
          dotSide: F.lerp(0.48, 1.0, liveTau),
          backdrop: false
        });
        ctx.restore();
      }

      drawTravelingUnit({
        x: tx,
        liftY: lift,
        mode: "transport",
        progress: liveTau,
        badgeText: `\u03c4 = ${liveTau.toFixed(2)}`,
        opacity: cardOp
      });
    }

    ctx.restore();
  }

  if (prefersReducedMotion) {
    renderAt(FINAL_T);
    return;
  }

  let clock = 0;
  let lastTs = performance.now();
  let inView = false;
  let finished = false;

  function tick(now) {
    const dt = Math.min(0.05, (now - lastTs) / 1000);
    lastTs = now;
    if (inView && !document.hidden && !finished) {
      clock = Math.min(FINAL_T, clock + dt);
      renderAt(clock);
      if (clock >= FINAL_T) {
        finished = true;
        return;
      }
    }
    requestAnimationFrame(tick);
  }

  renderAt(0);

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      if (inView) lastTs = performance.now();
    }, { threshold: 0.15 }).observe(canvas);
  } else {
    inView = true;
  }

  requestAnimationFrame(tick);
})();
