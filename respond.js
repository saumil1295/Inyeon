const SUPABASE_URL = "https://fjgshtktadaddwmshugw.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqZ3NodGt0YWRhZGR3bXNodWd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkzNzEzODQsImV4cCI6MjEwNDk0NzM4NH0.fMUzZ2chICrxSvRVdwrEb9TseFY532kC2KtsvV_zpGM";

const { createClient } = supabase;
const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

console.log(
  "SUPABASE CLIENT CREATED"
);

// View transition disabled for direct navigation

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
    data: { session }
  } = await client.auth.getSession();

  if (!session) {
    window.location.href = "auth.html";
    return false;
  }

  currentSession = session;
  currentUser = session.user;

  return true;
}

async function loadProfileInBackground() {

  if (!currentUser?.id) return;

  const { data: profile, error } = await client
    .from("profiles")
    .select("*")
    .eq("id", currentUser.id)
    .maybeSingle();

  if (error) {
    console.error("Profile load failed:", error);
    return;
  }

  if (!profile) {
    console.error(
      "Profile not found for authenticated user"
    );
    return;
  }

  currentProfile = profile;
}

async function getFreshAccessToken() {

  const {
    data: {
      session
    },
    error
  } = await client.auth.refreshSession();

  if (error || !session?.access_token) {

    console.error(
      "Unable to refresh authentication session:",
      error
    );

    return null;
  }

  currentSession = session;
  currentUser = session.user;

  return session.access_token;
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
  clearTimeout(stayEngagementTimer);

  stayTimer = null;
  stayEngagementTimer = null;

  activePostId = null;
  stayStartTime = null;
}

