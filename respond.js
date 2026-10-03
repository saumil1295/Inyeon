const SUPABASE_URL = "https://fjgshtktadaddwmshugw.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqZ3NodGt0YWRhZGR3bXNodWd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkzNzEzODQsImV4cCI6MjEwNDk0NzM4NH0.fMUzZ2chICrxSvRVdwrEb9TseFY532kC2KtsvV_zpGM";

const { createClient } = supabase;
const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Allow the View Transition destination to settle cleanly
requestAnimationFrame(() => {
  const card = document.getElementById("postContainer");
  if (card) card.style.viewTransitionName = "inyeon-card";
});

const params = new URLSearchParams(window.location.search);

/* -----------------------------
   Segmented Control
----------------------------- */

let selectedCategory = params.get("category") || "difficult";

// Support both ?category=light and ?category=lighter
if (selectedCategory === "lighter") selectedCategory = "light";
if (selectedCategory === "heavier") selectedCategory = "difficult";

function getMomentType() {
  return selectedCategory === "difficult"
    ? "support"
    : "celebrate";
}

const draftPostId = params.get("post");
let draftPostLoaded = false;

document.getElementById("menuBtn").addEventListener("click", () => {
  document.getElementById("menuDropdown").classList.toggle("hidden");
});

document.getElementById("menuSignOut").addEventListener("click", async (e) => {
  e.preventDefault();
  await client.auth.signOut();
  window.location.href = "auth.html";
});

let currentUser = null;
let currentProfile = null;
let currentSession = null;

async function requireAuth() {
  const {
    data: { session },
  } = await client.auth.getSession();

  if (!session) {
    window.location.href = "auth.html";
    return false;
  }

  currentSession = session;
  currentUser = session.user;

  const { data: profile } = await client
    .from("profiles")
    .select("*")
    .eq("id", session.user.id)
    .maybeSingle();

  if (!profile) {
    window.location.href = "auth.html";
    return false;
  }

  currentProfile = profile;
  return true;
}

function detectCrisis(text) {
  const lower = text.toLowerCase();

  const crisisKeywords = [
    "kill myself",
    "end my life",
    "suicide",
    "want to die",
    "don't want to live",
    "no reason to live",
    "better off dead",
    "hurt myself",
    "self harm",
    "cutting myself",
    "ending it all",
    "can't go on",
    "not worth living",
  ];

  return crisisKeywords.some((keyword) => lower.includes(keyword));
}

/* -----------------------------
   Someone Stayed
----------------------------- */

function getStayThreshold(text) {
  const words = text.trim().split(/\s+/).length;

  let base;

  if (words <= 40) {
    base = 7;
  } else if (words <= 120) {
    base = 9;
  } else {
    base = 12;
  }

  const variation = Math.floor(Math.random() * 3) - 1;

  return Math.max(6, base + variation);
}

function cancelStay() {
  clearTimeout(stayTimer);
  stayTimer = null;
  activePostId = null;
  stayStartTime = null;
}

async function trackStay(post) {
  if (!currentUser) return;

  cancelStay();

  if (post.anon_id === currentUser.id) return;

  activePostId = post.id;
  stayStartTime = Date.now();

  const threshold = getStayThreshold(post.content);

  stayTimer = setTimeout(async () => {
    if (!isVisible) return;

    const elapsed = (Date.now() - stayStartTime) / 1000;

    if (elapsed < threshold) return;

    const { data: existing, error } = await client
      .from("views")
      .select("id,qualified")
      .eq("post_id", post.id)
      .eq("viewer_id", currentUser.id)
      .maybeSingle();

    if (error) {
      console.error(error);
      return;
    }

    if (existing?.qualified) return;

    if (existing) {
      await client
        .from("views")
        .update({ qualified: true })
        .eq("id", existing.id);
    } else {
      await client
        .from("views")
        .insert({
          post_id: post.id,
          viewer_id: currentUser.id,
          qualified: true,
        });
    }

    console.log(`Someone stayed on post ${post.id}`);
  }, threshold * 1000);
}

const postContainer = document.getElementById("postContainer");
const postTextEl = document.getElementById("postText");
const optionsContainer = document.getElementById("optionsContainer");
const confirmation = document.getElementById("confirmation");
const noPosts = document.getElementById("noPosts");

const saveBtn = document.getElementById("saveBtn");
let currentPostSaved = false;

const toast = document.getElementById("toast");
let toastTimer = null;

let currentPost = null;

// Response Safety Check
const responseSafetyCheck = document.getElementById("responseSafetyCheck");
const responseSafetyTitle = document.getElementById("responseSafetyTitle");
const responseSafetyText = document.getElementById("responseSafetyText");
const responseSafetyQuestion = document.getElementById("responseSafetyQuestion");
const editResponseBtn = document.getElementById("editResponseBtn");
const sendAnywayBtn = document.getElementById("sendAnywayBtn");

let pendingResponseText = null;
let pendingResponsePostId = null;
let pendingResponseWasWarned = false;

const categoryState = {
  difficult: { currentPost: null },
  light: { currentPost: null }
};

let respondedPostIds = [];
let blockedUserIds = [];
let optionsByCategory = {};
const skippedPostIds = [];

