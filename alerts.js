const SUPABASE_URL = "https://fjgshtktadaddwmshugw.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqZ3NodGt0YWRhZGR3bXNodWd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkzNzEzODQsImV4cCI6MjEwNDk0NzM4NH0.fMUzZ2chICrxSvRVdwrEb9TseFY532kC2KtsvV_zpGM";

const { createClient } = supabase;
const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const alertsList = document.getElementById("alertsList");
const emptyState = document.getElementById("emptyState");
const menuBtn = document.getElementById("menuBtn");

let currentUser = null;


// --------------------------------------------------
// MENU
// --------------------------------------------------

menuBtn?.addEventListener("click", () => {
  window.location.href = "profile.html";
});


// --------------------------------------------------
// AUTH
// --------------------------------------------------

async function requireAuth() {

  const {
    data: { session },
    error
  } = await client.auth.getSession();

  if (error || !session) {
    window.location.href = "auth.html";
    return false;
  }

  currentUser = session.user;

  return true;
}


// --------------------------------------------------
// TIME FORMAT
// --------------------------------------------------

function formatAlertTime(dateString) {

  const date = new Date(dateString);
  const now = new Date();

  const diff = Math.floor((now - date) / 1000);

  if (diff < 60) {
    return "Just now";
  }

  if (diff < 3600) {
    const minutes = Math.floor(diff / 60);
    return `${minutes}m ago`;
  }

  if (diff < 86400) {
    const hours = Math.floor(diff / 3600);
    return `${hours}h ago`;
  }

  if (diff < 604800) {
    const days = Math.floor(diff / 86400);
    return `${days}d ago`;
  }

  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short"
  });
}


// --------------------------------------------------
// ICON
// --------------------------------------------------

function getAlertIcon(type) {

  if (type === "stay") {
    return "🌿";
  }

  if (type === "hold") {
    return "🤍";
  }

  if (type === "written") {
    return "✦";
  }

  return "🌿";
}


// --------------------------------------------------
// LOAD ALERTS
// --------------------------------------------------

async function loadAlerts() {

  alertsList.innerHTML = "";

  const {
    data: notifications,
    error
  } = await client
    .from("notifications")
    .select(`
      id,
      post_id,
      response_id,
      type,
      message,
      is_read,
      created_at
    `)
    .eq("recipient_anon_id", currentUser.id)
    .order("created_at", { ascending: false });

  console.log("Logged-in user ID:", currentUser.id);
console.log("Notifications returned:", notifications);
console.log("Notification error:", error);

if (error) {
  console.error("Error loading notifications:", error);
  return;
}

  if (!notifications || notifications.length === 0) {
    emptyState.classList.remove("hidden");
    return;
  }

  emptyState.classList.add("hidden");

  notifications.forEach(notification => {

    const card = document.createElement("div");

    card.className = "alert-card";

    if (!notification.is_read) {
      card.classList.add("unread");
    }

    card.dataset.notificationId = notification.id;

    card.innerHTML = `
      <div class="alert-icon">
        ${getAlertIcon(notification.type)}
      </div>

      <div class="alert-content">

        <strong>
          ${escapeHtml(notification.message)}
        </strong>

        <div class="alert-time">
          ${formatAlertTime(notification.created_at)}
        </div>

      </div>
    `;

    card.addEventListener("click", () => {
      markAsRead(notification.id, card);
    });

    alertsList.appendChild(card);
  });
}


// --------------------------------------------------
// MARK AS READ
// --------------------------------------------------

async function markAsRead(notificationId, card) {

  if (!card.classList.contains("unread")) {
    return;
  }

  card.classList.remove("unread");

  const { error } = await client
    .from("notifications")
    .update({
      is_read: true
    })
    .eq("id", notificationId)
    .eq("recipient_anon_id", currentUser.id);

  if (error) {
    console.error("Error marking notification as read:", error);

    // Put the unread state back if the update failed.
    card.classList.add("unread");
  }
}


// --------------------------------------------------
// ESCAPE HTML
// --------------------------------------------------

function escapeHtml(value) {

  const div = document.createElement("div");

  div.textContent = value ?? "";

  return div.innerHTML;
}


// --------------------------------------------------
// INIT
// --------------------------------------------------

(async () => {

  const authenticated = await requireAuth();

  if (!authenticated) {
    return;
  }

  await loadAlerts();

})();