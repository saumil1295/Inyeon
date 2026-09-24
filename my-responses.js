const SUPABASE_URL = "https://fjgshtktadaddwmshugw.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqZ3NodGt0YWRhZGR3bXNodWd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkzNzEzODQsImV4cCI6MjEwNDk0NzM4NH0.fMUzZ2chICrxSvRVdwrEb9TseFY532kC2KtsvV_zpGM";

const { createClient } = supabase;
const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let selectedPost = null;
let editCountdown = null;
let blockedUserIds = [];

const postsList = document.getElementById("postsList");
const emptyState = document.getElementById("emptyState");

// ---------- Menu ----------

document.getElementById("menuBtn").addEventListener("click", () => {
  document.getElementById("menuDropdown").classList.toggle("hidden");
});

document.getElementById("menuSignOut").addEventListener("click", async (e) => {
  e.preventDefault();
  await client.auth.signOut();
  location.href = "auth.html";
});

// ---------- Modal Elements ----------

const deleteSheet = document.getElementById("deleteSheet");
const confirmDeleteBtn = document.getElementById("confirmDeleteBtn");
const cancelDeleteBtn = document.getElementById("cancelDeleteBtn");

const editModal = document.getElementById("editModal");
const editTextarea = document.getElementById("editTextarea");
const editTimer = document.getElementById("editTimer");
const saveEditBtn = document.getElementById("saveEditBtn");
const closeEditModal = document.getElementById("closeEditModal");

// ---------- Auth ----------

