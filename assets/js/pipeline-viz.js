"use strict";

(function () {
  const canvas = document.getElementById("pipeline-canvas");
  if (!canvas || !window.DualSimFig) return;

  const F = window.DualSimFig;
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const W = 1200;
  const H = 610;
  const ctx = F.setupHiDPI(canvas, W, H);

  // Load real AgiBot G2 3D renders + all 3 views of real PPTX elements (including all 3 masks & offline fine-grain noise)
  const IMGS = F.loadImages({
    g2_0: "assets/figures/agibot_frames/g2_frame_0.png",
    g2_1: "assets/figures/agibot_frames/g2_frame_1.png",
    g2_2: "assets/figures/agibot_frames/g2_frame_2.png",
    g2_3: "assets/figures/agibot_frames/g2_frame_3.png",
    g2_4: "assets/figures/agibot_frames/g2_frame_4.png",
    head_sim: "assets/figures/elements/head_sim.jpg",
    head_src: "assets/figures/elements/head_source.jpg",
    head_real: "assets/figures/elements/head_real.jpg",
    head_mask: "assets/figures/elements/head_mask.png",
    wl_sim: "assets/figures/elements/wrist_l_sim.jpg",
    wl_src: "assets/figures/elements/wrist_l_source.jpg",
    wl_real: "assets/figures/elements/wrist_l_real.jpg",
    wl_mask: "assets/figures/elements/wrist_l_mask.png",
    wr_sim: "assets/figures/elements/wrist_r_sim.jpg",
    wr_src: "assets/figures/elements/wrist_r_source.jpg",
    wr_real: "assets/figures/elements/wrist_r_real.jpg",
    wr_mask: "assets/figures/elements/wrist_r_mask.png",
    noise: "assets/figures/elements/noise_patch.jpg"
  });

  // Helper: Tapered block arrow (horizontal or vertical)
  function drawBlockArrow(x1, y1, x2, y2, shaftW, headW, headL, fillStyle, alpha) {
    if (alpha <= 0.005) return;
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    if (len < 1) return;
    const ang = Math.atan2(dy, dx);
    const bodyL = Math.max(0, len - headL);

    ctx.save();
    ctx.globalAlpha *= F.clamp01(alpha);
    ctx.translate(x1, y1);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(0, -shaftW * 0.5);
    ctx.lineTo(bodyL, -shaftW * 0.5);
    ctx.lineTo(bodyL, -headW * 0.5);
    ctx.lineTo(len, 0);
    ctx.lineTo(bodyL, headW * 0.5);
    ctx.lineTo(bodyL, shaftW * 0.5);
    ctx.lineTo(0, shaftW * 0.5);
    ctx.closePath();
    ctx.fillStyle = fillStyle;
    ctx.fill();
    ctx.restore();
  }

  // Helper: Clean camera & joint micro-icons
  function drawCamIcon(x, y) {
    ctx.save();
    ctx.strokeStyle = "#2e6f95";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(x, y, 16, 12, 2.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + 8, y + 6, 2.7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  function drawJointIcon(x, y) {
    ctx.save();
    ctx.strokeStyle = "#148272";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x + 3, y + 10, 2.7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + 11, y + 3, 2.7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + 5, y + 8);
    ctx.lineTo(x + 9, y + 5);
    ctx.stroke();
    ctx.restore();
  }

  /* ============================================================
     PLAY-ONCE CHOREOGRAPHY (Ends cleanly at 8.8s and holds permanently):
       0.00 -> 2.35s : 5 AgiBot G2 frames left-to-right -> spotlight pop-out t
       2.35 -> 3.80s : Rendering -> 3-view Sim Video V~ & State q~ + 3-view robot mask M
       3.80 -> 5.40s : Kinematic Seeding -> Hybrid Video Source z_src & wavelet State Source q_src
       5.40 -> 6.25s : Clean cohesive Video-State MoT reveal
       6.25 -> 8.35s : Brisk, clear denoising & editing of top-right Video & State output
       8.35 -> 8.80s : Settles permanently on crisp finished state (NO loop!)
     ============================================================ */
  const FINAL_T = 8.8;

  function renderAt(t) {
    ctx.clearRect(0, 0, W, H);
    ctx.save();

    /* ============================================================
       PHASE 1 (0.0 -> 2.35s): AGIBOT G2 5-FRAME SEQUENCE -> POP-OUT t
       ============================================================ */
    const pTitle = F.easeOutCubic(F.phase(t, 0.0, 0.4));
    ctx.save();
    ctx.globalAlpha *= pTitle;
    ctx.fillStyle = "#142029";
    ctx.font = "750 18px Inter, system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("Physics Simulator: kinematic simulation", 16, 28);
    ctx.restore();

    const pPop = F.easeInOutCubic(F.phase(t, 1.32, 2.32));

    const rowXs = [62, 152, 242, 332, 422];
    const finalPos = [
      { cx: 66,  cy: 130, size: 86,  hero: 0, label: "t-1" },
      { cx: 156, cy: 206, size: 150, hero: 1, label: "t" },
      { cx: 256, cy: 130, size: 86,  hero: 0, label: "t+1" },
      { cx: 342, cy: 130, size: 86,  hero: 0, label: "t+2" },
      { cx: 428, cy: 130, size: 86,  hero: 0, label: "t+3" }
    ];
    const robotImgs = [IMGS.g2_0, IMGS.g2_1, IMGS.g2_2, IMGS.g2_3, IMGS.g2_4];

    // Draw background frames (0, 2, 3, 4) first, then spotlight hero frame (1) on top
    [0, 2, 3, 4, 1].forEach((idx) => {
      const enterP = F.easeOutCubic(F.phase(t, 0.10 + idx * 0.16, 0.48 + idx * 0.16));
      if (enterP <= 0.005) return;

      const f = finalPos[idx];
      const cx = F.lerp(rowXs[idx], f.cx, pPop);
      const cy = F.lerp(132 + (1 - enterP) * 10, f.cy, pPop);
      const size = F.lerp(86, f.size, pPop);
      const heroAmt = idx === 1 ? pPop : 0;
      const op = idx === 1 ? enterP : enterP * F.lerp(0.95, 0.78, pPop);

      F.drawSimRobotCube(ctx, {
        cx, cy, size,
        robotImg: robotImgs[idx],
        label: f.label,
        isHero: heroAmt,
        opacity: op
      });
    });

    /* ============================================================
       PHASE 2 (2.35 -> 3.80s): RENDERING (V~, q~) & ALL 3 ROBOT MASKS (M)
       ============================================================ */
    const pRender = F.easeOutCubic(F.phase(t, 2.35, 2.95));
    if (pRender > 0.005) {
      ctx.save();
      ctx.globalAlpha *= pRender;
      ctx.strokeStyle = "#8ba2b0";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(80, 282);
      ctx.bezierCurveTo(72, 326, 40, 352, 22, 376);
      ctx.moveTo(232, 282);
      ctx.bezierCurveTo(252, 326, 336, 352, 412, 376);
      ctx.stroke();

      const arrGrad = ctx.createLinearGradient(0, 294, 0, 358);
      arrGrad.addColorStop(0, "#d4dfe7");
      arrGrad.addColorStop(1, "#95adbd");
      drawBlockArrow(156, 294, 156, 360, 14, 28, 16, arrGrad, 1);

      ctx.fillStyle = "#223948";
      ctx.font = "italic 700 13.5px Inter, system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText("Rendering", 174, 332);
      ctx.restore();
    }

    // Bottom-Left Dashed Card: Multi-View Video V~ & Proprioception State q~
    const pSimCard = F.easeOutCubic(F.phase(t, 2.60, 3.15));
    if (pSimCard > 0.005) {
      ctx.save();
      ctx.globalAlpha *= pSimCard;
      ctx.translate(0, (1 - pSimCard) * 10);

      ctx.fillStyle = "#f8fbfd";
      ctx.strokeStyle = "#8ea6b5";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4.5]);
      ctx.beginPath();
      ctx.roundRect(16, 376, 404, 208, 15);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);

      drawCamIcon(30, 390);
      F.drawMathText(ctx, [
        { text: "Multi-View Video " },
        { text: "V\u0303", italic: true, weight: 700 }
      ], 52, 401, { align: "left", baseSize: 13.2 });

      const simViews = [
        { img: IMGS.head_sim, x: 28,  y: 414, w: 98,  h: 62, lbl: "Head",    t0: 2.72 },
        { img: IMGS.wl_sim,   x: 68,  y: 448, w: 90,  h: 72, lbl: "Wrist L", t0: 2.84 },
        { img: IMGS.wr_sim,   x: 112, y: 482, w: 90,  h: 72, lbl: "Wrist R", t0: 2.96 }
      ];
      simViews.forEach((sv) => {
        const vp = F.easeOutCubic(F.phase(t, sv.t0, sv.t0 + 0.34));
        if (vp <= 0.005) return;
        ctx.save();
        ctx.globalAlpha *= vp;
        F.drawVideoFrame(ctx, {
          x: sv.x, y: sv.y + (1 - vp) * 8, w: sv.w, h: sv.h, radius: 6,
          simImg: sv.img, mode: "sim",
          borderColor: "#ffffff", borderWidth: 2, shadowBlur: 10, shadowY: 3, shadowAlpha: 0.16
        });
        ctx.fillStyle = "#4c6270";
        ctx.font = "italic 600 10px Inter, system-ui, sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(sv.lbl, sv.x + 2, sv.y + sv.h + 12);
        ctx.restore();
      });

      drawJointIcon(222, 390);
      F.drawMathText(ctx, [
        { text: "Proprioception State " },
        { text: "q\u0303", italic: true, weight: 700 }
      ], 242, 401, { align: "left", baseSize: 13.0 });

      const pSimCurveDraw = F.easeOutCubic(F.phase(t, 2.85, 3.72));
      if (pSimCurveDraw > 0.005) {
        F.drawStateTriplet(ctx, {
          x: 230, y: 432, w: 174, h: 120,
          noiseLevel: 0, editProgress: 0, drawFrac: pSimCurveDraw,
          lineWidth: 2.0, ribbonHalf: 5.0
        });
      }
      ctx.restore();
    }

    // All 3 Robot Masks (Head, Wrist L, Wrist R) — Right of Spotlight Cube t
    const pMask = F.easeOutCubic(F.phase(t, 2.75, 3.40));
    if (pMask > 0.005) {
      ctx.save();
      ctx.globalAlpha *= pMask;
      const gRight = ctx.createLinearGradient(250, 0, 316, 0);
      gRight.addColorStop(0, "#d4dfe7");
      gRight.addColorStop(1, "#95adbd");
      drawBlockArrow(250, 246, 314, 246, 13, 25, 15, gRight, 1);

      const mx = 326 - (1 - pMask) * 10;
      const drawMaskCard = (img, x, y, w, h) => {
        ctx.save();
        ctx.shadowColor = "rgba(18, 32, 44, 0.14)";
        ctx.shadowBlur = 9;
        ctx.shadowOffsetY = 2.5;
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, 5.5);
        ctx.fill();
        ctx.restore();
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, 5.5);
        ctx.clip();
        if (img && img.complete && img.naturalWidth > 0) ctx.drawImage(img, x, y, w, h);
        ctx.restore();
        ctx.strokeStyle = "#cbd6de";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, 5.5);
        ctx.stroke();
      };
      // Clean 3-view binary mask fan (Head, Wrist L, Wrist R)
      drawMaskCard(IMGS.head_mask, mx,      198, 76, 48);
      drawMaskCard(IMGS.wl_mask,   mx + 30, 220, 68, 55);
      drawMaskCard(IMGS.wr_mask,   mx + 64, 240, 68, 55);

      F.drawMathText(ctx, [
        { text: "robot mask " },
        { text: "M", italic: true, weight: 700 }
      ], mx + 66, 314, { align: "center", baseSize: 13.0 });
      ctx.restore();
    }

    /* ============================================================
       PHASE 3 (3.80 -> 5.45s): KINEMATIC SEEDING (Perturb -> Sources)
       ============================================================ */
    const pSeed = F.easeOutCubic(F.phase(t, 3.80, 4.40));
    if (pSeed > 0.005) {
      ctx.save();
      ctx.globalAlpha *= pSeed;

      // Curved sweep arrow directly out of the 3-mask stack down into Hybrid Video Source
      ctx.strokeStyle = "#b5c6d2";
      ctx.lineWidth = 8.5;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(466, 266);
      ctx.lineTo(484, 266);
      ctx.quadraticCurveTo(498, 266, 498, 284);
      ctx.lineTo(498, 412);
      ctx.quadraticCurveTo(498, 434, 518, 434);
      ctx.lineTo(526, 434);
      ctx.stroke();
      F.drawArrowHead(ctx, 540, 434, 0, 13, "#9fb4c4");

      // Offline high-resolution fine-grained RGB Gaussian noise patch (matching Hybrid Video Source grain!)
      F.drawMathText(ctx, [
        { text: "noise ", color: "#344a58" },
        { text: "\u03b5", italic: true, color: "#344a58" }
      ], 452, 392, { align: "center", baseSize: 12.2 });

      ctx.save();
      ctx.shadowColor = "rgba(18, 32, 44, 0.14)";
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 2;
      ctx.beginPath();
      ctx.roundRect(429, 400, 46, 46, 7);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.beginPath();
      ctx.roundRect(429, 400, 46, 46, 7);
      ctx.clip();
      if (IMGS.noise && IMGS.noise.complete && IMGS.noise.naturalWidth > 0) {
        ctx.drawImage(IMGS.noise, 429, 400, 46, 46);
      }
      ctx.restore();

      ctx.strokeStyle = "#bccad4";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.roundRect(429, 400, 46, 46, 7);
      ctx.stroke();

      // Horizontal coral-accented Kinematic Seeding arrow
      const seedGrad = ctx.createLinearGradient(426, 0, 538, 0);
      seedGrad.addColorStop(0, "#c8dae6");
      seedGrad.addColorStop(0.55, "#b6cad7");
      seedGrad.addColorStop(1, "#e5885c");
      drawBlockArrow(426, 482, 538, 482, 13, 26, 16, seedGrad, 1);

      ctx.fillStyle = "#c05022";
      ctx.font = "italic 750 13.5px Inter, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Kinematic", 478, 514);
      ctx.fillText("Seeding", 478, 531);
      ctx.restore();
    }

    // Bottom-Right Dashed Card: Hybrid Video Source & State Source
    const pHybridBox = F.easeOutCubic(F.phase(t, 4.15, 4.65));
    const pPerturb = F.easeInOutCubic(F.phase(t, 4.40, 5.38));
    if (pHybridBox > 0.005) {
      ctx.save();
      ctx.globalAlpha *= pHybridBox;
      ctx.translate(0, (1 - pHybridBox) * 8);

      ctx.fillStyle = "#f7fafc";
      ctx.strokeStyle = "#8ea6b5";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4.5]);
      ctx.beginPath();
      ctx.roundRect(544, 424, 640, 160, 15);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);

      const hvList = [
        { sim: IMGS.head_sim, src: IMGS.head_src, x: 558, y: 454, w: 108, h: 72 },
        { sim: IMGS.wl_sim,   src: IMGS.wl_src,   x: 676, y: 440, w: 102, h: 86 },
        { sim: IMGS.wr_sim,   src: IMGS.wr_src,   x: 788, y: 440, w: 102, h: 86 }
      ];
      hvList.forEach((hv) => {
        F.drawVideoFrame(ctx, {
          x: hv.x, y: hv.y, w: hv.w, h: hv.h, radius: 7,
          simImg: hv.sim, sourceImg: hv.src,
          mode: "perturb", t: pPerturb,
          borderColor: "rgba(20, 32, 41, 0.14)", borderWidth: 1,
          shadowBlur: 8, shadowY: 2, shadowAlpha: 0.12
        });
      });

      F.drawMathText(ctx, [
        { text: "Hybrid Video Source  " },
        { text: "z", italic: true, weight: 700 },
        { text: "src", sub: true, color: "#3b5261" }
      ], 724, 560, { align: "center", baseSize: 13.5 });

      // State Source: matched aspect ratio (184x118) with Smooth Harmonic Wavelets ("丝滑小波浪")!
      F.drawStateTriplet(ctx, {
        x: 951, y: 430, w: 184, h: 118,
        noiseLevel: pPerturb, editProgress: 0, drawFrac: 1,
        noiseAmpPx: 3.4, lineWidth: 2.0, ribbonHalf: 5.0
      });

      F.drawMathText(ctx, [
        { text: "State Source  " },
        { text: "q", italic: true, weight: 700 },
        { text: "src", sub: true, color: "#3b5261" }
      ], 1043, 560, { align: "center", baseSize: 13.5 });
      ctx.restore();
    }

    /* ============================================================
       PHASE 4 (5.45 -> 6.55s): CALM COHESIVE VIDEO-STATE MoT REVEAL
       (Clean architecture — NO repetitive bouncing token effects!)
       ============================================================ */
    const pMotShell = F.easeOutCubic(F.phase(t, 5.45, 6.05));
    const pMotInner = F.easeOutCubic(F.phase(t, 5.75, 6.42));

    if (pMotShell > 0.005) {
      ctx.save();
      ctx.globalAlpha *= pMotShell;

      // Feed arrows from Hybrid Sources -> MoT Experts
      const vFeedG = ctx.createLinearGradient(0, 424, 0, 386);
      vFeedG.addColorStop(0, "#cfe6f7"); vFeedG.addColorStop(1, "#7ab9e0");
      drawBlockArrow(724, 424, 724, 382, 22, 42, 17, vFeedG, 1);

      const sFeedG = ctx.createLinearGradient(0, 424, 0, 386);
      sFeedG.addColorStop(0, "#cdecd9"); sFeedG.addColorStop(1, "#6bc499");
      drawBlockArrow(1043, 424, 1043, 382, 22, 42, 17, sFeedG, 1);

      // Output arrows rising cleanly from MoT Experts -> Top-Right Outputs
      const pOutArr = F.easeOutCubic(F.phase(t, 6.00, 6.55));
      drawBlockArrow(724, 152, 724, 114, 22, 42, 17, vFeedG, pOutArr);
      drawBlockArrow(1043, 152, 1043, 114, 22, 42, 17, sFeedG, pOutArr);

      // Outer MoT Glass Shell (with ×L stacked depth layer)
      ctx.save();
      ctx.fillStyle = "rgba(218, 236, 248, 0.52)";
      ctx.beginPath();
      ctx.roundRect(554, 156, 636, 240, 18);
      ctx.fill();

      ctx.shadowColor = "rgba(24, 51, 71, 0.08)";
      ctx.shadowBlur = 18;
      ctx.shadowOffsetY = 5;
      const shellG = ctx.createLinearGradient(544, 148, 1184, 392);
      shellG.addColorStop(0, "#e9f3fb");
      shellG.addColorStop(0.52, "#edf5f8");
      shellG.addColorStop(1, "#e7f5ee");
      ctx.fillStyle = shellG;
      ctx.beginPath();
      ctx.roundRect(544, 148, 638, 242, 18);
      ctx.fill();
      ctx.restore();

      ctx.strokeStyle = "#bcd6e7";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.roundRect(544, 148, 638, 242, 18);
      ctx.stroke();

      // Video Expert Sub-Container (Left)
      const vLaneG = ctx.createLinearGradient(0, 160, 0, 380);
      vLaneG.addColorStop(0, "#d9ecfb");
      vLaneG.addColorStop(1, "#ebf5fd");
      ctx.fillStyle = vLaneG;
      ctx.strokeStyle = "#b5d6ee";
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.roundRect(560, 160, 318, 218, 14);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#164666";
      ctx.font = 'italic 700 16px Georgia, "Times New Roman", serif';
      ctx.textAlign = "center";
      ctx.fillText("Video Expert Block", 719, 184);

      // State Expert Sub-Container (Right)
      const sLaneG = ctx.createLinearGradient(0, 160, 0, 380);
      sLaneG.addColorStop(0, "#d4f0e2");
      sLaneG.addColorStop(1, "#eaf8f1");
      ctx.fillStyle = sLaneG;
      ctx.strokeStyle = "#a9dac3";
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.roundRect(926, 160, 238, 218, 14);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#135741";
      ctx.font = 'italic 700 16px Georgia, "Times New Roman", serif';
      ctx.textAlign = "center";
      ctx.fillText("State Expert Block", 1045, 184);

      // ×L badge
      ctx.fillStyle = "#1a303f";
      ctx.font = 'italic 700 16.5px Georgia, "Times New Roman", serif';
      ctx.textAlign = "right";
      ctx.fillText("\u00d7L", 1174, 383);

      // Inner Transformer Layers (calm, crisp, authoritative)
      if (pMotInner > 0.005) {
        ctx.save();
        ctx.globalAlpha *= pMotInner;

        const drawSubBlock = (x, y, w, h, label, strokeCol, textCol) => {
          ctx.save();
          ctx.shadowColor = "rgba(20, 40, 56, 0.07)";
          ctx.shadowBlur = 4;
          ctx.shadowOffsetY = 1.5;
          ctx.fillStyle = "#ffffff";
          ctx.beginPath();
          ctx.roundRect(x, y, w, h, 6);
          ctx.fill();
          ctx.restore();

          ctx.strokeStyle = strokeCol;
          ctx.lineWidth = 1.3;
          ctx.beginPath();
          ctx.roundRect(x, y, w, h, 6);
          ctx.stroke();

          ctx.fillStyle = textCol;
          ctx.font = "700 13px Inter, system-ui, sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(label, x + w * 0.5, y + h * 0.65);
        };

        drawSubBlock(578, 340, 282, 26, "Self-Attention",  "#5ca3ce", "#164666");
        drawSubBlock(578, 268, 282, 26, "Cross-Attention", "#2e6f95", "#164666");
        drawSubBlock(578, 198, 282, 26, "FFN",             "#5ca3ce", "#164666");

        drawSubBlock(944, 340, 202, 26, "Self-Attention",  "#4fb385", "#135741");
        drawSubBlock(944, 268, 202, 26, "Cross-Attention", "#1f8a70", "#135741");
        drawSubBlock(944, 198, 202, 26, "FFN",             "#4fb385", "#135741");

        const drawMiniUp = (x, y1, y2, lbl, col) => {
          ctx.strokeStyle = "#2b4150";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(x, y1);
          ctx.lineTo(x, y2);
          ctx.stroke();
          F.drawArrowHead(ctx, x, y2, -Math.PI / 2, 6, "#2b4150");
          if (lbl) {
            ctx.fillStyle = col;
            ctx.font = "italic 750 11px Inter, system-ui, sans-serif";
            ctx.textAlign = "left";
            ctx.fillText(lbl, x + 6, (y1 + y2) * 0.5 + 4);
          }
        };
        drawMiniUp(719, 310, 298, "Q", "#164666");
        drawMiniUp(719, 238, 227, "", "#164666");
        drawMiniUp(1045, 310, 298, "Q", "#135741");
        drawMiniUp(1045, 238, 227, "", "#135741");

        const drawTokenRow = (x0, y, count, gap, isVideo) => {
          const g = ctx.createLinearGradient(0, y, 0, y + 18);
          if (isVideo) {
            g.addColorStop(0, "#76bde6");
            g.addColorStop(1, "#4495c7");
          } else {
            g.addColorStop(0, "#6ecf9f");
            g.addColorStop(1, "#3aa678");
          }
          ctx.fillStyle = g;
          for (let i = 0; i < count; i++) {
            ctx.beginPath();
            ctx.roundRect(x0 + i * gap, y, 22, 18, 4.5);
            ctx.fill();
          }
        };

        drawTokenRow(594, 314, 8, 32, true);
        drawTokenRow(594, 242, 8, 32, true);
        drawTokenRow(958, 314, 6, 30, false);
        drawTokenRow(958, 242, 6, 30, false);

        // Bidirectional K, V Crossing Curves
        ctx.strokeStyle = "#246e9b";
        ctx.lineWidth = 2.0;
        ctx.beginPath();
        ctx.moveTo(852, 323);
        ctx.bezierCurveTo(898, 323, 898, 281, 942, 281);
        ctx.stroke();
        F.drawArrowHead(ctx, 943, 281, 0, 7.5, "#246e9b");

        ctx.strokeStyle = "#1f8a68";
        ctx.lineWidth = 2.0;
        ctx.beginPath();
        ctx.moveTo(956, 323);
        ctx.bezierCurveTo(906, 323, 906, 281, 862, 281);
        ctx.stroke();
        F.drawArrowHead(ctx, 861, 281, Math.PI, 7.5, "#1f8a68");

        ctx.fillStyle = "#1a303f";
        ctx.font = "italic 750 12px Inter, system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("K, V", 902, 336);

        ctx.restore();
      }
      ctx.restore();
    }

    /* ============================================================
       PHASE 5 (6.20 -> 8.35s): BRISK, CLEAR OUTPUT DENOISING & EDITING
       ============================================================ */
    const pOutShow = F.easeOutCubic(F.phase(t, 6.00, 6.42));
    const outputTau = F.easeInOutCubic(F.phase(t, 6.32, 8.35));

    if (pOutShow > 0.005) {
      ctx.save();
      ctx.globalAlpha *= pOutShow;

      const outViews = [
        { src: IMGS.head_src, real: IMGS.head_real, x: 558, y: 34, w: 108, h: 72 },
        { src: IMGS.wl_src,   real: IMGS.wl_real,   x: 676, y: 20, w: 102, h: 86 },
        { src: IMGS.wr_src,   real: IMGS.wr_real,   x: 788, y: 20, w: 102, h: 86 }
      ];
      const settled = F.phase(outputTau, 0.85, 1.0);
      outViews.forEach((ov) => {
        F.drawVideoFrame(ctx, {
          x: ov.x, y: ov.y, w: ov.w, h: ov.h, radius: 7,
          sourceImg: ov.src, realImg: ov.real,
          mode: "transport", t: outputTau,
          borderColor: settled > 0.05 ? `rgba(226, 106, 56, ${(0.14 + 0.42 * settled).toFixed(2)})` : "rgba(20, 32, 41, 0.14)",
          borderWidth: settled > 0.05 ? 1.4 : 1,
          shadowBlur: 10, shadowY: 3, shadowAlpha: 0.14
        });
      });

      // Top-Right Proprioceptive State Output: matched aspect ratio (184x114) so Edited & dashed Sim curves match left q~ 1:1!
      const simRefReveal = F.easeOutCubic(F.phase(outputTau, 0.55, 1.0));
      F.drawStateTriplet(ctx, {
        x: 951, y: 8, w: 184, h: 114,
        noiseLevel: 1 - outputTau,
        editProgress: outputTau,
        drawFrac: 1,
        showRef: simRefReveal * 0.92,
        noiseAmpPx: 3.4,
        lineWidth: 2.0,
        ribbonHalf: 5.0
      });

      // Subtle clean Edited / Sim micro-legend cleanly to the right of the emerald output arrow
      if (simRefReveal > 0.05) {
        ctx.save();
        ctx.globalAlpha *= simRefReveal;
        const lx = 1072;
        const ly = 133;
        ctx.strokeStyle = "#0e8575";
        ctx.lineWidth = 2.0;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(lx, ly - 3.5);
        ctx.lineTo(lx + 15, ly - 3.5);
        ctx.stroke();

        ctx.fillStyle = "#48606e";
        ctx.font = "650 10.5px Inter, system-ui, sans-serif";
        ctx.textAlign = "left";
        ctx.fillText("Edited", lx + 20, ly);

        ctx.strokeStyle = "#778a98";
        ctx.lineWidth = 1.4;
        ctx.setLineDash([3.5, 2.5]);
        ctx.beginPath();
        ctx.moveTo(lx + 62, ly - 3.5);
        ctx.lineTo(lx + 77, ly - 3.5);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillText("Sim", lx + 82, ly);
        ctx.restore();
      }

      ctx.restore();
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
