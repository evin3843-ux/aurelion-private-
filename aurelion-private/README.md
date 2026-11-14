# Aurelion Private

A fictional private banking **financial simulation**, built as an installable iPhone-first PWA for personal entertainment.

Aurelion Private is not a bank. Nothing in this app holds, moves or verifies real money; every balance, account, card, rate, price and transaction is simulated and stored only on your device. The "Financial simulation" marking beside balances and on confirmations is part of the design and should stay.

## What is in it

- **Home** — total wealth with an animated, scrubbable chart (1D to All), available funds, account selector, portfolio split, recent activity.
- **Accounts** — Private Current, Reserve, Investment, Multi-Currency pockets (EUR, GBP, CHF, AED) and Wealth Portfolio; create, rename and archive accounts; per-account history, analytics and search.
- **Transfers** — between your own accounts (including cross-currency) and to fictional recipients, with review, confirmation, pending settlement (about two minutes), cancellation and refunds.
- **Cards** — three original fictional cards with freeze, monthly limits, linked accounts, simulated purchases and category analytics. Freezing really declines purchases.
- **Wealth** — allocation by asset class or currency, history, monthly net movement, and hypothetical holdings with your own quantities, prices and return assumptions.
- **Activity** — full ledger with search, type, account, date, amount and direction filters, sorting and monthly summaries.
- **Settings** — profile and photo, default currency, theme, accent, reduced motion, hide balances, privacy mode, local app lock, notifications, export, import, scenario editing and reset.

## Run locally

Requires Node 20 or later.

```bash
npm install
npm run dev        # development server
npm test           # ledger, validation and persistence tests
npm run build      # type-check and production build into dist/
npm run preview    # serve the production build (service worker active)
```

The service worker registers only in production builds, so test offline behaviour with `npm run preview`.

## Deploy to GitHub Pages (free)

1. Create a GitHub repository and push this project to the `main` branch.
2. In the repository, open **Settings → Pages** and set **Source** to **GitHub Actions**.
3. The included workflow (`.github/workflows/deploy.yml`) runs the tests, builds, and publishes on every push to `main`.
4. Your app appears at `https://<your-username>.github.io/<repository-name>/`.

All asset, manifest and service-worker paths are relative, so no configuration is needed for the repository name or a custom domain.

## Install on iPhone

1. Open the GitHub Pages address in **Safari**.
2. Tap **Share**, then **Add to Home Screen**, then **Add**.
3. Launch it from the Home Screen icon. It opens full screen, and works offline after that first successful load.

Notes for iOS: data lives in the Home Screen app's own storage, separate from Safari's. Use **Settings → Export backup** before clearing website data or removing the app. System notifications need iOS 16.4 or later and the installed app.

## Architecture

```
src/engine/   Pure, deterministic ledger (no UI, no storage)
  money.ts      integer-cent arithmetic, parsing, formatting, FX conversion (BigInt rounding)
  ledger.ts     selectors (balances, wealth, history, analytics) and actions (transfer, pay, cardSpend, buy…)
  validate.ts   structural and referential validation plus reconciliation for stored and imported data
  *.test.ts     engine tests
src/store/    IndexedDB persistence with a backup copy, app store, preferences (localStorage), app lock
src/ui/       Design-system primitives, sheet, SVG charts, card artwork
src/screens/  Home, Accounts, Cards, Wealth, Activity
src/sheets/   Transfer, add/withdraw, convert, account, transaction, card, holding, settings
public/       Manifest, icons, service worker template (file list stamped at build time)
```

Accounting rules worth knowing:

- Amounts are integer minor units. Balances are never stored; they are always derived from ledger postings, so screens cannot disagree with history.
- Total wealth is the sum of account balances plus holdings at their latest user-entered price.
- Same-currency internal transfers leave total wealth exactly unchanged. Cross-currency transfers convert at your illustrative rate and can differ by up to one cent of rounding.
- Pending payments hold funds (available falls, balance does not) until they settle or are cancelled.
- Every instruction carries an idempotency key, so a repeated tap cannot create a duplicate entry.
- Exchange rates and holding prices are entered by you. Nothing is live market data.

## Local app lock

The optional passcode is local privacy protection only. It stores a salted hash in the browser, does not encrypt the stored simulation, and is not banking-grade authentication.

## Regenerating icons

```bash
npm i --no-save sharp && node scripts/make-icons.mjs
```
