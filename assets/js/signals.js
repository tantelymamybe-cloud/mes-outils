/* ==========================================================================
   SNIPR — Contrôleur de la page Signaux
   Génère au moins 2 signaux/jour par instrument (M15 + H1) et les affiche.
   ========================================================================== */

const Signals = (() => {
  let current = "XAUUSD";

  function fmt(v, d) {
    return (+v).toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d });
  }

  function card(sig, label) {
    const long = sig.dir === "LONG";
    const d = sig.symbol === "BTCUSD" ? 1 : 2;
    return `
    <article class="sig" data-dir="${sig.dir}">
      <div class="sig__top">
        <div class="sig__sym">${sig.symbol}
          <small>${label} · ${sig.time}</small>
        </div>
        <span class="pill ${long ? "pill--long" : "pill--short"}">${long ? "▲ ACHAT" : "▼ VENTE"}</span>
      </div>

      <div class="ladder">
        <div class="ladder__row ladder__row--entry"><span>Entrée</span><b>${fmt(sig.entry, d)}</b></div>
        <div class="ladder__row ladder__row--sl"><span>Stop Loss</span><b>${fmt(sig.sl, d)}</b></div>
        <div class="ladder__row ladder__row--tp"><span>Take Profit 1 · 1:2</span><b>${fmt(sig.tp1, d)}</b></div>
        <div class="ladder__row ladder__row--tp"><span>Take Profit 2 · 1:3</span><b>${fmt(sig.tp2, d)}</b></div>
      </div>

      <div class="sig__meta">
        <span>RSI ${sig.rsi}</span>
        <span>Prix actuel ${fmt(sig.price, d)}</span>
      </div>

      <div class="conf">
        <div class="conf__bar"><div class="conf__fill" style="width:${sig.conf}%"></div></div>
        <div class="conf__label"><span>Confluence</span><span>${sig.conf}%</span></div>
      </div>

      <div class="tags">${sig.tags.map(t => `<span class="tag">${t}</span>`).join("")}</div>
    </article>`;
  }

  async function load(symbol) {
    current = symbol;
    const grid = document.getElementById("signals-grid");
    grid.innerHTML = `<div class="state"><div class="spinner"></div>Analyse des Order Blocks & FVG en cours…</div>`;

    // Marquer l'onglet actif
    document.querySelectorAll(".tabs button").forEach(b =>
      b.classList.toggle("active", b.dataset.sym === symbol));

    try {
      // Deux lectures = deux setups distincts pour couvrir M15 puis H1.
      Engine.CONFIG.interval = symbol === "BTCUSD" ? "15m" : "15min";
      const s1 = await Engine.analyze(symbol);
      Engine.CONFIG.interval = symbol === "BTCUSD" ? "1h" : "1h";
      const s2 = await Engine.analyze(symbol);

      grid.innerHTML = card(s1, "Intraday M15") + card(s2, "Swing H1");

      // relancer l'animation des barres de confluence
      requestAnimationFrame(() => {
        document.querySelectorAll(".conf__fill").forEach(f => {
          const w = f.style.width; f.style.width = "0%";
          requestAnimationFrame(() => f.style.width = w);
        });
      });
    } catch (e) {
      grid.innerHTML = `<div class="state">Impossible de charger les données de marché.<br>
        Vérifie ta connexion ou renseigne une clé API pour l'or.</div>`;
      console.error(e);
    }
  }

  function init() {
    document.querySelectorAll(".tabs button").forEach(btn =>
      btn.addEventListener("click", () => load(btn.dataset.sym)));
    const refresh = document.getElementById("refresh");
    if (refresh) refresh.addEventListener("click", () => load(current));
    load(current);
  }

  return { init };
})();

document.addEventListener("DOMContentLoaded", Signals.init);
