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

let respondedPostIds = [];
let blockedUserIds = [];
let optionsByCategory = {};
let cachedDraftPostIds = [];
let savedPostIds = new Set();

const feedPostCache = new Map();

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

}

function clearFeedQueue(
  category = selectedCategory
) {

  const key = getFeedQueueKey(category);

  if (!key) return;

  localStorage.removeItem(key);

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
function movePostToBack(
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

  queue.skipped.push(numericId);

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

    const start = performance.now();

    const result = await client
      .from("responses")
      .select("post_id")
      .eq("responder_anon_id", currentUser.id);

    console.log(
      "BACKGROUND: responses finished",
      Math.round(performance.now() - start),
      "ms"
    );

    if (!result.error) {

      respondedPostIds =
        (result.data || []).map(
          r => r.post_id
        );

      removeRespondedPostsFromQueue();

    } else {

      console.error(
        "Failed to load responded posts:",
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
      cachedDraftPostIds
    );

  })();

    const savedPostsPromise = (async () => {

    const start = performance.now();

    const result = await client
      .from("saved_posts")
      .select("post_id")
      .eq("user_id", currentUser.id);

    console.log(
      "BACKGROUND: saved posts finished",
      Math.round(performance.now() - start),
      "ms"
    );

    if (!result.error) {

      savedPostIds = new Set(
        (result.data || []).map(
          row => Number(row.post_id)
        )
      );

    } else {

      console.error(
        "Failed to load saved posts:",
        result.error
      );

    }

  })();

  const blockedPromise = (async () => {

    const start = performance.now();

    const result = await client
      .from("response_reports")
      .select("reported_user_id")
      .eq("reporter_id", currentUser.id);

    console.log(
      "BACKGROUND: blocked finished",
      Math.round(performance.now() - start),
      "ms"
    );

    return result;

  })();

  const blockedByPromise = (async () => {

    const start = performance.now();

    const result = await client
      .from("response_reports")
      .select("reporter_id")
      .eq("reported_user_id", currentUser.id);

    console.log(
      "BACKGROUND: blockedBy finished",
      Math.round(performance.now() - start),
      "ms"
    );

    return result;

  })();

  /*
   * Build the blocked-user list once those two
   * background queries finish.
   */

  Promise.all([
    blockedPromise,
    blockedByPromise
  ]).then(
    ([
      blockedResult,
      blockedByResult
    ]) => {

      const peopleIReported =
        (blockedResult?.data || [])
          .map(r => r.reported_user_id);

      const peopleWhoReportedMe =
        (blockedByResult?.data || [])
          .map(r => r.reporter_id);

      blockedUserIds = [
        ...new Set([
          ...peopleIReported,
          ...peopleWhoReportedMe
        ].filter(Boolean))
      ];

      console.log(
        "BACKGROUND: blocked users ready",
        blockedUserIds.length
      );

    }
  );

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

  const { data, error } = await client
    .from("response_options")
    .select("*");

  if (error) {

    console.error(
      "Response options load failed:",
      error
    );

    return;
  }

  optionsByCategory = {};

  data.forEach(opt => {

    if (!optionsByCategory[opt.need_category]) {
      optionsByCategory[opt.need_category] = [];
    }

    optionsByCategory[
      opt.need_category
    ].push(opt);

  });
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

  const { data, error } = await client
    .from("response_drafts")
    .select("post_id")
    .eq("responder_anon_id", currentUser.id);

  if (error) {

    console.error(
      "Failed to load draft post IDs:",
      error
    );

    return [];

  }

  return (data || [])
    .map(row => Number(row.post_id))
    .filter(Boolean);

}