let stayTimer = null;
let activePostId = null;
let stayStartTime = null;
let isVisible = true;

/* -----------------------------
   Fresh Feed Memory
----------------------------- */

const FEED_MEMORY_LIMIT = 30;
const FEED_MEMORY_HOURS = 24;

function getFeedKey(){
  return `seenPosts_${selectedCategory}`;
}

function getSeenPosts(){

  try{

    const stored = JSON.parse(localStorage.getItem(getFeedKey()));

    if(!stored) return [];

    const age =
      Date.now() - stored.timestamp;

    if(age > FEED_MEMORY_HOURS * 60 * 60 * 1000){

      localStorage.removeItem(getFeedKey());
      return [];

    }

    return stored.posts || [];

  }catch{

    return [];

  }

}

function rememberPost(postId){

  const seen = getSeenPosts();

  seen.unshift(postId);

  const unique =
    [...new Set(seen)].slice(0, FEED_MEMORY_LIMIT);

  localStorage.setItem(
    getFeedKey(),
    JSON.stringify({
      posts: unique,
      timestamp: Date.now()
    })
  );

}

function clearSeenPosts(){

  localStorage.removeItem(getFeedKey());

}

/* -----------------------------
   Segmented Control UI
----------------------------- */

const heavierTab = document.getElementById("heavierTab");
const lighterTab = document.getElementById("lighterTab");

function updateSegmentUI() {
  heavierTab?.classList.toggle(
    "active",
    selectedCategory === "difficult"
  );

  lighterTab?.classList.toggle(
    "active",
    selectedCategory === "light"
  );
}

async function switchCategory(nextCategory){

  if(nextCategory === selectedCategory) return;

  // Move the slider immediately
  selectedCategory = nextCategory;
  updateSegmentUI();

  const urlCategory =
    nextCategory === "light"
      ? "lighter"
      : "difficult";

  history.replaceState({}, "", `?category=${urlCategory}`);

  // Fade the card while the slider is moving
  postContainer.classList.add("switching");

  await new Promise(r => setTimeout(r,120));

  // Restore where this category was left,
  // otherwise fetch its first post.
  const savedPost = categoryState[nextCategory].currentPost;

  if(savedPost){

    displayPost(
      savedPost,
      optionsByCategory[savedPost.moment_type] || []
    );

  }else{

    const result = await fetchNextPost();

    if(result){
      displayPost(result.post, result.options);
    }

  }

  // Fade back in
  postContainer.classList.remove("switching");
  postContainer.classList.add("entering");

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      postContainer.classList.remove("entering");
    });
  });

  // Quietly prepare the opposite feed
  preloadOtherCategory();

}

updateSegmentUI();

heavierTab?.addEventListener("click", () => {
  switchCategory("difficult");
});

lighterTab?.addEventListener("click", () => {
  switchCategory("light");
});

let draftTimer;

function showDraftStatus(text, saving = false) {
  const status = document.getElementById("draftStatus");
  if (!status) return;

  status.textContent = text;
  status.classList.remove("hidden");
  status.classList.add("show");

  if (saving) {
    status.classList.add("saving");
  } else {
    status.classList.remove("saving");
  }

  clearTimeout(status._hideTimer);

  if (!saving) {
    status._hideTimer = setTimeout(() => {
      status.classList.remove("show");
    }, 1400);
  }
}

async function loadDraft() {
  const input = document.getElementById("responseInput");

  if (!input || !currentPost) return;

  const { data } = await client
    .from("response_drafts")
    .select("draft_text")
    .eq("post_id", currentPost.id)
    .eq("responder_anon_id", currentUser.id)
    .maybeSingle();

  if (data?.draft_text) {
    input.value = data.draft_text;
    showDraftStatus("🌿 Draft restored");
  }
}

function enableDraftAutosave() {
  const input = document.getElementById("responseInput");

  if (!input || !currentPost) return;

  input.oninput = () => {
    showDraftStatus("Saving…", true);

    clearTimeout(draftTimer);

    draftTimer = setTimeout(async () => {
      const text = input.value.trim();

      if (text) {
        const { error } = await client
          .from("response_drafts")
          .upsert(
            {
              post_id: currentPost.id,
              responder_anon_id: currentUser.id,
              draft_text: text,
              updated_at: new Date().toISOString(),
            },
            {
              onConflict: "post_id,responder_anon_id",
            }
          );

        if (error) console.error("Draft save error:", error);

        showDraftStatus("🌿 Draft saved");
      } else {
        await client
          .from("response_drafts")
          .delete()
          .eq("post_id", currentPost.id)
          .eq("responder_anon_id", currentUser.id);

        document.getElementById("draftStatus")
          ?.classList.add("hidden");
      }
    }, 500);
  };
}

async function clearDraft(postId) {
  await client
    .from("response_drafts")
    .delete()
    .eq("post_id", postId)
    .eq("responder_anon_id", currentUser.id);
}

/* -----------------------------
   Empty Response Popup
----------------------------- */

function showEmptyResponsePopup(){

  document
    .getElementById("emptyResponseModal")
    ?.classList.remove("hidden");

}

