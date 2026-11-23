"use strict";

(function () {
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const SVG_NS = "http://www.w3.org/2000/svg";
  const SANS = '"Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif';
  const SERIF = 'Georgia, "Times New Roman", serif';

  function svgEl(tag, attrs, parent) {
    const node = document.createElementNS(SVG_NS, tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        node.setAttribute(k, String(v));
      }
    }
    if (parent) parent.appendChild(node);
    return node;
  }

  function animateValue(el, target, decimals, suffix) {
    const sfx = suffix || "";
    if (prefersReducedMotion) {
      el.textContent = `${target.toFixed(decimals)}${sfx}`;
      return;
    }
    const start = performance.now();
    const dur = 820;
    function step(now) {
      const p = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = `${(target * eased).toFixed(decimals)}${sfx}`;
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function observeOnce(el, callback) {
    if (!el) return;
    if (prefersReducedMotion || !("IntersectionObserver" in window)) {
      callback();
      return;
    }
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          obs.disconnect();
          callback();
        }
      },
      { threshold: 0.16 }
    );
    obs.observe(el);
  }

  /* ============================================================
     1. SECTION 4.1: EWMSCORE BARS + TEASER-STYLE SPLIT RADAR
     ============================================================ */
  const RICH_METHODS = [
    { name: "Dual-Sim", isOurs: true, ewm: 64.67, scene: 87.42, psnr: 21.56, ssim: 74.90, hsd: 33.65, dynamics: 16.84, ndtw: 44.99 },
    { name: "GE-Sim 2.0*", isMatched: true, ewm: 59.11, scene: 85.10, psnr: 18.84, ssim: 67.38, hsd: 31.74, dynamics: 14.70, ndtw: 38.40 },
    { name: "GE-Sim 2.0", ewm: 52.48, scene: 86.55, psnr: 17.86, ssim: 67.25, hsd: 16.96, dynamics: 12.54, ndtw: 19.88 },
    { name: "Ctrl-World", ewm: 49.54, scene: 88.94, psnr: 15.82, ssim: 56.67, hsd: 11.99, dynamics: 3.52, ndtw: 14.47 },
    { name: "EnerVerse-AC", ewm: 49.30, scene: 84.08, psnr: 15.49, ssim: 57.30, hsd: 15.81, dynamics: 6.91, ndtw: 19.55 },
    { name: "DreamDojo", ewm: 44.99, scene: 76.57, psnr: 14.51, ssim: 54.97, hsd: 12.84, dynamics: 8.40, ndtw: 16.93 }
  ];

  // Flat-top hexagon matching Teaser with 100% mirror-symmetric stacked label + value pairs:
  // Left half (Action Consistency): Top-Left (240°), Left (180°), Bottom-Left (120°)
  // Right half (Visual Quality): Top-Right (300°), Right (0°), Bottom-Right (60°)
  const RADAR_AXES = [
    { key: "psnr",     lines: ["PSNR"],                   deg: 0,   min: 13.8, max: 23.0, x: 118,  ly: -4,   vy: 13,   anchor: "start" },
    { key: "ssim",     lines: ["SSIM"],                   deg: 60,  min: 50.0, max: 79.5, x: 74,   ly: 128,  vy: 111,  anchor: "middle" },
    { key: "hsd",      lines: ["Trajectory", "HSD"],      deg: 120, min: 22.0, max: 36.0, x: -74,  ly: 128,  vy: 111,  anchor: "middle" },
    { key: "dynamics", lines: ["Trajectory", "Dynamics"], deg: 180, min: 9.0,  max: 18.4, x: -118, ly: -11,  vy: 20,   anchor: "end" },
    { key: "ndtw",     lines: ["Trajectory", "nDTW"],     deg: 240, min: 20.0, max: 49.5, x: -74,  ly: -127, vy: -95,  anchor: "middle" },
    { key: "scene",    lines: ["Scene", "Consistency"],   deg: 300, min: 76.0, max: 89.5, x: 74,   ly: -127, vy: -95,  anchor: "middle" }
  ];

  const richBlock = document.querySelector('[data-chart-block="richinteraction"]');
  const richBarsContainer = document.getElementById("rich-bars-container");
  const radarSvg = document.getElementById("rich-radar-svg");

  const RADAR_CX = 210;
  const RADAR_CY = 186;
  const RADAR_R = 102;
  let radarOursPoly = null;
  let radarBasePoly = null;
  let radarOursDots = [];
  let radarBaseDots = [];

  function radarPoint(deg, ratio) {
    const rad = (deg * Math.PI) / 180;
    return {
      x: RADAR_CX + Math.cos(rad) * RADAR_R * ratio,
      y: RADAR_CY + Math.sin(rad) * RADAR_R * ratio
    };
  }

  function normAxis(ax, val) {
    return Math.max(0.15, Math.min(0.96, (val - ax.min) / (ax.max - ax.min)));
  }

  function initRadar() {
    if (!radarSvg) return;
    radarSvg.innerHTML = "";
    const defs = svgEl("defs", {}, radarSvg);

    const gradOurs = svgEl("linearGradient", { id: "radar-ours-fill", x1: "0%", y1: "0%", x2: "100%", y2: "100%" }, defs);
    svgEl("stop", { offset: "0%", "stop-color": "#f38b52", "stop-opacity": "0.34" }, gradOurs);
    svgEl("stop", { offset: "100%", "stop-color": "#e26a38", "stop-opacity": "0.22" }, gradOurs);

    const gradBase = svgEl("linearGradient", { id: "radar-base-fill", x1: "0%", y1: "0%", x2: "100%", y2: "100%" }, defs);
    svgEl("stop", { offset: "0%", "stop-color": "#94b8d3", "stop-opacity": "0.42" }, gradBase);
    svgEl("stop", { offset: "100%", "stop-color": "#7ca4c4", "stop-opacity": "0.28" }, gradBase);

    // Uniform transparent background inside & outside the outer circle (zero color mismatch!)
    svgEl("circle", {
      cx: RADAR_CX, cy: RADAR_CY, r: RADAR_R,
      fill: "none", stroke: "#cbd7e1", "stroke-width": "1.2"
    }, radarSvg);

    [0.33, 0.66].forEach((r) => {
      svgEl("circle", {
        cx: RADAR_CX, cy: RADAR_CY, r: (RADAR_R * r).toFixed(1),
        fill: "none", stroke: "#e4ecf2", "stroke-width": "1", "stroke-dasharray": "3 3"
      }, radarSvg);
    });

    // Vertical dashed midline separating Action Consistency (Left) | Visual Quality (Right)
    svgEl("line", {
      x1: RADAR_CX, y1: 30, x2: RADAR_CX, y2: 342,
      stroke: "#c3d2dd", "stroke-width": "1.15", "stroke-dasharray": "4 4"
    }, radarSvg);

    // Group Headers aligned at top with Overall EWMScore on the left!
    const leftTitle = svgEl("text", {
      x: RADAR_CX - 94, y: 17, "text-anchor": "middle",
      fill: "#1b2c38", "font-family": SERIF, "font-size": "14.5", "font-weight": "700", "font-style": "italic"
    }, radarSvg);
    leftTitle.textContent = "Action Consistency";

    const rightTitle = svgEl("text", {
      x: RADAR_CX + 94, y: 17, "text-anchor": "middle",
      fill: "#1b2c38", "font-family": SERIF, "font-size": "14.5", "font-weight": "700", "font-style": "italic"
    }, radarSvg);
    rightTitle.textContent = "Visual Quality";

    // Radial spokes
    RADAR_AXES.forEach((ax) => {
      const outer = radarPoint(ax.deg, 1.0);
      svgEl("line", {
        x1: RADAR_CX, y1: RADAR_CY, x2: outer.x.toFixed(1), y2: outer.y.toFixed(1),
        stroke: "#dce6ee", "stroke-width": "1", "stroke-dasharray": "3 3"
      }, radarSvg);
    });

    // Polygons (Dual-Sim outer coral + GE-Sim 2.0* inner slate-blue)
    radarOursPoly = svgEl("polygon", {
      points: RADAR_AXES.map(() => `${RADAR_CX},${RADAR_CY}`).join(" "),
      fill: "url(#radar-ours-fill)", stroke: "#e26a38", "stroke-width": "2.4", "stroke-linejoin": "round"
    }, radarSvg);

    radarBasePoly = svgEl("polygon", {
      points: RADAR_AXES.map(() => `${RADAR_CX},${RADAR_CY}`).join(" "),
      fill: "url(#radar-base-fill)", stroke: "#6995b8", "stroke-width": "1.9", "stroke-linejoin": "round"
    }, radarSvg);

    // Crisp white-filled vertex rings
    radarOursDots = RADAR_AXES.map(() =>
      svgEl("circle", { cx: RADAR_CX, cy: RADAR_CY, r: "4.0", fill: "#ffffff", stroke: "#e26a38", "stroke-width": "2.0" }, radarSvg)
    );
    radarBaseDots = RADAR_AXES.map(() =>
      svgEl("circle", { cx: RADAR_CX, cy: RADAR_CY, r: "3.4", fill: "#ffffff", stroke: "#6995b8", "stroke-width": "1.7" }, radarSvg)
    );

    // Perfectly aligned stacked axis labels & bold coral values (same x & anchor per vertex!)
    const ours = RICH_METHODS[0];
    RADAR_AXES.forEach((ax) => {
      ax.lines.forEach((lineTxt, li) => {
        const t = svgEl("text", {
          x: (RADAR_CX + ax.x).toFixed(1),
          y: (RADAR_CY + ax.ly + li * 14).toFixed(1),
          "text-anchor": ax.anchor,
          fill: "#1a2a36",
          "font-family": SANS,
          "font-size": "12",
          "font-weight": "700"
        }, radarSvg);
        t.textContent = lineTxt;
      });

      const vLbl = svgEl("text", {
        x: (RADAR_CX + ax.x).toFixed(1),
        y: (RADAR_CY + ax.vy).toFixed(1),
        "text-anchor": ax.anchor,
        fill: "#d34f1d",
        "font-family": SANS,
        "font-size": "12",
        "font-weight": "700"
      }, radarSvg);
      vLbl.textContent = ours[ax.key].toFixed(2);
    });
  }

  function animateRadar() {
    if (!radarOursPoly || !radarBasePoly) return;
    const ours = RICH_METHODS[0];
    const base = RICH_METHODS[1];
    const targetOurs = RADAR_AXES.map((ax) => normAxis(ax, ours[ax.key]));
    const targetBase = RADAR_AXES.map((ax) => normAxis(ax, base[ax.key]));

    function paint(p) {
      const oPts = [];
      const bPts = [];
      RADAR_AXES.forEach((ax, i) => {
        const op = radarPoint(ax.deg, targetOurs[i] * p);
        const bp = radarPoint(ax.deg, targetBase[i] * p);
        oPts.push(`${op.x.toFixed(1)},${op.y.toFixed(1)}`);
        bPts.push(`${bp.x.toFixed(1)},${bp.y.toFixed(1)}`);
        radarOursDots[i].setAttribute("cx", op.x.toFixed(1));
        radarOursDots[i].setAttribute("cy", op.y.toFixed(1));
        radarBaseDots[i].setAttribute("cx", bp.x.toFixed(1));
        radarBaseDots[i].setAttribute("cy", bp.y.toFixed(1));
      });
      radarOursPoly.setAttribute("points", oPts.join(" "));
      radarBasePoly.setAttribute("points", bPts.join(" "));
    }

    if (prefersReducedMotion) return paint(1);
    const start = performance.now();
    const dur = 860;
    function tick(now) {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      paint(eased);
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function renderRichSection(triggerAnim) {
    if (!richBarsContainer) return;
    richBarsContainer.innerHTML = "";
    RICH_METHODS.forEach((m, idx) => {
      const row = document.createElement("div");
      row.className = "bar-row-single" + (m.isOurs ? " is-ours" : m.isMatched ? " is-matched" : "");

      const nameEl = document.createElement("span");
      nameEl.className = "bar-name";
      nameEl.textContent = m.name;

      const track = document.createElement("div");
      track.className = "bar-track";
      const fill = document.createElement("div");
      fill.className = "bar-fill";
      track.appendChild(fill);

      const valEl = document.createElement("span");
      valEl.className = "bar-val";
      valEl.textContent = triggerAnim && !prefersReducedMotion ? "0.00" : m.ewm.toFixed(2);

      row.append(nameEl, track, valEl);
      richBarsContainer.appendChild(row);

      if (triggerAnim) {
        requestAnimationFrame(() => {
          setTimeout(() => {
            fill.style.width = `${Math.min(100, (m.ewm / 70) * 100).toFixed(1)}%`;
            animateValue(valEl, m.ewm, 2, "");
          }, idx * 65);
        });
      }
    });
  }

  initRadar();
  renderRichSection(false);
  observeOnce(richBlock, () => {
    renderRichSection(true);
    animateRadar();
  });

  /* ============================================================
     2. SECTION 4.2: CROSS-EMBODIMENT GROUPED BARS (ROBOTWIN)
     ============================================================ */
  const EMB_DATA = [
    { name: "ARX-X5", unseen: false, baseSsim: 36.75, oursSsim: 60.91, baseTraj: 12.09, oursTraj: 27.83 },
    { name: "Aloha-AgileX", unseen: false, baseSsim: 44.46, oursSsim: 64.40, baseTraj: 17.86, oursTraj: 33.19 },
    { name: "UR5-WSG", unseen: false, baseSsim: 63.09, oursSsim: 72.89, baseTraj: 26.16, oursTraj: 44.65 },
    { name: "Franka-Panda", unseen: true, baseSsim: 39.04, oursSsim: 60.23, baseTraj: 14.59, oursTraj: 32.52 }
  ];

  const embBlock = document.querySelector('[data-chart-block="cross-embodiment"]');
  const embContainer = document.getElementById("emb-chart-container");

  function renderEmbChart(triggerAnim) {
    if (!embContainer) return;
    embContainer.innerHTML = "";
    const maxScale = 82;

    EMB_DATA.forEach((item, gIdx) => {
      const card = document.createElement("div");
      card.className = "emb-group-card" + (item.unseen ? " is-unseen" : "");

      if (item.unseen) {
        const pill = document.createElement("span");
        pill.className = "emb-unseen-pill";
        pill.textContent = "Unseen";
        card.appendChild(pill);
      }

      const title = document.createElement("div");
      title.className = "emb-group-title";
      title.textContent = item.name;
      card.appendChild(title);

      const barsArea = document.createElement("div");
      barsArea.className = "emb-bars-area";

      const pairs = [
        { label: "Emb. SSIM", base: item.baseSsim, ours: item.oursSsim },
        { label: "Traj. Acc.", base: item.baseTraj, ours: item.oursTraj }
      ];

      pairs.forEach((pair, pIdx) => {
        const pairWrap = document.createElement("div");
        pairWrap.className = "emb-metric-pair";
        const cols = document.createElement("div");
        cols.className = "emb-pair-cols";

        [
          { val: pair.base, isOurs: false },
          { val: pair.ours, isOurs: true }
        ].forEach((entry, cIdx) => {
          const col = document.createElement("div");
          col.className = "emb-col" + (entry.isOurs ? " is-ours" : "");

          const vEl = document.createElement("span");
          vEl.className = "emb-col-val";
          vEl.textContent = triggerAnim && !prefersReducedMotion ? "0.0" : entry.val.toFixed(2);

          const bar = document.createElement("div");
          bar.className = "emb-col-bar";

          col.append(vEl, bar);
          cols.appendChild(col);

          const hPct = Math.min(100, (entry.val / maxScale) * 100);
          if (triggerAnim) {
            requestAnimationFrame(() => {
              setTimeout(() => {
                bar.style.height = `${hPct.toFixed(1)}%`;
                animateValue(vEl, entry.val, 2, "");
              }, gIdx * 85 + pIdx * 55 + cIdx * 35);
            });
          }
        });

        const lbl = document.createElement("span");
        lbl.className = "emb-pair-label";
        lbl.textContent = pair.label;

        pairWrap.append(cols, lbl);
        barsArea.appendChild(pairWrap);
      });

      card.appendChild(barsArea);

      const gainRow = document.createElement("div");
      gainRow.className = "emb-gain-row";
      const c1 = document.createElement("span");
      c1.className = "gain-chip";
      c1.textContent = `+${(item.oursSsim - item.baseSsim).toFixed(1)} SSIM`;
      const c2 = document.createElement("span");
      c2.className = "gain-chip";
      c2.textContent = `${(item.oursTraj / item.baseTraj).toFixed(1)}\u00d7 Traj.`;
      gainRow.append(c1, c2);
      card.appendChild(gainRow);

      embContainer.appendChild(card);
    });
  }

  renderEmbChart(false);
  observeOnce(embBlock, () => renderEmbChart(true));

  /* ============================================================
     3. SECTION 4.1 ABLATION: KINEMATIC SEEDING (3-COLUMN)
     ============================================================ */
  const ABLATION_DATA = [
    {
      metric: "PSNR (dB) \u2191",
      delta: "+1.61 dB",
      max: 24,
      rows: [
        { name: "Input Conditioning", val: 19.90 },
        { name: "Feature Conditioning", val: 19.95 },
        { name: "Dual-Sim", val: 21.56, isOurs: true }
      ]
    },
    {
      metric: "SSIM \u2191",
      delta: "+4.40",
      max: 84,
      rows: [
        { name: "Input Conditioning", val: 70.50 },
        { name: "Feature Conditioning", val: 68.94 },
        { name: "Dual-Sim", val: 74.90, isOurs: true }
      ]
    },
    {
      metric: "Trajectory nDTW \u2191",
      delta: "+4.86",
      max: 50,
      rows: [
        { name: "Input Conditioning", val: 40.13 },
        { name: "Feature Conditioning", val: 38.40 },
        { name: "Dual-Sim", val: 44.99, isOurs: true }
      ]
    }
  ];

  const ablationBlock = document.querySelector('[data-chart-block="ablation"]');
  const ablationContainer = document.getElementById("ablation-chart-container");

  function renderAblation(triggerAnim) {
    if (!ablationContainer) return;
    ablationContainer.innerHTML = "";

    ABLATION_DATA.forEach((blk, bIdx) => {
      const card = document.createElement("div");
      card.className = "ablation-metric-block";

      const head = document.createElement("div");
      head.className = "ablation-metric-head";
      const title = document.createElement("span");
      title.textContent = blk.metric;
      const delta = document.createElement("span");
      delta.className = "ablation-delta";
      delta.textContent = blk.delta;
      head.append(title, delta);

      const rowsWrap = document.createElement("div");
      rowsWrap.className = "ablation-rows";

      blk.rows.forEach((r, rIdx) => {
        const row = document.createElement("div");
        row.className = "ablation-row" + (r.isOurs ? " is-ours" : "");

        const lbl = document.createElement("span");
        lbl.className = "ablation-row-label";
        lbl.textContent = r.name;

        const track = document.createElement("div");
        track.className = "ablation-track";
        const fill = document.createElement("div");
        fill.className = "ablation-fill";
        track.appendChild(fill);

        const val = document.createElement("span");
        val.className = "ablation-val";
        val.textContent = triggerAnim && !prefersReducedMotion ? "0.00" : r.val.toFixed(2);

        row.append(lbl, track, val);
        rowsWrap.appendChild(row);

        const pct = Math.min(100, (r.val / blk.max) * 100);
        if (triggerAnim) {
          requestAnimationFrame(() => {
            setTimeout(() => {
              fill.style.width = `${pct.toFixed(1)}%`;
              animateValue(val, r.val, 2, "");
            }, bIdx * 100 + rIdx * 55);
          });
        }
      });

      card.append(head, rowsWrap);
      ablationContainer.appendChild(card);
    });
  }

  renderAblation(false);
  observeOnce(ablationBlock, () => renderAblation(true));
})();
