"use strict";

window.DualSimFig = (function () {
  if (typeof CanvasRenderingContext2D !== "undefined" && !CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
      const rad = Math.min(r || 0, w / 2, h / 2);
      this.moveTo(x + rad, y);
      this.arcTo(x + w, y, x + w, y + h, rad);
      this.arcTo(x + w, y + h, x, y + h, rad);
      this.arcTo(x, y + h, x, y, rad);
      this.arcTo(x, y, x + w, y, rad);
      this.closePath();
      return this;
    };
  }

  function clamp01(v) {
    return v < 0 ? 0 : v > 1 ? 1 : v;
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function phase(t, start, end) {
    return clamp01((t - start) / (end - start));
  }

  function easeOutCubic(t) {
    const u = clamp01(t);
    return 1 - Math.pow(1 - u, 3);
  }

  function easeInOutCubic(t) {
    const u = clamp01(t);
    return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
  }

  function easeOutBack(t) {
    const u = clamp01(t);
    const c1 = 1.35;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2);
  }

  function setupHiDPI(canvas, logicalW, logicalH) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(logicalW * dpr);
    canvas.height = Math.round(logicalH * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }

  function loadImages(map, onReady) {
    const out = {};
    const keys = Object.keys(map);
    let remaining = keys.length;
    keys.forEach((k) => {
      const img = new Image();
      img.decoding = "async";
      img.onload = img.onerror = () => {
        remaining -= 1;
        if (remaining <= 0 && onReady) onReady(out);
      };
      img.src = map[k];
      out[k] = img;
    });
    return out;
  }

  /* ============================================================
     SCULPTURAL 3-DOF PROPRIOCEPTIVE STATE CURVE ENGINE
     - 3 distinct expressive joint trajectories (bell arch / dip-to-shelf / S-climb)
     - Stylized Smooth Harmonic Wavelets ("丝滑小波浪") for clean, modern noise-to-denoise
     - Pixel-identical original Sim dashed comparison curve
     ============================================================ */
  const N_SAMPLES = 220;

  // 3 Distinct Sculptural Joint Trajectories faithful to Fig 2 & Fig 3:
  // ch 0 (Teal): Tall sweeping bell crest
  // ch 1 (Blue): Left dip into U-valley -> high sweeping right plateau
  // ch 2 (Sage): Diagonal S-curve climb to gentle right hill
  function evalBaseJoint(ch, u) {
    if (ch === 0) {
      const bell = Math.exp(-Math.pow((u - 0.46) / 0.265, 2));
      return -0.66 + 1.56 * bell + 0.24 * u;
    }
    if (ch === 1) {
      const leftHigh = 0.34 * Math.exp(-u * 4.4);
      const valley = -0.80 * Math.exp(-Math.pow((u - 0.29) / 0.22, 2));
      const rightShelf = 0.86 / (1 + Math.exp(-(u - 0.55) * 5.8));
      return -0.06 + leftHigh + valley + rightShelf;
    }
    const climb = 1.08 / (1 + Math.exp(-(u - 0.43) * 4.8)) - 0.60;
    const rollOff = -0.16 * Math.pow(Math.max(0, (u - 0.74) / 0.26), 2);
    return climb + rollOff;
  }

  // Meaningful physical contact edit delta (Sim q~ -> Edited q^):
  // Zero at t=0 (shared initial state q0), clearly diverging across contact region u in [0.25..1.0]
  function evalEditDelta(ch, u) {
    const ramp = 1 / (1 + Math.exp(-(u - 0.34) * 8.0));
    const ramp0 = 1 / (1 + Math.exp(0.34 * 8.0));
    const gate = Math.max(0, (ramp - ramp0) / (1 - ramp0));
    if (ch === 0) return -0.40 * gate * Math.exp(-Math.pow((u - 0.74) / 0.44, 2));
    if (ch === 1) return 0.42 * gate * (0.68 + 0.32 * u);
    return 0.35 * gate * (0.75 + 0.25 * Math.sin(u * Math.PI));
  }

  const STATE_STYLES = [
    { stroke: "#0e8575", haloFill: "rgba(14, 133, 117, 0.10)", haloEdge: "rgba(14, 133, 117, 0.16)", yFrac: 0.25 },
    { stroke: "#2b77b4", haloFill: "rgba(43, 119, 180, 0.10)", haloEdge: "rgba(43, 119, 180, 0.16)", yFrac: 0.59 },
    { stroke: "#69986c", haloFill: "rgba(105, 152, 108, 0.10)", haloEdge: "rgba(105, 152, 108, 0.16)", yFrac: 0.88 }
  ];

  /**
   * Draw 3 expressive proprioceptive state trajectories with delicate halo ribbons,
   * stylized Smooth Harmonic Wavelets ("丝滑小波浪") during perturbation/denoising,
   * and an exact pixel-identical dashed Sim comparison curve when showRef > 0.
   */
  function drawStateTriplet(ctx, opts) {
    const {
      x, y, w, h,
      noiseLevel = 0,       // 0 = glass-smooth, 1 = full smooth wavelet perturbation
      editProgress = 0,     // 0 = Sim trajectory, 1 = Edited trajectory
      drawFrac = 1,         // 0..1 left-to-right drawing progress
      showRef = 0,          // 0..1 opacity of exact dashed Sim comparison curve
      noiseAmpPx = 3.5,     // smooth wavelet peak amplitude in logical px
      lineWidth = 2.0,
      ribbonHalf = 5.0
    } = opts;

    const maxIdx = Math.max(1, Math.floor((N_SAMPLES - 1) * clamp01(drawFrac)));
    const ampScale = h * 0.21;
    const effWave = clamp01(noiseLevel) * noiseAmpPx;

    ctx.save();
    STATE_STYLES.forEach((st, ch) => {
      const cy = y + h * st.yFrac;
      const ph = ch * 1.9;

      const cleanPts = [];
      const wavePts = [];
      const simPts = [];

      for (let i = 0; i <= maxIdx; i++) {
        const u = i / (N_SAMPLES - 1);
        const px = x + u * w;
        const base = evalBaseJoint(ch, u);
        const delta = evalEditDelta(ch, u);
        const cleanVal = base + delta * editProgress;

        const pyClean = cy - cleanVal * ampScale;
        const pySim = cy - base * ampScale;

        let waveOff = 0;
        if (effWave > 0.005) {
          const env = 0.65 + 0.35 * Math.sin(u * Math.PI);
          const w1 = Math.sin(u * Math.PI * 22.0 + ph);
          const w2 = 0.32 * Math.sin(u * Math.PI * 34.0 + ph * 1.7 + 0.8);
          waveOff = (w1 + w2) * effWave * env;
        }

        cleanPts.push([px, pyClean]);
        wavePts.push([px, pyClean + waveOff]);
        simPts.push([px, pySim]);
      }

      // 1. Delicate Translucent Halo Ribbon hugging the smooth curve backbone
      const half = ribbonHalf * (0.88 + 0.36 * clamp01(noiseLevel));
      ctx.beginPath();
      for (let i = 0; i < cleanPts.length; i++) {
        const [px, py] = cleanPts[i];
        if (i === 0) ctx.moveTo(px, py - half);
        else ctx.lineTo(px, py - half);
      }
      for (let i = cleanPts.length - 1; i >= 0; i--) {
        const [px, py] = cleanPts[i];
        ctx.lineTo(px, py + half);
      }
      ctx.closePath();
      ctx.fillStyle = st.haloFill;
      ctx.fill();
      ctx.strokeStyle = st.haloEdge;
      ctx.lineWidth = 0.6;
      ctx.stroke();

      // 2. Exact Original Sim Dashed Comparison Curve (1:1 identical to initial Sim curve!)
      if (showRef > 0.01) {
        ctx.save();
        ctx.globalAlpha *= clamp01(showRef);
        ctx.beginPath();
        for (let i = 0; i < simPts.length; i++) {
          const [px, py] = simPts[i];
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.strokeStyle = "#6c7e8c";
        ctx.lineWidth = Math.max(1.3, lineWidth * 0.72);
        ctx.setLineDash([4.2, 3.2]);
        ctx.lineCap = "round";
        ctx.stroke();
        ctx.restore();
      }

      // 3. Main Trajectory Curve (silky smooth wavelets -> razor-sharp Edited trajectory)
      ctx.beginPath();
      for (let i = 0; i < wavePts.length; i++) {
        const [px, py] = wavePts[i];
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.strokeStyle = st.stroke;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();
    });
    ctx.restore();
  }

  /* ============================================================
     EXACT PIXEL-TRUE VIDEO BLENDING (Sim -> Source -> Real)
     ============================================================ */
  function drawVideoFrame(ctx, opts) {
    const {
      x, y, w, h, radius = 7,
      simImg, sourceImg, realImg,
      mode = "transport", // "sim" | "perturb" | "transport" | "real"
      t = 0,              // perturb progress (0..1) OR transport tau (0..1)
      borderColor = "rgba(20, 32, 41, 0.14)",
      borderWidth = 1.0,
      shadowBlur = 10,
      shadowY = 3,
      shadowAlpha = 0.12
    } = opts;

    ctx.save();

    // Soft studio elevation shadow
    if (shadowBlur > 0 && shadowAlpha > 0) {
      ctx.save();
      ctx.shadowColor = `rgba(18, 32, 44, ${shadowAlpha})`;
      ctx.shadowBlur = shadowBlur;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = shadowY;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, radius);
      ctx.fill();
      ctx.restore();
    }

    // Clip to rounded frame
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
    ctx.clip();

    // Neutral fallback background before images load
    ctx.fillStyle = "#d5dde3";
    ctx.fillRect(x, y, w, h);

    const drawIfReady = (img, alpha) => {
      if (!img || !img.complete || img.naturalWidth === 0 || alpha <= 0.001) return;
      ctx.save();
      ctx.globalAlpha *= clamp01(alpha);
      ctx.drawImage(img, x, y, w, h);
      ctx.restore();
    };

    if (mode === "sim") {
      drawIfReady(simImg, 1);
    } else if (mode === "real") {
      drawIfReady(realImg, 1);
    } else if (mode === "perturb") {
      // Smoothly infuse Kinematic Seeding noise from Sim -> Hybrid Source
      drawIfReady(simImg, 1);
      drawIfReady(sourceImg, t);
    } else {
      // Exact Conditional Transport: I(tau) = (1 - tau) * Source + tau * Real
      // Inside mask M: Source = 0.7*Sim + 0.3*Noise; Outside mask M: Source = Noise
      drawIfReady(sourceImg, 1);
      drawIfReady(realImg, t);
    }

    ctx.restore();

    // Crisp hairline frame stroke
    if (borderWidth > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, radius);
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = borderWidth;
      ctx.stroke();
      ctx.restore();
    }
  }

  /* ============================================================
     PUBLICATION-GRADE MATH TYPOGRAPHY HELPER (Subscripts & Italics)
     parts: array of { text, italic?, sub?, weight?, color?, sizeDelta? }
     ============================================================ */
  function drawMathText(ctx, parts, x, y, opts) {
    const {
      align = "center",
      baseSize = 13.5,
      baseWeight = 700,
      baseColor = "#142029",
      fontFamily = '"Segoe UI Variable Text", "SF Pro Text", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      mathFamily = '"Cambria Math", "STIX Two Math", "Times New Roman", "Palatino Linotype", Georgia, serif'
    } = opts || {};

    ctx.save();
    const measured = parts.map((p) => {
      const sz = p.sub ? baseSize * 0.72 : baseSize + (p.sizeDelta || 0);
      const wt = p.weight || (p.sub ? 600 : baseWeight);
      const isMath = Boolean(p.italic || p.math || p.sub);
      const fam = p.family || (isMath ? mathFamily : fontFamily);
      const style = p.italic ? "italic " : "";
      const font = `${style}${wt} ${sz}px ${fam}`;

      // Separate combining tilde (\u0303) or circumflex (\u0302) for crisp vector accent rendering
      let accent = p.accent || "";
      let cleanText = p.text;
      if (!accent && cleanText.indexOf("\u0303") !== -1) {
        accent = "tilde";
        cleanText = cleanText.replace(/\u0303/g, "");
      } else if (!accent && cleanText.indexOf("\u0302") !== -1) {
        accent = "hat";
        cleanText = cleanText.replace(/\u0302/g, "");
      }

      ctx.font = font;
      const w = ctx.measureText(cleanText).width + (p.italic ? sz * 0.06 : 0);
      return { p, cleanText, accent, font, sz, w, dy: p.sub ? baseSize * 0.25 : 0 };
    });

    const totalW = measured.reduce((acc, m) => acc + m.w, 0);
    let curX = align === "center" ? x - totalW * 0.5 : align === "right" ? x - totalW : x;

    ctx.textAlign = "left";
    measured.forEach((m) => {
      ctx.font = m.font;
      const col = m.p.color || baseColor;
      ctx.fillStyle = col;
      ctx.fillText(m.cleanText, curX, y + m.dy);

      if (m.accent) {
        const isLower = m.cleanText === m.cleanText.toLowerCase();
        const ax = curX + m.w * (m.p.italic ? 0.56 : 0.48);
        const ay = y + m.dy - (isLower ? m.sz * 0.64 : m.sz * 0.84);
        ctx.save();
        ctx.strokeStyle = col;
        ctx.lineWidth = Math.max(1.15, m.sz * 0.085);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        if (m.accent === "tilde") {
          const hw = m.sz * 0.27;
          ctx.moveTo(ax - hw, ay + 1.0);
          ctx.bezierCurveTo(ax - hw * 0.45, ay - 2.2, ax + hw * 0.15, ay + 2.2, ax + hw, ay - 1.0);
        } else if (m.accent === "hat") {
          const hw = m.sz * 0.25;
          ctx.moveTo(ax - hw, ay + 1.6);
          ctx.lineTo(ax, ay - 2.0);
          ctx.lineTo(ax + hw, ay + 1.6);
        }
        ctx.stroke();
        ctx.restore();
      }

      curX += m.w;
    });
    ctx.restore();
  }

  /* ============================================================
     SOFT RADIAL MIST PROBABILITY CLOUDS + MIGRATION TRAIL
     Self-defined organic gradient boundaries (zero dashed rings!):
     - Start (Col 0, mix=0): Rich, fuller, cleanly separated Sim & Real clouds (not too far apart),
       blue data point inside Sim.
     - Perturb (Col 1, mix=1): Both clouds DILUTE (lower peak density) & EXPAND larger so they
       visibly OVERLAP in the center (Source), with the data point in the overlap.
     - Denoise (Col 2..4): Both clouds gradually concentrate & contract back to their initial state
       while the data point glides along a subtle migration trail into Real.
     - Final (Col 5, mix=0): IDENTICAL cloud geometry & density to Col 0 — ONLY the data point
       has migrated across into the Real cloud!
     ============================================================ */
  function drawDistributionClouds(ctx, opts) {
    const {
      cx, cy = 136,
      mix = 0,         // 0 = crisp separated manifolds (Col 0 & Col 5 identical!), 1 = diluted expanded overlap
      dotSide = 0,     // 0 = inside Sim, 0.5 = in Source overlap, 1 = inside Real
      labelMode = "",  // "sim" | "source" | "final" | ""
      backdrop = false // subtle soft white halo when gliding live above the traveling card
    } = opts;

    const m = clamp01(mix);

    // Larger, lush clouds (~32% bigger!) — Col 0 & Col 5 (mix=0) are 100% IDENTICAL:
    // cleanly separated without being far apart, expanding & diluting smoothly at mix=1!
    const sepX = lerp(31.0, 16.5, m);
    const sepY = lerp(12.5, 6.2, m);
    const realCx = cx - sepX;
    const realCy = cy + sepY;
    const simCx = cx + sepX;
    const simCy = cy - sepY;

    // Cloud radius: bold & generous when clean (mix=0), noticeably expanded (1.39x) when noisy (mix=1)!
    const rx = lerp(38.0, 52.5, m);
    const ry = lerp(23.5, 32.5, m);

    // Peak color density: rich & saturated when clean (mix=0), visibly DILUTED when noisy (mix=1)!
    const peakA = lerp(0.78, 0.44, m);
    const midA  = lerp(0.45, 0.27, m);
    const edgeA = lerp(0.12, 0.08, m);

    // Optional compact soft white halo when actively gliding so live morphing stays crisp without dimming neighbors
    if (backdrop) {
      ctx.save();
      const br = Math.max(sepX + rx * 0.85, 62);
      const bg = ctx.createRadialGradient(cx, cy, br * 0.35, cx, cy, br * 0.92);
      bg.addColorStop(0, "rgba(255, 255, 255, 0.86)");
      bg.addColorStop(0.68, "rgba(255, 255, 255, 0.50)");
      bg.addColorStop(1, "rgba(255, 255, 255, 0)");
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.arc(cx, cy, br * 0.92, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    const drawMistCloud = (x0, y0, aRx, aRy, rotRad, rgb) => {
      ctx.save();
      ctx.translate(x0, y0);
      ctx.rotate(rotRad);
      // Scale unit circle into elliptical soft Gaussian radial mist (self-defining edge, zero dashed border!)
      ctx.scale(aRx, aRy);
      const rg = ctx.createRadialGradient(0, 0, 0.0, 0, 0, 1.0);
      rg.addColorStop(0.00, `rgba(${rgb}, ${peakA.toFixed(3)})`);
      rg.addColorStop(0.42, `rgba(${rgb}, ${midA.toFixed(3)})`);
      rg.addColorStop(0.78, `rgba(${rgb}, ${edgeA.toFixed(3)})`);
      rg.addColorStop(1.00, `rgba(${rgb}, 0)`);
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(0, 0, 1.0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    // Draw Real (emerald mist) and Sim (cerulean blue mist)
    drawMistCloud(realCx, realCy, rx, ry, -0.22, "18, 156, 128");
    drawMistCloud(simCx, simCy, rx * 0.96, ry * 0.96, -0.27, "44, 134, 212");

    // Subtle soft cyan-teal intersection glow only while diluted clouds overlap (mix > 0.22)
    if (m > 0.22) {
      ctx.save();
      const ir = 22 * m;
      const ig = ctx.createRadialGradient(cx, cy, 0, cx, cy, ir);
      ig.addColorStop(0, `rgba(54, 182, 198, ${(0.22 * m).toFixed(3)})`);
      ig.addColorStop(1, "rgba(54, 182, 198, 0)");
      ctx.fillStyle = ig;
      ctx.beginPath();
      ctx.arc(cx, cy, ir, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Data point x_tau crossing smoothly from Sim (dotSide=0) -> Source overlap (0.5) -> Real (1.0)
    const s = clamp01(dotSide);
    const startX = simCx - 6.5;
    const startY = simCy - 2.0;
    const endX = realCx + 6.0;
    const endY = realCy - 1.5;

    // Gentle upward-bowed quadratic curve for the migration trail
    const ctrlX = (startX + endX) * 0.5 - 2.5;
    const ctrlY = (startY + endY) * 0.5 - 9.5;
    const mt = 1 - s;
    const dotX = mt * mt * startX + 2 * mt * s * ctrlX + s * s * endX;
    const dotY = mt * mt * startY + 2 * mt * s * ctrlY + s * s * endY;

    // Delicate dashed migration trajectory trail from Sim origin -> current particle position
    if (s > 0.06) {
      ctx.save();
      ctx.strokeStyle = "rgba(32, 114, 162, 0.54)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3.0, 2.8]);
      ctx.lineCap = "round";
      ctx.beginPath();
      const segs = 22;
      for (let i = 0; i <= segs; i++) {
        const u = (i / segs) * s;
        const mu = 1 - u;
        const px = mu * mu * startX + 2 * mu * u * ctrlX + u * u * endX;
        const py = mu * mu * startY + 2 * mu * u * ctrlY + u * u * endY;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // Keep the migrating particle a consistent vivid sky-blue across all 6 columns
    const dotFill = "#35aaf8";
    const dotRing = "#155787";

    ctx.save();
    ctx.beginPath();
    ctx.arc(dotX, dotY, 10.0, 0, Math.PI * 2);
    ctx.fillStyle = dotFill;
    ctx.globalAlpha *= 0.25;
    ctx.fill();
    ctx.restore();

    ctx.beginPath();
    ctx.arc(dotX, dotY, 5.6, 0, Math.PI * 2);
    ctx.fillStyle = dotFill;
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2.1;
    ctx.stroke();
    ctx.strokeStyle = dotRing;
    ctx.lineWidth = 0.95;
    ctx.stroke();

    // Clean balanced labels in Teaser-inspired italic serif
    ctx.font = 'italic 700 13px Georgia, "Times New Roman", serif';
    if (labelMode === "sim") {
      ctx.fillStyle = "#226796";
      ctx.textAlign = "left";
      ctx.fillText("Sim", simCx + 24, simCy - 14);
      ctx.fillStyle = "#167a63";
      ctx.textAlign = "center";
      ctx.fillText("Real", realCx, realCy + 30);
    } else if (labelMode === "source") {
      ctx.fillStyle = "#1f628c";
      ctx.textAlign = "center";
      ctx.fillText("Source", cx, cy - ry - 6);
    } else if (labelMode === "final") {
      ctx.fillStyle = "#167a63";
      ctx.textAlign = "center";
      ctx.fillText("Real", realCx, realCy + 30);
      ctx.fillStyle = "#226796";
      ctx.textAlign = "left";
      ctx.fillText("Sim", simCx + 24, simCy - 14);
    }
  }

  function drawArrowHead(ctx, x, y, angle, size, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-size, -size * 0.50);
    ctx.lineTo(-size * 0.75, 0);
    ctx.lineTo(-size, size * 0.50);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  }

  // Draw a crisp isometric dashed 3D cube + studio radial halo + rendered AgiBot G2 PNG inside
  function drawSimRobotCube(ctx, opts) {
    const {
      cx, cy, size,
      robotImg,
      label = "",
      isHero = 0, // 0 = background row cube, 1 = foreground spotlighted t cube
      opacity = 1
    } = opts;

    if (opacity <= 0.005) return;
    ctx.save();
    ctx.globalAlpha *= clamp01(opacity);

    const half = size * 0.5;
    const x = cx - half;
    const y = cy - half;
    const dx = size * 0.22;
    const dy = -size * 0.15;

    // Soft studio radial circular backdrop (deep slate-navy when hero, misty cool gray when row)
    const rGlow = size * 0.56;
    const rg = ctx.createRadialGradient(cx, cy + size * 0.02, size * 0.04, cx, cy + size * 0.02, rGlow);
    if (isHero > 0.3) {
      const a0 = lerp(0.55, 0.94, isHero);
      const a1 = lerp(0.32, 0.86, isHero);
      rg.addColorStop(0, `rgba(74, 92, 106, ${a0})`);
      rg.addColorStop(0.58, `rgba(38, 52, 64, ${a1})`);
      rg.addColorStop(0.86, `rgba(48, 63, 76, ${a1 * 0.35})`);
      rg.addColorStop(1, "rgba(48, 63, 76, 0)");
    } else {
      rg.addColorStop(0, "rgba(104, 120, 134, 0.52)");
      rg.addColorStop(0.62, "rgba(138, 152, 164, 0.24)");
      rg.addColorStop(1, "rgba(138, 152, 164, 0)");
    }
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(cx, cy + size * 0.02, rGlow, 0, Math.PI * 2);
    ctx.fill();

    // Subtle wireframe floor perspective grid when spotlighted
    if (isHero > 0.2) {
      ctx.save();
      ctx.globalAlpha *= isHero * 0.26;
      ctx.strokeStyle = "#b8d0e0";
      ctx.lineWidth = 0.8;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(cx - size * 0.36, cy + size * 0.28 + i * 4.5);
        ctx.lineTo(cx + size * 0.36, cy + size * 0.28 + i * 4.5);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Back isometric dashed face & connectors
    const wireColor = isHero > 0.4 ? "rgba(56, 82, 100, 0.72)" : "rgba(140, 158, 172, 0.55)";
    ctx.strokeStyle = wireColor;
    ctx.lineWidth = lerp(1.0, 1.55, isHero);
    ctx.setLineDash([4, 3.5]);

    ctx.strokeRect(x + dx, y + dy, size, size);
    [
      [x, y, x + dx, y + dy],
      [x + size, y, x + size + dx, y + dy],
      [x, y + size, x + dx, y + size + dy],
      [x + size, y + size, x + size + dx, y + size + dy]
    ].forEach(([x1, y1, x2, y2]) => {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    });

    // Soft ground shadow oval under robot wheels
    ctx.setLineDash([]);
    ctx.fillStyle = `rgba(14, 22, 28, ${lerp(0.14, 0.34, isHero)})`;
    ctx.beginPath();
    ctx.ellipse(cx, cy + size * 0.39, size * 0.24, size * 0.065, 0, 0, Math.PI * 2);
    ctx.fill();

    // Real Rendered AgiBot G2 3D Robot PNG
    if (robotImg && robotImg.complete && robotImg.naturalWidth > 0) {
      const rSize = size * 0.96;
      ctx.save();
      if (isHero < 0.5) {
        ctx.globalAlpha *= lerp(0.76, 1.0, isHero * 2);
      }
      ctx.drawImage(robotImg, cx - rSize * 0.5, cy - rSize * 0.49, rSize, rSize);
      ctx.restore();
    }

    // Front isometric dashed face (drawn crisp on top)
    ctx.strokeStyle = isHero > 0.4 ? "rgba(38, 66, 86, 0.85)" : "rgba(130, 148, 162, 0.62)";
    ctx.lineWidth = lerp(1.1, 1.85, isHero);
    ctx.setLineDash([5, 3.5]);
    ctx.strokeRect(x, y, size, size);
    ctx.setLineDash([]);

    // Time step label: row frames cleanly ABOVE back face (never colliding with popped-out t!),
    // spotlight hero frame gets a crisp italic pill at left edge!
    if (label) {
      if (isHero > 0.35) {
        ctx.save();
        ctx.globalAlpha *= clamp01((isHero - 0.35) / 0.65);
        const px = x - 28;
        const py = cy + 6;
        ctx.fillStyle = "#1c3342";
        ctx.beginPath();
        ctx.roundRect(px - 11, py - 15, 22, 22, 11);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.font = "italic 700 13.5px Georgia, 'Times New Roman', serif";
        ctx.textAlign = "center";
        ctx.fillText(label, px, py);
        ctx.restore();
      } else {
        ctx.font = "italic 650 12.5px Georgia, 'Times New Roman', serif";
        ctx.fillStyle = "#4b606e";
        ctx.textAlign = "center";
        ctx.fillText(label, cx + dx * 0.5, y + dy - 7);
      }
    }

    ctx.restore();
  }

  return {
    clamp01,
    lerp,
    phase,
    easeOutCubic,
    easeInOutCubic,
    easeOutBack,
    setupHiDPI,
    loadImages,
    drawMathText,
    drawStateTriplet,
    drawVideoFrame,
    drawDistributionClouds,
    drawArrowHead,
    drawSimRobotCube
  };
})();