async function qualifyStay(postId) {
  console.log("QUALIFY STAY CALLED", postId);

  if (!currentUser) {
    console.log("STAY: no current user");
    return;
  }

  if (!postId) {
    console.log("STAY: no post ID");
    return;
  }

  // Check whether this user has already qualified a stay on this post
  const { data: existingView, error: existingError } = await client
    .from("views")
    .select("id, qualified")
    .eq("post_id", postId)
    .eq("viewer_id", currentUser.id)
    .maybeSingle();

  if (existingError) {
    console.error("STAY CHECK ERROR:", existingError);
    return;
  }

  // Already qualified — do nothing
  if (existingView?.qualified === true) {
    console.log(`STAY: already qualified for post ${postId}`);

    clearTimeout(stayTimer);
    clearTimeout(stayEngagementTimer);

    stayTimer = null;
    stayEngagementTimer = null;

    return;
  }

  // First qualification
  const { data, error } = await client
    .from("views")
    .upsert(
      {
        post_id: postId,
        viewer_id: currentUser.id,
        qualified: true
      },
      {
        onConflict: "post_id,viewer_id"
      }
    )
    .select("id, qualified")
    .single();

  if (error) {
    console.error("STAY UPSERT ERROR:", error);
    return;
  }

  clearTimeout(stayTimer);
  clearTimeout(stayEngagementTimer);

  stayTimer = null;
  stayEngagementTimer = null;

  if (data?.qualified) {
    console.log(`Someone stayed on post ${postId}`);
  }
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

    const elapsed =
      (Date.now() - stayStartTime) / 1000;

    if (elapsed < threshold) return;

    await qualifyStay(post.id);

    stayTimer = null;
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

let responseSafetyPopupMode = "normal";

const categoryState = {
  difficult: { currentPost: null },
  light: { currentPost: null }
};

const nextPostCache = {
  difficult: null,
  light: null
};

const nextPostPreloading = {
  difficult: false,
  light: false
};

const feedRefillPromise = {
  difficult: null,
  light: null
};

let respondedPostIds = [];

const RESPONDED_POST_IDS_CACHE_PREFIX =
  "inyeon_responded_post_ids_";

let blockedUserIds = [];
let optionsByCategory = {};
let cachedDraftPostIds = [];
let savedPostIds = new Set();

const DRAFT_POST_IDS_CACHE_PREFIX =
  "inyeon_draft_post_ids_";

function getRespondedPostsCacheKey() {

  return currentUser?.id
    ? `${RESPONDED_POST_IDS_CACHE_PREFIX}${currentUser.id}`
    : null;

}

function getDraftPostIdsCacheKey() {

  return currentUser?.id
    ? `${DRAFT_POST_IDS_CACHE_PREFIX}${currentUser.id}`
    : null;

}

function getSavedPostsCacheKey() {

  return currentUser?.id
    ? `inyeon_saved_post_ids_${currentUser.id}`
    : null;

}

const feedPostCache = new Map();

const restoredSkippedPostCategories =
  new Set();

  const clearedDraftPostIds = new Set();

const skippedPostHydration = {
  difficult: null,
  light: null
};

let stayTimer = null;
let stayEngagementTimer = null;
let activePostId = null;
let stayStartTime = null;
let isVisible = true;

/* -----------------------------
   Personal Feed Queue
----------------------------- */

const FEED_QUEUE_LIMIT = 30;
const FEED_QUEUE_REFILL_THRESHOLD = 5;
const FEED_FETCH_BATCH_SIZE = 20;
const FEED_QUEUE_HOURS = 24;

function getFeedQueueKey(category = selectedCategory) {

  if (!currentUser?.id) return null;

  return `feedQueue_${currentUser.id}_${category}`;

}

function getSkippedPostCacheKey(
  category = selectedCategory
) {
  if (!currentUser?.id) return null;

  return `feedSkippedPosts_${currentUser.id}_${category}`;
}

function restorePersistedSkippedPosts(
  category,
  skippedIds
) {
  const key =
    getSkippedPostCacheKey(category);

  if (!key || !skippedIds?.length) {
    return;
  }

  try {
    const stored =
      JSON.parse(
        localStorage.getItem(key)
      );

    if (
      !stored ||
      !stored.timestamp ||
      !Array.isArray(stored.posts)
    ) {
      return;
    }

    const age =
      Date.now() - stored.timestamp;

    if (
      age >
      FEED_QUEUE_HOURS * 60 * 60 * 1000
    ) {
      localStorage.removeItem(key);
      return;
    }

    const skippedSet =
      new Set(
        skippedIds.map(Number)
      );

    stored.posts.forEach(post => {
      const id = Number(post?.id);

      if (
        id &&
        skippedSet.has(id)
      ) {
        feedPostCache.set(
          id,
          post
        );
      }
    });

    console.log(
      "FEED: restored skipped posts from local cache",
      [...feedPostCache.keys()]
    );

  } catch (error) {
    console.warn(
      "FEED: skipped post cache restore failed:",
      error
    );
  }
}

function savePersistedSkippedPosts(
  category,
  skippedIds
) {
  const key =
    getSkippedPostCacheKey(category);

  if (!key) return;

  const posts =
    skippedIds
      .map(Number)
      .map(id =>
        feedPostCache.get(id)
      )
      .filter(Boolean)
      .slice(0, FEED_QUEUE_LIMIT);

  try {
    localStorage.setItem(
      key,
      JSON.stringify({
        posts,
        timestamp: Date.now()
      })
    );
  } catch (error) {
    console.warn(
      "FEED: skipped post cache save failed:",
      error
    );
  }
}

function getActivePostCacheKey(
  category = selectedCategory
) {

  if (!currentUser?.id) {
    return null;
  }

  return `feedActivePosts_${currentUser.id}_${category}`;
}


function restorePersistedActivePosts(
  category,
  activeIds
) {

  const key =
    getActivePostCacheKey(category);

  if (
    !key ||
    !Array.isArray(activeIds) ||
    activeIds.length === 0
  ) {
    return;
  }

  try {

    const stored =
      JSON.parse(
        localStorage.getItem(key)
      );

    if (
      !stored ||
      !stored.timestamp ||
      !Array.isArray(stored.posts)
    ) {
      return;
    }

    const age =
      Date.now() -
      stored.timestamp;

    if (
      age >
      FEED_QUEUE_HOURS *
      60 *
      60 *
      1000
    ) {

      localStorage.removeItem(key);

      return;
    }

    const activeSet =
      new Set(
        activeIds.map(Number)
      );

    let restoredCount = 0;

    stored.posts.forEach(post => {

      const id =
        Number(post?.id);

      if (
        Number.isFinite(id) &&
        activeSet.has(id)
      ) {

        feedPostCache.set(
          id,
          post
        );

        restoredCount++;
      }

    });

    console.log(
      "FEED: restored active posts from local cache",
      restoredCount
    );

  } catch (error) {

    console.warn(
      "FEED: active post cache restore failed:",
      error
    );

  }
}


function savePersistedActivePosts(
  category,
  activeIds
) {

  const key =
    getActivePostCacheKey(category);

  if (
    !key ||
    !Array.isArray(activeIds) ||
    activeIds.length === 0
  ) {
    return;
  }

  const posts =
    activeIds
      .map(Number)
      .map(id =>
        feedPostCache.get(id)
      )
      .filter(Boolean)
      .slice(0, FEED_QUEUE_LIMIT);

  if (posts.length === 0) {
    return;
  }

  try {

    localStorage.setItem(
      key,
      JSON.stringify({
        posts,
        timestamp: Date.now()
      })
    );

  } catch (error) {

    console.warn(
      "FEED: active post cache save failed:",
      error
    );

  }
}

function getFeedQueue(category = selectedCategory) {

  const key = getFeedQueueKey(category);

  if (!key) {
    return {
      active: [],
      skipped: []
    };
  }

  try {

    const stored = JSON.parse(
      localStorage.getItem(key)
    );

    if (!stored) {
      return {
        active: [],
        skipped: []
      };
    }

    const age =
      Date.now() - stored.timestamp;

    if (
      age >
      FEED_QUEUE_HOURS * 60 * 60 * 1000
    ) {

      localStorage.removeItem(key);

      return {
        active: [],
        skipped: []
      };

    }

    /*
     * New queue format:
     *
     * active: posts the user has not skipped
     * skipped: posts deliberately skipped by the user
     *
     * This guarantees skipped posts remain
     * behind all active posts.
     */

    if (
  Array.isArray(stored.active) &&
  Array.isArray(stored.skipped)
) {

  /*
   * Restore persisted active posts.
   *
   * This allows the feed to display
   * immediately without hydrating active
   * post IDs from Supabase.
   */
  // restorePersistedActivePosts(
//   category,
//   stored.active
// );

  /*
   * Restore persisted skipped posts only once
   * per category during this page session.
   */
  if (
    !restoredSkippedPostCategories.has(
      category
    )
  ) {

    restorePersistedSkippedPosts(
      category,
      stored.skipped
    );

    restoredSkippedPostCategories.add(
      category
    );
  }

  return {
    active: stored.active,
    skipped: stored.skipped
  };
}

    /*
     * Convert the old flat queue format
     * into the new active queue format.
     */

    if (Array.isArray(stored.queue)) {

      return {
        active: stored.queue,
        skipped: []
      };

    }

    return {
      active: [],
      skipped: []
    };

  } catch {

    return {
      active: [],
      skipped: []
    };

  }

}

function saveFeedQueue(
  queue,
  category = selectedCategory
) {
  const key = getFeedQueueKey(category);

  if (!key) return;

  const active = [
    ...new Set(
      queue.active.map(Number)
    )
  ].slice(0, FEED_QUEUE_LIMIT);

  const skipped = [
    ...new Set(
      queue.skipped.map(Number)
    )
  ].slice(0, FEED_QUEUE_LIMIT);

  localStorage.setItem(
    key,
    JSON.stringify({
      active,
      skipped,
      timestamp: Date.now()
    })
  );

  savePersistedSkippedPosts(
    category,
    skipped
  );
}

function clearFeedQueue(
  category = selectedCategory
) {

    restoredSkippedPostCategories.delete(
    category
  );

  const key =
    getFeedQueueKey(category);

  const skippedCacheKey =
    getSkippedPostCacheKey(category);

  if (key) {
    localStorage.removeItem(key);
  }

  if (skippedCacheKey) {
    localStorage.removeItem(
      skippedCacheKey
    );
  }
}

/*
 * Add newly discovered posts to the ACTIVE queue.
 *
 * New posts always go after existing active posts,
 * but BEFORE skipped posts.
 */
function addPostsToQueue(
  postIds,
  category = selectedCategory
) {

  const queue = getFeedQueue(category);

  const existing = new Set([
    ...queue.active,
    ...queue.skipped
  ]);

  postIds.forEach(id => {
  const numericId = Number(id);

  if (!existing.has(numericId)) {
    queue.active.push(numericId);
    existing.add(numericId);
  } else {
    console.log(
      "QUEUE ADD: rejected existing ID",
      numericId,
      "already in active =",
      queue.active.includes(numericId),
      "already in skipped =",
      queue.skipped.includes(numericId)
    );
  }
});

  console.log(
  "QUEUE ADD:",
  "adding =", postIds.length,
  "active before save =", queue.active.length,
  "skipped =", queue.skipped.length
);

  saveFeedQueue(queue, category);

}

/*
 * When a user skips a post:
 *
 * ACTIVE:
 * [A, B, C, D]
 *
 * Skip B
 *
 * ACTIVE:
 * [A, C, D]
 *
 * SKIPPED:
 * [B]
 *
 * This guarantees B stays behind all
 * non-skipped posts.
 */
async function movePostToBack(
  postId,
  category = selectedCategory
) {
  const numericId = Number(postId);

  if (!Number.isFinite(numericId)) {
    return;
  }

  const queue = getFeedQueue(category);

  queue.active = queue.active.filter(
    id => Number(id) !== numericId
  );

  if (!queue.skipped.includes(numericId)) {
    queue.skipped.push(numericId);
  }

  saveFeedQueue(queue, category);
}

/*
 * Remove a post completely from the queue.
 *
 * Used when the user has responded to it.
 */
function removePostFromQueue(
  postId,
  category = selectedCategory
) {

  const queue = getFeedQueue(category);

  const numericId = Number(postId);

  queue.active = queue.active.filter(
    id => Number(id) !== numericId
  );

  queue.skipped = queue.skipped.filter(
    id => Number(id) !== numericId
  );

  saveFeedQueue(queue, category);

}

/*
 * Remove all posts the user has already
 * responded to.
 */
function removeRespondedPostsFromQueue(
  category = selectedCategory
) {

  const queue = getFeedQueue(category);

  if (!respondedPostIds.length) return;

  const responded = new Set(
    respondedPostIds.map(Number)
  );

  queue.active = queue.active.filter(
    id => !responded.has(Number(id))
  );

  queue.skipped = queue.skipped.filter(
    id => !responded.has(Number(id))
  );

  console.log(
  "QUEUE REMOVE RESPONDED:",
  "active after removal =", queue.active.length,
  "skipped =", queue.skipped.length
);

  saveFeedQueue(queue, category);

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

let lastSavedDraftPostId = null;
let lastSavedDraftText = "";

let pendingDraft = null;

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

  const input =
    document.getElementById("responseInput");

  if (!input || !currentPost) return;

  /*
   * Track which draft is currently loaded
   * into the response box.
   */
  lastSavedDraftPostId =
    Number(currentPost.id);

  lastSavedDraftText =
    input.value.trim();

  input.oninput = () => {

    /*
     * Capture the post and text at the exact
     * moment the user edits the response.
     */
    const postId =
      Number(currentPost.id);

    const draftText =
  input.value.trim();

/*
 * Remember the latest draft immediately.
 * This allows us to flush it if the user
 * navigates away before the 500ms debounce fires.
 */
pendingDraft = {
  postId,
  draftText
};

/*
 * Reset the debounce timer.
 */
clearTimeout(draftTimer);

    /*
     * Wait until the user pauses typing before
     * doing any status update or database work.
     */
    draftTimer = setTimeout(async () => {

      /*
       * The user may have moved to another post
       * while the timer was waiting.
       */
      if (!Number.isFinite(postId)) {
        return;
      }

/*
 * --------------------------------------------------
 * EMPTY DRAFT
 * --------------------------------------------------
 *
 * Empty input must always be handled first.
 * Even if the previously tracked text is also empty,
 * the delete path needs to be evaluated explicitly.
 */
if (!draftText) {

  showDraftStatus(
    "Removing draft…",
    true
  );

  const { error } =
    await client
      .from("response_drafts")
      .delete()
      .eq("post_id", postId)
      .eq(
        "responder_anon_id",
        currentUser.id
      );

  if (error) {
    console.error(
      "Draft delete error:",
      error
    );

    return;
  }

  lastSavedDraftPostId =
    null;

  lastSavedDraftText =
    "";

  /*
   * Remove the post from the local
   * draft-ID cache.
   */
  cachedDraftPostIds =
    cachedDraftPostIds.filter(
      id =>
        Number(id) !== postId
    );

  /*
   * Protect this post from any stale
   * background draft cleanup.
   */
  clearedDraftPostIds.add(
    postId
  );

  try {

    const cacheKey =
      getDraftPostIdsCacheKey();

    if (cacheKey) {

      sessionStorage.setItem(
        cacheKey,
        JSON.stringify(
          cachedDraftPostIds
        )
      );

    }

  } catch (error) {

    console.warn(
      "DRAFTS: failed to update session cache:",
      error
    );

  }

  document
    .getElementById("draftStatus")
    ?.classList.add("hidden");

  console.log(
    "DRAFTS: deleted draft for post",
    postId
  );

  restoreClearedDraftToFeed(
    postId
  );

  return;
}

/*
 * --------------------------------------------------
 * UNCHANGED DRAFT
 * --------------------------------------------------
 */
if (
  postId === lastSavedDraftPostId &&
  draftText === lastSavedDraftText
) {

  console.log(
    "DRAFTS: unchanged — skipping save",
    postId
  );

  return;
}

      /*
       * --------------------------------------------------
       * CHANGED DRAFT
       * --------------------------------------------------
       */
      showDraftStatus(
        "Saving…",
        true
      );

      const { error } =
        await client
          .from("response_drafts")
          .upsert(
            {
              post_id: postId,
              responder_anon_id:
                currentUser.id,
              draft_text: draftText,
              updated_at:
                new Date().toISOString()
            },
            {
              onConflict:
                "post_id,responder_anon_id"
            }
          );

      if (error) {

        console.error(
          "Draft save error:",
          error
        );

        return;
      }

      /*
       * Remember exactly what was saved.
       */
      lastSavedDraftPostId =
  postId;

lastSavedDraftText =
  draftText;

pendingDraft = null;

      /*
       * Keep the lightweight draft-ID cache
       * synchronized with Supabase.
       */
      const draftIds =
        new Set(
          cachedDraftPostIds.map(Number)
        );

      draftIds.add(postId);

      cachedDraftPostIds =
        [...draftIds];

      try {

        const cacheKey =
          getDraftPostIdsCacheKey();

        if (cacheKey) {

          sessionStorage.setItem(
            cacheKey,
            JSON.stringify(
              cachedDraftPostIds
            )
          );

        }

      } catch (error) {

        console.warn(
          "DRAFTS: failed to update session cache:",
          error
        );

      }

      showDraftStatus(
        "🌿 Draft saved"
      );

    }, 500);
  };
}

async function flushPendingDraft() {

  if (
    !pendingDraft ||
    !currentUser?.id ||
    !currentSession?.access_token
  ) {
    return;
  }

  const {
    postId,
    draftText
  } = pendingDraft;

  if (!Number.isFinite(postId)) {
    return;
  }

  /*
   * Cancel the normal debounce timer.
   */
  clearTimeout(draftTimer);

  const url =
    `${SUPABASE_URL}/rest/v1/response_drafts`;

  const headers = {
    "Content-Type": "application/json",
    "apikey": SUPABASE_ANON_KEY,
    "Authorization":
      `Bearer ${currentSession.access_token}`,
    "Prefer":
      "resolution=merge-duplicates,return=minimal"
  };

  /*
   * Nothing typed — remove the draft.
   */
  if (!draftText) {

    fetch(
      `${url}?post_id=eq.${postId}&responder_anon_id=eq.${currentUser.id}`,
      {
        method: "DELETE",
        headers,
        keepalive: true
      }
    );

    console.log(
      "DRAFTS: flushed pending delete",
      postId
    );

    pendingDraft = null;

    return;
  }

  /*
   * Save the latest text immediately.
   *
   * keepalive allows the browser to continue
   * the request while the page is unloading.
   */
  fetch(
    url,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        post_id: postId,
        responder_anon_id:
          currentUser.id,
        draft_text: draftText,
        updated_at:
          new Date().toISOString()
      }),
      keepalive: true
    }
  );

  console.log(
    "DRAFTS: flushed pending save",
    postId
  );

  pendingDraft = null;
}

