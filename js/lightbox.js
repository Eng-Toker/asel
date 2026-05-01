// lightbox.js — Tam ekran fotoğraf görüntüleyici

import { el } from "./utils.js";

const lb = { f: [], i: 0, sc: 1, tx: 0, ty: 0, drag: false, lx: 0, ly: 0, pd: null };

function lbApply() {
  const img = el("lb-img");
  const vw = window.innerWidth, vh = window.innerHeight;
  const bw = img.offsetWidth || vw, bh = img.offsetHeight || vh;
  const maxTx = Math.max(0, (bw * lb.sc - vw) / 2);
  const maxTy = Math.max(0, (bh * lb.sc - vh) / 2);
  lb.tx = Math.max(-maxTx, Math.min(maxTx, lb.tx));
  lb.ty = Math.max(-maxTy, Math.min(maxTy, lb.ty));
  el("lb-img").style.transform = `translate(${lb.tx}px,${lb.ty}px) scale(${lb.sc})`;
}

export function lbReset() {
  lb.sc = 1; lb.tx = 0; lb.ty = 0;
  lbApply();
}

export function lbZoom(f, cx, cy) {
  const p = lb.sc;
  lb.sc = Math.max(1, Math.min(6, lb.sc * f));
  if (cx !== undefined) {
    lb.tx += (cx - lb.tx) * (1 - lb.sc / p);
    lb.ty += (cy - lb.ty) * (1 - lb.sc / p);
  }
  lbApply();
}

export function lbAc(fotolar, idx = 0) {
  lb.f = fotolar || [];
  lb.i = Math.max(0, Math.min(idx, lb.f.length - 1));
  if (!lb.f.length) return;
  lbReset();
  el("lightbox").classList.add("open");
  lbUp();
}

function lbUp() {
  el("lb-img").src = lb.f[lb.i];
  el("lb-counter").textContent = `${lb.i + 1} / ${lb.f.length}`;
  lbReset();
}

export function lbKapat() {
  el("lightbox").classList.remove("open");
  el("lb-img").src = "";
}

export function lbSon() {
  lb.i = (lb.i + 1) % lb.f.length;
  lbUp();
}

export function lbOnc() {
  lb.i = (lb.i - 1 + lb.f.length) % lb.f.length;
  lbUp();
}

// ── Event bindings ────────────────────────────────────────────────────────────

el("lightbox").addEventListener("wheel", (e) => {
  e.preventDefault();
  const r = el("lb-img").getBoundingClientRect();
  lbZoom(
    e.deltaY < 0 ? 1.15 : 1 / 1.15,
    e.clientX - r.left - r.width / 2,
    e.clientY - r.top - r.height / 2,
  );
}, { passive: false });

const lbW = el("lb-wrap");
lbW.addEventListener("mousedown", (e) => {
  if (lb.sc <= 1) return;
  lb.drag = true; lb.lx = e.clientX; lb.ly = e.clientY;
  lbW.classList.add("grab");
});
window.addEventListener("mousemove", (e) => {
  if (!lb.drag) return;
  lb.tx += e.clientX - lb.lx; lb.ty += e.clientY - lb.ly;
  lb.lx = e.clientX; lb.ly = e.clientY;
  lbApply();
});
window.addEventListener("mouseup", () => { lb.drag = false; lbW.classList.remove("grab"); });

el("lightbox").addEventListener("touchstart", (e) => {
  if (e.touches.length === 2) {
    lb.pd = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY,
    );
  } else if (e.touches.length === 1 && lb.sc > 1) {
    lb.drag = true; lb.lx = e.touches[0].clientX; lb.ly = e.touches[0].clientY;
  }
}, { passive: true });

el("lightbox").addEventListener("touchmove", (e) => {
  if (e.touches.length === 2 && lb.pd) {
    e.preventDefault();
    const d = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY,
    );
    lbZoom(d / lb.pd); lb.pd = d;
  } else if (e.touches.length === 1 && lb.drag) {
    lb.tx += e.touches[0].clientX - lb.lx;
    lb.ty += e.touches[0].clientY - lb.ly;
    lb.lx = e.touches[0].clientX; lb.ly = e.touches[0].clientY;
    lbApply();
  }
}, { passive: false });

el("lightbox").addEventListener("touchend", (e) => {
  if (e.touches.length < 2) lb.pd = null;
  if (e.touches.length === 0) lb.drag = false;
});

lbW.addEventListener("dblclick", lbReset);
el("lb-zoom-in").addEventListener("click", () => lbZoom(1.3));
el("lb-zoom-out").addEventListener("click", () => lbZoom(1 / 1.3));
el("lb-close").addEventListener("click", lbKapat);
el("lb-prev").addEventListener("click", lbOnc);
el("lb-next").addEventListener("click", lbSon);
el("lightbox").addEventListener("click", (e) => { if (e.target === el("lightbox")) lbKapat(); });

document.addEventListener("keydown", (e) => {
  if (!el("lightbox").classList.contains("open")) return;
  if (e.key === "Escape") lbKapat();
  if (e.key === "ArrowLeft") lbOnc();
  if (e.key === "ArrowRight") lbSon();
  if (e.key === "+" || e.key === "=") lbZoom(1.2);
  if (e.key === "-") lbZoom(1 / 1.2);
  if (e.key === "0") lbReset();
});
