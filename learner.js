import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const $ = (id) => document.getElementById(id);

const params = new URLSearchParams(location.search);
const sessionCode = params.get("s");

let session = null;
let cards = [];
let flippableMap = {};   // card_id -> bool, sincronizat de la trainer
let flippedLocal = {};   // card_id -> bool, doar local, la acest user

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str || "";
  return d.innerHTML;
}

async function init() {
  if (!sessionCode) {
    $("status-box").innerHTML = `<div class="empty-state">Link invalid. Cere trainerului link-ul sesiunii.</div>`;
    return;
  }

  const { data: sessionData, error: sessionErr } = await supabase
    .from("training_sessions")
    .select("*")
    .eq("session_code", sessionCode)
    .eq("status", "active")
    .maybeSingle();

  if (sessionErr || !sessionData) {
    $("status-box").innerHTML = `<div class="empty-state">Sesiunea nu există sau s-a încheiat. Cere trainerului un link nou.</div>`;
    return;
  }
  session = sessionData;

  const { data: cardData } = await supabase
    .from("cards")
    .select("*")
    .eq("game_id", session.game_id)
    .order("order_index", { ascending: true });
  cards = cardData || [];

  const { data: stateData } = await supabase
    .from("session_card_state")
    .select("*")
    .eq("session_id", session.id);
  (stateData || []).forEach((r) => (flippableMap[r.card_id] = r.is_flippable));

  render();
  subscribeRealtime();
}

function render() {
  const grid = $("learner-grid");
  grid.innerHTML = "";
  if (cards.length === 0) {
    grid.innerHTML = `<div class="empty-state">Trainerul nu a adăugat încă niciun card.</div>`;
    return;
  }

  cards.forEach((c) => {
    const isHighlighted = session.highlighted_card_id === c.id;
    const canFlip = !!flippableMap[c.id];
    const isFlipped = !!flippedLocal[c.id];

    const wrap = document.createElement("div");

    const flip = document.createElement("div");
    flip.className = "flip-card" + (isHighlighted ? " is-highlighted" : "") + (canFlip ? " can-flip" : "") + (isFlipped ? " flipped" : "");
    flip.innerHTML = `
      <div class="flip-card-inner">
        <div class="flip-face front"><img src="${c.initial_face === "back" ? c.back_image_url : c.front_image_url}" /></div>
        <div class="flip-face back"><img src="${c.initial_face === "back" ? c.front_image_url : c.back_image_url}" /></div>
      </div>
    `;
    if (canFlip) {
      flip.addEventListener("click", () => {
        flippedLocal[c.id] = !flippedLocal[c.id];
        render();
      });
    }

    const label = document.createElement("div");
    label.className = "card-title";
    label.textContent = c.title;

    wrap.appendChild(flip);
    wrap.appendChild(label);

    if (isFlipped && c.explanation) {
      const exp = document.createElement("div");
      exp.style.fontSize = "12px";
      exp.style.color = "var(--grey)";
      exp.style.marginTop = "6px";
      exp.style.textAlign = "center";
      exp.textContent = c.explanation;
      wrap.appendChild(exp);
    }

    grid.appendChild(wrap);
  });
}

function subscribeRealtime() {
  supabase
    .channel(`session-${session.id}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "training_sessions", filter: `id=eq.${session.id}` },
      (payload) => {
        session = { ...session, ...payload.new };
        render();
      }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "session_card_state", filter: `session_id=eq.${session.id}` },
      (payload) => {
        flippableMap[payload.new.card_id] = payload.new.is_flippable;
        render();
      }
    )
    .subscribe();
}

init();