function restoreClearedDraftToFeed(postId) {

  const numericId =
    Number(postId);

  if (!Number.isFinite(numericId)) {
    return;
  }

  const alreadyResponded =
    respondedPostIds.some(
      id =>
        Number(id) === numericId
    );

  if (alreadyResponded) {

    console.log(
      "DRAFTS: not restoring responded post",
      numericId
    );

    return;
  }

  const queue =
    getFeedQueue(selectedCategory);

  /*
   * Remove the post from both queues first.
   *
   * This prevents duplicates if the post was
   * already sitting somewhere in the queue.
   */
  queue.active =
    queue.active.filter(
      id =>
        Number(id) !== numericId
    );

  queue.skipped =
    queue.skipped.filter(
      id =>
        Number(id) !== numericId
    );

  /*
   * A cleared draft behaves like a skipped post.
   *
   * It should return to the feed, but behind
   * all new / unseen posts.
   */
  queue.skipped.push(
    numericId
  );

  saveFeedQueue(
    queue,
    selectedCategory
  );

  console.log(
    "DRAFTS: cleared draft, restored to skipped backlog",
    numericId,
    "active =",
    queue.active.length,
    "skipped =",
    queue.skipped.length
  );
}

async function clearDraft(postId) {

  const { error } =
    await client
      .from("response_drafts")
      .delete()
      .eq("post_id", postId)
      .eq(
        "responder_anon_id",
        currentUser.id
      );

  if (error) {

    console.error(
      "DRAFTS: failed to delete draft:",
      error
    );

    return;

  }

  /*
   * Keep the local draft-ID cache synchronized.
   */
  cachedDraftPostIds =
    cachedDraftPostIds.filter(
      id => Number(id) !== Number(postId)
    );

  try {

    const cacheKey =
      getDraftPostIdsCacheKey();

    if (cacheKey) {

      sessionStorage.setItem(
        cacheKey,
        JSON.stringify(
          cachedDraftPostIds
        )
      );

    }

  } catch (error) {

    console.warn(
      "DRAFTS: failed to update session cache:",
      error
    );

  }

  /*
 * The draft is genuinely gone.
 *
 * Do not restore the post to the feed here.
 * clearDraft() is called after a successful response,
 * so the post has already been removed from the queue.
 */

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

async function loadSavedPostsInBackground() {

  if (!currentUser?.id) return;

  const cacheKey =
    getSavedPostsCacheKey();

  /*
   * Restore saved post IDs from the session cache.
   *
   * This is enough to immediately determine
   * whether the current post is saved.
   */
  if (cacheKey) {

    try {

      const cached =
        sessionStorage.getItem(
          cacheKey
        );

      if (cached) {

        const parsed =
          JSON.parse(cached);

        if (Array.isArray(parsed)) {

          savedPostIds =
            new Set(
              parsed
                .map(Number)
                .filter(Boolean)
            );

          console.log(
            "SAVED POSTS: restored from session cache",
            savedPostIds.size
          );

          /*
           * Refresh the current post's Save button
           * immediately using the cached state.
           */
          if (currentPost) {

            updateSaveState(
              currentPost.id
            );

          }

          return;

        }

      }

    } catch (error) {

      console.warn(
        "SAVED POSTS: session cache unavailable:",
        error
      );

    }

  }

  /*
   * No cache exists.
   * Fetch the saved post IDs from Supabase.
   */
  const start =
    performance.now();

  const result =
    await client
      .from("saved_posts")
      .select("post_id")
      .eq(
        "user_id",
        currentUser.id
      );

  const elapsed =
    Math.round(
      performance.now() - start
    );

  console.log(
    "BACKGROUND: saved posts finished",
    elapsed,
    "ms"
  );

  if (!result.error) {

    savedPostIds =
      new Set(
        (result.data || []).map(
          row => Number(row.post_id)
        )
      );

    /*
     * Save the lightweight ID list so future
     * page loads don't need this query.
     */
    if (cacheKey) {

      try {

        sessionStorage.setItem(
          cacheKey,
          JSON.stringify(
            [...savedPostIds]
          )
        );

        console.log(
          "SAVED POSTS: saved to session cache",
          savedPostIds.size
        );

      } catch (error) {

        console.warn(
          "SAVED POSTS: failed to save session cache:",
          error
        );

      }

    }

    /*
     * The first post may already be visible by
     * the time saved posts finish loading.
     */
    if (currentPost) {

      updateSaveState(
        currentPost.id
      );

    }

  } else {

    console.error(
      "Failed to load saved posts:",
      result.error
    );

  }

}

async function initCriticalFeedData() {

  console.log(
    "CRITICAL: startup filter loading started"
  );

  /*
   * These are all background-only.
   *
   * Nothing here should delay the first feed request.
   */

  const responsesPromise = (async () => {

  const cacheKey =
    getRespondedPostsCacheKey();

  /*
   * Restore responded post IDs from the
   * session cache when available.
   */
  if (cacheKey) {

    try {

      const cached =
        sessionStorage.getItem(
          cacheKey
        );

      if (cached) {

        const parsed =
          JSON.parse(cached);

        if (Array.isArray(parsed)) {

          respondedPostIds =
            parsed
              .map(Number)
              .filter(Boolean);

          console.log(
            "RESPONSES: restored from session cache",
            respondedPostIds.length
          );

          removeRespondedPostsFromQueue();

          return;

        }

      }

    } catch (error) {

      console.warn(
        "RESPONSES: session cache unavailable:",
        error
      );

    }

  }

  /*
   * No usable cache.
   * Fetch responded post IDs from Supabase.
   */
  const start =
    performance.now();

  const result =
    await client
      .from("responses")
      .select("post_id")
      .eq(
        "responder_anon_id",
        currentUser.id
      );

  const elapsed =
    Math.round(
      performance.now() - start
    );

  console.log(
    "RESPONSES QUERY TIME:",
    elapsed,
    "ms"
  );

  console.log(
    "BACKGROUND: responses finished",
    elapsed,
    "ms"
  );

  if (!result.error) {

    respondedPostIds =
      (result.data || [])
        .map(r => Number(r.post_id))
        .filter(Boolean);

    /*
     * Save the lightweight ID list so
     * subsequent page loads can avoid
     * this Supabase request.
     */
    if (cacheKey) {

      try {

        sessionStorage.setItem(
          cacheKey,
          JSON.stringify(
            respondedPostIds
          )
        );

        console.log(
          "RESPONSES: saved to session cache",
          respondedPostIds.length
        );

      } catch (error) {

        console.warn(
          "RESPONSES: failed to save session cache:",
          error
        );

      }

    }

    removeRespondedPostsFromQueue();

  } else {

    console.error(
      "Failed to load responded post IDs:",
      result.error
    );

  }

})();

  const draftsPromise = (async () => {

    const start = performance.now();

    const result =
      await getDraftPostIds();

    console.log(
      "BACKGROUND: drafts finished",
      Math.round(performance.now() - start),
      "ms"
    );

    cachedDraftPostIds =
      result || [];

    removeDraftPostsFromQueue(
  [...cachedDraftPostIds]
);

  })();

  /*
   * IMPORTANT:
   *
   * Do not await any of the above.
   *
   * The first feed request can start immediately.
   */

  return [];
}

async function initNonCriticalData() {

  const CACHE_KEY =
    "inyeon_response_options";

  /*
   * Response options are reference data and do not
   * need to be fetched on every page load.
   *
   * sessionStorage keeps the cache limited to the
   * current browser session.
   */

  try {

    const cached =
      sessionStorage.getItem(
        CACHE_KEY
      );

    if (cached) {

      const parsed =
        JSON.parse(cached);

      if (Array.isArray(parsed)) {

        optionsByCategory = {};

        parsed.forEach(opt => {

          if (
            !optionsByCategory[
              opt.need_category
            ]
          ) {
            optionsByCategory[
              opt.need_category
            ] = [];
          }

          optionsByCategory[
            opt.need_category
          ].push(opt);

        });

        console.log(
          "OPTIONS: restored from session cache"
        );

        return;
      }

    }

  } catch (error) {

    console.warn(
      "OPTIONS: session cache unavailable:",
      error
    );

  }

  /*
   * No usable cache — fetch from Supabase.
   */

  const start =
    performance.now();

  const { data, error } =
    await client
      .from("response_options")
      .select("*");

  console.log(
    "OPTIONS: Supabase query finished",
    Math.round(
      performance.now() - start
    ),
    "ms"
  );

  if (error) {

    console.error(
      "Response options load failed:",
      error
    );

    return;
  }

  optionsByCategory = {};

  (data || []).forEach(opt => {

    if (
      !optionsByCategory[
        opt.need_category
      ]
    ) {
      optionsByCategory[
        opt.need_category
      ] = [];
    }

    optionsByCategory[
      opt.need_category
    ].push(opt);

  });

  /*
   * Save the raw options so the next page load
   * can avoid the Supabase request.
   */

  try {

    sessionStorage.setItem(
      CACHE_KEY,
      JSON.stringify(data || [])
    );

    console.log(
      "OPTIONS: saved to session cache"
    );

  } catch (error) {

    console.warn(
      "OPTIONS: failed to save session cache:",
      error
    );

  }

}

async function loadProfileInBackground() {

  if (!currentUser?.id) return;

  const { data: profile, error } = await client
    .from("profiles")
    .select("*")
    .eq("id", currentUser.id)
    .maybeSingle();

  if (error) {
    console.error(
      "Profile load failed:",
      error
    );
    return;
  }

  if (!profile) {
    console.error(
      "Profile not found for authenticated user"
    );
    return;
  }

  currentProfile = profile;
}

async function getDraftPostIds() {

  if (!currentUser?.id) return [];

  /*
   * Restore the user's draft-post ID list from
   * sessionStorage first.
   *
   * The actual draft text is still loaded from
   * Supabase when the post is opened.
   */
  try {

    const cached =
      sessionStorage.getItem(
        getDraftPostIdsCacheKey()
      );

    if (cached) {

      const parsed =
        JSON.parse(cached);

      if (Array.isArray(parsed)) {

        console.log(
          "DRAFTS: restored from session cache",
          parsed.length
        );

        return parsed
          .map(Number)
          .filter(Boolean);

      }

    }

  } catch (error) {

    console.warn(
      "DRAFTS: session cache unavailable:",
      error
    );

  }

  /*
   * No usable cache exists.
   * Fetch the draft IDs from Supabase.
   */
  const start = performance.now();

  const { data, error } = await client
    .from("response_drafts")
    .select("post_id")
    .eq(
      "responder_anon_id",
      currentUser.id
    );

  const elapsed =
    Math.round(
      performance.now() - start
    );

  console.log(
    "DRAFT QUERY TIME:",
    elapsed,
    "ms"
  );

  if (error) {

    console.error(
      "Failed to load draft post IDs:",
      error
    );

    return [];

  }

  const draftIds =
    (data || [])
      .map(row => Number(row.post_id))
      .filter(Boolean);

  /*
   * Save only the lightweight ID list.
   */
  try {

    sessionStorage.setItem(
      getDraftPostIdsCacheKey(),
      JSON.stringify(draftIds)
    );

    console.log(
      "DRAFTS: saved to session cache",
      draftIds.length
    );

  } catch (error) {

    console.warn(
      "DRAFTS: failed to save session cache:",
      error
    );

  }

  return draftIds;
}

function removeDraftPostsFromQueue(
  draftPostIds,
  category = selectedCategory
) {
  if (!draftPostIds.length) return;

  const queue = getFeedQueue(category);

  const draftIds = new Set(
    draftPostIds
      .map(Number)
      .filter(
        id =>
          !clearedDraftPostIds.has(id)
      )
  );

  queue.active = queue.active.filter(
    id => !draftIds.has(Number(id))
  );

  queue.skipped = queue.skipped.filter(
    id => !draftIds.has(Number(id))
  );

  console.log(
    "QUEUE REMOVE DRAFTS:",
    "protected cleared drafts =",
    [...clearedDraftPostIds],
    "active after removal =",
    queue.active.length,
    "skipped =",
    queue.skipped.length
  );

  saveFeedQueue(
    queue,
    category
  );
}

async function hydrateSkippedPosts(
  category = selectedCategory,
  limit = FEED_QUEUE_LIMIT
) {

  if (skippedPostHydration[category]) {
    return skippedPostHydration[category];
  }

  const queue = getFeedQueue(category);

  const missingIds = queue.skipped
    .map(Number)
    .filter(
      id => !feedPostCache.has(id)
    );

  if (!missingIds.length) {
    return;
  }

  const idsToFetch = missingIds.slice(
    0,
    limit
  );

  skippedPostHydration[category] =
    (async () => {

      console.log(
        "FEED: hydrating skipped posts",
        idsToFetch.length
      );

      const start =
        performance.now();

      const rpcStart = performance.now();

const {
  data,
  error
} = await client.rpc(
  "get_feed_posts_by_ids",
  {
    p_post_ids: idsToFetch
  }
);

console.log(
  "FEED HYDRATION RPC TIME:",
  Math.round(
    performance.now() - rpcStart
  ),
  "ms"
);

      console.log(
  "FEED: skipped posts hydrated",
  Math.round(
    performance.now() - start
  ),
  "ms"
);

if (error) {

  console.error(
    "Skipped post hydration failed:",
    error
  );

  return;

}

console.log(
  "FEED HYDRATION RPC:",
  {
    requestedIds: idsToFetch,
    returnedCount: data?.length || 0,
    returnedIds: (data || []).map(
      post => Number(post.id)
    ),
    error
  }
);

(data || []).forEach(post => {

  feedPostCache.set(
    Number(post.id),
    post
  );

});

/*
 * Persist newly hydrated skipped posts so they
 * are available immediately on the next session.
 */
savePersistedSkippedPosts(
  category,
  queue.skipped
);

console.log(
  "FEED CACHE AFTER HYDRATION:",
  [...feedPostCache.keys()]
);

console.log(
  "FEED: persisted hydrated skipped posts"
);

console.log(
  "FEED SKIPPED IDS:",
  [...queue.skipped]
);

    })();

  try {

    await skippedPostHydration[category];

  } finally {

    skippedPostHydration[category] = null;

  }

}

/* -----------------------------
   Fetch next matching post
----------------------------- */

async function fetchNextPost(
  excludeCurrent = false,
  consumeSkipped = true
) {

  console.trace(
  "FETCH NEXT POST CALLER",
  "excludeCurrent =",
  excludeCurrent
);

  const fetchStart =
    performance.now();

  console.log(
    "FEED: fetchNextPost started"
  );

  /*
   * Direct-post mode
   */
  if (draftPostId && !draftPostLoaded) {

  draftPostLoaded = true;

  const numericDraftPostId =
    Number(draftPostId);

  /*
 * DIRECT POST CACHE
 *
 * First check the in-memory feed cache.
 * Then check the session cache populated
 * by given-responses.js before navigation.
 */
const cachedPost =
  feedPostCache.get(
    numericDraftPostId
  );

if (cachedPost) {

  /*
   * Restore the correct feed category
   * for a direct/draft post.
   *
   * support   → heavier / difficult
   * celebrate → lighter / light
   */
  if (cachedPost.moment_type === "celebrate") {
    selectedCategory = "light";
  } else {
    selectedCategory = "difficult";
  }

  updateSegmentUI();

  console.log(
    "DIRECT POST: restored from feed cache",
    numericDraftPostId,
    "category =",
    selectedCategory
  );

  return {
    post: cachedPost,
    options:
      optionsByCategory[cachedPost.moment_type] || []
  };

}

const sessionPostKey =
  `inyeon_direct_post_${numericDraftPostId}`;

try {

  const storedPost =
    sessionStorage.getItem(
      sessionPostKey
    );

  if (storedPost) {

    const parsedPost =
      JSON.parse(storedPost);

    if (
      parsedPost &&
      Number(parsedPost.id) ===
        numericDraftPostId
    ) {

      feedPostCache.set(
        numericDraftPostId,
        parsedPost
      );

      sessionStorage.removeItem(
        sessionPostKey
      );

      console.log(
        "DIRECT POST: restored from session cache",
        numericDraftPostId
      );

      return {
        post: parsedPost,
        options: []
      };
    }

  }

} catch (error) {

  console.warn(
    "DIRECT POST: session cache restore failed:",
    error
  );

}

  /*
   * --------------------------------------------------
   * DIRECT POST FALLBACK
   * --------------------------------------------------
   *
   * The post is not cached, so fetch it from
   * Supabase and immediately add it to the cache.
   */

  const directPostStart =
    performance.now();

  const { data, error } =
    await client
      .from("posts")
      .select(
        "id, content, anon_id, moment_type, created_at"
      )
      .eq(
        "id",
        numericDraftPostId
      )
      .maybeSingle();

  console.log(
    "DIRECT POST QUERY TIME:",
    Math.round(
      performance.now() -
      directPostStart
    ),
    "ms"
  );

  if (error) {

    console.error(
      "Direct post load failed:",
      error
    );

    return null;

  }

  if (!data) {

    console.error(
      "Direct post not found:",
      draftPostId
    );

    return null;

  }

  feedPostCache.set(
  numericDraftPostId,
  data
);

/*
 * Restore the correct feed category
 * for a direct/draft post.
 */
if (data.moment_type === "celebrate") {
  selectedCategory = "light";
} else {
  selectedCategory = "difficult";
}

updateSegmentUI();

console.log(
  "DIRECT POST: fetched from Supabase and cached",
  numericDraftPostId,
  "category =",
  selectedCategory
);

return {
  post: data,
  options:
    optionsByCategory[data.moment_type] || []
};

}

  /*
   * Remove anything the user has already answered.
   */
  removeRespondedPostsFromQueue();

const draftPostIds =
  cachedDraftPostIds || [];

removeDraftPostsFromQueue(
  draftPostIds
);

  let queue = getFeedQueue();

  console.log(
  "FEED DEBUG: after queue restore",
  Math.round(
    performance.now() - fetchStart
  ),
  "ms"
);


  /*
   * --------------------------------------------------
   * REFILL ACTIVE QUEUE
   * --------------------------------------------------
   *
   * We only fetch more posts when the active queue
   * is getting low.
   *
   * Skipped posts are deliberately NOT used here.
   */
  console.log(
  "FEED QUEUE:",
  "active =", queue.active.length,
  "skipped =", queue.skipped.length,
  "threshold =", FEED_QUEUE_REFILL_THRESHOLD
);

if (
  queue.active.length === 0
) {

  const category =
    selectedCategory;

  const existingIds = [
  ...queue.active,
  ...respondedPostIds,
  ...draftPostIds
].map(Number);

  /*
   * If a refill is already running,
   * reuse that promise instead of
   * starting another Supabase request.
   */
  if (!feedRefillPromise[category]) {

    console.log(
      "FEED: starting personalized RPC",
      Math.round(
        performance.now() - fetchStart
      ),
      "ms"
    );

    feedRefillPromise[category] =
  (async () => {

    const rpcStart =
      performance.now();

      console.log(
  "FEED RPC EXCLUDED IDS:",
  existingIds
);

    const {
      data: personalizedPosts,
      error
    } = await client.rpc(
      "get_personalized_feed_posts_data",
      {
        p_moment_type:
          getMomentType(),

        p_excluded_ids:
          existingIds,

        p_limit:
          FEED_FETCH_BATCH_SIZE
      }
    );

    console.log(
      "FEED: personalized RPC finished",
      Math.round(
        performance.now() - rpcStart
      ),
      "ms"
    );

    console.log(
      "FEED: personalized posts returned:",
      personalizedPosts?.length || 0
    );

    if (error) {

      console.error(
        "Personalized feed refill failed:",
        error
      );

      return;
    }

    if (
      personalizedPosts &&
      personalizedPosts.length > 0
    ) {

      personalizedPosts.forEach(
        post => {

          feedPostCache.set(
            Number(post.id),
            post
          );

        }
      );

      const newPostIds =
        personalizedPosts.map(
          post => post.id
        );

      addPostsToQueue(
  newPostIds,
  category
);

      savePersistedActivePosts(
        category,
        newPostIds
      );

    }

    const updatedQueue =
      getFeedQueue(category);

    console.log(
      "FEED QUEUE AFTER REFILL:",
      "active =",
      updatedQueue.active.length,
      "skipped =",
      updatedQueue.skipped.length
    );

  })()
  .finally(() => {

    feedRefillPromise[category] =
      null;

  });

  }

  /*
   * If we already have active posts,
   * let the current fetch continue immediately.
   *
   * Only wait when the queue is completely
   * empty and we have nothing to display.
   */
  if (
  queue.active.length === 0 &&
  queue.skipped.length === 0
) {
  await feedRefillPromise[category];

  queue =
    getFeedQueue(category);

      console.log(
    "FEED DEBUG: after refill wait",
    Math.round(
      performance.now() - fetchStart
    ),
    "ms",
    "active =",
    queue.active.length,
    "skipped =",
    queue.skipped.length
  );

  }

}


  /*
  /* --------------------------------------------------
   GET NEXT POST
-------------------------------------------------- */

/*
 * ACTIVE posts always have priority.
 *
 * Only when there are no active posts left
 * do we enter the skipped-post cycle.
 *
 * When the skipped cycle begins, the post
 * that was just skipped is excluded so it
 * cannot immediately appear again.
 */

let candidateIds = [];

let consumedSkippedPost = false;

if (queue.active.length > 0) {

  candidateIds = [
    ...queue.active
  ];

  if (excludeCurrent && currentPost?.id) {

    candidateIds =
      candidateIds.filter(
        id =>
          Number(id) !==
          Number(currentPost.id)
      );

  }

  } else {

    /*
     * No active posts remain.
     *
     * Start looking through the skipped backlog.
     *
     * IMPORTANT:
     * Do NOT remove the skipped post here.
     *
     * fetchNextPost() may only be preloading it.
     * The skipped post should be removed from the
     * backlog only when it is actually displayed.
     */
    candidateIds = [
      ...queue.skipped
    ].filter(
      id =>
        Number(id) !==
        Number(currentPost?.id)
    );

    if (
      consumeSkipped &&
      candidateIds.length > 0
    ) {

      consumedSkippedPost = true;

      console.log(
        "FEED: selected skipped post for display",
        Number(candidateIds[0]),
        "remaining skipped =",
        queue.skipped.length
      );
    }
  }

console.log(
  "FEED DEBUG: after candidate selection",
  Math.round(
    performance.now() - fetchStart
  ),
  "ms",
  "candidates =",
  candidateIds.length,
  "consumedSkipped =",
  consumedSkippedPost
);

if (candidateIds.length === 0) {
  return null;
}

/*
 * Only retrieve a small number of actual posts
 * from Supabase at a time.
 *
 * If skipped posts are already cached, continue
 * immediately and hydrate anything missing in
 * the background.
 *
 * If there are no cached skipped posts, hydrate
 * one post before continuing.
 */

let cachedCandidateIds = candidateIds.filter(
  id => feedPostCache.has(Number(id))
);

let uncachedCandidateIds = candidateIds.filter(
  id => !feedPostCache.has(Number(id))
);

let skippedHydrationPromise = null;

if (
  !excludeCurrent &&
  queue.active.length === 0 &&
  (
    queue.skipped.length > 0 ||
    consumedSkippedPost
  ) &&
  uncachedCandidateIds.length > 0
) {

  skippedHydrationPromise =
    hydrateSkippedPosts(
      selectedCategory,
      1
    );

  /*
   * If we already have a cached candidate,
   * do not wait for hydration.
   */
  if (cachedCandidateIds.length === 0) {

  await skippedHydrationPromise;

  console.log(
    "FEED DEBUG: after skipped hydration",
    Math.round(
      performance.now() - fetchStart
    ),
    "ms"
  );

  /*
   * Hydration may have populated the
     * in-memory cache, so refresh the lists.
     */
    cachedCandidateIds =
      candidateIds.filter(
        id => feedPostCache.has(Number(id))
      );

    uncachedCandidateIds =
      candidateIds.filter(
        id => !feedPostCache.has(Number(id))
      );

  }
}

/*
 * Skipped posts should normally have already been
 * hydrated above. Keep the fallback list small.
 */
const batchIds =
  queue.active.length === 0 &&
  queue.skipped.length > 0

    ? cachedCandidateIds.slice(
        0,
        excludeCurrent ? 1 : 10
      )

    : [
        ...cachedCandidateIds,
        ...uncachedCandidateIds
      ].slice(0, 10);

/*
 * Posts returned directly by the personalized RPC
 * are already fully hydrated.
 *
 * Only query Supabase for IDs that are not
 * currently in the in-memory cache.
 */

const cachedPosts = [];

const missingIds = [];

for (const id of batchIds) {

  const cachedPost =
    feedPostCache.get(Number(id));

  if (cachedPost) {

    cachedPosts.push(cachedPost);

  } else {

    missingIds.push(Number(id));

  }

}

let posts = [
  ...cachedPosts
];

/*
 * Older posts already stored in localStorage
 * may not exist in the current session cache.
 *
 * Only fetch those missing posts.
 */

if (
  missingIds.length > 0 &&
  queue.active.length > 0 &&
  !excludeCurrent
) {

  console.log(
    "FEED: starting cached-ID hydration RPC",
    Math.round(
      performance.now() - fetchStart
    ),
    "ms"
  );

  const {
    data: fetchedPosts,
    error
  } = await client.rpc(
    "get_feed_posts_by_ids",
    {
      p_post_ids: missingIds
    }
  );

  console.log(
    "FEED: cached-ID hydration RPC finished",
    Math.round(
      performance.now() - fetchStart
    ),
    "ms"
  );

  if (error) {

    console.error(
      "Cached-ID hydration RPC failed:",
      error
    );

    return null;

  }

  (fetchedPosts || []).forEach(post => {

    feedPostCache.set(
      Number(post.id),
      post
    );

    posts.push(post);

  });

}

console.log(
  "FEED DEBUG: before post lookup",
  Math.round(
    performance.now() - fetchStart
  ),
  "ms",
  "posts =",
  posts.length,
  "batchIds =",
  batchIds.length
);

const postMap = new Map(
  (posts || []).map(post => [
    Number(post.id),
    post
  ])
);

/*
 * Find the first available post according
 * to our queue order.
 */
for (const id of batchIds) {

  const post =
    postMap.get(Number(id));

  if (!post) continue;

      const cameFromSkipped =
      queue.active.length === 0 &&
      candidateIds.includes(
        Number(post.id)
      );

return {
  post,
  options: [],
  cameFromSkipped
};
}

/*
 * If queued posts disappeared from the database,
 * remove only those stale IDs that we actually
 * checked in this batch.
 */
const availableIds = new Set(
  (posts || []).map(
    post => Number(post.id)
  )
);

const checkedIds = new Set(
  batchIds.map(Number)
);

queue.active =
  queue.active.filter(id => {

    const numericId = Number(id);

    if (!checkedIds.has(numericId)) {
      return true;
    }

    return availableIds.has(numericId);

  });

queue.skipped =
  queue.skipped.filter(id => {

    const numericId = Number(id);

    if (!checkedIds.has(numericId)) {
      return true;
    }

    return availableIds.has(numericId);

  });

saveFeedQueue(queue);

return null;

}

/* -----------------------------
   Save Posts
----------------------------- */

function updateSaveState(postId){

  currentPostSaved =
    savedPostIds.has(Number(postId));

  saveBtn?.classList.toggle(
    "saved",
    currentPostSaved
  );

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

  savedPostIds.add(
  Number(currentPost.id)
);

const cacheKey =
  getSavedPostsCacheKey();

if (cacheKey) {

  sessionStorage.setItem(
    cacheKey,
    JSON.stringify(
      [...savedPostIds]
    )
  );

}

sessionStorage.setItem(
  "newlySavedPostId",
  currentPost.id
);

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

  savedPostIds.delete(
  Number(currentPost.id)
);

const cacheKey =
  getSavedPostsCacheKey();

if (cacheKey) {

  sessionStorage.setItem(
    cacheKey,
    JSON.stringify(
      [...savedPostIds]
    )
  );

}

showToast("Removed from Saved");

}

  }

}

