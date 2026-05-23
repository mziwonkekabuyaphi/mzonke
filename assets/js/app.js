const APP_STATE = {

  currentPage: null

};

const VALID_PAGES = [

  "home",

  "tickets",

  "shisha",

  "lockers",

  "order-now",

  "queue-now",

  "vvip-tab",

  "vibe-statement"

];

// -------------------- SPA ROUTER --------------------

async function loadPage(page, { pushState = true } = {}) {

  if (!VALID_PAGES.includes(page)) {

    page = "home";

  }

  try {

    const res = await fetch(`views/${page}.html`);

    if (!res.ok) {

      throw new Error("Failed to load page");

    }

    const html = await res.text();

    document.getElementById("app").innerHTML = html;

    APP_STATE.currentPage = page;

    localStorage.setItem("lastPage", page);

    updateActiveNav(page);

    closeTransactModal();

    if (pushState) {

      history.pushState({ page }, "", `#${page}`);

    }

  } catch (err) {

    document.getElementById("app").innerHTML =

      `<div style="padding:20px">Page failed to load</div>`;

  }

}

// -------------------- NAV --------------------

function updateActiveNav(page) {

  document.querySelectorAll(".nav-item").forEach(btn => {

    btn.classList.toggle(

      "active",

      btn.dataset.page === page

    );

  });

}

// click binding (NO inline onclick = production safe)

document.addEventListener("click", (e) => {

  const navBtn = e.target.closest(".nav-item[data-page]");

  if (navBtn) {

    loadPage(navBtn.dataset.page);

  }

  const transactCard = e.target.closest(".transact-card");

  if (transactCard) {

    loadPage(transactCard.dataset.page);

  }

});

// -------------------- MODAL --------------------

function openTransactModal() {

  document.getElementById("transactModal").classList.remove("hidden");

}

function closeTransactModal() {

  document.getElementById("transactModal").classList.add("hidden");

}

document.getElementById("openTransactBtn")

  .addEventListener("click", openTransactModal);

document.getElementById("closeTransactBtn")

  .addEventListener("click", closeTransactModal);

// -------------------- BACK BUTTON FIX --------------------

window.addEventListener("popstate", (e) => {

  const page = e.state?.page || "home";

  loadPage(page, { pushState: false });

});

// -------------------- BOOT --------------------

(function init() {

  const saved = localStorage.getItem("lastPage");

  const hash = window.location.hash.replace("#", "");

  loadPage(hash || saved || "home", { pushState: false });

})();
