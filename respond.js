const SUPABASE_URL = "https://fjgshtktadaddwmshugw.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqZ3NodGt0YWRhZGR3bXNodWd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkzNzEzODQsImV4cCI6MjEwNDk0NzM4NH0.fMUzZ2chICrxSvRVdwrEb9TseFY532kC2KtsvV_zpGM";

const { createClient } = supabase;
const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const params = new URLSearchParams(window.location.search);

const selectedCategory = params.get("category");

// Keep draft support
const draftPostId = params.get("post");

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

async function requireAuth() {
  const {
    data: { session },
  } = await client.auth.getSession();

  if (!session) {
    window.location.href = "auth.html";
    return false;
  }

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

function getStayThreshold(text){

  const words = text.trim().split(/\s+/).length;

  let base;

  if(words <= 40){
    base = 7;
  }else if(words <= 120){
    base = 9;
  }else{
    base = 12;
  }

  // ±1 second randomness
  const variation = Math.floor(Math.random()*3)-1;

  return Math.max(6, base + variation);

}

function cancelStay(){

  clearTimeout(stayTimer);

  stayTimer = null;
  activePostId = null;
  stayStartTime = null;

}

async function trackStay(post){

  if(!currentUser) return;

  cancelStay();

  // Don't count your own thought
  if(post.anon_id === currentUser.id) return;

  activePostId = post.id;
  stayStartTime = Date.now();

  const threshold = getStayThreshold(post.content);

  stayTimer = setTimeout(async()=>{

    if(!isVisible) return;

    const elapsed = (Date.now()-stayStartTime)/1000;

    if(elapsed < threshold) return;

    const {data:existing,error}=await client
      .from("views")
      .select("id,qualified")
      .eq("post_id",post.id)
      .eq("viewer_id",currentUser.id)
      .maybeSingle();

    if(error){
      console.error(error);
      return;
    }

    if(existing?.qualified) return;

    if(existing){

      await client
        .from("views")
        .update({qualified:true})
        .eq("id",existing.id);

    }else{

      await client
        .from("views")
        .insert({
          post_id:post.id,
          viewer_id:currentUser.id,
          qualified:true
        });

    }

    console.log(`Someone stayed on post ${post.id}`);

  }, threshold*1000);

}

const postContainer = document.getElementById("postContainer");
const postTextEl = document.getElementById("postText");
const optionsContainer = document.getElementById("optionsContainer");
const confirmation = document.getElementById("confirmation");
const noPosts = document.getElementById("noPosts");

let currentPost = null;
let respondedPostIds = [];
let blockedUserIds = [];
let optionsByCategory = {};
const skippedPostIds = [];

// Someone Stayed tracking
let stayTimer = null;
let activePostId = null;
let stayStartTime = null;
let isVisible = true;

/* -----------------------------
   Category Selection
----------------------------- */

function fadeOut(el, callback) {
  el.style.opacity = "0";
  el.style.transform = "translateY(-8px)";

  setTimeout(() => {
    el.classList.add("hidden");
    callback && callback();
  }, 300);
}

function fadeIn(el) {
  el.classList.remove("hidden");
  el.style.opacity = "0";
  el.style.transform = "translateY(8px)";

  requestAnimationFrame(() => {
    el.style.opacity = "1";
    el.style.transform = "translateY(0)";
  });
}

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

        document.getElementById("draftStatus")?.classList.add("hidden");
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

async function initData() {
 const [responsesResult, optionsResult, blockedResult, blockedByResult] = await Promise.all([
  client
    .from("responses")
    .select("post_id")
    .eq("responder_anon_id", currentUser.id),

  client
    .from("response_options")
    .select("*"),

  // People I reported
  client
    .from("response_reports")
    .select("reported_user_id")
    .eq("reporter_id", currentUser.id),

  // People who reported me
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

  const peopleIReported = (blockedResult?.data || [])
  .map(r => r.reported_user_id);

const peopleWhoReportedMe = (blockedByResult?.data || [])
  .map(r => r.reporter_id);

blockedUserIds = [...new Set([
  ...peopleIReported,
  ...peopleWhoReportedMe
].filter(Boolean))];

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

    // Open directly into a saved draft if needed
  if (draftPostId) {

    const { data, error } = await client
      .from("posts")
      .select("*")
      .eq("id", draftPostId)
      .maybeSingle();

    if (!error && data) {

      // Don't open direct links to blocked users' posts
      if (!blockedUserIds.includes(data.anon_id)) {
        return {
          post: data,
          options: optionsByCategory[data.need_category] || []
        };
      }

           // If blocked, continue loading the next eligible post.
    }
  }

  const excludedIds = [...respondedPostIds, ...skippedPostIds];

let query = client
  .from("posts")
  .select("*")
  .eq("status","active")
  .is("deleted_at",null)
  .neq("anon_id",currentUser.id)
  .eq("need_category", selectedCategory)   // ← ADD THIS LINE HERE
  .order("created_at",{ascending:true})
  .limit(1);

  if (blockedUserIds.length > 0) {
  query = query.not("anon_id", "in", `(${blockedUserIds.join(",")})`);
}

  if (excludedIds.length) {
    query = query.not("id", "in", `(${excludedIds.join(",")})`);
  }


  let { data: posts, error } = await query;

  if (error) {
    console.error(error);
    return null;
  }

  // If we've skipped everything in this category,
  // recycle skipped posts but never answered ones.
  if ((!posts || posts.length === 0) && skippedPostIds.length) {

    skippedPostIds.length = 0;

   let retryQuery = client
  .from("posts")
  .select("*")
  .eq("status","active")
  .is("deleted_at",null)
  .neq("anon_id",currentUser.id)
  .eq("need_category", selectedCategory)
  .order("created_at",{ascending:true})
  .limit(1);

  if (blockedUserIds.length > 0) {
  retryQuery = retryQuery.not("anon_id", "in", `(${blockedUserIds.join(",")})`);
}

    if (respondedPostIds.length) {
      retryQuery = retryQuery.not(
        "id",
        "in",
        `(${respondedPostIds.join(",")})`
      );
    }

    const retryResult = await retryQuery;
    posts = retryResult.data;
  }

  if (!posts || posts.length === 0) return null;

const post = posts[0];

return {
  post,
  options: optionsByCategory[post.need_category] || []
};

} // <-- Add this closing brace

/* -----------------------------
   Render post
----------------------------- */

function displayPost(post, options) {

  currentPost = post;

  // Re-enable interactions after skipping
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

    <div class="response-meta">

      <span id="writingHint" class="writing-hint">
        Write like you're sitting beside them.
      </span>

      <span id="charCount" class="char-count">
        0 / 500
      </span>

    </div>

    <div id="draftStatus" class="draft-status hidden">
      🌿 Draft saved
    </div>

    <button id="sendResponseBtn">
      Your thought isn't alone.
    </button>

    <p class="or-divider">
      or choose a quick response
    </p>

    <div id="presetButtons">
      ${presetButtonsHtml}
    </div>

    <button id="skipBtn" class="skip-btn">
      Skip
    </button>
  `;

  const input = document.getElementById("responseInput");
  const counter = document.getElementById("charCount");
  const hint = document.getElementById("writingHint");
  const sendBtn = document.getElementById("sendResponseBtn");

  function updateCounter() {

    const len = input.value.length;

    counter.textContent = `${len} / 500`;

    counter.classList.remove("warning", "danger");

    if (len >= 470) counter.classList.add("warning");

    if (len >= 500) {
      counter.classList.remove("warning");
      counter.classList.add("danger");
    }

    sendBtn.disabled = len === 0;
  }

  // Restore draft first
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

      hintIndex = (hintIndex + 1) % hintMessages.length;

      hint.classList.add("fade-out");

      setTimeout(() => {
        hint.textContent = hintMessages[hintIndex];
        hint.classList.remove("fade-out");
      }, 180);

    }, 8000);
  });

  document
    .getElementById("sendResponseBtn")
    .addEventListener("click", () => {

      const text = input.value.trim();
      if (!text) return;

      sendFreeTextResponse(text);
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

    // Start "Someone Stayed" tracking once the card is rendered
requestAnimationFrame(() => {
  trackStay(post);
});
}

/* -----------------------------
   First load after category pick
----------------------------- */

async function loadInitialPost() {

  await initData();

  const result = await fetchNextPost();

  if (!result) {
    postContainer.classList.add("hidden");
    noPosts.classList.remove("hidden");
    return;
  }

  displayPost(result.post, result.options);
}

/* -----------------------------
   Card transition
----------------------------- */

function animateToNextPost(nextResultPromise) {

  postContainer.classList.remove("post-enter");
  postContainer.classList.add("post-exit");

  nextResultPromise.then(result => {

    setTimeout(() => {

      postContainer.classList.remove("post-exit");

      if (!result) {
        postContainer.classList.add("hidden");
        noPosts.classList.remove("hidden");
        return;
      }

      displayPost(result.post, result.options);

      requestAnimationFrame(() => {

        postContainer.classList.add("post-enter");

        postContainer.addEventListener("animationend", () => {
          postContainer.classList.remove("post-enter");
        }, { once: true });

      });

    }, 220);

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

  animateToNextPost(fetchNextPost());

}

/* -----------------------------
   Daily limit
----------------------------- */

async function checkRateLimit(userId) {

  const startOfDay = new Date();
  startOfDay.setHours(0,0,0,0);

  const { count, error } = await client
    .from("responses")
    .select("id", { count: "exact", head: true })
    .eq("responder_anon_id", userId)
    .gte("created_at", startOfDay.toISOString());

  if (error) return false;

  return count >= 50;
}

/* -----------------------------
   Success modal
----------------------------- */

function showConfirmationAndAdvance(){

  const modal = document.getElementById("responseModal");

  modal.classList.remove("hidden");

  setTimeout(() => {

    modal.classList.add("hidden");

    animateToNextPost(fetchNextPost());

  },1600);

}

/* -----------------------------
   Written response
----------------------------- */

async function sendFreeTextResponse(responseText){

  const sendBtn = document.getElementById("sendResponseBtn");
  const skipBtn = document.getElementById("skipBtn");

  sendBtn.disabled = true;
  skipBtn.disabled = true;

  document
    .querySelectorAll("#presetButtons .response-btn")
    .forEach(btn => btn.disabled = true);

  if (await checkRateLimit(currentUser.id)){

    alert("You've reached today's response limit. Come back tomorrow.");

    sendBtn.disabled = false;
    skipBtn.disabled = false;

    document
      .querySelectorAll("#presetButtons .response-btn")
      .forEach(btn => btn.disabled = false);

    return;
  }

  const isCrisis = detectCrisis(responseText);

  const { error } = await client
    .from("responses")
    .insert({
      post_id: currentPost.id,
      response_text: responseText,
      responder_anon_id: currentUser.id,
      status: isCrisis ? "flagged" : "pending",
      response_type: "written"
    });

  if (error){

    console.error(error);
    alert("Something went wrong. Try again.");

    sendBtn.disabled = false;
    skipBtn.disabled = false;

    document
      .querySelectorAll("#presetButtons .response-btn")
      .forEach(btn => btn.disabled = false);

    return;
  }

  respondedPostIds.push(currentPost.id);

cancelStay();

await clearDraft(currentPost.id);

showConfirmationAndAdvance();

}

/* -----------------------------
   Preset response
----------------------------- */

async function sendPresetResponse(responseText, buttonEl){

  if (buttonEl){

    buttonEl.classList.add("response-btn-selected");

    document
      .querySelectorAll("#presetButtons .response-btn")
      .forEach(btn => {

        btn.style.pointerEvents = "none";

        if (btn !== buttonEl){
          btn.style.opacity = "0.35";
        }

      });

  }

  document.getElementById("sendResponseBtn").disabled = true;
  document.getElementById("skipBtn").disabled = true;

  if (await checkRateLimit(currentUser.id)){
    alert("You've reached today's response limit. Come back tomorrow.");
    return;
  }

  const { error } = await client
    .from("responses")
    .insert({
      post_id: currentPost.id,
      response_text: responseText,
      responder_anon_id: currentUser.id,
      status: "approved",
      response_type: "preset"
    });

  if (error){
    console.error(error);
    alert("Something went wrong. Try again.");
    return;
  }

  respondedPostIds.push(currentPost.id);

cancelStay();

await clearDraft(currentPost.id);

showConfirmationAndAdvance();

}

/* -----------------------------
   App start
----------------------------- */

async function init() {
  const authed = await requireAuth();
  if (!authed) return;

  await loadInitialPost();
}

document.addEventListener("visibilitychange", () => {

  isVisible = !document.hidden;

  if(document.hidden){
    cancelStay();
  }

});

window.addEventListener("beforeunload", cancelStay);

init();