function hideEmptyResponsePopup(){

  document
    .getElementById("emptyResponseModal")
    ?.classList.add("hidden");

  document
    .getElementById("responseInput")
    ?.focus();

}

async function initData() {
  const [
    responsesResult,
    optionsResult,
    blockedResult,
    blockedByResult
  ] = await Promise.all([

    client
      .from("responses")
      .select("post_id")
      .eq("responder_anon_id", currentUser.id),

    client
      .from("response_options")
      .select("*"),

    client
      .from("response_reports")
      .select("reported_user_id")
      .eq("reporter_id", currentUser.id),

    client
      .from("response_reports")
      .select("reporter_id")
      .eq("reported_user_id", currentUser.id)

  ]);

  if (responsesResult.error) {
    console.error(responsesResult.error);
  } else {
    respondedPostIds = responsesResult.data.map(r => r.post_id);
  }

  const peopleIReported =
    (blockedResult?.data || []).map(r => r.reported_user_id);

  const peopleWhoReportedMe =
    (blockedByResult?.data || []).map(r => r.reporter_id);

  blockedUserIds = [
    ...new Set([
      ...peopleIReported,
      ...peopleWhoReportedMe
    ].filter(Boolean))
  ];

  if (optionsResult.error) {
    console.error(optionsResult.error);
  } else {

    optionsByCategory = {};

    optionsResult.data.forEach(opt => {

      if (!optionsByCategory[opt.need_category]) {
        optionsByCategory[opt.need_category] = [];
      }

      optionsByCategory[opt.need_category].push(opt);

    });

  }
}

/* -----------------------------
   Fetch next matching post
----------------------------- */

async function fetchNextPost() {

  /*
   * Direct-post mode
   * ----------------
   * If ?post=ID is present, ALWAYS load that exact post.
   * This is primarily useful for deterministic testing.
   */
  if (draftPostId && !draftPostLoaded) {

    draftPostLoaded = true;

    const { data, error } = await client
  .from("posts")
  .select("*")
  .eq("id", Number(draftPostId))
  .maybeSingle();

console.log("DIRECT POST DEBUG:", {
  requestedId: draftPostId,
  numericId: Number(draftPostId),
  data,
  error
});

    if (error) {
      console.error("Direct post load failed:", error);
      return null;
    }

    if (!data) {
      console.error("Direct post not found:", draftPostId);
      return null;
    }

    console.log("DIRECT TEST POST LOADED:", data.id);

    return {
      post: data,
      options:
        optionsByCategory[data.moment_type] || []
    };
  }

  /*
   * Normal randomized feed
   */

  const seenPosts = getSeenPosts();

  const excludedIds = [
    ...respondedPostIds,
    ...skippedPostIds,
    ...seenPosts
  ];

  let query = client
    .from("posts")
    .select("*")
    .eq("status", "Active")
    .eq("moment_type", getMomentType())
    .is("deleted_at", null)
    .neq("anon_id", currentUser.id)
    .limit(100);

  if (blockedUserIds.length > 0) {

    query = query.not(
      "anon_id",
      "in",
      `(${blockedUserIds.join(",")})`
    );

  }

  if (excludedIds.length > 0) {

    query = query.not(
      "id",
      "in",
      `(${excludedIds.join(",")})`
    );

  }

  let { data: posts, error } = await query;

  if (error) {
    console.error(error);
    return null;
  }

  if ((!posts || posts.length === 0) && skippedPostIds.length) {

    skippedPostIds.length = 0;

    let retryQuery = client
      .from("posts")
      .select("*")
      .eq("status", "Active")
      .eq("moment_type", getMomentType())
      .is("deleted_at", null)
      .neq("anon_id", currentUser.id)
      .limit(100);

    if (blockedUserIds.length > 0) {

      retryQuery = retryQuery.not(
        "anon_id",
        "in",
        `(${blockedUserIds.join(",")})`
      );

    }

    if (respondedPostIds.length) {

      retryQuery = retryQuery.not(
        "id",
        "in",
        `(${respondedPostIds.join(",")})`
      );

    }

    const retryResult = await retryQuery;

    posts = retryResult.data || [];
  }

  if (!posts || posts.length === 0) {

    clearSeenPosts();

    return null;
  }

  const randomPost =
    posts[Math.floor(Math.random() * posts.length)];

  return {
    post: randomPost,
    options:
      optionsByCategory[randomPost.moment_type] || []
  };

}

/* -----------------------------
   Save Posts
----------------------------- */

async function updateSaveState(postId){

  const { data } = await client
    .from("saved_posts")
    .select("id")
    .eq("user_id", currentUser.id)
    .eq("post_id", postId)
    .maybeSingle();

  currentPostSaved = !!data;

  saveBtn?.classList.toggle("saved", currentPostSaved);

}

function showToast(message){

  clearTimeout(toastTimer);

  toast.textContent = message;
  toast.classList.remove("hidden");

  toastTimer = setTimeout(()=>{
    toast.classList.add("hidden");
  },1500);

}

