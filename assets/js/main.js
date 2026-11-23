"use strict";

(function () {
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ============================================================
     1. Hero Cinematic Video Controller & Scroll-Cue Contrast Sync
     ============================================================ */
  const heroStage = document.getElementById("hero");
  const heroVideo = document.getElementById("hero-video");

  let isHeroInView = true;
  let endHoldTimer = null;
  let heroPhase = "physics"; // "physics" (<2.35s) | "generative" (>=2.35s)

  function setHeroPhase(currentTime) {
    const nextPhase = currentTime >= 2.35 ? "generative" : "physics";
    if (nextPhase !== heroPhase) {
      heroPhase = nextPhase;
      if (heroStage) {
        heroStage.classList.toggle("is-phase-physics", nextPhase === "physics");
        heroStage.classList.toggle("is-phase-generative", nextPhase === "generative");
      }
    }
  }

  function clearEndHold() {
    if (endHoldTimer !== null) {
      clearTimeout(endHoldTimer);
      endHoldTimer = null;
    }
  }

  if (heroVideo) {
    heroVideo.muted = true;
    heroVideo.defaultMuted = true;

    heroVideo.addEventListener("timeupdate", () => {
      setHeroPhase(heroVideo.currentTime);
    });

    // Hold gracefully on the final title frame for 3.2s before looping
    heroVideo.addEventListener("ended", () => {
      if (prefersReducedMotion) return;
      clearEndHold();
      endHoldTimer = setTimeout(() => {
        if (isHeroInView && !document.hidden) {
          heroVideo.currentTime = 0;
          setHeroPhase(0);
          heroVideo.play().catch(() => {});
        }
      }, 3200);
    });

    // Pause hero playback when scrolled completely out of view to save GPU
    if ("IntersectionObserver" in window && heroStage) {
      new IntersectionObserver(
        ([entry]) => {
          isHeroInView = entry.isIntersecting;
          if (!isHeroInView) {
            clearEndHold();
            if (!heroVideo.paused) heroVideo.pause();
          } else if (!prefersReducedMotion && !document.hidden) {
            heroVideo.play().catch(() => {});
          }
        },
        { threshold: 0.08 }
      ).observe(heroStage);
    }

    if (!prefersReducedMotion) {
      heroVideo.play().catch(() => {});
    }
  }

  /* ============================================================
     3. Scroll-Reveal Observer
     ============================================================ */
  const revealEls = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && !prefersReducedMotion) {
    const revealObs = new IntersectionObserver(
      (entries, observer) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08, rootMargin: "0px 0px -30px 0px" }
    );
    revealEls.forEach((el) => revealObs.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add("is-visible"));
  }

  /* ============================================================
     4. Animated KPI Count-Up Numbers on Scroll
     ============================================================ */
  function animateCounter(el) {
    const target = Number(el.dataset.countTo);
    const decimals = Number(el.dataset.decimals || 0);
    const prefix = el.dataset.prefix || "";
    const suffix = el.dataset.suffix || "";

    if (prefersReducedMotion) {
      el.textContent = `${prefix}${target.toFixed(decimals)}${suffix}`;
      return;
    }

    const duration = 880;
    const start = performance.now();
    function tick(now) {
      const t = Math.min(1, (now - start) / duration);
      // Cubic ease-out
      const eased = 1 - Math.pow(1 - t, 3);
      const val = target * eased;
      el.textContent = `${prefix}${val.toFixed(decimals)}${suffix}`;
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  const kpiStrip = document.querySelector("[data-kpi-strip]");
  if (kpiStrip) {
    const counters = kpiStrip.querySelectorAll("[data-count-to]");
    if ("IntersectionObserver" in window && !prefersReducedMotion) {
      const kpiObs = new IntersectionObserver(
        ([entry], observer) => {
          if (entry.isIntersecting) {
            counters.forEach((el, idx) => {
              setTimeout(() => animateCounter(el), idx * 65);
            });
            observer.disconnect();
          }
        },
        { threshold: 0.25 }
      );
      kpiObs.observe(kpiStrip);
    } else {
      counters.forEach(animateCounter);
    }
  }
})();
