import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_ANON_KEY, GAME_ID } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const $ = (id) => document.getElementById(id);

let currentSession = null; // sesiunea activa curenta a trainerului
let deckCards = [];

// ---------- AUTH ----------
async function checkAuth() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    showAdmin();
  } else {
    $("login-view").style.display = "block";
  }
}

$("login-btn").addEventListener("click", async () => {
  const email = $("login-email").value.trim();
  const password = $("login-password").value;
  $("login-error").textContent = "";
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    $("login-error").textContent = "Autentificare eșuată: " + error.message;
    return;
  }
  showAdmin();
});

$("logout-btn").addEventListener("click", async () => {
  await supabase.auth.signOut();
  location.reload();
});

async function showAdmin() {
  $("login-view").style.display = "none";
  $("admin-view").style.display = "block";
  await loadDeck();
  await loadActiveSession();
}

// ---------- DECK ----------
async function loadDeck() {
  const { data, error } = await supabase
    .from("cards")
    .select("*")
    .eq("game_id", GAME_ID)
    .order("order_index", { ascending: true });
  if (error) {
    console.error(error);
    return;
  }
  deckCards = data || [];
  renderDeck();
  if (currentSession) renderControlGrid();
}

function renderDeck() {
  const grid = $("deck-grid");
  grid.innerHTML = "";
  if (deckCards.length === 0) {
    grid.innerHTML = `<p style="color:var(--grey); font-size:14px;">Niciun card încă. Adaugă primul card.</p>`;
    return;
  }
  deckCards.forEach((c) => {
    const tile = document.createElement("div");
    tile.className = "card-tile";
    tile.innerHTML = `
      <img src="${c.front_image_url}" alt="față" />
      <div class="tile-label">${escapeHtml(c.title)}</div>
      <div class="tile-controls">
        <button class="toggle-flip show-back-btn">Vezi verso</button>
        <button class="toggle-flip" style="border-color:var(--red); color:var(--red);" data-delete="${c.id}">Șterge</button>
      </div>
    `;
    const img = tile.querySelector("img");
    let showingBack = false;
    tile.querySelector(".show-back-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      showingBack = !showingBack;
      img.src = showingBack ? c.back_image_url : c.front_image_url;
      e.target.textContent = showingBack ? "Vezi față" : "Vezi verso";
    });
    tile.querySelector("[data-delete]").addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!confirm(`Ștergi cardul „${c.title}”?`)) return;
      await supabase.from("cards").delete().eq("id", c.id);
      await loadDeck();
    });
    grid.appendChild(tile);
  });
}

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str || "";
  return d.innerHTML;
}

// ---------- ADD CARD MODAL ----------
$("add-card-btn").addEventListener("click", () => {
  $("f-title").value = "";
  $("f-explanation").value = "";
  $("f-initial-face").value = "front";
  $("f-flippable").checked = true;
  $("f-front-file").value = "";
  $("f-back-file").value = "";
  $("f-front-preview").style.display = "none";
  $("f-back-preview").style.display = "none";
  $("modal-error").textContent = "";
  $("card-modal").style.display = "flex";
});
$("modal-cancel-btn").addEventListener("click", () => ($("card-modal").style.display = "none"));

function wirePreview(fileInputId, previewId) {
  $(fileInputId).addEventListener("change", () => {
    const file = $(fileInputId).files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    $(previewId).src = url;
    $(previewId).style.display = "block";
  });
}
wirePreview("f-front-file", "f-front-preview");
wirePreview("f-back-file", "f-back-preview");

async function uploadImage(file) {
  const ext = file.name.split(".").pop();
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("card-images").upload(path, file);
  if (error) throw error;
  const { data } = supabase.storage.from("card-images").getPublicUrl(path);
  return data.publicUrl;
}

$("modal-save-btn").addEventListener("click", async () => {
  const title = $("f-title").value.trim();
  const frontFile = $("f-front-file").files[0];
  const backFile = $("f-back-file").files[0];
  $("modal-error").textContent = "";

  if (!title || !frontFile || !backFile) {
    $("modal-error").textContent = "Titlul și ambele imagini (față + verso) sunt obligatorii.";
    return;
  }

  $("modal-save-btn").disabled = true;
  $("modal-save-btn").textContent = "Se salvează...";
  try {
    const frontUrl = await uploadImage(frontFile);
    const backUrl = await uploadImage(backFile);
    const { error } = await supabase.from("cards").insert({
      title,
      front_image_url: frontUrl,
      back_image_url: backUrl,
      initial_face: $("f-initial-face").value,
      flippable_default: $("f-flippable").checked,
      explanation: $("f-explanation").value.trim(),
      game_id: GAME_ID,
      order_index: deckCards.length,
    });
    if (error) throw error;
    $("card-modal").style.display = "none";
    await loadDeck();
  } catch (err) {
    $("modal-error").textContent = "Eroare: " + err.message;
  } finally {
    $("modal-save-btn").disabled = false;
    $("modal-save-btn").textContent = "Salvează";
  }
});