function removeDraftPostsFromQueue(
  draftPostIds,
  category = selectedCategory
) {

  if (!draftPostIds.length) return;

  const queue = getFeedQueue(category);

  const draftIds = new Set(
    draftPostIds.map(Number)
  );

  queue.active = queue.active.filter(
    id => !draftIds.has(Number(id))
  );

  queue.skipped = queue.skipped.filter(
    id => !draftIds.has(Number(id))
  );

  console.log(
  "QUEUE REMOVE DRAFTS:",
  "active after removal =", queue.active.length,
  "skipped =", queue.skipped.length
);

  saveFeedQueue(queue, category);

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

      (data || []).forEach(post => {

        feedPostCache.set(
          Number(post.id),
          post
        );

      });

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

async function fetchNextPost(excludeCurrent = false) {

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

    const { data, error } = await client
  .from("posts")
  .select("id, content, anon_id, moment_type, created_at")
  .eq("id", Number(draftPostId))
  .maybeSingle();

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

    return {
  post: data,
  options: []
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
  queue.active.length < FEED_QUEUE_REFILL_THRESHOLD &&
  queue.skipped.length === 0
) {

        const existingIds = [
      ...queue.active,
      ...respondedPostIds,
      ...draftPostIds
    ].map(Number);

    console.log(
  "FEED EXCLUSIONS:",
  "existingIds =", existingIds.length,
  "active =", queue.active.length,
  "skipped =", queue.skipped.length,
  "responded =", respondedPostIds?.length || 0,
  "drafts =", draftPostIds?.length || 0
);

    /*
     * Ask Supabase for the next personalized
     * batch for THIS user.
     *
     * The ordering is deterministic per user,
     * so different users naturally see different
     * posts at the front of their feed.
     */

    console.log(
  "FEED: starting personalized RPC",
  Math.round(
    performance.now() - fetchStart
  ),
  "ms"
);

    const {
  data: personalizedPosts,
  error
} = await client.rpc(
  "get_personalized_feed_posts_data",
  {
    p_moment_type: getMomentType(),
    p_excluded_ids: existingIds,
    p_limit: FEED_FETCH_BATCH_SIZE
  }
);

    console.log(
  "FEED: personalized RPC finished",
  Math.round(
    performance.now() - fetchStart
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

    } else if (
      personalizedPosts &&
      personalizedPosts.length > 0
    ) {

      /*
       * The database has already ordered these
       * specifically for this user.
       *
       * Do NOT shuffle them here.
       */
      personalizedPosts.forEach(post => {

  feedPostCache.set(
    Number(post.id),
    post
  );

});

addPostsToQueue(
  personalizedPosts.map(
    post => post.id
  )
);

queue = getFeedQueue();

console.log(
  "FEED QUEUE AFTER REFILL:",
  "active =", queue.active.length,
  "skipped =", queue.skipped.length
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

if (queue.active.length > 0) {

  candidateIds = [
    ...queue.active
  ];

  if (excludeCurrent && currentPost?.id) {
    candidateIds = candidateIds.filter(
      id => Number(id) !== Number(currentPost.id)
    );
  }

} else {

  candidateIds = [
    ...queue.skipped
  ].filter(
    id =>
      Number(id) !==
      Number(currentPost?.id)
  );

}

if (candidateIds.length === 0) {

  return null;

}

/*
 * Only retrieve a small number of actual posts
 * from Supabase at a time.
 */

if (
  !excludeCurrent &&
  queue.active.length === 0 &&
  queue.skipped.length > 0
) {

  await hydrateSkippedPosts(
    selectedCategory,
    2
  );

}

let cachedCandidateIds = candidateIds.filter(
  id => feedPostCache.has(Number(id))
);

let uncachedCandidateIds = candidateIds.filter(
  id => !feedPostCache.has(Number(id))
);

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

  return {
  post,
  options: []
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

return fetchNextPost();

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

  currentPost = post;
  categoryState[selectedCategory].currentPost = post;
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

// Quietly preload the next post while the user reads
preloadNextPost();

// Continue hydrating remaining skipped posts in the background.
// This starts after preload has had a chance to use the first
// cached skipped post.
if (
  getFeedQueue(selectedCategory).active.length === 0 &&
  getFeedQueue(selectedCategory).skipped.length > 0
) {

  hydrateSkippedPosts(
    selectedCategory,
    FEED_QUEUE_LIMIT
  ).catch(error => {

    console.error(
      "Background skipped-post hydration failed:",
      error
    );

  });

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
 * Start skipped-post hydration immediately.
 * fetchNextPost() will reuse the same promise.
 */
const skippedHydrationPromise =
  hydrateSkippedPosts(
    selectedCategory,
    2
  );

/*
 * First actual post.
 */
const postStart =
  performance.now();

const result =
  await fetchNextPost();

await skippedHydrationPromise;

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

    const result = await fetchNextPost(true);

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

  /*
   * Immediately start preparing the post
   * after this one.
   */
  preloadNextPost();

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

    respondedPostIds.push(currentPost.id);
removePostFromQueue(currentPost.id);

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

  respondedPostIds.push(currentPost.id);
  removePostFromQueue(currentPost.id);

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

  respondedPostIds.push(currentPost.id);
  removePostFromQueue(currentPost.id);

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

window.addEventListener("beforeunload", cancelStay);

init();