async function toggleSave(){

  if(!currentPost) return;

  const wasSaved = currentPostSaved;

  currentPostSaved = !wasSaved;
  saveBtn.classList.toggle("saved", currentPostSaved);

  if(currentPostSaved){

    const { error } = await client
      .from("saved_posts")
      .insert({
        user_id: currentUser.id,
        post_id: currentPost.id
      });

    if(error){

  currentPostSaved = false;
  saveBtn.classList.remove("saved");

}else{

  sessionStorage.setItem("newlySavedPostId", currentPost.id);
  showToast("Saved for later");

}

  }else{

    const { error } = await client
      .from("saved_posts")
      .delete()
      .eq("user_id", currentUser.id)
      .eq("post_id", currentPost.id);

    if(error){

  currentPostSaved = true;
  saveBtn.classList.add("saved");

}else{

  showToast("Removed from Saved");

}

  }

}

/* -----------------------------
   Render post
----------------------------- */

function displayPost(post, options) {

 currentPost = post;
categoryState[selectedCategory].currentPost = post;
rememberPost(post.id);
updateSaveState(post.id);

  postContainer.style.pointerEvents = "auto";

  postContainer.classList.remove("hidden");
  noPosts.classList.add("hidden");

  postTextEl.classList.remove("skeleton-text");
  postTextEl.textContent = post.content;

  let presetButtonsHtml = "";

  options.forEach(option => {

    presetButtonsHtml += `
      <button
        class="response-btn"
        data-text="${option.response_text.replace(/"/g, "&quot;")}">
        ${option.response_text}
      </button>
    `;

  });

  optionsContainer.innerHTML = `
    <textarea
      id="responseInput"
      maxlength="500"
      placeholder="Write something honest..."
    ></textarea>

    <div class="helper-row">
      <span id="writingHint" class="writing-hint">
  Write like you're sitting beside them.
</span>

      <span class="char-count" id="charCount">
        0 / 500
      </span>
    </div>

    <div id="draftStatus" class="draft-status hidden">
      🌿 Draft saved
    </div>

    <button id="sendResponseBtn">
      Your words aren't alone.
    </button>

    <div class="divider">
      <span>or choose a quick response</span>
    </div>

    <button id="holdSpaceBtn" class="secondary-btn">
      🌿 Hold space
    </button>

    <p class="hold-copy">
      A small gesture can mean a lot.
    </p>

    <div id="presetButtons">
      ${presetButtonsHtml}
    </div>

    <button id="skipBtn" class="skip-btn">
      Skip
    </button>
  `;

  saveBtn.onclick = toggleSave;

  const input = document.getElementById("responseInput");
  const counter = document.getElementById("charCount");
  const hint = document.getElementById("writingHint");
  const sendBtn = document.getElementById("sendResponseBtn");

  function updateCounter() {

    const len = input.value.length;

    counter.textContent = `${len} / 500`;

    counter.classList.remove("warning", "danger");

    if (len >= 470) {
      counter.classList.add("warning");
    }

    if (len >= 500) {

      counter.classList.remove("warning");
      counter.classList.add("danger");

    }

    sendBtn.classList.toggle("empty", len === 0);

  }

  loadDraft().then(() => updateCounter());

  enableDraftAutosave();

  const hintMessages = [
    "Write like you're sitting beside them.",
    "You're making space for someone's story.",
    "Even a few honest words can stay with someone.",
    "Let your words feel like company.",
    "You're helping someone feel less alone.",
    "Sometimes a sentence is enough."
  ];

  let hintIndex = 0;
  let hintInterval = null;

  hint.textContent = hintMessages[0];

  input.addEventListener("input", () => {

    updateCounter();

    if (input.value.length === 0 || hintInterval) return;

    hintInterval = setInterval(() => {

      hintIndex =
        (hintIndex + 1) % hintMessages.length;

      hint.classList.add("fade-out");

      setTimeout(() => {

        hint.textContent =
          hintMessages[hintIndex];

        hint.classList.remove("fade-out");

      }, 180);

    }, 8000);

  });

  document
  .getElementById("sendResponseBtn")
  .addEventListener("click", () => {

    const text = input.value.trim();

    if (!text){

      showEmptyResponsePopup();
      return;

    }

    sendFreeTextResponse(text);

  });

  document
  .getElementById("holdSpaceBtn")
  ?.addEventListener("click", () => {

    sendPresetResponse(
      "🌿 I'm holding space with you.",
      null,
      "hold"
    );

  });

  document
    .querySelectorAll("#presetButtons .response-btn")
    .forEach(btn => {

      btn.addEventListener("click", () => {

        sendPresetResponse(btn.dataset.text, btn);

      });

    });

  document
  .getElementById("skipBtn")
  .addEventListener("click", handleSkip);

document
  .getElementById("closeEmptyPopup")
  ?.addEventListener("click", hideEmptyResponsePopup);

document
  .getElementById("emptyResponseModal")
  ?.addEventListener("click", (e) => {

    if (e.target.id === "emptyResponseModal") {
      hideEmptyResponsePopup();
    }

  });

requestAnimationFrame(() => {
  trackStay(post);

  // Remember where this category was left
categoryState[selectedCategory].currentPost = post;
});

}

/* -----------------------------
   First load after category pick
----------------------------- */