async function requireAuth() {
  const { data: { session } } = await client.auth.getSession();

  if (!session) {
    location.href = "auth.html";
    return false;
  }

  currentUser = session.user;

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

// ---------- Helpers ----------

function timeAgo(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 60000);

  if (diff < 1) return "just now";
  if (diff < 60) return `${diff}m ago`;
  if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;

  const days = Math.floor(diff / 1440);
  if (days < 7) return `${days}d ago`;

  return new Date(dateStr).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function formatPostDate(date) {
  return new Date(date).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function avatar(alias, color) {
  const el = document.createElement("div");
  el.className = "mini-avatar";
  el.style.background = color || "#7FA895";
  el.textContent = alias?.[0]?.toUpperCase() || "?";
  return el;
}

// ---------- Category ----------

function guessCategory(text) {
  const lower = text.toLowerCase();

  if (/(panic|anxiety|anxious|overthinking|worried|can't breathe)/.test(lower))
    return "Anxious";

  if (/(lonely|alone|isolated|no one|left out)/.test(lower))
    return "Lonely";

  if (/(hurt|heartbreak|heartbroken|cheated|ghosted|miss him|miss her)/.test(lower))
    return "Hurt";

  if (/(angry|frustrated|annoyed|irritated|fed up)/.test(lower))
    return "Frustrated";

  if (/(overwhelmed|burnout|burnt out|too much|exhausted|stressed)/.test(lower))
    return "Overwhelmed";

  if (/(calm|peaceful|at ease|relaxed)/.test(lower))
    return "Calm";

  if (/(settled|grounded|stable|content)/.test(lower))
    return "Settled";

  if (/(hopeful|optimistic|looking forward|things are getting better)/.test(lower))
    return "Optimistic";

  if (/(uplifted|inspired|encouraged|motivated)/.test(lower))
    return "Uplifted";

  if (/(grateful|thankful|appreciate|blessed)/.test(lower))
    return "Grateful";

  return "Calm";
}
// ---------- Edit ----------

function openEdit(post) {
  selectedPost = post;
  editTextarea.value = post.content;
  editModal.classList.remove("hidden");

  updateEditTimer();

  clearInterval(editCountdown);
  editCountdown = setInterval(updateEditTimer, 1000);
}

function closeEdit() {
  editModal.classList.add("hidden");
  clearInterval(editCountdown);
}

function updateEditTimer() {
  if (!selectedPost) return;

  const remaining = new Date(selectedPost.edit_until) - new Date();

  if (remaining <= 0) {
    editTimer.textContent = "Editing closed";
    editTextarea.disabled = true;
    saveEditBtn.disabled = true;
    clearInterval(editCountdown);
    return;
  }

  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);

  editTimer.textContent = `Editing available for ${mins}m ${secs}s`;
}

closeEditModal?.addEventListener("click", closeEdit);

saveEditBtn?.addEventListener("click", async () => {
  const text = editTextarea.value.trim();
  if (!text) return;

  const { error } = await client
    .from("posts")
    .update({
      content: text,
      need_category: guessCategory(text)
    })
    .eq("id", selectedPost.id)
    .eq("anon_id", currentUser.id)
    .gt("edit_until", new Date().toISOString());

  if (error) {
    console.error(error);
    return;
  }

  closeEdit();
  loadPosts();
});

// ---------- Report ----------

const reportOtherBtn = document.querySelector(".report-other");
const reportOtherBox = document.getElementById("reportOtherBox");
const reportOtherText = document.getElementById("reportOtherText");
const reportOtherCount = document.getElementById("reportOtherCount");
const submitOtherReport = document.getElementById("submitOtherReport");

const reportSheet = document.getElementById("reportSheet");
const closeReportSheet = document.getElementById("closeReportSheet");

let reportResponseId = null;
let reportUserId = null;

function resetReportSheet() {
  reportSheet.classList.add("hidden");

  reportOtherBox.classList.add("hidden");
  reportOtherText.value = "";
  reportOtherCount.textContent = "0/300";
  submitOtherReport.disabled = true;
}

closeReportSheet?.addEventListener("click", resetReportSheet);

reportSheet?.addEventListener("click", (e) => {
  if (e.target === reportSheet) {
    resetReportSheet();
  }
});

reportOtherBtn?.addEventListener("click", () => {
  reportOtherBox.classList.remove("hidden");
  reportOtherText.focus();
});

reportOtherText?.addEventListener("input", () => {
  reportOtherCount.textContent =
    `${reportOtherText.value.length}/300`;

  submitOtherReport.disabled =
    reportOtherText.value.trim().length === 0;
});

// ---------- Delete ----------

// Prevent clicks inside the sheet from bubbling
/* ---------- Delete ---------- */

/* ---------- Delete ---------- */

const sheetContent = document.querySelector("#deleteSheet .sheet-content");

sheetContent?.addEventListener("click", (e) => {
  e.stopPropagation();
});

deleteSheet?.addEventListener("click", () => {
  deleteSheet.classList.add("hidden");
});

cancelDeleteBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  deleteSheet.classList.add("hidden");
});

confirmDeleteBtn?.addEventListener("click", async (e) => {
  e.preventDefault();
  e.stopPropagation();

  if (!selectedPost) return;

  const { error } = await client
    .from("posts")
    .update({
      deleted_at: new Date().toISOString()
    })
    .eq("id", selectedPost.id)
    .eq("anon_id", currentUser.id);

  if (error) {
    console.error(error);
    return;
  }

  deleteSheet.classList.add("hidden");
  selectedPost = null;
  loadPosts();
});

document.querySelectorAll(".report-option:not(.report-other)").forEach(btn => {
  btn.addEventListener("click", async () => {

    const reason = btn.dataset.reason;

    // Prevent duplicate reports
    const { data: existing } = await client
      .from("response_reports")
      .select("id")
      .eq("response_id", reportResponseId)
      .eq("reporter_id", currentUser.id)
      .maybeSingle();

    if (existing) {
      reportSheet.classList.add("hidden");
      return;
    }

    const { error } = await client
  .from("response_reports")
  .insert({
  response_id: reportResponseId,
  reporter_id: currentUser.id,
  reported_user_id: reportUserId,
  reason,
  details: null
});

if (error) {
  if (error.code === "23505") {
    resetReportSheet();
showReportToast("Thanks. We'll review it.");
await removeReportedCard();
    return;
  }

  console.error(error);
  return;
}

resetReportSheet();
showReportToast("Thanks. We'll review it.");
await removeReportedCard();
  });
});

function showReportToast(message) {
  const toast = document.createElement("div");
  toast.className = "report-toast";
  toast.textContent = message;

  document.body.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add("show"));

  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 250);
  }, 2000);
}

