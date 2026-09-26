const SUPABASE_URL = "https://fjgshtktadaddwmshugw.supabase.co";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";

const { createClient } = supabase;
const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const menuBtn = document.getElementById("menuBtn");
const alertsList = document.getElementById("alertsList");
const emptyState = document.getElementById("emptyState");

menuBtn?.addEventListener("click", () => {
  window.location.href = "profile.html";
});

let currentUser = null;

async function requireAuth() {
  const { data: { session } } = await client.auth.getSession();

  if (!session) {
    window.location.href = "auth.html";
    return false;
  }

  currentUser = session.user;
  return true;
}

function timeAgo(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 60000);

  if (diff < 1) return "just now";
  if (diff < 60) return `${diff}m ago`;
  if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;

  const days = Math.floor(diff / 1440);
  if (days < 7) return `${days}d ago`;

  return new Date(dateStr).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric"
  });
}

async function loadAlerts() {

  const { data: alerts, error } = await client
    .from("response_acknowledgments")
    .select(`
      id,
      created_at,
      responses (
        id
      )
    `)
    .eq("responder_id", currentUser.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    return;
  }

  alertsList.innerHTML = "";

  if (!alerts?.length) {
    emptyState.classList.remove("hidden");
    return;
  }

  emptyState.classList.add("hidden");

  alerts.forEach(alert => {

    const card = document.createElement("div");
    card.className = "alert-card";

    card.innerHTML = `
      <div class="alert-icon">🌿</div>

      <div class="alert-content">
        <h3>Your words were received.</h3>

        <p>Someone appreciated that you showed up for their story.</p>

        <span class="alert-time">${timeAgo(alert.created_at)}</span>
      </div>
    `;

    alertsList.appendChild(card);

    requestAnimationFrame(() => {
      card.classList.add("show");
    });

  });

}

(async () => {
  if (await requireAuth()) {
    await loadAlerts();
  }
})();