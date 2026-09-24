const SUPABASE_URL = "https://fjgshtktadaddwmshugw.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqZ3NodGt0YWRhZGR3bXNodWd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkzNzEzODQsImV4cCI6MjEwNDk0NzM4NH0.fMUzZ2chICrxSvRVdwrEb9TseFY532kC2KtsvV_zpGM";

const { createClient } = supabase;
const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* -----------------------------
   Menu
----------------------------- */

document.getElementById("menuBtn")?.addEventListener("click", () => {
  document.getElementById("menuDropdown")?.classList.toggle("hidden");
});

document.getElementById("menuSignOut")?.addEventListener("click", async (e) => {
  e.preventDefault();
  await client.auth.signOut();
  window.location.href = "auth.html";
});

/* -----------------------------
   Helpers
----------------------------- */

function formatWaiting(createdAt) {
  const mins = Math.floor((Date.now() - new Date(createdAt)) / 60000);

  if (mins < 1) return "Now";
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h`;

  return `${Math.floor(mins / 1440)}d`;
}

function formatRetry(time) {
  if (!time) return "—";

  return new Date(time).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}

/* -----------------------------
   Dashboard
----------------------------- */

async function loadDashboard() {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [
      pendingResult,
      classifiedResult,
      postsResult,
      stayedResult,
      queueResult
    ] = await Promise.all([

      client
        .from("posts")
        .select("id")
        .eq("moment_type", "pending"),

      client
        .from("posts")
        .select("created_at, classified_at, retries_before_classification")
        .not("classified_at", "is", null),

      client
      .from("posts")
      .select("moment_type, retries_before_classification, classified_at"),

      client
        .from("views")
        .select("post_id")
        .eq("qualified", true)
        .gte("created_at", startOfDay.toISOString()),

      client
        .from("posts")
        .select("id, created_at, retry_count, next_retry_at")
        .eq("moment_type", "pending")
        .order("created_at", { ascending: true })
        .limit(10)

    ]);

    /* -----------------------------
       Pending Thoughts
    ----------------------------- */

    const pendingCount = pendingResult.data?.length || 0;

    document.getElementById("pendingCount").textContent = pendingCount;

    document.getElementById("queueCount").textContent =
      pendingCount === 1
        ? "1 thought waiting"
        : `${pendingCount} thoughts waiting`;

    /* -----------------------------
       Average AI Time + Attempts
    ----------------------------- */

    const classified = classifiedResult.data || [];

    const avgCard = document.getElementById("avgTimeCard");
    const avgValue = document.getElementById("avgTime");
    const avgStatus = document.getElementById("avgTimeStatus");

    avgCard.classList.remove(
      "ai-good",
      "ai-warning",
      "ai-danger"
    );

    if (!classified.length) {

      avgValue.textContent = "—";
      avgStatus.textContent = "Waiting for data";

    } else {

      const totalSeconds = classified.reduce((sum, post) => {

        return sum + (
          new Date(post.classified_at) -
          new Date(post.created_at)
        ) / 1000;

      }, 0);

      const totalAttempts = classified.reduce((sum, post) => {

        return sum + ((post.retries_before_classification || 0) + 1);

      }, 0);

      const avgSeconds = totalSeconds / classified.length;
      const avgAttempts = totalAttempts / classified.length;

      avgValue.textContent =
        avgSeconds < 60
          ? `${Math.round(avgSeconds)}s`
          : `${Math.round(avgSeconds / 60)}m`;

      const attemptsText = `${avgAttempts.toFixed(1)} attempts avg`;

      if (avgSeconds < 10) {

        avgCard.classList.add("ai-good");
        avgStatus.textContent = `Healthy · ${attemptsText}`;

      } else if (avgSeconds < 30) {

        avgCard.classList.add("ai-warning");
        avgStatus.textContent = `Slowing · ${attemptsText}`;

      } else {

        avgCard.classList.add("ai-danger");
        avgStatus.textContent = `Attention · ${attemptsText}`;

      }

    }

    /* -----------------------------
       AI Success Rate
    ----------------------------- */

    const allPosts = postsResult.data || [];

    const totalPosts = allPosts.length;

    const successfulPosts = allPosts.filter(
      post => post.moment_type !== "pending"
    ).length;

    const successRate = totalPosts
      ? (successfulPosts / totalPosts) * 100
      : 0;

    document.getElementById("aiSuccessRate").textContent =
      `${successRate.toFixed(1)}%`;

    const successCard = document.getElementById("aiSuccessCard");
    const successStatus = document.getElementById("aiSuccessStatus");

    successCard.classList.remove(
      "ai-success-good",
      "ai-success-warning",
      "ai-success-danger"
    );

    const instantClassified = allPosts.filter(
      p =>
        p.moment_type !== "pending" &&
        (p.retries_before_classification || 0) === 0
    ).length;

    const retriedClassified = allPosts.filter(
      p =>
        p.moment_type !== "pending" &&
        (p.retries_before_classification || 0) > 0
    ).length;

    const pendingPosts = allPosts.filter(
      p => p.moment_type === "pending"
    ).length;

    successStatus.textContent =
      `${instantClassified} instant · ${retriedClassified} retried · ${pendingPosts} pending`;

    if (totalPosts === 0) {

      successStatus.textContent = "Waiting for data";

    } else if (successRate >= 98) {

      successCard.classList.add("ai-success-good");

    } else if (successRate >= 90) {

      successCard.classList.add("ai-success-warning");

    } else {

      successCard.classList.add("ai-success-danger");

    }

    /* -----------------------------
   Retry Distribution
----------------------------- */

const classifiedOnly = allPosts.filter(
  p => p.moment_type !== "pending"
);

const retryCard = document.getElementById("retryDistCard");
const retryPrimary = document.getElementById("retryDistPrimary");
const retrySecondary = document.getElementById("retryDistSecondary");

retryCard.classList.remove(
  "ai-good",
  "ai-warning",
  "ai-danger"
);

if (!classifiedOnly.length) {

  retryPrimary.textContent = "—";
  retrySecondary.textContent = "Waiting for data";

} else {

  const firstTry = classifiedOnly.filter(
    p => (p.retries_before_classification || 0) === 0
  ).length;

  const secondTry = classifiedOnly.filter(
    p => (p.retries_before_classification || 0) === 1
  ).length;

  const thirdPlus = classifiedOnly.filter(
    p => (p.retries_before_classification || 0) >= 2
  ).length;

  const firstPct = Math.round(firstTry / classifiedOnly.length * 100);
  const secondPct = Math.round(secondTry / classifiedOnly.length * 100);
  const thirdPct = Math.round(thirdPlus / classifiedOnly.length * 100);

  retryPrimary.textContent = `${firstPct}%`;

  retrySecondary.textContent =
    `${secondPct}% 2nd · ${thirdPct}% 3rd+`;

  if (firstPct >= 90) {
    retryCard.classList.add("ai-good");
  } else if (firstPct >= 70) {
    retryCard.classList.add("ai-warning");
  } else {
    retryCard.classList.add("ai-danger");
  }
}

    /* -----------------------------
       Someone Stayed Today
    ----------------------------- */

    const uniqueStayed = new Set(
      (stayedResult.data || []).map(v => v.post_id)
    ).size;

    const stayedCard = document.getElementById("stayedCard");
    const stayedStatus = document.getElementById("stayedStatus");

    stayedCard.classList.remove(
      "stayed-soft",
      "stayed-warm",
      "stayed-glow"
    );

    document.getElementById("stayedToday").textContent = uniqueStayed;

    if (uniqueStayed === 0) {

      stayedCard.classList.add("stayed-soft");
      stayedStatus.textContent = "No one yet";

    } else if (uniqueStayed < 25) {

      stayedCard.classList.add("stayed-warm");
      stayedStatus.textContent = "People are showing up";

    } else {

      stayedCard.classList.add("stayed-glow");
      stayedStatus.textContent = "The community is alive";

    }

    /* -----------------------------
       Pending Queue
    ----------------------------- */

    const queueList = document.getElementById("queueList");
    queueList.innerHTML = "";

    (queueResult.data || []).forEach(post => {

      const row = document.createElement("div");
      row.className = "queue-row";

      row.innerHTML = `
        <span>#${post.id}</span>
        <span>${formatWaiting(post.created_at)}</span>
        <span>${post.retry_count}</span>
        <span>${formatRetry(post.next_retry_at)}</span>
      `;

      queueList.appendChild(row);

    });

    if (!queueResult.data?.length) {

      queueList.innerHTML = `
        <div class="queue-empty">
          No pending thoughts waiting.
        </div>
      `;

    }

  } catch (err) {

    console.error("Dashboard error:", err);

  }
}

/* -----------------------------
   Start
----------------------------- */

loadDashboard();

setInterval(loadDashboard, 15000);