
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
const charCount = document.getElementById("charCount");

postText.addEventListener("input", () => {
  const used = postText.value.length;
  charCount.textContent = `${used}/500`;
  charCount.classList.toggle("char-count-warning", used >= 450);
});

/* Share flow */

document.getElementById("shareChoiceBtn").addEventListener("click", () => {
  choiceStep.classList.add("hidden");
  postStep.classList.remove("hidden");
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
   MESSAGES
----------------------------- */

function showCrisisResponse() {
  confirmation.innerHTML = `
    <div class="crisis-message">
      <p>It sounds like you're carrying a lot right now.</p>
      <p>What you're feeling matters, and you deserve support beyond what this app can give.</p>
      <p><strong>iCall</strong>: <a href="tel:+919152987821">+91 9152987821</a></p>
      <p><strong>Vandrevala Foundation</strong>: <a href="tel:+919999666555">+91 9999 666 555</a></p>
      <p class="crisis-soft">We're not going anywhere.</p>
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

  const { data: post, error } = await client
    .from("posts")
    .insert({
      content: text,
      anon_id: currentUser.id,
      moment_type: "pending",
      status: isCrisis ? "flagged" : "active"
    })
    .select("id")
    .single();

  console.log("POST INSERT:", { post, error });

  submitBtn.disabled = false;
  submitBtn.textContent = "Post";

  if (error) {
    console.error(error);
    alert("Something went wrong. Try again.");
    return;
  }

  postText.value = "";
  charCount.textContent = "0/500";

  if (isCrisis) {
    showCrisisResponse();
    return;
  }

  confirmation.classList.add("hidden");

  setTimeout(() => {
    openInyeonMoment();
  }, 250);

});

/* -----------------------------
   INIT
----------------------------- */

async function init() {

  const authed = await requireAuth();
  if (!authed) return;

  greeting.textContent = `Hi, ${currentProfile.alias}!`;

}

init();