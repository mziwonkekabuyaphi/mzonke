async function loadPage(page){

  const res = await fetch(`views/${page}.html`);

  const html = await res.text();

  document.getElementById("app").innerHTML = html;

  closeTransactModal();

  updateActiveNav(page);

}

function openTransactModal(){

  document.getElementById("transactModal")

    .classList.remove("hidden");

}

function closeTransactModal(){

  document.getElementById("transactModal")

    .classList.add("hidden");

}

function updateActiveNav(page){

  document.querySelectorAll(".nav-item")

    .forEach(btn => btn.classList.remove("active"));

  const match = document.querySelector(

    `[onclick*="${page}"]`

  );

  if(match) match.classList.add("active");

}

// first load

loadPage("home");
