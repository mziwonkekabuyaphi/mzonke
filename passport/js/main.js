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

// --- Not yet converted — placeholders so nav links don't dead-end.
// Convert these one at a time using the same 3-step pattern as home.js.
['order', 'lockers', 'shisha', 'pre-order', 'statement',
 'profile', 'deposit', 'pay-now', 'festival-banner'].forEach((path) => {
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
