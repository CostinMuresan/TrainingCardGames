import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_ANON_KEY, GAME_ID } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const $ = (id) => document.getElementById(id);

let currentSession = null; // sesiunea activa curenta a trainerului
let deckCards = [];
let controlPreviewBack = {}; // card_id -> bool, doar local pentru trainer (nu afecteaza cursantii)
let selectedCardIds = new Set(); // pentru stergere in bulk
let editingCard = null; // cardul editat curent (null = card nou)

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

[$("login-email"), $("login-password")].forEach((input) => {
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") $("login-btn").click();
  });
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
  $("deck-bulk-bar").style.display = !currentSession && deckCards.length > 0 ? "flex" : "none";
  if (deckCards.length === 0) {
    grid.innerHTML = `<p style="color:var(--grey); font-size:14px;">Niciun card încă. Adaugă primul card.</p>`;
    return;
  }
  const locked = !!currentSession;
  deckCards.forEach((c) => {
    const tile = document.createElement("div");
    tile.className = "card-tile";
    tile.innerHTML = `
      ${locked ? "" : `<div style="padding:8px 8px 0; text-align:left;"><input type="checkbox" data-select="${c.id}" style="width:auto;" ${selectedCardIds.has(c.id) ? "checked" : ""} /></div>`}
      <img src="${c.front_image_url}" alt="față" />
      <div class="tile-label">${escapeHtml(c.title)}</div>
      <div class="tile-controls">
        <button class="toggle-flip show-back-btn">Vezi verso</button>
        ${locked ? "" : `<button class="toggle-flip" data-edit="${c.id}">Editează</button>`}
        ${locked ? "" : `<button class="toggle-flip" style="border-color:var(--red); color:var(--red);" data-delete="${c.id}">Șterge</button>`}
      </div>
    `;
    const img = tile.querySelector("img");
    let showingBack = false;
    img.addEventListener("click", () => openLightbox(img.src));
    tile.querySelector(".show-back-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      showingBack = !showingBack;
      img.src = showingBack ? c.back_image_url : c.front_image_url;
      e.target.textContent = showingBack ? "Vezi față" : "Vezi verso";
    });
    if (!locked) {
      tile.querySelector("[data-select]").addEventListener("change", (e) => {
        if (e.target.checked) selectedCardIds.add(c.id);
        else selectedCardIds.delete(c.id);
        updateBulkBar();
      });
      tile.querySelector("[data-edit]").addEventListener("click", (e) => {
        e.stopPropagation();
        openCardModal(c);
      });
      tile.querySelector("[data-delete]").addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!confirm(`Ștergi cardul „${c.title}”?`)) return;
        await supabase.from("cards").delete().eq("id", c.id);
        selectedCardIds.delete(c.id);
        await loadDeck();
      });
    }
    grid.appendChild(tile);
  });
  updateBulkBar();
}

function updateBulkBar() {
  $("selected-count").textContent = selectedCardIds.size;
  $("bulk-delete-btn").disabled = selectedCardIds.size === 0;
  $("select-all-btn").textContent = selectedCardIds.size === deckCards.length && deckCards.length > 0 ? "Deselectează tot" : "Selectează tot";
}

$("select-all-btn").addEventListener("click", () => {
  const allSelected = selectedCardIds.size === deckCards.length;
  selectedCardIds.clear();
  if (!allSelected) deckCards.forEach((c) => selectedCardIds.add(c.id));
  renderDeck();
});

$("bulk-delete-btn").addEventListener("click", async () => {
  if (selectedCardIds.size === 0) return;
  if (!confirm(`Ștergi definitiv ${selectedCardIds.size} carduri selectate?`)) return;
  $("bulk-delete-btn").disabled = true;
  $("bulk-delete-btn").textContent = "Se șterge...";
  await supabase.from("cards").delete().in("id", Array.from(selectedCardIds));
  selectedCardIds.clear();
  await loadDeck();
  $("bulk-delete-btn").textContent = `Șterge selectate (0)`;
});

function syncDeckLockUI() {
  const locked = !!currentSession;
  $("deck-edit-actions").style.display = locked ? "none" : "flex";
  $("deck-locked-note").style.display = locked ? "block" : "none";
  renderDeck();
}

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str || "";
  return d.innerHTML;
}

function openLightbox(src) {
  $("lightbox-img").src = src;
  $("lightbox").style.display = "flex";
}
$("lightbox").addEventListener("click", () => ($("lightbox").style.display = "none"));

// ---------- ADD / EDIT CARD MODAL ----------
$("add-card-btn").addEventListener("click", () => openCardModal(null));

