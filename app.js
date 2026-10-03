
const SUPABASE_URL = "https://fjgshtktadaddwmshugw.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqZ3NodGt0YWRhZGR3bXNodWd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkzNzEzODQsImV4cCI6MjEwNDk0NzM4NH0.fMUzZ2chICrxSvRVdwrEb9TseFY532kC2KtsvV_zpGM";

const { createClient } = supabase;
const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* -----------------------------
   INYEON MOMENT MODAL (after posting)
----------------------------- */

const inyeonOverlay = document.getElementById("inyeonMomentOverlay");
const holdSpaceBtn = document.getElementById("holdSpaceBtn");
const maybeLaterBtn = document.getElementById("maybeLaterBtn");
const closeInyeonMoment = document.getElementById("closeInyeonMoment");

function openInyeonMoment() {
  if (!inyeonOverlay) return;
  inyeonOverlay.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function closeInyeonMomentModal() {
  if (!inyeonOverlay) return;
  inyeonOverlay.classList.add("hidden");
  document.body.style.overflow = "";
}

closeInyeonMoment?.addEventListener("click", closeInyeonMomentModal);
maybeLaterBtn?.addEventListener("click", closeInyeonMomentModal);

/* Updated: Hold space now goes to category select */

holdSpaceBtn?.addEventListener("click", () => {
  window.location.href = "category-select.html";
});

inyeonOverlay?.addEventListener("click", (e) => {
  if (e.target === inyeonOverlay) closeInyeonMomentModal();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeInyeonMomentModal();
});

/* -----------------------------
   MENU
----------------------------- */

document.getElementById("menuBtn").addEventListener("click", () => {
  document.getElementById("menuDropdown").classList.toggle("hidden");
});

document.getElementById("menuSignOut").addEventListener("click", async (e) => {
  e.preventDefault();
  await client.auth.signOut();
  window.location.href = "auth.html";
});

/* -----------------------------
   AUTH
----------------------------- */

let currentUser = null;
let currentProfile = null;

async function requireAuth() {
  const { data: { session } } = await client.auth.getSession();

  if (!session) {
    if (!window.location.pathname.includes("auth.html")) {
      window.location.href = "auth.html";
    }
    return false;
  }

  currentUser = session.user;

  const { data: profile, error } = await client
    .from("profiles")
    .select("*")
    .eq("id", session.user.id)
    .maybeSingle();

  if (error) {
    console.error(error);
    return false;
  }

  if (!profile) {
    console.error("Profile not found.");
    return false;
  }

  currentProfile = profile;
  return true;
}

/* -----------------------------
   CRISIS DETECTION
----------------------------- */

function detectCrisis(text) {
  const lower = text.toLowerCase();

  return [
    "kill myself","end my life","suicide","want to die",
    "don't want to live","no reason to live","better off dead",
    "hurt myself","self harm","cutting myself","ending it all",
    "can't go on","not worth living"
  ].some(k => lower.includes(k));
}

async function hasReachedDailyLimit(userId, maxPosts = 5) {
  const startOfDay = new Date();
  startOfDay.setHours(0,0,0,0);

  const { count } = await client
    .from("posts")
    .select("id",{count:"exact",head:true})
    .eq("anon_id",userId)
    .gte("created_at",startOfDay.toISOString());

  return count >= maxPosts;
}

/* -----------------------------
   UI
----------------------------- */

const choiceStep = document.getElementById("choiceStep");
const postStep = document.getElementById("postStep");
const greeting = document.getElementById("greeting");
const submitBtn = document.getElementById("submitBtn");
const postText = document.getElementById("postText");
const confirmation = document.getElementById("confirmation");

const crisisPostWarning = document.getElementById("crisisPostWarning");
const crisisGoBackBtn = document.getElementById("crisisGoBackBtn");
const crisisContinueBtn = document.getElementById("crisisContinueBtn");
const crisisContext = document.getElementById("crisisContext");

let pendingCrisisPostText = null;
let pendingCrisisContext = "";

const charCount = document.getElementById("charCount");

const momentSuggestion = document.getElementById("momentSuggestion");
const momentLabel = document.getElementById("momentLabel");
const momentActions = document.getElementById("momentActions");
const momentPicker = document.getElementById("momentPicker");

const momentChange = document.getElementById("momentChange");

const pickHeavier = document.getElementById("pickHeavier");
const pickLighter = document.getElementById("pickLighter");

let selectedMomentType = "support";
let typingTimer = null;

const ghostRewriteBtn = document.getElementById("ghostRewriteBtn");
const ghostRewriteModal = document.getElementById("ghostRewriteModal");

const ghostLoading = document.getElementById("ghostLoading");
const ghostResult = document.getElementById("ghostResult");
const ghostActions = document.getElementById("ghostActions");

const ghostUse = document.getElementById("ghostUse");
const ghostKeep = document.getElementById("ghostKeep");
const ghostClose = document.getElementById("ghostClose");

const draftCard = document.getElementById("draftCard");
const draftPreview = document.getElementById("draftPreview");
const draftTime = document.getElementById("draftTime");

let rewrittenText = "";

function animateMomentLabel() {
  momentLabel.getAnimations().forEach(animation => animation.cancel());

  momentLabel.animate(
    [
      { opacity: 0.7, transform: "scale(0.96)" },
      { opacity: 1, transform: "scale(1)" }
    ],
    {
      duration: 180,
      easing: "ease-out",
      fill: "both"
    }
  );
}

const draftToast = document.getElementById("draftToast");
let draftToastTimer = null;

let hasShownDraftToast = false;

function showDraftToast() {
  if (hasShownDraftToast) return;

  hasShownDraftToast = true;
  draftToast.classList.remove("hidden");

  clearTimeout(draftToastTimer);

  draftToastTimer = setTimeout(() => {
    draftToast.classList.add("hidden");
  }, 1500);
}

function formatDraftTime(timestamp) {
  const diff = Math.floor((Date.now() - timestamp) / 1000);

  if (diff < 60) return "Saved just now";
  if (diff < 3600) return `Saved ${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `Saved ${Math.floor(diff / 3600)} hr ago`;
  return `Saved ${Math.floor(diff / 86400)} day${Math.floor(diff / 86400) > 1 ? "s" : ""} ago`;
}

function updateDraftCard() {
  if (!draftCard || !draftPreview || !draftTime) return;

  const saved = localStorage.getItem("inyeon_draft");

  if (!saved) {
    draftCard.classList.add("hidden");
    return;
  }

const { text, timestamp } = JSON.parse(saved);

draftPreview.textContent =
  text.length > 65 ? text.slice(0, 65) + "…" : text;

draftTime.textContent = formatDraftTime(timestamp);

draftCard.classList.remove("hidden");
}

draftCard?.addEventListener("click", () => {
  const saved = localStorage.getItem("inyeon_draft");

  if (!saved) return;

  const draft = JSON.parse(saved);

  postText.value = draft.text;

// Update UI without triggering autosave
const used = draft.text.length;
charCount.textContent = `${used}/500`;
charCount.classList.toggle("char-count-warning", used >= 450);

classifyMoment(draft.text);

draftCard.classList.add("hidden");

setTimeout(() => postText.focus(), 150);
});

const discardDraftBtn = document.getElementById("discardDraftBtn");

discardDraftBtn?.addEventListener("click", (e) => {
  e.stopPropagation();

  localStorage.removeItem("inyeon_draft");
  hasShownDraftToast = false;
  draftCard.classList.add("hidden");
});

postText.addEventListener("input", () => {

  const used = postText.value.length;
  charCount.textContent = `${used}/500`;
  charCount.classList.toggle("char-count-warning", used >= 450);

  clearTimeout(typingTimer);

  const text = postText.value.trim();

  if (!text) {
  momentSuggestion.classList.add("hidden");
  ghostRewriteBtn.classList.add("hidden");

  localStorage.removeItem("inyeon_draft");
  updateDraftCard();

  return;
}

  typingTimer = setTimeout(() => {
  classifyMoment(text);

const existingDraft = localStorage.getItem("inyeon_draft");

let existingTimestamp = Date.now();

if (existingDraft) {
  try {
    const parsed = JSON.parse(existingDraft);
    existingTimestamp = parsed.timestamp || Date.now();
  } catch {
    // Old draft format (plain text) — ignore and use a fresh timestamp.
    existingTimestamp = Date.now();
  }
}

localStorage.setItem(
  "inyeon_draft",
  JSON.stringify({
    text: postText.value,
    timestamp: existingTimestamp,
    restored: false
  })
);

  if (postText.value.trim()) {
    showDraftToast();
  }
}, 800);

});

async function classifyMoment(text) {

const cleanText = text.trim();
const wordCount = cleanText.split(/\s+/).filter(Boolean).length;

if (cleanText.length < 8 && wordCount < 2) {
  momentSuggestion.classList.add("hidden");
  ghostRewriteBtn.classList.add("hidden");
  return;
}

  try {

    const response = await fetch(
      "https://inyeon-ghost-rewrite.madgavkarsaumil.workers.dev",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          text,
          task: "classify"
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Moment classifier failed", data);
      return;
    }

    selectedMomentType =
      data.category === "celebrate"
        ? "celebrate"
        : "support";

    momentLabel.textContent =
  selectedMomentType === "support"
    ? "Heavier moment"
    : "Lighter moment";

if (selectedMomentType === "support") {
  momentLabel.style.backgroundColor = "#4F7DF3";
  momentLabel.style.color = "#FFFFFF";
} else {
  momentLabel.style.backgroundColor = "#6F8E79";
  momentLabel.style.color = "#FFFFFF";
}

animateMomentLabel();

    momentSuggestion.classList.remove("hidden");
    ghostRewriteBtn.classList.remove("hidden");

    momentActions.classList.remove("hidden");
    momentPicker.classList.add("hidden");

    pickHeavier.classList.toggle(
      "active",
      selectedMomentType === "support"
    );

    pickLighter.classList.toggle(
      "active",
      selectedMomentType === "celebrate"
    );

  } catch (err) {
    console.error("Moment classifier error:", err);
  }
}

momentChange.addEventListener("click", () => {
  momentActions.classList.add("hidden");
  momentPicker.classList.remove("hidden");
});

pickHeavier.addEventListener("click", () => {

  selectedMomentType = "support";
  momentLabel.textContent = "Heavier moment";

  momentLabel.style.backgroundColor = "#4F7DF3";
momentLabel.style.color = "#FFFFFF";

animateMomentLabel();

  pickHeavier.classList.add("active");
  pickLighter.classList.remove("active");

  momentPicker.classList.add("hidden");
momentActions.classList.remove("hidden");

});

pickLighter.addEventListener("click", () => {

  selectedMomentType = "celebrate";
  momentLabel.textContent = "Lighter moment";

  momentLabel.style.backgroundColor = "#6F8E79";
momentLabel.style.color = "#FFFFFF";

animateMomentLabel();

  pickLighter.classList.add("active");
  pickHeavier.classList.remove("active");

  momentPicker.classList.add("hidden");
  momentActions.classList.remove("hidden");

});

function openGhostModal() {
  ghostRewriteModal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function closeGhostModal() {
  ghostRewriteModal.classList.add("hidden");
  document.body.style.overflow = "";
}

ghostClose.addEventListener("click", closeGhostModal);
ghostKeep.addEventListener("click", closeGhostModal);

ghostRewriteModal.addEventListener("click", (e) => {
  if (e.target === ghostRewriteModal) closeGhostModal();
});

ghostRewriteBtn.addEventListener("click", async () => {

  openGhostModal();

  ghostLoading.classList.remove("hidden");
  ghostResult.classList.add("hidden");
  ghostActions.classList.add("hidden");

  const response = await fetch(
  "https://inyeon-ghost-rewrite.madgavkarsaumil.workers.dev",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      text: postText.value.trim()
    })
  }
);

const data = await response.json();

ghostLoading.classList.add("hidden");

if (!response.ok) {
  console.error("Ghost Rewrite Status:", response.status);
  console.error("Ghost Rewrite Response:", data);
  console.error("Cloudflare Error:", data.errors?.[0]);
  alert(data.errors?.[0]?.message || "Ghost rewrite failed.");
  return;
}

  rewrittenText = data.rewritten || postText.value.trim();

  ghostResult.textContent = rewrittenText;
  ghostResult.classList.remove("hidden");
  ghostActions.classList.remove("hidden");

});

ghostUse.addEventListener("click", () => {

  postText.value = rewrittenText;

  postText.dispatchEvent(new Event("input"));

  closeGhostModal();

});

/* Share flow */

document.getElementById("shareChoiceBtn").addEventListener("click", () => {

  // Don't create duplicate history entries
  if (window.location.hash !== "#compose") {
    history.pushState({ screen: "compose" }, "", "#compose");
  }

  choiceStep.classList.add("hidden");
postStep.classList.remove("hidden");
document.getElementById("bottomNav").classList.remove("hidden");

// Start with a clean composer
postText.value = "";
charCount.textContent = "0/500";
momentSuggestion.classList.add("hidden");
ghostRewriteBtn.classList.add("hidden");

updateDraftCard();

});

/* -----------------------------
   NEW SUPPORT FLOW
----------------------------- */

const supportChoiceBtn = document.getElementById("supportChoiceBtn");
const supportMomentOverlay = document.getElementById("supportMomentOverlay");

supportChoiceBtn?.addEventListener("click", (e) => {

  e.preventDefault();

  supportMomentOverlay.classList.add("show");

  setTimeout(() => {

    window.location.href = "category-select.html";

  }, 700);

});

/* -----------------------------
   Browser Back Support
----------------------------- */

window.addEventListener("popstate", (e) => {

  if (window.location.hash === "#compose") {

  choiceStep.classList.add("hidden");
postStep.classList.remove("hidden");
document.getElementById("bottomNav").classList.remove("hidden");

postText.value = "";
charCount.textContent = "0/500";
momentSuggestion.classList.add("hidden");
ghostRewriteBtn.classList.add("hidden");

updateDraftCard();

} else {

  choiceStep.classList.remove("hidden");
  postStep.classList.add("hidden");
  document.getElementById("bottomNav").classList.add("hidden");

}

});

/* -----------------------------
   MESSAGES
----------------------------- */

function showCrisisResponse() {
  confirmation.innerHTML = `
    <div class="crisis-message">
      <p><strong>We've heard you.</strong></p>

      <p>
        Your post has been received, but we're keeping it private for now
        so we can make sure you're supported.
      </p>

      <p>
        Take a breath. You don't have to figure everything out right now.
      </p>

      <p>
        <strong>iCall:</strong>
        <a href="tel:+919152987821">+91 9152987821</a>
      </p>

      <p>
        <strong>Vandrevala Foundation:</strong>
        <a href="tel:+919999666555">+91 9999 666 555</a>
      </p>

      <p class="crisis-soft">
        You don't have to carry this alone.
      </p>
    </div>`;

  confirmation.classList.remove("hidden");
}

function showLimitReachedMessage() {
  confirmation.innerHTML = `
    <div class="crisis-message">
      <p>You've shared a lot today — we're glad you're here.</p>
      <p>Come back tomorrow, or if you need support now:</p>
      <p><strong>iCall</strong>: <a href="tel:+919152987821">+91 9152987821</a></p>
      <p><strong>Vandrevala Foundation</strong>: <a href="tel:+919999666555">+91 9999 666 555</a></p>
    </div>`;
  confirmation.classList.remove("hidden");
}

/* -----------------------------
   POST
----------------------------- */

submitBtn.addEventListener("click", async () => {

  const text = postText.value.trim();
  if (!text) return;

  submitBtn.disabled = true;
  submitBtn.textContent = "Posting...";

  const limitReached = await hasReachedDailyLimit(currentUser.id);

  if (limitReached) {
    showLimitReachedMessage();
    submitBtn.disabled = false;
    submitBtn.textContent = "Post";
    return;
  }

  const isCrisis = detectCrisis(text);

  if (isCrisis) {
  pendingCrisisPostText = text;

  crisisPostWarning?.classList.remove("hidden");

  submitBtn.disabled = false;
  submitBtn.textContent = "Post";

  return;
}

  const { error } = await client
  .from("posts")
  .insert({
    content: text,
    anon_id: currentUser.id,
    moment_type: selectedMomentType,
    status: "active"
  });

console.log("POST INSERT:", { error });

  submitBtn.disabled = false;
  submitBtn.textContent = "Post";

  if (error) {
    console.error(error);
    alert("Something went wrong. Try again.");
    return;
  }

  postText.value = "";
  charCount.textContent = "0/500";
  localStorage.removeItem("inyeon_draft");

  hasShownDraftToast = false;

  updateDraftCard();

  momentLabel.style.backgroundColor = "#4F7DF3";
momentLabel.style.color = "#FFFFFF";

momentSuggestion.classList.add("hidden");

momentActions.classList.remove("hidden");
momentPicker.classList.add("hidden");

ghostRewriteBtn.classList.add("hidden");

  if (isCrisis) {
    showCrisisResponse();
    return;
  }

  confirmation.classList.add("hidden");

  setTimeout(() => {
    openInyeonMoment();
  }, 250);

});

crisisGoBackBtn?.addEventListener("click", () => {

  crisisPostWarning?.classList.add("hidden");

  pendingCrisisPostText = null;
  pendingCrisisContext = "";

  if (crisisContext) {
    crisisContext.value = "";
  }

  postText.focus();

});


crisisContinueBtn?.addEventListener("click", async () => {

  if (!pendingCrisisPostText) return;

  const text = pendingCrisisPostText;
  const context = crisisContext?.value.trim() || "";
  
  pendingCrisisContext = context;

  crisisContinueBtn.disabled = true;
  crisisContinueBtn.textContent = "Posting...";

  // Get the authenticated user directly from Supabase
  const {
    data: { session },
    error: sessionError
  } = await client.auth.getSession();

  if (sessionError || !session?.user) {

    console.error("Authentication error:", sessionError);

    alert("Your session has expired. Please sign in again.");

    crisisContinueBtn.disabled = false;
    crisisContinueBtn.textContent = "Continue posting";

    return;
  }

  console.log("CRISIS AUTH USER:", session.user.id);

  const { error } = await client
  .from("posts")
  .insert({
    content: text,
    anon_id: session.user.id,
    moment_type: selectedMomentType,
    status: "flagged",
    moderation_context: context || null
  });

  console.log("CRISIS POST INSERT:", { error });

  if (error) {

    console.error(error);

    alert("Something went wrong. Try again.");

    crisisContinueBtn.disabled = false;
    crisisContinueBtn.textContent = "Continue posting";

    return;
  }

  crisisPostWarning?.classList.add("hidden");

  pendingCrisisPostText = null;

  crisisContinueBtn.disabled = false;
  crisisContinueBtn.textContent = "Continue posting";

  postText.value = "";
  charCount.textContent = "0/500";

  localStorage.removeItem("inyeon_draft");

  hasShownDraftToast = false;

  updateDraftCard();

  momentSuggestion.classList.add("hidden");
  ghostRewriteBtn.classList.add("hidden");

  showCrisisResponse();

});

/* -----------------------------
   INIT
----------------------------- */

async function init() {

  const authed = await requireAuth();
  if (!authed) return;

  greeting.textContent = `Hi, ${currentProfile.alias}!`;

  if (window.location.hash === "#compose") {

    history.replaceState({ screen: "compose" }, "", "#compose");

    choiceStep.classList.add("hidden");
postStep.classList.remove("hidden");
document.getElementById("bottomNav").classList.remove("hidden");

postText.value = "";
charCount.textContent = "0/500";
momentSuggestion.classList.add("hidden");
ghostRewriteBtn.classList.add("hidden");

updateDraftCard();

setTimeout(() => postText?.focus(), 50);

} else {

  history.replaceState({ screen: "choice" }, "", window.location.pathname);

  choiceStep.classList.remove("hidden");
  postStep.classList.add("hidden");
  document.getElementById("bottomNav").classList.add("hidden");

}

updateDraftCard();

document.documentElement.classList.remove("compose-preload");

}

init();