/* -----------------------------
   Render post
----------------------------- */

function displayPost(post, options) {
  const displayStart = performance.now();

  console.log(
    "DISPLAY: started"
  );

  /*
   * Always derive the feed category from
   * the actual post being displayed.
   *
   * support   → heavier
   * celebrate → lighter
   */
  if (post?.moment_type === "celebrate") {
    selectedCategory = "light";
  } else {
    selectedCategory = "difficult";
  }

  updateSegmentUI();

  currentPost = post;
  categoryState[selectedCategory].currentPost = post;

  console.log(
    "DISPLAY: category resolved",
    selectedCategory,
    "moment_type =",
    post?.moment_type
  );
  updateSaveState(post.id);

  console.log(
    "DISPLAY: after updateSaveState",
    Math.round(
      performance.now() - displayStart
    ),
    "ms"
  );

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

  console.log(
    "DISPLAY: after HTML render",
    Math.round(
      performance.now() - displayStart
    ),
    "ms"
  );

  saveBtn.onclick = toggleSave;

  const input = document.getElementById("responseInput");
  const counter = document.getElementById("charCount");
  const hint = document.getElementById("writingHint");
  const sendBtn = document.getElementById("sendResponseBtn");

// Someone Stayed — response box engagement
input.onfocus = async () => {
  console.log("RESPONSE BOX FOCUSED", post.id);

  if (!currentUser) {
    console.log("STAY: no current user");
    return;
  }

  if (post.anon_id === currentUser.id) {
    console.log("STAY: own post");
    return;
  }

  if (!isVisible) {
    console.log("STAY: page not visible");
    return;
  }

  // Check whether this post has already been qualified
  const { data: existingView, error: existingError } = await client
    .from("views")
    .select("qualified")
    .eq("post_id", post.id)
    .eq("viewer_id", currentUser.id)
    .maybeSingle();

  if (existingError) {
    console.error("STAY CHECK ERROR:", existingError);
    return;
  }

  // Already counted — don't start another engagement timer
  if (existingView?.qualified === true) {
    console.log(`STAY: post ${post.id} already qualified`);
    return;
  }

  clearTimeout(stayEngagementTimer);

  stayEngagementTimer = setTimeout(async () => {
    console.log("STAY: 2 second engagement reached", post.id);

    if (!isVisible) {
      console.log("STAY: page not visible");
      return;
    }

    await qualifyStay(post.id);

    stayEngagementTimer = null;
  }, 2000);
};

input.onblur = () => {
  clearTimeout(stayEngagementTimer);
  stayEngagementTimer = null;
};

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

console.log(
  "DISPLAY: after draft setup",
  Math.round(
    performance.now() - displayStart
  ),
  "ms"
);

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

trackStay(post);

console.log(
  "DISPLAY: after trackStay",
  Math.round(
    performance.now() - displayStart
  ),
  "ms"
);

  // Remember where this category was left
categoryState[selectedCategory].currentPost = post;

// Quietly preload the next post while the user reads.
// displayPost() is the single owner of next-post preloading.
if (
  !nextPostCache[selectedCategory] &&
  !nextPostPreloading[selectedCategory]
) {
  preloadNextPost();
}

console.log(
  "DISPLAY: finished",
  Math.round(
    performance.now() - displayStart
  ),
  "ms"
);
}