function openCardModal(card) {
  editingCard = card;
  $("modal-title").textContent = card ? `Editează: ${card.title}` : "Card nou";
  $("f-title").value = card ? card.title : "";
  $("f-explanation").value = card ? (card.explanation || "") : "";
  $("f-initial-face").value = card ? card.initial_face : "front";
  $("f-flippable").checked = card ? card.flippable_default : true;
  $("f-front-file").value = "";
  $("f-back-file").value = "";
  $("label-front").textContent = card ? "Imagine față (lasă gol pentru a păstra actuala)" : "Imagine față";
  $("label-back").textContent = card ? "Imagine verso (lasă gol pentru a păstra actuala)" : "Imagine verso";
  if (card) {
    $("f-front-preview").src = card.front_image_url;
    $("f-front-preview").style.display = "block";
    $("f-back-preview").src = card.back_image_url;
    $("f-back-preview").style.display = "block";
  } else {
    $("f-front-preview").style.display = "none";
    $("f-back-preview").style.display = "none";
  }
  $("modal-error").textContent = "";
  $("modal-save-btn").textContent = "Salvează";
  $("card-modal").style.display = "flex";
}
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

  if (!title || (!editingCard && (!frontFile || !backFile))) {
    $("modal-error").textContent = "Titlul este obligatoriu" + (editingCard ? "." : ", iar la un card nou, ambele imagini (față + verso) sunt obligatorii.");
    return;
  }

  $("modal-save-btn").disabled = true;
  $("modal-save-btn").textContent = "Se salvează...";
  try {
    const frontUrl = frontFile ? await uploadImage(frontFile) : editingCard.front_image_url;
    const backUrl = backFile ? await uploadImage(backFile) : editingCard.back_image_url;
    const payload = {
      title,
      front_image_url: frontUrl,
      back_image_url: backUrl,
      initial_face: $("f-initial-face").value,
      flippable_default: $("f-flippable").checked,
      explanation: $("f-explanation").value.trim(),
    };
    let error;
    if (editingCard) {
      ({ error } = await supabase.from("cards").update(payload).eq("id", editingCard.id));
    } else {
      ({ error } = await supabase.from("cards").insert({ ...payload, game_id: GAME_ID, order_index: deckCards.length }));
    }
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
  syncDeckLockUI();
  if (currentSession) {
    $("no-session-box").style.display = "none";
    $("active-session-box").style.display = "block";
    $("control-panel").style.display = "block";
    $("session-code-badge").textContent = currentSession.session_code;
    const link = sessionLink(currentSession.session_code);
    $("session-link-text").textContent = link;
    $("qr-canvas").src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(link)}`;
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
    const previewBack = !!controlPreviewBack[c.id];
    const tile = document.createElement("div");
    tile.className = "card-tile" + (isHighlighted ? " highlighted" : "");
    tile.innerHTML = `
      <img src="${previewBack ? c.back_image_url : c.front_image_url}" alt="${escapeHtml(c.title)}" />
      <div class="tile-label">${escapeHtml(c.title)}</div>
      <div class="tile-controls">
        <button class="toggle-flip" data-preview>${previewBack ? "Vezi față" : "Vezi verso"}</button>
        <button class="toggle-flip" data-zoom>🔍</button>
        <button class="toggle-flip ${isFlippable ? "active" : ""}" data-toggle="${c.id}">
          ${isFlippable ? "Flip activat" : "Permite răsturnarea"}
        </button>
      </div>
    `;
    tile.querySelector("img").addEventListener("click", () => highlightCard(c.id));
    tile.querySelector(".tile-label").addEventListener("click", () => highlightCard(c.id));
    tile.querySelector("[data-preview]").addEventListener("click", (e) => {
      e.stopPropagation();
      controlPreviewBack[c.id] = !previewBack;
      renderControlGrid();
    });
    tile.querySelector("[data-zoom]").addEventListener("click", (e) => {
      e.stopPropagation();
      openLightbox(previewBack ? c.back_image_url : c.front_image_url);
    });
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

async function setAllFlippable(value) {
  if (!currentSession || deckCards.length === 0) return;
  const btn = value ? $("flip-all-on-btn") : $("flip-all-off-btn");
  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = "Se aplică...";
  const rows = deckCards.map((c) => ({ session_id: currentSession.id, card_id: c.id, is_flippable: value }));
  await supabase.from("session_card_state").upsert(rows);
  await renderControlGrid();
  btn.disabled = false;
  btn.textContent = original;
}
$("flip-all-on-btn").addEventListener("click", () => setAllFlippable(true));
$("flip-all-off-btn").addEventListener("click", () => setAllFlippable(false));

checkAuth();