async function loadInitialPost(){

  await initData();

  const result = await fetchNextPost();

  if(!result){

    postContainer.classList.add("hidden");
    noPosts.classList.remove("hidden");
    return;

  }

  displayPost(result.post, result.options);

}

/* -----------------------------
   Preload opposite category
----------------------------- */

async function preloadOtherCategory(){

  const otherCategory =
    selectedCategory === "difficult"
      ? "light"
      : "difficult";

  if (categoryState[otherCategory].currentPost) return;

  const previousCategory = selectedCategory;

  selectedCategory = otherCategory;

  const result = await fetchNextPost();

  selectedCategory = previousCategory;

  if(result){
    categoryState[otherCategory].currentPost = result.post;
  }

}

/* -----------------------------
   Card transition
----------------------------- */

async function animateToNextPost(){

  const content = document.getElementById("responseContent");

  content.classList.add("exiting");

  await new Promise(r => setTimeout(r,220));

  // Always fetch using the CURRENT selected category
  const result = await fetchNextPost();

  if(!result){

    postContainer.classList.add("hidden");
    noPosts.classList.remove("hidden");
    content.classList.remove("exiting");
    return;

  }

  displayPost(result.post, result.options);

  // Quietly prepare the first post for the other tab.
preloadOtherCategory();

  content.classList.remove("exiting");
  content.classList.add("entering");

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      content.classList.remove("entering");
    });
  });

}

/* -----------------------------
   Skip post
----------------------------- */

function handleSkip() {

  cancelStay();

  skippedPostIds.push(currentPost.id);

  document.getElementById("skipBtn").disabled = true;
  document.getElementById("sendResponseBtn").disabled = true;

  document
    .querySelectorAll("#presetButtons .response-btn")
    .forEach(btn => btn.disabled = true);

  postContainer.style.pointerEvents = "none";

  animateToNextPost();

}

/* -----------------------------
   Daily limit
----------------------------- */

async function checkRateLimit(userId) {

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const { count, error } = await client
    .from("responses")
    .select("id", { count: "exact", head: true })
    .eq("responder_anon_id", userId)
    .gte("created_at", startOfDay.toISOString());

  if (error) return false;

  return count >= 50;

}

/* -----------------------------
   Daily Recognition
----------------------------- */

function getTodayKey() {
  const now = new Date();

  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0")
  ].join("-");
}

function shouldShowRecognition(type) {

  const today = getTodayKey();

  if (type === "written") {

    return (
      localStorage.getItem("inyeon_written_recognition") !== today
    );

  }

  if (type === "hold") {

    return (
      localStorage.getItem("inyeon_hold_recognition") !== today
    );

  }

  return false;
}


function markRecognitionShown(type) {

  const today = getTodayKey();

  if (type === "written") {

    localStorage.setItem(
      "inyeon_written_recognition",
      today
    );

  }

  if (type === "hold") {

    localStorage.setItem(
      "inyeon_hold_recognition",
      today
    );

  }
}

function showRecognition(type) {

  const modal =
    document.getElementById("recognitionModal");

  const title =
    document.getElementById("recognitionTitle");

  const text =
    document.getElementById("recognitionText");

  if (!modal || !title || !text) {

    animateToNextPost();

    return;

  }

  if (type === "written") {

    title.textContent =
      "You carried someone's thoughts today.";

    text.textContent =
      "You took a moment to listen when someone needed to be heard.";

  }

  if (type === "hold") {

    title.textContent =
      "You held space for someone today.";

    text.textContent =
      "Sometimes, being there is enough.";

  }

  /*
   * Mark BEFORE displaying the popup.
   * This prevents the same recognition
   * from being shown again immediately.
   */

  markRecognitionShown(type);

  modal.classList.remove("hidden");
}

let recognitionAdvanceTimer = null;

function hideRecognitionAndAdvance() {

  clearTimeout(recognitionAdvanceTimer);

  const modal =
    document.getElementById("recognitionModal");

  modal?.classList.add("hidden");

  animateToNextPost();
}

function showConfirmationAndAdvance(type = "normal") {

  /*
   * First written response of the day
   * gets the full recognition moment.
   */
  if (
    type === "written" &&
    shouldShowRecognition("written")
  ) {

    showRecognition("written");

    return;
  }

  /*
   * First Hold Space of the day
   * gets the full recognition moment.
   */
  if (
    type === "hold" &&
    shouldShowRecognition("hold")
  ) {

    showRecognition("hold");

    return;
  }

  /*
   * Hold Space after the first one:
   * no confirmation — move directly
   * to the next post.
   */
  if (type === "hold") {

    animateToNextPost();

    return;
  }

  /*
   * Written responses after the first one,
   * and preset responses, get the small
   * floating confirmation.
   */

  const toast =
    document.getElementById("heldSpaceToast");

  if (!toast) {

    animateToNextPost();

    return;

  }

  toast.classList.remove("hidden");

  setTimeout(() => {

    toast.classList.add("hidden");

    animateToNextPost();

  }, 1600);
}

document
  .getElementById("recognitionNextBtn")
  ?.addEventListener(
    "click",
    hideRecognitionAndAdvance
  );

/* -----------------------------
   Response Safety Check
----------------------------- */

