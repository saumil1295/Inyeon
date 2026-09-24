const SUPABASE_URL = "https://fjgshtktadaddwmshugw.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqZ3NodGt0YWRhZGR3bXNodWd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkzNzEzODQsImV4cCI6MjEwNDk0NzM4NH0.fMUzZ2chICrxSvRVdwrEb9TseFY532kC2KtsvV_zpGM";

const { createClient } = supabase;
const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

document.getElementById("menuBtn")?.addEventListener("click", () => {
  document.getElementById("menuDropdown").classList.toggle("hidden");
});

document.getElementById("menuSignOut")?.addEventListener("click", async (e) => {
  e.preventDefault();
  await client.auth.signOut();
  window.location.href = "auth.html";
});

let currentUser = null;
let blockedUserIds = [];

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

  const [reported, reportedBy] = await Promise.all([
  client
    .from("response_reports")
    .select("reported_user_id")
    .eq("reporter_id", currentUser.id),

  client
    .from("response_reports")
    .select("reporter_id")
    .eq("reported_user_id", currentUser.id)
]);

blockedUserIds = [
  ...(reported.data || []).map(r => r.reported_user_id),
  ...(reportedBy.data || []).map(r => r.reporter_id)
];

return true;
}

/* -----------------------------
   Time helpers
----------------------------- */

