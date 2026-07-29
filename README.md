# SNIPR Desk — Site de signaux XAUUSD & BTCUSD

Site statique et autonome de signaux de trading (Or et Bitcoin) basé sur les
concepts *Smart Money* : Order Blocks, Fair Value Gaps et confluence
d'indicateurs.

## Contenu

```
index.html          Page d'accueil (hero + carte instrument live)
signals.html        Tableau des signaux (2 setups/instrument : M15 + H1)
education.html      La méthode : OB, FVG, confluence, gestion du risque
disclaimer.html     Avertissement sur les risques & mentions légales
404.html            Page d'erreur
sitemap.xml         Plan du site (SEO)
robots.txt          Directives moteurs de recherche
assets/css/style.css
assets/js/engine.js Moteur d'analyse (indicateurs + FVG/OB + signal)
assets/js/app.js    Navigation, tape, prix live, sparklines
assets/js/signals.js Contrôleur de la page signaux
assets/img/favicon.svg
```

## Mise en ligne

C'est un site 100 % statique : aucun serveur requis. Déploie le dossier tel quel sur
**Netlify, Vercel, GitHub Pages, Cloudflare Pages** ou n'importe quel hébergeur.

- **GitHub Pages** : pousse le dossier dans un repo, active Pages sur la branche `main`.
- **Netlify / Vercel** : glisse-dépose le dossier, c'est en ligne.
- **Localement** : `python3 -m http.server` puis ouvre `http://localhost:8000`.

> Remplace `https://sniprdesk.example` par ton vrai domaine dans
> `sitemap.xml`, `robots.txt` et les balises `<link rel="canonical">`.

## Données de marché

- **BTCUSD** : flux public **Binance** (`api.binance.com`), gratuit, aucune clé.
- **XAUUSD** : nécessite un fournisseur. Crée une clé gratuite sur
  [twelvedata.com](https://twelvedata.com), puis colle-la dans
  `assets/js/engine.js` :

  ```js
  const CONFIG = { TWELVE_DATA_KEY: "TA_CLE_ICI", ... };
  ```

  Sans clé, l'or fonctionne en **mode démonstration** (données synthétiques) pour
  que le site reste fonctionnel hors ligne.

## Comment sont générés les signaux

Le moteur (`engine.js`) :
1. récupère 200 bougies de l'instrument ;
2. calcule EMA 20/50, RSI 14, ATR 14 ;
3. détecte les Fair Value Gaps (déséquilibres 3 bougies) et les Order Blocks ;
4. mesure la structure (cassure BOS) ;
5. additionne les facteurs alignés → biais ACHAT/VENTE + **score de confluence** ;
6. cale l'entrée sur la zone OB/FVG, place le stop au-delà de la structure (ATR),
   fixe deux objectifs en 1:2 et 1:3.

## ⚠️ Avertissement

Le trading comporte un risque de perte en capital. Les signaux sont fournis à
titre informatif et éducatif ; ils ne garantissent aucun résultat et ne
constituent pas un conseil en investissement. Le score de confluence n'est
**pas** une probabilité de gain. Testez sur compte démo avant tout.