// ---------- BULK UPLOAD ----------
let bulkPairs = []; // { key, order, title, frontFile, backFile }

$("bulk-upload-btn").addEventListener("click", () => {
  bulkPairs = [];
  $("bulk-file-input").value = "";
  $("bulk-preview").innerHTML = "";
  $("bulk-error").textContent = "";
  $("bulk-progress").textContent = "";
  $("bulk-save-btn").disabled = true;
  $("bulk-modal").style.display = "flex";
});
$("bulk-cancel-btn").addEventListener("click", () => ($("bulk-modal").style.display = "none"));

function titleFromSlug(slug) {
  const clean = slug.replace(/^\d+-/, "").replace(/-/g, " ").trim();
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

$("bulk-file-input").addEventListener("change", () => {
  const files = Array.from($("bulk-file-input").files);
  const groups = {}; // key (fara -fata/-verso si extensie) -> {front, back, order}

  files.forEach((file) => {
    const name = file.name.replace(/\.[^.]+$/, ""); // fara extensie
    const m = name.match(/^(.*)-(fata|verso|front|back)$/i);
    if (!m) return; // fisier care nu respecta formatul, il ignoram
    const key = m[1];
    const side = m[2].toLowerCase();
    if (!groups[key]) {
      const orderMatch = key.match(/^(\d+)/);
      groups[key] = { key, order: orderMatch ? parseInt(orderMatch[1], 10) : 999, title: titleFromSlug(key) };
    }
    if (side === "fata" || side === "front") groups[key].frontFile = file;
    else groups[key].backFile = file;
  });

  bulkPairs = Object.values(groups).sort((a, b) => a.order - b.order);
  renderBulkPreview();
});

function renderBulkPreview() {
  const box = $("bulk-preview");
  box.innerHTML = "";
  if (bulkPairs.length === 0) {
    box.innerHTML = `<p style="font-size:13px; color:var(--grey);">Niciun fișier recunoscut. Verifică denumirile (ex: 01-titlu-fata.jpg).</p>`;
    $("bulk-save-btn").disabled = true;
    return;
  }
  let allComplete = true;
  bulkPairs.forEach((p) => {
    const complete = !!p.frontFile && !!p.backFile;
    if (!complete) allComplete = false;
    const row = document.createElement("div");
    row.className = "bulk-pair-row" + (complete ? "" : " incomplete");
    row.innerHTML = `
      <img src="${p.frontFile ? URL.createObjectURL(p.frontFile) : ""}" />
      <img src="${p.backFile ? URL.createObjectURL(p.backFile) : ""}" />
      <input data-key="${p.key}" value="${escapeHtml(p.title)}" />
      ${complete ? "" : `<span class="pair-warning">lipsește ${p.frontFile ? "verso" : "față"}</span>`}
    `;
    row.querySelector("input").addEventListener("input", (e) => {
      p.title = e.target.value;
    });
    box.appendChild(row);
  });
  $("bulk-save-btn").disabled = !allComplete;
  $("bulk-error").textContent = allComplete ? "" : "Completează perechile lipsă sau elimină fișierele orfane înainte de a încărca.";
}

$("bulk-save-btn").addEventListener("click", async () => {
  $("bulk-save-btn").disabled = true;
  $("bulk-error").textContent = "";
  let done = 0;
  try {
    for (const p of bulkPairs) {
      $("bulk-progress").textContent = `Se încarcă ${done + 1}/${bulkPairs.length}: ${p.title}...`;
      const frontUrl = await uploadImage(p.frontFile);
      const backUrl = await uploadImage(p.backFile);
      const { error } = await supabase.from("cards").insert({
        title: p.title,
        front_image_url: frontUrl,
        back_image_url: backUrl,
        initial_face: "front",
        flippable_default: true,
        explanation: "",
        game_id: GAME_ID,
        order_index: p.order,
      });
      if (error) throw error;
      done++;
    }
    $("bulk-progress").textContent = `Gata! ${done} carduri încărcate.`;
    await loadDeck();
    setTimeout(() => ($("bulk-modal").style.display = "none"), 1200);
  } catch (err) {
    $("bulk-error").textContent = `Eroare la cardul ${done + 1}: ${err.message}`;
    $("bulk-save-btn").disabled = false;
  }
});

// ---------- SESSION ----------
function randomCode(len = 6) {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

async function loadActiveSession() {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("training_sessions")
    .select("*")
    .eq("admin_email", user.email)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) {
    console.error(error);
    return;
  }
  currentSession = (data && data[0]) || null;
  renderSessionPanel();
}

$("create-session-btn").addEventListener("click", async () => {
  const { data: { user } } = await supabase.auth.getUser();
  const code = randomCode();
  const { data, error } = await supabase
    .from("training_sessions")
    .insert({ session_code: code, game_id: GAME_ID, admin_email: user.email, status: "active" })
    .select()
    .single();
  if (error) {
    alert("Eroare la crearea sesiunii: " + error.message);
    return;
  }
  currentSession = data;
  renderSessionPanel();
});

$("end-session-btn").addEventListener("click", async () => {
  if (!currentSession) return;
  if (!confirm("Închei sesiunea curentă?")) return;
  await supabase.from("training_sessions").update({ status: "ended" }).eq("id", currentSession.id);
  currentSession = null;
  renderSessionPanel();
});

$("copy-link-btn").addEventListener("click", () => {
  navigator.clipboard.writeText($("session-link-text").textContent);
  $("copy-link-btn").textContent = "Copiat!";
  setTimeout(() => ($("copy-link-btn").textContent = "Copiază"), 1500);
});

function sessionLink(code) {
  // link-ul catre pagina cursantului (index.html), relativ la locatia curenta
  const base = location.href.replace(/admin\.html.*$/, "index.html");
  return `${base}?s=${code}`;
}

function renderSessionPanel() {
  if (currentSession) {
    $("no-session-box").style.display = "none";
    $("active-session-box").style.display = "block";
    $("control-panel").style.display = "block";
    $("session-code-badge").textContent = currentSession.session_code;
    const link = sessionLink(currentSession.session_code);
    $("session-link-text").textContent = link;
    QRCode.toCanvas($("qr-canvas"), link, { width: 180 });
    renderControlGrid();
  } else {
    $("no-session-box").style.display = "block";
    $("active-session-box").style.display = "none";
    $("control-panel").style.display = "none";
  }
}

async function renderControlGrid() {
  if (!currentSession) return;
  const grid = $("control-grid");
  grid.innerHTML = "";

  const { data: stateRows } = await supabase
    .from("session_card_state")
    .select("*")
    .eq("session_id", currentSession.id);
  const stateMap = {};
  (stateRows || []).forEach((r) => (stateMap[r.card_id] = r.is_flippable));

  deckCards.forEach((c) => {
    const isHighlighted = currentSession.highlighted_card_id === c.id;
    const isFlippable = !!stateMap[c.id];
    const tile = document.createElement("div");
    tile.className = "card-tile" + (isHighlighted ? " highlighted" : "");
    tile.innerHTML = `
      <img src="${c.front_image_url}" alt="${escapeHtml(c.title)}" />
      <div class="tile-label">${escapeHtml(c.title)}</div>
      <div class="tile-controls">
        <button class="toggle-flip ${isFlippable ? "active" : ""}" data-toggle="${c.id}">
          ${isFlippable ? "Flip activat" : "Permite răsturnarea"}
        </button>
      </div>
    `;
    tile.querySelector("img").addEventListener("click", () => highlightCard(c.id));
    tile.querySelector(".tile-label").addEventListener("click", () => highlightCard(c.id));
    tile.querySelector("[data-toggle]").addEventListener("click", async (e) => {
      e.stopPropagation();
      await supabase.from("session_card_state").upsert({
        session_id: currentSession.id,
        card_id: c.id,
        is_flippable: !isFlippable,
      });
      renderControlGrid();
    });
    grid.appendChild(tile);
  });
}

async function highlightCard(cardId) {
  await supabase.from("training_sessions").update({ highlighted_card_id: cardId }).eq("id", currentSession.id);
  currentSession.highlighted_card_id = cardId;
  renderControlGrid();
}

checkAuth();
