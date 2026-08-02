# Converting `wallet/` to an SPA — starter kit

## What's in this kit
```
passport/
  index.html            ← the shell, loads once
  js/router.js           ← hash router, don't touch after setup
  js/state.js             ← session/wallet singleton, shared across all pages
  js/main.js               ← route table — the ONE file you edit per page migrated
  css/shell-additions.css  ← nav + loading-state styles, local to passport/
  fragments/home.html       ← home.html's inner content, converted
  fragments/404.html
  pages/home.js             ← home.js + home-ui.js, converted to init()/destroy()

  home.html, tickets.html, ...  ← your OLD 14 pages, untouched, kept as
                                   reference until each is converted

/assets/css/, /assets/js/   ← shared across passport/admin/staff/kiosk, at
                               repo root — do NOT move these into passport/
/config/supabase.js         ← shared client, repo root, do NOT touch
```

## The 3-step conversion (repeat for each of your other 14 pages)

**1. Fragment it.** Copy the page's `<body>` inner content (everything that
   isn't the shared bottom nav — keep the page's own header, since yours
   aren't global) into `fragments/<page>.html`. Delete `<script>` tags.
   Change any `onclick="window.location.href='x.html'"` or
   `data-url="./x.html"` to `data-link="x"` (no `.html`, matches the route
   name you'll register).

**2. Module-ify it.** Take the page's JS file and wrap its logic in:
   ```js
   export default {
     async init() { /* old DOMContentLoaded code, query via appState not fresh fetches */ },
     destroy() { /* clearInterval, removeEventListener, unsubscribe — undo everything init() did */ }
   };
   ```
   Every `setInterval`, `addEventListener`, or realtime `.channel()` you
   create in `init()` MUST have a matching teardown in `destroy()`, or it
   leaks and stacks up every time the user revisits that page. `pages/home.js`
   shows the pattern (`onCleanup()` helper).

**3. Register it.** In `main.js`, replace the placeholder line for that
   path with the real fragment + module:
   ```js
   registerRoute('order', {
     fragment: 'fragments/order.html',
     module: () => import('../pages/order.js')
   });
   ```

## Things to double check as you go

- **CSS**: concatenate all your existing page CSS files (`home.css`,
  `tickets.css`, etc.) into one `assets/css/app.css`, plus
  `shell-additions.css`. Class names across your pages don't collide today,
  so this is safe — just watch for two different pages both using a generic
  class like `.form-group` with different rules.
- **`state.js` is trimmed** — your real `home.js` also auto-*creates* a
  card number/CVV if the profile doesn't have one yet (`getOrCreateCardNumber`,
  `getOrCreateCvv`). Port those two functions into `state.js`'s
  `refreshSession()` before going live, or new sign-ups won't get a card number.
- **Payment request realtime channel** (`setupPaymentListener` in your
  original `home.js`) should move into `state.js` next to `setupWalletRealtime`,
  same app-lifetime pattern — it shouldn't be torn down on page navigation.
- **Relative import paths**: `pages/home.js` imports
  `../../config/supabase.js` — adjust based on where your `config/` folder
  actually sits relative to `wallet/pages/`.
- **Deployment**: hash routing (`#/order`) needs zero server config — it
  works on any static host as-is, unlike History API routing which needs a
  rewrite rule. Direct links like `yoursite.com/wallet/#/tickets` work and
  are shareable/refreshable out of the box.
- **Admin/staff/passport folders**: leave those as separate multi-page apps
  for now — they're different user roles with different session needs.
  Converting the *customer wallet* first, then deciding later whether staff/
  admin get the same treatment, keeps this migration low-risk.

## Suggested order to convert the remaining 14 pages
Do the two most-visited first so you feel the win immediately, then the rest:
1. `order` (has the order-now / pre-order split you mentioned — model it as
   nested routes, e.g. `order/now` and `order/pre`, sharing one `order.js`)
2. `pay-now`, `deposit` (money-in/out, high traffic)
3. `tickets`, `vvip`, `shisha`, `lockers`
4. `statement`, `profile`, `festival-banner` (lower traffic, convert last)
