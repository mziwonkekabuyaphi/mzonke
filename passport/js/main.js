import { registerRoute, initRouter } from './router.js';

// ============================================
// ROUTE TABLE — this is the only place you touch when converting
// another one of your 15 pages. For each old page:
//   1. Move its <body> content (minus <script> tags) into fragments/<name>.html
//   2. Turn its old home.js-style script into pages/<name>.js exporting
//      { init(){...}, destroy(){...} } — see pages/home.js as the template
//   3. Add one line below
// ============================================

registerRoute('home', {
    fragment: 'fragments/home.html',
    module: () => import('../pages/home.js')
});

registerRoute('tickets', {
    fragment: 'fragments/tickets.html',
    module: () => import('../pages/tickets.js')
});

registerRoute('vvip', {
    fragment: 'fragments/vvip.html',
    module: () => import('../pages/vvip.js')
});

registerRoute('shisha', {
    fragment: 'fragments/shisha.html',
    module: () => import('../pages/shisha.js')
});

registerRoute('order', {
    fragment: 'fragments/order.html',
    module: () => import('../pages/order.js')
});

registerRoute('profile', {
    fragment: 'fragments/profile.html',
    module: () => import('../pages/profile.js')
});

registerRoute('deposit', {
    fragment: 'fragments/deposit.html',
    module: () => import('../pages/deposit.js')
});

registerRoute('lockers', {
    fragment: 'fragments/lockers.html',
    module: () => import('../pages/lockers.js')
});

registerRoute('pay-now', {
    fragment: 'fragments/pay-now.html',
    module: () => import('../pages/pay-now.js')
});

registerRoute('statement', {
    fragment: 'fragments/statement.html',
    module: () => import('../pages/statement.js')
});

registerRoute('festival-banner', {
    fragment: 'fragments/festival-banner.html',
    module: () => import('../pages/festival-banner.js')
});

registerRoute('payment-success', {
    fragment: 'fragments/payment-success.html',
    module: () => import('../pages/payment-success.js')
});

// --- Not yet converted — placeholders so nav links don't dead-end.
// Convert these one at a time using the same 3-step pattern as home.js.
['butcher', 'pre-order'].forEach((path) => {
    registerRoute(path, {
        fragment: `fragments/${path}.html`,   // create this file when you migrate the page
        module: () => Promise.resolve({ default: { init(){}, destroy(){} } })
    });
});

registerRoute('404', {
    fragment: 'fragments/404.html',
    module: () => Promise.resolve({ default: { init(){}, destroy(){} } })
});

initRouter('home');