async function checkResponseSafety(responseText, postText) {

  try {

    if (!currentSession?.access_token) {

      console.error(
        "Safety check failed: no authenticated session."
      );

      return null;
    }

    const response = await fetch(
      "https://fjgshtktadaddwmshugw.supabase.co/functions/v1/check-response-safety",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",

          "apikey": SUPABASE_ANON_KEY,

          "Authorization":
            `Bearer ${currentSession.access_token}`
        },

        body: JSON.stringify({
          response: responseText,
          post: postText
        })
      }
    );

    if (!response.ok) {

      const errorText =
        await response.text();

      console.error(
        "Safety check failed:",
        response.status,
        errorText
      );

      return null;
    }

    const result =
      await response.json();

    console.log(
      "Response Safety Worker result:",
      result
    );

    /*
     * The worker now returns the complete
     * interpretation needed by the
     * Response Decision Engine.
     */

    return result;

  } catch (error) {

    console.error(
      "Safety check error:",
      error
    );

    return null;
  }
}

async function checkResponseDecision(
  responseText,
  postText,
  safetyResult
) {

  try {

    if (!currentSession?.access_token) {

      console.error(
        "Decision check failed: no authenticated session."
      );

      return null;
    }

    const response = await fetch(
      "https://fjgshtktadaddwmshugw.supabase.co/functions/v1/response-decision-engine",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",

          "apikey": SUPABASE_ANON_KEY,

          "Authorization":
            `Bearer ${currentSession.access_token}`
        },

        body: JSON.stringify({

          post: postText,

          response: responseText,

          safe: safetyResult.safe,

          category: safetyResult.category,

          severity: safetyResult.severity,

          intent: safetyResult.intent,

          target: safetyResult.target,

          actionability:
            safetyResult.actionability,

          confidence:
            safetyResult.confidence,

          reason:
            safetyResult.reason

        })
      }
    );

    if (!response.ok) {

      const errorText =
        await response.text();

      console.error(
        "Decision Engine failed:",
        response.status,
        errorText
      );

      return null;
    }

    const result =
      await response.json();

    console.log(
      "Response Decision Engine result:",
      result
    );

    return result;

  } catch (error) {

    console.error(
      "Decision Engine error:",
      error
    );

    return null;
  }
}

function showResponseSafetyPopup(type = "normal") {

  if (!responseSafetyCheck) return;

  if (type === "urgent") {

    if (responseSafetyTitle) {
      responseSafetyTitle.textContent =
        "This response could cause serious harm.";
    }

    if (responseSafetyText) {
      responseSafetyText.textContent =
        "This response contains language that could seriously harm or put the person who shared this at risk. Please reconsider sending it.";
    }

    if (responseSafetyQuestion) {
      responseSafetyQuestion.textContent =
        "Please edit your response before sending it.";
    }

    if (sendAnywayBtn) {
      sendAnywayBtn.classList.add("hidden");
      sendAnywayBtn.style.display = "none";
    }

  } else {

    if (responseSafetyTitle) {
      responseSafetyTitle.textContent =
        "Your response may not feel right to them.";
    }

    if (responseSafetyText) {
      responseSafetyText.textContent =
        "This response contains something that could feel uncomfortable, dismissive, or hurtful to the person who shared this.";
    }

    if (responseSafetyQuestion) {
      responseSafetyQuestion.textContent =
        "Do you still want to send it?";
    }

    if (sendAnywayBtn) {
      sendAnywayBtn.classList.remove("hidden");
      sendAnywayBtn.style.display = "";
    }
  }

  responseSafetyCheck.classList.remove("hidden");
  responseSafetyCheck.style.display = "block";
}