function hydratePresetButtons(post) {

  if (!post) return;

  const container =
    document.getElementById("presetButtons");

  if (!container) return;

  const options =
    optionsByCategory[post.moment_type] || [];

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

  container.innerHTML =
    presetButtonsHtml;

  container
    .querySelectorAll(".response-btn")
    .forEach(btn => {

      btn.addEventListener("click", () => {

        sendPresetResponse(
          btn.dataset.text,
          btn
        );

      });

    });

}

/* -----------------------------
   First load after category pick
----------------------------- */

async function loadInitialPost() {

  const startupStart =
    performance.now();

  console.log(
    "STARTUP: loadInitialPost started"
  );

  /*
   * Start non-critical requests immediately.
   */
  const profilePromise =
    loadProfileInBackground();

  const optionsPromise =
    initNonCriticalData();

  console.log(
    "STARTUP: background requests started",
    Math.round(
      performance.now() - startupStart
    ),
    "ms"
  );

  /*
   * Critical feed data.
   */
  const criticalStart =
  performance.now();

const draftPostIds =
  await initCriticalFeedData();

console.log(
  "STARTUP: critical feed data finished",
  Math.round(
    performance.now() - criticalStart
  ),
  "ms"
);

/*
 * First actual post.
 */
const postStart =
  performance.now();

const result =
  await fetchNextPost();

  console.log(
    "STARTUP: fetchNextPost finished",
    Math.round(
      performance.now() - postStart
    ),
    "ms"
  );

  if (!result) {

    postContainer.classList.add("hidden");
    noPosts.classList.remove("hidden");

    return;
  }

  console.log(
    "STARTUP: first post ready",
    Math.round(
      performance.now() - startupStart
    ),
    "ms"
  );

  /*
   * Render immediately.
   */
  displayPost(
    result.post,
    []
  );

  /*
 * Saved posts are not required to render the feed.
 *
 * Start loading them only after the first post
 * has already been displayed.
 */
loadSavedPostsInBackground();

  /*
   * Hydrate quick responses when available.
   */
  optionsPromise
    .then(() => {

      console.log(
        "STARTUP: options finished",
        Math.round(
          performance.now() - startupStart
        ),
        "ms"
      );

      if (currentPost) {

        hydratePresetButtons(
          currentPost
        );

      }

    })
    .catch(error => {

      console.error(
        "Background response options failed:",
        error
      );

    });

  /*
   * Profile remains non-critical.
   */
  profilePromise
    .catch(error => {

      console.error(
        "Background profile load failed:",
        error
      );

    });

}