submitOtherReport?.addEventListener("click", async () => {

  const text = reportOtherText.value.trim();

  if (!text) return;

  const { data: existing } = await client
    .from("response_reports")
    .select("id")
    .eq("response_id", reportResponseId)
    .eq("reporter_id", currentUser.id)
    .maybeSingle();

  if (existing) {
    reportSheet.classList.add("hidden");
    return;
  }

  const { error } = await client
    .from("response_reports")
    .insert({
  response_id: reportResponseId,
  reporter_id: currentUser.id,
  reported_user_id: reportUserId,
  reason: "Other",
  details: text
});

  if (!error) {
    resetReportSheet();
await removeReportedCard();
showReportToast("Thanks. We'll review it.");
  }
});

async function removeReportedCard() {
  const card = document.querySelector(
  `.response-menu-btn[data-post-id="${reportSheet.dataset.cardId}"]`
)?.closest(".post-block");

  if (!card) {
    await loadPosts();
    return;
  }

  card.style.transition =
    "opacity 240ms ease, transform 240ms ease, max-height 260ms ease, margin 260ms ease";

  card.style.opacity = "0";
  card.style.transform = "translateY(-10px)";
  card.style.maxHeight = card.offsetHeight + "px";

  requestAnimationFrame(() => {
    card.style.maxHeight = "0";
    card.style.marginTop = "0";
    card.style.marginBottom = "0";
    card.style.overflow = "hidden";
  });

  setTimeout(async () => {
    await loadPosts();
  }, 260);
}

// ---------- Load Posts ----------