async function recordUrgentModeration(
  responseText,
  postId,
  safetyResult,
  decisionResult
) {
  try {
    if (!currentSession?.access_token) {
      console.error(
        "Urgent moderation failed: no authenticated session."
      );

      return false;
    }

    const response = await fetch(
      "https://fjgshtktadaddwmshugw.supabase.co/functions/v1/record-urgent-response",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          "apikey": SUPABASE_ANON_KEY,
          "Authorization":
            `Bearer ${currentSession.access_token}`
        },

        body: JSON.stringify({
          post_id: postId,
          response_text: responseText,
          category: safetyResult.category,
          severity: safetyResult.severity,
          decision: decisionResult.decision,
          reason: safetyResult.reason
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();

      console.error(
        "Urgent moderation recording failed:",
        response.status,
        errorText
      );

      return false;
    }

    const result = await response.json();

    console.log(
      "Urgent moderation recorded:",
      result
    );

    return true;

  } catch (error) {
    console.error(
      "Urgent moderation recording error:",
      error
    );

    return false;
  }
}

/* -----------------------------
   Written response
----------------------------- */

async function sendFreeTextResponse(responseText) {

  const sendBtn =
    document.getElementById("sendResponseBtn");

  const skipBtn =
    document.getElementById("skipBtn");

  sendBtn.disabled = true;
  skipBtn.disabled = true;

  document
    .querySelectorAll("#presetButtons .response-btn")
    .forEach(btn => {
      btn.disabled = true;
    });

  /* ---------------------------------------------
     DAILY LIMIT
  --------------------------------------------- */

  if (await checkRateLimit(currentUser.id)) {

    alert(
      "You've reached today's response limit. Come back tomorrow."
    );

    sendBtn.disabled = false;
    skipBtn.disabled = false;

    document
      .querySelectorAll("#presetButtons .response-btn")
      .forEach(btn => {
        btn.disabled = false;
      });

    return;
  }

  /* ---------------------------------------------
     SUBMIT RESPONSE — SERVER CONTROLLED
  --------------------------------------------- */

  let result;

  try {

    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/submit-response`,
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          "apikey": SUPABASE_ANON_KEY,
          "Authorization":
            `Bearer ${currentSession.access_token}`
        },

        body: JSON.stringify({
          post_id: currentPost.id,
          response_text: responseText,
          response_type: "written",
          send_anyway: false
        })
      }
    );

    result = await response.json();

    console.log(
      "Submit Response result:",
      result
    );

    if (!response.ok) {

      if (result?.code === "ACCOUNT_SUSPENDED") {

        alert(
          "Your account is temporarily suspended. You can't send responses until your suspension ends."
        );

      } else {

        alert(
          "We couldn't complete the response check right now. Please try again."
        );

      }

      sendBtn.disabled = false;
      skipBtn.disabled = false;

      document
        .querySelectorAll("#presetButtons .response-btn")
        .forEach(btn => {
          btn.disabled = false;
        });

      return;
    }

  } catch (error) {

    console.error(
      "Submit response error:",
      error
    );

    alert(
      "We couldn't complete the response check right now. Please try again."
    );

    sendBtn.disabled = false;
    skipBtn.disabled = false;

    document
      .querySelectorAll("#presetButtons .response-btn")
      .forEach(btn => {
        btn.disabled = false;
      });

    return;
  }

  /* ---------------------------------------------
     URGENT
  --------------------------------------------- */

  if (
    result.backend_action === "urgent"
  ) {

    pendingResponseText = responseText;
    pendingResponsePostId = currentPost.id;
    pendingResponseWasWarned = true;

    showResponseSafetyPopup("urgent");

    sendBtn.disabled = false;
    skipBtn.disabled = false;

    document
      .querySelectorAll("#presetButtons .response-btn")
      .forEach(btn => {
        btn.disabled = false;
      });

    return;
  }

  /* ---------------------------------------------
     WARNING
  --------------------------------------------- */

  if (
    result.backend_action === "withhold"
  ) {

    pendingResponseText = responseText;
    pendingResponsePostId = currentPost.id;
    pendingResponseWasWarned = true;

    showResponseSafetyPopup("normal");

    sendBtn.disabled = false;
    skipBtn.disabled = false;

    document
      .querySelectorAll("#presetButtons .response-btn")
      .forEach(btn => {
        btn.disabled = false;
      });

    return;
  }

  /* ---------------------------------------------
     PUBLISH
  --------------------------------------------- */

  if (
    result.backend_action === "publish" &&
    result.response_id
  ) {

    respondedPostIds.push(currentPost.id);

    cancelStay();

    await clearDraft(currentPost.id);

    if (responseSafetyCheck) {
      responseSafetyCheck.classList.add("hidden");
      responseSafetyCheck.style.display = "none";
    }

    pendingResponseText = null;
    pendingResponsePostId = null;
    pendingResponseWasWarned = false;

    showConfirmationAndAdvance("written");

    return;
  }

  /* ---------------------------------------------
     FAIL CLOSED
  --------------------------------------------- */

  console.error(
    "Unexpected submit-response result:",
    result
  );

  alert(
    "We couldn't complete the response check right now. Please try again."
  );

  sendBtn.disabled = false;
  skipBtn.disabled = false;

  document
    .querySelectorAll("#presetButtons .response-btn")
    .forEach(btn => {
      btn.disabled = false;
    });
}

editResponseBtn?.addEventListener("click", () => {

  if (responseSafetyCheck) {
    responseSafetyCheck.classList.add("hidden");
    responseSafetyCheck.style.display = "none";
  }

 pendingResponseText = null;
pendingResponsePostId = null;
pendingResponseWasWarned = false;

if (sendAnywayBtn) {
  sendAnywayBtn.classList.remove("hidden");
  sendAnywayBtn.style.display = "";
}

if (responseSafetyTitle) {
  responseSafetyTitle.textContent =
    "Your response may not feel right to them.";
}

if (responseSafetyText) {
  responseSafetyText.textContent =
    "This response contains something that could feel uncomfortable, dismissive, or hurtful to the person who shared this.";
}

if (responseSafetyQuestion) {
  responseSafetyQuestion.textContent =
    "Do you still want to send it?";
}

  const input = document.getElementById("responseInput");

  if (input) {
    input.focus();
    input.setSelectionRange(
      input.value.length,
      input.value.length
    );
  }

});

sendAnywayBtn?.addEventListener("click", async () => {

  if (!pendingResponseText || !pendingResponsePostId) {
    return;
  }

  const responseText = pendingResponseText;

  if (responseSafetyCheck) {
    responseSafetyCheck.classList.add("hidden");
    responseSafetyCheck.style.display = "none";
  }

  pendingResponseText = null;
  pendingResponsePostId = null;
  pendingResponseWasWarned = false;

  const sendBtn =
    document.getElementById("sendResponseBtn");

  const skipBtn =
    document.getElementById("skipBtn");

  sendBtn.disabled = true;
  skipBtn.disabled = true;

  document
    .querySelectorAll("#presetButtons .response-btn")
    .forEach(btn => {
      btn.disabled = true;
    });

  try {

    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/submit-response`,
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          "apikey": SUPABASE_ANON_KEY,
          "Authorization":
            `Bearer ${currentSession.access_token}`
        },

        body: JSON.stringify({
          post_id: currentPost.id,
          response_text: responseText,
          response_type: "written",
          send_anyway: true
        })
      }
    );

    const result = await response.json();

    console.log(
      "Send Anyway result:",
      result
    );

    if (!response.ok) {

      if (result?.code === "ACCOUNT_SUSPENDED") {

        alert(
          "Your account is temporarily suspended. You can't send responses until your suspension ends."
        );

      } else {

        alert(
          "Something went wrong. Try again."
        );

      }

      return;
    }

    if (
      result.sent === true &&
      result.response_id
    ) {

      respondedPostIds.push(currentPost.id);

      cancelStay();

      await clearDraft(currentPost.id);

      showConfirmationAndAdvance("written");

      return;
    }

    console.error(
      "Unexpected Send Anyway result:",
      result
    );

    alert(
      "Something went wrong. Try again."
    );

  } catch (error) {

    console.error(
      "Send Anyway error:",
      error
    );

    alert(
      "Something went wrong. Try again."
    );

  } finally {

    sendBtn.disabled = false;
    skipBtn.disabled = false;

    document
      .querySelectorAll("#presetButtons .response-btn")
      .forEach(btn => {
        btn.disabled = false;
      });

  }

});

