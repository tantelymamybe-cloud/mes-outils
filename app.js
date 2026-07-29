/* ==========================================================================
   SNIPR — Script partagé (navigation, tape, prix live, animations)
   ========================================================================== */

/* ---------- Menu mobile --------------------------------------------------- */
document.addEventListener("click", (e) => {
  const burger = e.target.closest(".burger");
  const links = document.querySelector(".nav__links");
  if (burger && links) links.classList.toggle("open");
  else if (links && !e.target.closest(".nav") && links.classList.contains("open")) {
    links.classList.remove("open");
  }
});

/* ---------- Reveal au scroll ---------------------------------------------- */
(() => {
  const els = document.querySelectorAll(".reveal");
  if (!els.length || !("IntersectionObserver" in window)) {
    els.forEach(el => el.classList.add("in")); return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach(en => { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } });
  }, { threshold: 0.15 });
  els.forEach(el => io.observe(el));
})();

/* ---------- Prix live (BTC via Binance, Or via démo/API) ------------------ */
async function livePrices() {
  const out = { BTCUSD: null, XAUUSD: null };
  try {
    const r = await fetch("https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT");
    if (r.ok) { const j = await r.json(); out.BTCUSD = { p: +j.lastPrice, chg: +j.priceChangePercent }; }
  } catch (_) {}
  // Or : prix indicatif si pas de clé API (mis à jour côté page signaux via Engine).
  return out;
}

function fmt(n, d) {
  return n == null ? "—" : n.toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d });
}

/* ---------- Bandeau tape -------------------------------------------------- */
async function renderTape() {
  const track = document.querySelector(".tape__track");
  if (!track) return;
  const pr = await livePrices();
  const items = [
    { s: "BTC/USD", v: pr.BTCUSD ? fmt(pr.BTCUSD.p, 1) : "—", c: pr.BTCUSD?.chg },
    { s: "XAU/USD", v: pr.XAUUSD ? fmt(pr.XAUUSD.p, 2) : "flux live", c: pr.XAUUSD?.chg },
    { s: "SESSION", v: sessionNow() },
    { s: "SIGNAUX/JOUR", v: "≥ 2" },
    { s: "TIMEFRAME", v: "M15 · H1 · H4" },
    { s: "R:R MIN", v: "1:2" }
  ];
  const html = items.map(i => {
    const chg = i.c != null ? `<b class="${i.c >= 0 ? "up" : "down"}">${i.c >= 0 ? "+" : ""}${i.c.toFixed(2)}%</b>` : "";
    return `<span class="tape__item">${i.s} <b>${i.v}</b> ${chg}</span>`;
  }).join("");
  track.innerHTML = html + html;   // dupliqué pour la boucle
}

function sessionNow() {
  const h = new Date().getUTCHours();
  if (h >= 0 && h < 7)  return "ASIE";
  if (h >= 7 && h < 12) return "LONDRES";
  if (h >= 12 && h < 16) return "LONDRES/NY";
  if (h >= 16 && h < 21) return "NEW YORK";
  return "APRÈS-CLÔTURE";
}

/* ---------- Sparkline (mini-graphe dans le hero) -------------------------- */
function drawSpark(el, candles, color) {
  if (!el || !candles?.length) return;
  const data = candles.slice(-48).map(c => c.c);
  const min = Math.min(...data), max = Math.max(...data), range = max - min || 1;
  const w = 300, h = 70;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 8) - 4;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const up = data.at(-1) >= data[0];
  const stroke = color || (up ? "#35B98A" : "#E35B54");
  el.innerHTML = `
    <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
      <defs><linearGradient id="g${el.id}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${stroke}" stop-opacity="0.28"/>
        <stop offset="1" stop-color="${stroke}" stop-opacity="0"/>
      </linearGradient></defs>
      <polygon points="0,${h} ${pts} ${w},${h}" fill="url(#g${el.id})"/>
      <polyline points="${pts}" fill="none" stroke="${stroke}" stroke-width="2"
        stroke-linejoin="round" stroke-linecap="round"/>
    </svg>`;
}

/* ---------- Carte instrument du hero -------------------------------------- */
async function heroInstrument() {
  const box = document.getElementById("hero-instrument");
  if (!box || typeof Engine === "undefined") return;
  try {
    const sig = await Engine.analyze("BTCUSD");
    box.querySelector("[data-price]").textContent = "$" + fmt(+sig.price, 1);
    box.querySelector("[data-entry]").textContent = fmt(+sig.entry, 1);
    box.querySelector("[data-sl]").textContent    = fmt(+sig.sl, 1);
    box.querySelector("[data-tp]").textContent    = fmt(+sig.tp1, 1);
    const dirEl = box.querySelector("[data-dir]");
    dirEl.textContent = sig.dir === "LONG" ? "ACHAT" : "VENTE";
    dirEl.className = "pill " + (sig.dir === "LONG" ? "pill--long" : "pill--short");
    drawSpark(document.getElementById("hero-spark"), sig.candles, "#F0932B");
  } catch (e) { console.warn(e); }
}

/* ---------- Init ---------------------------------------------------------- */
renderTape();
heroInstrument();
setInterval(renderTape, 30000);

/* Année dynamique dans le footer */
document.querySelectorAll("[data-year]").forEach(el => el.textContent = new Date().getFullYear());
