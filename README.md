# SNIPR Desk — Signaux XAUUSD & BTCUSD (avec historique + Telegram)

Site statique de signaux de trading (Or & Bitcoin) basé sur Order Blocks,
Fair Value Gaps et confluence. Les signaux sont générés automatiquement 2×/jour
par GitHub Actions, enregistrés dans un historique, envoyés sur Telegram, et
une notification navigateur s'affiche quand un nouveau signal arrive.

## Structure (à respecter absolument)

```
index.html  signals.html  education.html  disclaimer.html  404.html
sitemap.xml  robots.txt  sw.js
assets/css/style.css
assets/js/engine.js  app.js  signals.js
assets/img/favicon.svg
data/latest.json      ← dernier(s) signal(aux)
data/signals.json     ← historique
scripts/generate-signals.mjs
.github/workflows/signals.yml
```

⚠️ Si tu télé-verses sur GitHub, **glisse les DOSSIERS** (assets, data, scripts,
.github) et pas les fichiers un par un, sinon la structure est cassée et le CSS
ne se charge pas.

## 1. Mettre en ligne (GitHub Pages)
Settings → Pages → Source « Deploy from a branch » → branche `main`, dossier `/root` → Save.
Ton adresse : `https://TON-PSEUDO.github.io/TON-REPO/`.

## 2. Créer le bot Telegram
1. Sur Telegram, ouvre **@BotFather** → `/newbot` → suis les étapes.
   Il te donne un **token** du type `123456:ABC-DEF...`.
2. Récupère ton **chat_id** : ouvre une conversation avec ton bot, envoie-lui « salut »,
   puis va sur `https://api.telegram.org/bot<TON_TOKEN>/getUpdates`.
   Cherche `"chat":{"id":123456789` → ce nombre est ton **chat_id**.
   (Pour un canal/groupe, ajoute le bot dedans et utilise l'id du groupe.)

## 3. Enregistrer les secrets sur GitHub
Dépôt → Settings → Secrets and variables → **Actions** → New repository secret :
- `TELEGRAM_BOT_TOKEN` = ton token BotFather
- `TELEGRAM_CHAT_ID`   = ton chat_id
- `TWELVE_DATA_KEY`    = clé gratuite twelvedata.com (pour l'or ; facultatif —
  sans elle, seul le Bitcoin sera généré)

## 4. Autoriser Actions à écrire
Settings → Actions → General → **Workflow permissions** → coche
« Read and write permissions » → Save.
(Nécessaire pour que le bot puisse enregistrer l'historique.)

## 5. Tester tout de suite
Onglet **Actions** → « Générer les signaux » → **Run workflow**.
En ~1 min : Telegram reçoit le signal, `data/` est mis à jour, le site se rafraîchit.
Ensuite ça tourne seul à 06:00 et 13:00 UTC (08:00 / 15:00 Paris).
Pour changer les horaires, édite les lignes `cron` dans `.github/workflows/signals.yml`.

## Notifications navigateur
Sur la page Signaux, clique **🔔 Activer les notifications**. Tant que l'onglet
est ouvert, le site vérifie toutes les 60 s et t'alerte à chaque nouveau signal.
La notification « où que tu sois » (site fermé), c'est **Telegram** qui la gère.

## ⚠️ Avertissement
Le trading comporte un risque de perte en capital. Signaux fournis à titre
informatif et éducatif — aucune garantie de résultat, pas un conseil en
investissement. Le score de confluence n'est pas une probabilité de gain.