function timeAgo(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();

  const diffMins = Math.floor((now - date) / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "1 day ago";
  if (diffDays < 7) return `${diffDays} days ago`;

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function formatPostDate(dateStr) {
  return new Date(dateStr).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/* -----------------------------
   Avatar
----------------------------- */

function makeAvatar(alias, color) {
  const circle = document.createElement("div");
  circle.classList.add("mini-avatar");
  circle.style.background = color || "#7FA895";
  circle.textContent = alias ? alias[0].toUpperCase() : "?";
  return circle;
}

/* -----------------------------
   Someone Stayed
----------------------------- */

function getStayedMessage(count) {
  switch (count) {
    case 1:
      return "Someone stayed with your words.";
    case 2:
      return "Two people stayed with your words.";
    case 3:
      return "Three people stayed with your words.";
    default:
      return `${count} people stayed with your words.`;
  }
}

const givenList = document.getElementById("givenList");
const emptyState = document.getElementById("emptyState");

/* -----------------------------
   Load Responses
----------------------------- */

async function loadGivenResponses() {

  /* ---------- Drafts ---------- */

  const { data: drafts, error: draftsError } = await client
    .from("response_drafts")
    .select(`
      id,
      post_id,
      draft_text,
      updated_at,
      posts(content, created_at, anon_id)
    `)
    .eq("responder_anon_id", currentUser.id)
    .order("updated_at", { ascending: false });

  if (draftsError) {
    console.error(draftsError);
  }

  /* ---------- Responses ---------- */

  const { data: responses, error } = await client
    .from("responses")
    .select(`
      *,
      posts(
        id,
        content,
        anon_id,
        created_at,
        profiles(alias, avatar_color)
      )
    `)
    .eq("responder_anon_id", currentUser.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    return;
  }

  const visibleDrafts = (drafts || []).filter(
  draft => !blockedUserIds.includes(draft.posts?.anon_id)
);

const visibleResponses = (responses || []).filter(
  response => !blockedUserIds.includes(response.posts?.anon_id)
);

if (visibleResponses.length === 0 &&
    visibleDrafts.length === 0) {

  emptyState.classList.remove("hidden");
  return;
}

emptyState.classList.add("hidden");
givenList.innerHTML = "";

if (visibleDrafts.length) {

  const section = document.createElement("div");
  section.className = "draft-section";

  givenList.appendChild(section);

  visibleDrafts.forEach(draft => {

  /* -----------------------------
     Draft section
  ----------------------------- */

      const card = document.createElement("div");
      card.className = "draft-card";

      card.innerHTML = `
        <div class="shared-card-top">
          <div class="draft-pill">🌿 Waiting for you</div>
          <span class="shared-date">${timeAgo(draft.updated_at)}</span>
        </div>

        <p class="shared-post-label">You're responding to</p>

        <p class="shared-post-text">
          ${draft.posts?.content || "A post"}
        </p>

        <div class="draft-divider"></div>

        <p class="draft-label">Your draft</p>

        <p class="draft-preview">
          ${
            draft.draft_text.length > 140
              ? draft.draft_text.slice(0,140) + "..."
              : draft.draft_text
          }
        </p>

        <button class="continue-btn draft-continue-btn">
          Continue writing →
        </button>
      `;

      card.querySelector(".draft-continue-btn")
        .addEventListener("click", () => {
          window.location.href = `respond.html?post=${draft.post_id}`;
        });

      givenList.appendChild(card);

    });

  }

  /* -----------------------------
     Response cards
  ----------------------------- */

  for (const response of visibleResponses) {

    const card = document.createElement("div");
    card.classList.add("shared-card");

    /* ---------- Date ---------- */

    const top = document.createElement("div");
    top.classList.add("shared-card-top");

    const dateEl = document.createElement("span");
    dateEl.classList.add("shared-date");
    dateEl.textContent = formatPostDate(response.created_at);

    top.appendChild(dateEl);
    card.appendChild(top);

    /* ---------- Poster ---------- */

    const posterAlias = response.posts?.profiles?.alias || "Someone";
    const posterColor = response.posts?.profiles?.avatar_color || "#7FA895";

    const postHeader = document.createElement("div");
    postHeader.classList.add("poster-header");

    postHeader.appendChild(makeAvatar(posterAlias, posterColor));

    const postMeta = document.createElement("div");
    postMeta.classList.add("poster-meta");

    const aliasText = document.createElement("span");
    aliasText.classList.add("poster-name");
    aliasText.textContent = posterAlias;

    postMeta.appendChild(aliasText);
    postHeader.appendChild(postMeta);
    card.appendChild(postHeader);

    /* ---------- Original post ---------- */

    const postText = document.createElement("p");
    postText.classList.add("shared-post-text");
    postText.textContent = response.posts?.content || "a post";
    card.appendChild(postText);

    /* ---------- Someone Stayed ---------- */

    const { count: stayCount } = await client
      .from("views")
      .select("*", { count: "exact", head: true })
      .eq("post_id", response.post_id)
      .eq("qualified", true);

    if (stayCount > 0) {

      const stayed = document.createElement("p");
      stayed.classList.add("stayed-message");
      stayed.textContent = getStayedMessage(stayCount);

      card.appendChild(stayed);

    }

    /* ---------- Reply header ---------- */

    const header = document.createElement("div");
    header.classList.add("reply-header");

    const meta = document.createElement("div");
    meta.classList.add("reply-meta");

    const statusLabel =
      response.status === "pending"
        ? "Awaiting review"
        : "You replied";

    meta.innerHTML =
      `<strong>${statusLabel}</strong> · ${timeAgo(response.created_at)}`;

    header.appendChild(meta);
    card.appendChild(header);

    /* ---------- Your first response ---------- */

    const firstResponse = document.createElement("div");
    firstResponse.classList.add("first-response");
    firstResponse.textContent =
      response.response_text ??
      response.message_text ??
      response.text ??
      response.content ??
      "";

    card.appendChild(firstResponse);

    /* ---------- Conversation preview ---------- */

    if (response.response_type === "written" && response.posts?.anon_id) {

      const { data: convo } = await client
        .from("conversations")
        .select("id")
        .eq("post_id", response.post_id)
        .eq("responder_id", currentUser.id)
        .eq("poster_id", response.posts.anon_id)
        .maybeSingle();

      if (convo) {

        const { data: messages } = await client
          .from("conversation_messages")
          .select("message_text,sender_id,created_at")
          .eq("conversation_id", convo.id)
          .neq("status", "flagged")
          .order("created_at", { ascending: true });

        if (messages?.length) {

          const preview = document.createElement("div");
          preview.classList.add("conversation-preview");

          const MAX_PREVIEW = 4;

          const visible =
            messages.length <= MAX_PREVIEW
              ? messages
              : messages.slice(-MAX_PREVIEW);

          if (messages.length > MAX_PREVIEW) {

            const earlier = document.createElement("div");
            earlier.classList.add("conversation-earlier");
            earlier.textContent = "Earlier messages…";
            preview.appendChild(earlier);

          }

          visible.forEach(msg => {

            const isMine = msg.sender_id === currentUser.id;

            const row = document.createElement("div");
            row.classList.add(
              "preview-row",
              isMine ? "preview-you" : "preview-them"
            );

            const sender = document.createElement("div");
            sender.classList.add("preview-sender");
            sender.textContent = isMine ? "You" : posterAlias;

            const bubble = document.createElement("div");
            bubble.classList.add(
              "preview-bubble",
              isMine ? "bubble-you" : "bubble-them"
            );

            bubble.textContent = msg.message_text;

            row.appendChild(sender);
            row.appendChild(bubble);

            preview.appendChild(row);

          });

          card.appendChild(preview);

        }

        const continueBtn = document.createElement("button");
        continueBtn.classList.add("continue-btn");
        continueBtn.textContent = "Continue conversation →";

        continueBtn.addEventListener("click", () => {
          window.location.href =
            `conversation.html?conversation_id=${convo.id}`;
        });

        card.appendChild(continueBtn);

      }

    }

    givenList.appendChild(card);

  }

}

/* -----------------------------
   Init
----------------------------- */

async function init() {
  const authed = await requireAuth();
  if (!authed) return;

  await loadGivenResponses();

  // Refresh when returning to this tab after blocking someone.
  document.addEventListener("visibilitychange", async () => {
    if (!document.hidden) {
      await requireAuth();        // Reload blockedUserIds
      await loadGivenResponses(); // Re-render immediately
    }
  });
}

init();