async function loadPosts() {

  const { data: posts, error } = await client
    .from("posts")
    .select("*")
    .eq("anon_id", currentUser.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    return;
  }

  postsList.innerHTML = "";

  if (!posts?.length) {
    emptyState.classList.remove("hidden");
    return;
  }

  emptyState.classList.add("hidden");

  for (const post of posts) {

    const card = document.createElement("div");
    card.className = "post-block conversation-card";

    const canEdit = new Date(post.edit_until) > new Date();

    const minsLeft = Math.max(
      0,
      Math.floor((new Date(post.edit_until) - new Date()) / 60000)
    );

    card.innerHTML = `
  <div class="post-header">
    <div class="post-date">${formatPostDate(post.created_at)}</div>
    <button class="post-menu-btn">⋮</button>
  </div>

  <div class="post-text">${post.content}</div>

  <div class="edit-status">
    ${canEdit ? `Editing available for ${minsLeft}m left` : "Editing closed"}
  </div>

  <div class="divider-line"></div>
`;

    const menuBtn = card.querySelector(".post-menu-btn");

    menuBtn.addEventListener("click", e => {

      e.stopPropagation();

      document.querySelectorAll(".post-popup-menu").forEach(m => m.remove());

      const menu = document.createElement("div");
      menu.className = "post-popup-menu";

      if (canEdit) {

        const edit = document.createElement("button");
        edit.textContent = "Edit";

        edit.addEventListener("click", ev => {
          ev.stopPropagation();
          menu.remove();
          openEdit(post);
        });

        menu.appendChild(edit);
      }

      const del = document.createElement("button");
      del.textContent = "Delete";
      del.className = "delete-option";

      del.addEventListener("click", (ev) => {
  ev.stopPropagation();
  menu.remove();
  selectedPost = post;

  const sheet = document.getElementById("deleteSheet");
  if (sheet) {
    sheet.classList.remove("hidden");
  } else {
    console.error("deleteSheet not found.");
  }
});
      menu.appendChild(del);

      card.appendChild(menu);
    });

    // ----- Responses -----

    let responsesQuery = client
  .from("responses")
  .select("*")
  .eq("post_id", post.id)
  .order("created_at", { ascending: true });

if (blockedUserIds.length) {
  responsesQuery = responsesQuery.not(
    "responder_anon_id",
    "in",
    `(${blockedUserIds.join(",")})`
  );
}

const { data: visibleResponses } = await responsesQuery;

if (!visibleResponses.length) {
  postsList.appendChild(card);
  continue;
};

   const { data: existingReport } = await client
  .from("response_reports")
  .select("id")
  .eq("response_id", visibleResponses[0].id)
  .eq("reporter_id", currentUser.id)
  .maybeSingle();

const alreadyReported = !!existingReport;


    const { data: responderProfile } = await client
  .from("profiles")
  .select("alias, avatar_color")
  .eq("id", visibleResponses[0].responder_anon_id)
  .maybeSingle();

    const responder = responderProfile || {
      alias: "Companion",
      avatar_color: "#7FA895"
    };

    const header = document.createElement("div");
header.className = "reply-header";

header.appendChild(avatar(responder.alias, responder.avatar_color));

const meta = document.createElement("div");
meta.className = "reply-meta";

meta.innerHTML = `
  <strong>${responder.alias}</strong>
  replied · ${timeAgo(visibleResponses[0].created_at)}
`;

header.appendChild(meta);

// Only allow reporting for written responses
if (visibleResponses[0].response_type === "written") {

  if (alreadyReported) {

    const reported = document.createElement("div");
    reported.className = "reported-badge";
    reported.innerHTML = "✓ Reported";

    header.appendChild(reported);

  } else {

    const reportBtn = document.createElement("button");
    reportBtn.className = "response-menu-btn";
    reportBtn.dataset.postId = post.id;
    reportBtn.textContent = "⋯";

    reportBtn.addEventListener("click", (e) => {
  e.stopPropagation();

  reportResponseId = visibleResponses[0].id;
reportUserId = visibleResponses[0].responder_anon_id;
  reportSheet.dataset.cardId = post.id;

  reportSheet.classList.remove("hidden");
});

    header.appendChild(reportBtn);
  }


}

card.appendChild(header);

    const firstResponse = document.createElement("div");
    firstResponse.className = "first-response";

    firstResponse.textContent =
  visibleResponses[0].message_text ??
  visibleResponses[0].response_text ??
  visibleResponses[0].content ??
  "";

    card.appendChild(firstResponse);

    const { data: conversation } = await client
      .from("conversations")
      .select("id")
      .eq("post_id", post.id)
      .eq("responder_id", visibleResponses[0].responder_anon_id)
      .maybeSingle();

    if (conversation) {

      const { data: messages } = await client
        .from("conversation_messages")
        .select("message_text,sender_id,created_at")
        .eq("conversation_id", conversation.id)
        .order("created_at", { ascending: true });

      if (messages?.length) {

        const preview = document.createElement("div");
        preview.className = "conversation-preview";

        const visible =
          messages.length <= 4
            ? messages
            : messages.slice(-4);

        if (messages.length > 4) {

          const earlier = document.createElement("div");
          earlier.className = "conversation-earlier";
          earlier.textContent = "Earlier messages…";

          preview.appendChild(earlier);
        }

        visible.forEach(msg => {

          const isMe = msg.sender_id === currentUser.id;

          const row = document.createElement("div");
          row.className = `preview-row ${isMe ? "preview-you" : "preview-them"}`;

          const sender = document.createElement("div");
          sender.className = "preview-sender";
          sender.textContent = isMe ? "You" : responder.alias;

          const bubble = document.createElement("div");
          bubble.className = `preview-bubble ${isMe ? "bubble-you" : "bubble-them"}`;
          bubble.textContent = msg.message_text;

          row.append(sender, bubble);
          preview.appendChild(row);
        });

        card.appendChild(preview);
      }

      const btn = document.createElement("button");
      btn.className = "conversation-btn";
      btn.textContent = "Continue conversation →";

      btn.addEventListener("click", () => {
        location.href = `conversation.html?conversation_id=${conversation.id}`;
      });

      card.appendChild(btn);
    }

    postsList.appendChild(card);
  }
}

// Close the 3-dot menu when clicking elsewhere
document.addEventListener("click", e => {
  if (
    !e.target.closest(".post-popup-menu") &&
    !e.target.closest(".post-menu-btn")
  ) {
    document.querySelectorAll(".post-popup-menu").forEach(m => m.remove());
  }
});

// ---------- Init ----------

(async () => {
  if (await requireAuth()) {
    await loadPosts();
  }
})();