/* -----------------------------
   Preset response
----------------------------- */

async function sendPresetResponse(
  responseText,
  buttonEl,
  recognitionType = "normal"
) {

  if (buttonEl) {

    buttonEl.classList.add("response-btn-selected");

    document
      .querySelectorAll("#presetButtons .response-btn")
      .forEach(btn => {

        btn.style.pointerEvents = "none";

        if (btn !== buttonEl) {
          btn.style.opacity = "0.35";
        }

      });

  }

  const sendBtn =
    document.getElementById("sendResponseBtn");

  const skipBtn =
    document.getElementById("skipBtn");

  sendBtn.disabled = true;
  skipBtn.disabled = true;

  if (await checkRateLimit(currentUser.id)) {

    alert(
      "You've reached today's response limit. Come back tomorrow."
    );

    sendBtn.disabled = false;
    skipBtn.disabled = false;

    document
      .querySelectorAll("#presetButtons .response-btn")
      .forEach(btn => {
        btn.style.pointerEvents = "";
        btn.style.opacity = "";
      });

    return;
  }

  try {

    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/submit-response`,
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          "apikey": SUPABASE_ANON_KEY,
          "Authorization":
            `Bearer ${currentSession.access_token}`
        },

        body: JSON.stringify({
          post_id: currentPost.id,
          response_text: responseText,
          response_type:
            recognitionType === "hold"
              ? "hold"
              : "preset",
          send_anyway: false
        })
      }
    );

    const result = await response.json();

    console.log(
      "Submit preset response result:",
      result
    );

    if (!response.ok) {

      if (result?.code === "ACCOUNT_SUSPENDED") {

        alert(
          "Your account is temporarily suspended. You can't send responses until your suspension ends."
        );

      } else {

        alert(
          "Something went wrong. Try again."
        );

      }

      return;
    }

    if (
      result.backend_action === "publish" &&
      result.response_id
    ) {

      respondedPostIds.push(currentPost.id);

      cancelStay();

      await clearDraft(currentPost.id);

      showConfirmationAndAdvance(
        recognitionType
      );

      return;
    }

    if (
      result.backend_action === "withhold" ||
      result.backend_action === "urgent"
    ) {

      console.error(
        "Preset response was moderated:",
        result
      );

      alert(
        "This response couldn't be sent. Please try another response."
      );

      return;
    }

    console.error(
      "Unexpected preset response result:",
      result
    );

    alert(
      "Something went wrong. Try again."
    );

  } catch (error) {

    console.error(
      "Preset response submission error:",
      error
    );

    alert(
      "Something went wrong. Try again."
    );

  } finally {

    sendBtn.disabled = false;
    skipBtn.disabled = false;

    document
      .querySelectorAll("#presetButtons .response-btn")
      .forEach(btn => {
        btn.style.pointerEvents = "";
        btn.style.opacity = "";
      });

  }

}

/* -----------------------------
   App start
----------------------------- */

async function init(){

  const authed = await requireAuth();
  if(!authed) return;

  updateSegmentUI();

  requestAnimationFrame(() => {
    document
      .querySelector(".segment-control")
      ?.classList.remove("initializing");
  });

  await loadInitialPost();

}

document.addEventListener("visibilitychange", () => {

  isVisible = !document.hidden;

  if (document.hidden) {
    cancelStay();
  }

});

window.addEventListener("beforeunload", cancelStay);

init();