/* -----------------------------
   Preload next post
----------------------------- */

async function preloadNextPost() {

  const preloadStart = performance.now();

  const category = selectedCategory;

  if (nextPostCache[category]) {
    return;
  }

  if (nextPostPreloading[category]) {
    return;
  }

  nextPostPreloading[category] = true;

  try {

    const result =
  await fetchNextPost(
    true,
    false
  );

    if (result) {
      nextPostCache[category] = result;
      console.log(
  "NEXT POST PRELOADED",
  result.post.id,
  Math.round(performance.now() - preloadStart),
  "ms"
);
    }

  } catch (error) {

    console.error(
      "NEXT POST PRELOAD FAILED:",
      error
    );

  } finally {

    nextPostPreloading[category] = false;

  }

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

async function animateToNextPost() {

  const content =
    document.getElementById("responseContent");

  const category = selectedCategory;

  /*
   * If the next post is already preloaded,
   * we do not need to wait for the network.
   *
   * Keep the 220ms exit animation so the
   * transition remains visually smooth.
   */
  const cached = nextPostCache[category];

  content.classList.add("exiting");

 if (cached) {

  await new Promise(r =>
    setTimeout(r, 220)
  );

  nextPostCache[category] = null;

  /*
   * The post is now actually being displayed.
   * If it came from the skipped backlog,
   * consume it now rather than during preload.
   */
  if (cached.cameFromSkipped) {

  const queue =
    getFeedQueue(category);

  const cachedPostId =
    Number(cached.post.id);

  queue.skipped =
    queue.skipped.filter(
      id =>
        Number(id) !== cachedPostId
    );

  saveFeedQueue(
    queue,
    category
  );

  console.log(
    "FEED: displayed skipped post",
    cachedPostId,
    "remaining skipped =",
    queue.skipped.length
  );
}

  displayPost(
    cached.post,
    cached.options
  );

  } else {

    /*
     * Preload wasn't ready yet.
     *
     * Give the exit animation time to play
     * while the fallback fetch happens.
     */
    const fetchPromise =
      fetchNextPost();

    await new Promise(r =>
      setTimeout(r, 220)
    );

    const result =
      await fetchPromise;

    if (!result) {

      postContainer.classList.add("hidden");
      noPosts.classList.remove("hidden");
      content.classList.remove("exiting");

      return;
    }

    displayPost(
      result.post,
      result.options
    );
  }

  /*
   * Finish the transition.
   */
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

  /*
   * Skipping does NOT exclude the post.
   * It moves the post to the back of this
   * user's queue for this category.
   */
  movePostToBack(currentPost.id);

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
   * move directly to the next post.
   */
  if (type === "hold") {

    animateToNextPost();

    return;
  }

  /*
   * Subsequent written responses:
   * show the small floating confirmation,
   * then move to the next post.
   */
  if (type === "written") {

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

    return;
  }

  /*
   * Any other response type:
   * move directly to the next post.
   */
  animateToNextPost();

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

function showAccountSuspendedPopup(suspendedUntil) {

  responseSafetyPopupMode = "suspended";

  if (!responseSafetyCheck) return;

  if (responseSafetyTitle) {
    responseSafetyTitle.textContent =
      "Your account has been suspended.";
  }

  if (responseSafetyText) {
    responseSafetyText.textContent =
      "You can't send responses until your suspension ends.";
  }

  if (responseSafetyQuestion) {

    let endDateText = "your suspension ends";

    if (suspendedUntil) {

      const date = new Date(suspendedUntil);

      if (!Number.isNaN(date.getTime())) {

        endDateText =
          `Suspension ends: ${date.toLocaleDateString(
            "en-IN",
            {
              day: "numeric",
              month: "long",
              year: "numeric"
            }
          )}.`;

      }

    }

    responseSafetyQuestion.textContent =
      endDateText;
  }

  if (sendAnywayBtn) {
    sendAnywayBtn.classList.add("hidden");
    sendAnywayBtn.style.display = "none";
  }

  if (editResponseBtn) {
    editResponseBtn.textContent = "Okay";
  }

  responseSafetyCheck.classList.remove("hidden");
  responseSafetyCheck.style.display = "block";
}

function showResponseSafetyPopup(
  type = "normal",
  violationCount = null
) {

  responseSafetyPopupMode = type;

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

      if (violationCount === 2) {

        responseSafetyQuestion.textContent =
          "This is your second serious violation. One more serious violation will result in your account being suspended.";

      } else {

        responseSafetyQuestion.textContent =
          "Please edit your response before sending it.";

      }

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
   PRE-SUBMIT CHECKS
--------------------------------------------- */

let result;

try {

  /*
   * These two operations are independent.
   * Run them simultaneously instead of waiting
   * for the rate-limit query before refreshing
   * the access token.
   */
  const [
    rateLimitReached,
    accessToken
  ] = await Promise.all([
    checkRateLimit(currentUser.id),
    getFreshAccessToken()
  ]);

  if (rateLimitReached) {

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

  if (!accessToken) {

    alert(
      "Your session has expired. Please sign in again."
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

  const response = await fetch(
    `${SUPABASE_URL}/functions/v1/submit-response`,
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_ANON_KEY,
        "Authorization":
          `Bearer ${accessToken}`
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

  showAccountSuspendedPopup(
    result.suspended_until
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

    if (result.enforcement?.account_status === "suspended") {
  showAccountSuspendedPopup(
    result.enforcement?.suspended_until
  );
} else {
  showResponseSafetyPopup(
    "urgent",
    result.enforcement?.urgent_violation_count
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

    respondedPostIds.push(
  Number(currentPost.id)
);

const cacheKey =
  getRespondedPostsCacheKey();

if (cacheKey) {

  sessionStorage.setItem(
    cacheKey,
    JSON.stringify(
      respondedPostIds
    )
  );

}

removePostFromQueue(
  currentPost.id
);

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

    if (responseSafetyPopupMode === "suspended") {

    responseSafetyCheck?.classList.add("hidden");
    responseSafetyCheck.style.display = "none";

    responseSafetyPopupMode = "normal";

    if (editResponseBtn) {
      editResponseBtn.textContent = "Edit response";
    }

    return;
  }

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

    const accessToken = await getFreshAccessToken();

if (!accessToken) {

  alert(
    "Your session has expired. Please sign in again."
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

const response = await fetch(
  `${SUPABASE_URL}/functions/v1/submit-response`,
  {
    method: "POST",

    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_ANON_KEY,
      "Authorization":
        `Bearer ${accessToken}`
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

  showAccountSuspendedPopup(
    result.suspended_until
  );

} else {

        alert(
          "Something went wrong. Try again."
        );

      }

      return;
    }

    if (
  result.backend_action === "withhold"
) {

  respondedPostIds.push(
  Number(currentPost.id)
);

const cacheKey =
  getRespondedPostsCacheKey();

if (cacheKey) {

  sessionStorage.setItem(
    cacheKey,
    JSON.stringify(
      respondedPostIds
    )
  );

}

removePostFromQueue(
  currentPost.id
);

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

    const accessToken = await getFreshAccessToken();

if (!accessToken) {

  alert(
    "Your session has expired. Please sign in again."
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

const response = await fetch(
  `${SUPABASE_URL}/functions/v1/submit-response`,
  {
    method: "POST",

    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_ANON_KEY,
      "Authorization":
        `Bearer ${accessToken}`
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

  showAccountSuspendedPopup(
    result.suspended_until
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

  respondedPostIds.push(
  Number(currentPost.id)
);

const cacheKey =
  getRespondedPostsCacheKey();

if (cacheKey) {

  sessionStorage.setItem(
    cacheKey,
    JSON.stringify(
      respondedPostIds
    )
  );

}

removePostFromQueue(
  currentPost.id
);

  cancelStay();

      await clearDraft(currentPost.id);

      showConfirmationAndAdvance(
        recognitionType
      );

      return;
    }

    if (result.backend_action === "urgent") {

  pendingResponseText = responseText;
  pendingResponsePostId = currentPost.id;
  pendingResponseWasWarned = true;

  if (result.enforcement?.account_status === "suspended") {
    showAccountSuspendedPopup(
      result.enforcement?.suspended_until
    );
  } else {
    showResponseSafetyPopup(
      "urgent",
      result.enforcement?.urgent_violation_count
    );
  }

  return;
}

if (result.backend_action === "withhold") {

  pendingResponseText = responseText;
  pendingResponsePostId = currentPost.id;
  pendingResponseWasWarned = true;

  showResponseSafetyPopup("normal");

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

window.addEventListener(
  "beforeunload",
  cancelStay
);

window.addEventListener(
  "beforeunload",
  flushPendingDraft
);

init();