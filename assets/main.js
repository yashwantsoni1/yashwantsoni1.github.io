/* IIAI site scripts — all figures are synthetic and drawn live on <canvas>. */
(function () {
  "use strict";
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  /* ---------- Photo slots: show a placeholder until a real image exists ---------- */
  document.querySelectorAll(".photo img").forEach((img) => {
    const fig = img.closest(".photo");
    fig.dataset.file = img.getAttribute("src");
    const markEmpty = () => fig.classList.add("empty");
    if (img.complete && img.naturalWidth === 0) markEmpty();
    img.addEventListener("error", markEmpty);
  });

  /* ---------- Canvas helper: crisp on retina, resizes with layout ---------- */
  function setup(canvas, draw) {
    const ctx = canvas.getContext("2d");
    let w = 0, h = 0;
    function resize() {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = r.width; h = r.height;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw.resize && draw.resize(w, h);
    }
    new ResizeObserver(resize).observe(canvas);
    resize();
    let visible = true;
    new IntersectionObserver((e) => { visible = e[0].isIntersecting; }).observe(canvas);
    let t0 = performance.now();
    function loop(now) {
      if (visible) draw.frame(ctx, w, h, (now - t0) / 1000);
      if (!reduceMotion) requestAnimationFrame(loop);
    }
    if (reduceMotion) setTimeout(() => draw.frame(ctx, w, h, 6), 50);
    else requestAnimationFrame(loop);
  }

  // Seeded random for repeatable "data"
  function rng(seed) { return () => ((seed = (seed * 16807) % 2147483647) / 2147483647); }
  const gauss = (r) => Math.sqrt(-2 * Math.log(r() + 1e-9)) * Math.cos(2 * Math.PI * r());

  /* Synthetic earthquake: P arrival, S arrival, decaying coda */
  function quake(t, tp, amp) {
    if (t < tp) return 0;
    const dp = t - tp, ts = tp + 1.7, ds = t - ts;
    let v = 0.35 * amp * Math.exp(-dp * 2.2) * Math.sin(dp * 38) * Math.min(1, dp * 20);
    if (t > ts) v += amp * Math.exp(-ds * 0.9) * Math.sin(ds * 17 + Math.sin(ds * 5)) * Math.min(1, ds * 8);
    return v;
  }

  /* ---------- 1. Hero: continuously recording seismogram ---------- */
  const hero = document.getElementById("hero-trace");
  if (hero) {
    const r = rng(7); const pxPerSec = 70; let buf = [];
    setup(hero, {
      frame(ctx, w, h, t) {
        const n = Math.ceil(w);
        const events = [3.2, 11, 19.5, 27];
        const sample = (tt) => {
          const cyc = tt % 32; let v = gauss(r) * 0.04 + Math.sin(tt * 1.3) * 0.02;
          events.forEach((e, i) => { v += quake(cyc, e, [0.9, 0.45, 1, 0.6][i]); });
          return v;
        };
        while (buf.length < n) buf.push(sample(buf.length / pxPerSec));
        const step = reduceMotion ? 0 : Math.round(t * pxPerSec) - (this.last || 0);
        this.last = Math.round(t * pxPerSec);
        for (let i = 0; i < step; i++) { buf.shift(); buf.push(sample((this.last + n + i) / pxPerSec)); }
        if (buf.length > n) buf = buf.slice(buf.length - n);

        ctx.clearRect(0, 0, w, h);
        ctx.strokeStyle = css("--rule"); ctx.lineWidth = 1;
        for (let x = w - (this.last % pxPerSec); x > 0; x -= pxPerSec) {
          ctx.beginPath(); ctx.moveTo(x, h - 10); ctx.lineTo(x, h); ctx.stroke();
        }
        ctx.strokeStyle = css("--ink"); ctx.lineWidth = 1.3; ctx.beginPath();
        buf.forEach((v, i) => { const y = h / 2 - v * h * 0.42; i ? ctx.lineTo(i, y) : ctx.moveTo(i, y); });
        ctx.stroke();
        ctx.fillStyle = css("--slow");
        ctx.beginPath(); ctx.arc(w - 2, h / 2 - buf[buf.length - 1] * h * 0.42, 3.5, 0, 7); ctx.fill();
      },
    });
  }

  /* ---------- 2. Interferometry: noise cross-correlation stack converging ---------- */
  const xc = document.getElementById("interferometry");
  if (xc) {
    const r = rng(42); const N = 300; const lag = 1.0;
    const green = Array.from({ length: N }, (_, i) => {
      const t = (i / (N - 1)) * 2 - 1; // lag -1..1
      const pk = (c) => Math.exp(-((t - c) ** 2) / 0.0025) * Math.cos((t - c) * 60);
      return pk(0.45 * lag) + 0.8 * pk(-0.45 * lag);
    });
    let stack = new Array(N).fill(0), days = 0;
    const label = document.getElementById("xc-days");
    setup(xc, {
      frame(ctx, w, h, t) {
        const target = reduceMotion ? 365 : Math.floor((t * 22) % 420);
        if (target < days) { stack.fill(0); days = 0; }
        while (days < Math.min(target, 365)) {
          for (let i = 0; i < N; i++) stack[i] += green[i] * 0.7 + gauss(r) * 1.0;
          days++;
        }
        if (label) label.textContent = days;
        const max = Math.max(...stack.map(Math.abs)) || 1;
        ctx.clearRect(0, 0, w, h);
        const top = 70, mid = top + (h - top) / 2;
        // stations
        const sx = [w * 0.3, w * 0.7];
        ctx.strokeStyle = css("--rule"); ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(sx[0], 34); ctx.lineTo(sx[1], 34); ctx.stroke(); ctx.setLineDash([]);
        sx.forEach((x, i) => {
          ctx.fillStyle = css("--ink"); ctx.beginPath();
          ctx.moveTo(x, 24); ctx.lineTo(x - 9, 40); ctx.lineTo(x + 9, 40); ctx.fill();
          ctx.font = "600 13px Archivo, sans-serif"; ctx.textAlign = "center";
          ctx.fillText(i ? "Station B" : "Station A", x, 58);
        });
        // ambient noise sources flickering around
        ctx.fillStyle = css("--graphite");
        for (let k = 0; k < 14; k++) {
          const a = (k * 2.4 + t * 0.3) % (Math.PI * 2);
          ctx.globalAlpha = 0.25 + 0.25 * Math.sin(t * 3 + k);
          ctx.beginPath(); ctx.arc(w / 2 + Math.cos(a) * w * 0.47, 34 + Math.sin(a) * 26, 2.5, 0, 7); ctx.fill();
        }
        ctx.globalAlpha = 1;
        // axis
        ctx.strokeStyle = css("--rule"); ctx.beginPath();
        ctx.moveTo(20, mid); ctx.lineTo(w - 20, mid); ctx.moveTo(w / 2, top); ctx.lineTo(w / 2, h - 18); ctx.stroke();
        ctx.fillStyle = css("--graphite"); ctx.font = "12px Archivo, sans-serif"; ctx.textAlign = "center";
        ctx.fillText("acausal (B → A)", w * 0.27, h - 6); ctx.fillText("causal (A → B)", w * 0.73, h - 6);
        ctx.fillText("0 s lag", w / 2, h - 6);
        // trace
        ctx.strokeStyle = css("--fast"); ctx.lineWidth = 1.4; ctx.beginPath();
        stack.forEach((v, i) => {
          const x = 20 + (i / (N - 1)) * (w - 40), y = mid - (v / max) * (h - top) * 0.42;
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        });
        ctx.stroke();
      },
    });
  }

  /* ---------- 3. Neural network phase picker ---------- */
  const nn = document.getElementById("neuralnet");
  if (nn) {
    const layers = [6, 9, 9, 5, 3];
    const outLabels = ["P wave", "S wave", "Noise"];
    setup(nn, {
      frame(ctx, w, h, t) {
        ctx.clearRect(0, 0, w, h);
        const x0 = w * 0.24, x1 = w * 0.8;
        const pos = layers.map((n, li) => Array.from({ length: n }, (_, k) => [
          x0 + (li / (layers.length - 1)) * (x1 - x0), h * 0.12 + ((k + 0.5) / n) * h * 0.76,
        ]));
        // input waveform window
        ctx.strokeStyle = css("--ink"); ctx.lineWidth = 1.2; ctx.beginPath();
        for (let i = 0; i <= 100; i++) {
          const x = 10 + (i / 100) * (x0 - 40), tt = i / 100 * 4 + (t % 8) * 0.6;
          const y = h / 2 - (quake(tt % 6, 1.2, 1) + Math.sin(tt * 40) * 0.03) * h * 0.25;
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.stroke();
        ctx.fillStyle = css("--graphite"); ctx.font = "12px Archivo, sans-serif"; ctx.textAlign = "left";
        ctx.fillText("3-component window", 10, h - 10);
        // edges
        ctx.lineWidth = 0.6;
        for (let l = 0; l < layers.length - 1; l++)
          pos[l].forEach((a) => pos[l + 1].forEach((b) => {
            ctx.strokeStyle = css("--rule"); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
          }));
        // travelling pulses
        const phase = (t * 0.9) % layers.length;
        const l = Math.floor(phase), f = phase - l;
        if (l < layers.length - 1) {
          pos[l].forEach((a, i) => pos[l + 1].forEach((b, j) => {
            if ((i * 7 + j * 3 + l) % 4) return;
            ctx.fillStyle = (i + j) % 2 ? css("--fast") : css("--slow");
            ctx.beginPath(); ctx.arc(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, 2.4, 0, 7); ctx.fill();
          }));
        }
        // nodes
        pos.forEach((layer, li) => layer.forEach(([x, y], k) => {
          const act = 0.5 + 0.5 * Math.sin(t * 2 + k * 1.3 + li);
          ctx.fillStyle = css("--surface"); ctx.strokeStyle = css("--ink"); ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.arc(x, y, 7, 0, 7); ctx.fill(); ctx.stroke();
          ctx.globalAlpha = li === l ? 0.9 : act * 0.35;
          ctx.fillStyle = css("--fast"); ctx.beginPath(); ctx.arc(x, y, 5, 0, 7); ctx.fill();
          ctx.globalAlpha = 1;
        }));
        // outputs
        const cyc = Math.floor(t / 5) % 3;
        const probs = [[0.91, 0.06, 0.03], [0.08, 0.87, 0.05], [0.04, 0.07, 0.89]][cyc];
        pos[layers.length - 1].forEach(([x, y], k) => {
          ctx.fillStyle = css("--ink"); ctx.font = "600 12px Archivo, sans-serif"; ctx.textAlign = "left";
          ctx.fillText(outLabels[k], x + 14, y - 3);
          ctx.fillStyle = css("--rule"); ctx.fillRect(x + 14, y + 3, w - x - 24, 5);
          ctx.fillStyle = k === cyc ? css("--slow") : css("--graphite");
          ctx.fillRect(x + 14, y + 3, (w - x - 24) * probs[k], 5);
        });
      },
    });
  }

  /* ---------- 4. Time series: raw → band-pass → STA/LTA trigger ---------- */
  const ts = document.getElementById("timeseries");
  if (ts) {
    const r = rng(11), N = 900, dt = 0.02;
    const raw = [], filt = [];
    for (let i = 0; i < N; i++) {
      const t = i * dt;
      raw.push(Math.sin(t * 0.9) * 0.35 + gauss(r) * 0.08 + quake(t, 9, 1.2));
    }
    // simple band-pass: remove running mean (high-pass) then 3-point smooth (low-pass)
    for (let i = 0; i < N; i++) {
      let m = 0, c = 0;
      for (let k = Math.max(0, i - 40); k < Math.min(N, i + 40); k++) { m += raw[k]; c++; }
      filt.push(raw[i] - m / c);
    }
    const sm = filt.map((v, i) => (filt[i - 1] ?? v) * 0.25 + v * 0.5 + (filt[i + 1] ?? v) * 0.25);
    const ratio = sm.map((_, i) => {
      const e = (a, b) => { let s = 0; for (let k = Math.max(0, a); k < b; k++) s += sm[k] ** 2; return s / Math.max(1, b - Math.max(0, a)); };
      return i < 60 ? 1 : e(i - 15, i) / (e(i - 200, i - 15) + 1e-6);
    });
    const rmax = Math.max(...ratio), thr = 4;
    const pick = ratio.findIndex((v) => v > thr);
    setup(ts, {
      frame(ctx, w, h, t) {
        ctx.clearRect(0, 0, w, h);
        const reveal = reduceMotion ? N : Math.floor(((t % 9) / 7) * N);
        const rows = [["Raw record", raw, css("--graphite")], ["Band-passed", sm, css("--ink")], ["STA/LTA", ratio, css("--fast")]];
        const rh = (h - 20) / 3, pad = 12;
        rows.forEach(([name, data, col], ri) => {
          const y0 = 10 + ri * rh, cy = y0 + rh / 2;
          const scale = ri === 2 ? null : Math.max(...data.map(Math.abs));
          ctx.strokeStyle = css("--rule"); ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(pad, y0 + rh - 2); ctx.lineTo(w - pad, y0 + rh - 2); ctx.stroke();
          ctx.fillStyle = css("--graphite"); ctx.font = "600 12px Archivo, sans-serif"; ctx.textAlign = "left";
          ctx.fillText(name, pad, y0 + 12);
          ctx.strokeStyle = col; ctx.lineWidth = 1.2; ctx.beginPath();
          for (let i = 0; i < Math.min(reveal, N); i++) {
            const x = pad + (i / (N - 1)) * (w - 2 * pad);
            const y = ri === 2 ? y0 + rh - 4 - (data[i] / rmax) * (rh - 20) : cy - (data[i] / scale) * rh * 0.4;
            i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
          }
          ctx.stroke();
          if (ri === 2) {
            const ty = y0 + rh - 4 - (thr / rmax) * (rh - 20);
            ctx.setLineDash([5, 4]); ctx.strokeStyle = css("--slow");
            ctx.beginPath(); ctx.moveTo(pad, ty); ctx.lineTo(w - pad, ty); ctx.stroke(); ctx.setLineDash([]);
            ctx.fillStyle = css("--slow"); ctx.textAlign = "right"; ctx.fillText("trigger threshold", w - pad, ty - 5);
          }
        });
        if (reveal > pick) {
          const x = pad + (pick / (N - 1)) * (w - 2 * pad);
          ctx.strokeStyle = css("--slow"); ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(x, 10); ctx.lineTo(x, h - 10); ctx.stroke();
          ctx.fillStyle = css("--slow"); ctx.font = "700 12px Archivo, sans-serif"; ctx.textAlign = "left";
          ctx.fillText("P pick", x + 5, 24);
        }
      },
    });
  }

  /* ---------- 5. Tomography: map-view depth slices + cross-section ---------- */
  function polar(v) { // v in [-1,1]; negative = slow (red), positive = fast (blue)
    v = Math.max(-1, Math.min(1, v));
    const a = Math.abs(v);
    const red = [184, 40, 34], blue = [28, 70, 150];
    const c = v < 0 ? red : blue;
    return [255 + (c[0] - 255) * a, 255 + (c[1] - 255) * a, 255 + (c[2] - 255) * a];
  }
  function field(x, y, blobs) {
    let s = 0; blobs.forEach(([bx, by, r, a]) => { s += a * Math.exp(-((x - bx) ** 2 + (y - by) ** 2) / (r * r)); });
    return s;
  }
  const slices = {
    10: [[0.25, 0.35, 0.14, -0.9], [0.6, 0.6, 0.18, 0.8], [0.8, 0.25, 0.1, -0.6], [0.4, 0.8, 0.12, 0.5], [0.15, 0.75, 0.08, -0.4]],
    30: [[0.35, 0.4, 0.2, -0.8], [0.7, 0.5, 0.15, 0.9], [0.55, 0.15, 0.12, -0.5], [0.2, 0.8, 0.16, 0.6]],
    60: [[0.5, 0.45, 0.3, 0.7], [0.15, 0.3, 0.15, -0.8], [0.85, 0.75, 0.18, -0.6]],
  };
  const map = document.getElementById("tomo-map");
  const sec = document.getElementById("tomo-section");
  if (map && sec) {
    const r = rng(5);
    const stations = Array.from({ length: 22 }, () => [0.08 + r() * 0.84, 0.08 + r() * 0.84]);
    const pairs = Array.from({ length: 40 }, () => [Math.floor(r() * 22), Math.floor(r() * 22)]);
    let depth = 10;

    function drawMap() {
      const ctx = map.getContext("2d"), dpr = Math.min(devicePixelRatio || 1, 2);
      const W = map.clientWidth, H = map.clientHeight;
      map.width = W * dpr; map.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const gw = 120, gh = Math.round(120 * H / W), off = document.createElement("canvas");
      off.width = gw; off.height = gh; const oc = off.getContext("2d"), img = oc.createImageData(gw, gh);
      for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
        const [R, G, B] = polar(field(i / gw, j / gh, slices[depth]));
        const k = (j * gw + i) * 4; img.data.set([R, G, B, 255], k);
      }
      oc.putImageData(img, 0, 0);
      ctx.imageSmoothingEnabled = true; ctx.drawImage(off, 0, 0, W, H);
      ctx.strokeStyle = "rgba(23,36,51,0.25)"; ctx.lineWidth = 0.7;
      pairs.forEach(([a, b]) => { if (a === b) return; ctx.beginPath();
        ctx.moveTo(stations[a][0] * W, stations[a][1] * H); ctx.lineTo(stations[b][0] * W, stations[b][1] * H); ctx.stroke(); });
      ctx.fillStyle = "#172433";
      stations.forEach(([x, y]) => { ctx.beginPath(); ctx.moveTo(x * W, y * H - 5); ctx.lineTo(x * W - 5, y * H + 4); ctx.lineTo(x * W + 5, y * H + 4); ctx.fill(); });
      ctx.strokeStyle = "#172433"; ctx.setLineDash([6, 4]); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(0.05 * W, 0.45 * H); ctx.lineTo(0.95 * W, 0.45 * H); ctx.stroke(); ctx.setLineDash([]);
      ctx.font = "700 13px Archivo, sans-serif"; ctx.fillText("A", 0.05 * W - 4, 0.45 * H - 8); ctx.fillText("A′", 0.95 * W - 6, 0.45 * H - 8);
      ctx.fillStyle = "rgba(255,255,255,0.85)"; ctx.fillRect(8, 8, 110, 24);
      ctx.fillStyle = "#172433"; ctx.fillText(`Depth ${depth} km`, 16, 25);
    }
    function drawSection() {
      const ctx = sec.getContext("2d"), dpr = Math.min(devicePixelRatio || 1, 2);
      const W = sec.clientWidth, H = sec.clientHeight;
      sec.width = W * dpr; sec.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const gw = 160, gh = Math.round(160 * H / W), off = document.createElement("canvas");
      off.width = gw; off.height = gh; const oc = off.getContext("2d"), img = oc.createImageData(gw, gh);
      for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
        const x = i / gw, z = j / gh; // z: 0..1 = 0..80 km
        const dk = z * 80; const keys = [10, 30, 60];
        let v; if (dk <= 10) v = field(x, 0.45, slices[10]);
        else { const k = dk < 30 ? 0 : 1; const a = keys[k], b = keys[k + 1] ?? 60;
          const f = Math.min(1, (dk - a) / (b - a)); v = field(x, 0.45, slices[a]) * (1 - f) + field(x, 0.45, slices[b]) * f; }
        v += 0.6 * Math.exp(-((z - (0.2 + x * 0.6)) ** 2) / 0.004) / (1 + Math.exp(-(x - 0.3) * 40)); // dipping fast slab
        const [R, G, B] = polar(v); img.data.set([R, G, B, 255], (j * gw + i) * 4);
      }
      oc.putImageData(img, 0, 0); ctx.drawImage(off, 0, 0, W, H);
      const zl = (depth / 80) * H;
      ctx.strokeStyle = "#172433"; ctx.setLineDash([6, 4]); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(0, zl); ctx.lineTo(W, zl); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = "#172433"; ctx.font = "600 12px Archivo, sans-serif";
      [0, 20, 40, 60].forEach((d) => ctx.fillText(`${d} km`, 6, (d / 80) * H + 14));
      ctx.font = "700 13px Archivo, sans-serif"; ctx.fillText("A", 6, H - 8); ctx.textAlign = "right"; ctx.fillText("A′", W - 6, H - 8); ctx.textAlign = "left";
    }
    const redraw = () => { drawMap(); drawSection(); };
    document.querySelectorAll("[data-depth]").forEach((b) => b.addEventListener("click", () => {
      depth = +b.dataset.depth;
      document.querySelectorAll("[data-depth]").forEach((o) => o.setAttribute("aria-pressed", o === b));
      redraw();
    }));
    new ResizeObserver(redraw).observe(map);
    redraw();
  }

  /* ---------- Gallery lightbox ---------- */
  const box = document.getElementById("lightbox");
  if (box) {
    const bimg = box.querySelector("img"), bcap = box.querySelector("p");
    document.querySelectorAll(".gallery .photo").forEach((fig) => {
      fig.tabIndex = 0;
      const open = () => {
        if (fig.classList.contains("empty")) return;
        const im = fig.querySelector("img");
        bimg.src = im.src; bimg.alt = im.alt;
        bcap.textContent = fig.querySelector("figcaption")?.textContent || "";
        box.showModal();
      };
      fig.addEventListener("click", open);
      fig.addEventListener("keydown", (e) => { if (e.key === "Enter") open(); });
    });
    box.querySelector("button").addEventListener("click", () => box.close());
    box.addEventListener("click", (e) => { if (e.target === box) box.close(); });
  }

  const yr = document.getElementById("year");
  if (yr) yr.textContent = new Date().getFullYear();
})();
