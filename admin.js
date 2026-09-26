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
        .select("moment_type, retries_before_classification, classified_at, ai_provider, ai_confidence"),

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
       Average AI Time
    ----------------------------- */

    const classified = classifiedResult.data || [];

    const avgCard = document.getElementById("avgTimeCard");
    const avgValue = document.getElementById("avgTime");
    const avgStatus = document.getElementById("avgTimeStatus");

    avgCard.classList.remove("ai-good", "ai-warning", "ai-danger");

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
       AI Provider Split
    ----------------------------- */

    const providerCard = document.getElementById("providerCard");
    const providerPrimary = document.getElementById("providerPrimary");
    const providerSecondary = document.getElementById("providerSecondary");

    providerCard.classList.remove("ai-good", "ai-warning", "ai-danger");

    const providerCounts = allPosts.reduce((acc, post) => {
      if (post.ai_provider) {
        acc[post.ai_provider] = (acc[post.ai_provider] || 0) + 1;
      }
      return acc;
    }, {});

    const totalProvider = Object.values(providerCounts).reduce((a, b) => a + b, 0);

    if (!totalProvider) {

      providerPrimary.textContent = "—";
      providerSecondary.textContent = "Waiting for data";

    } else {

      const sorted = Object.entries(providerCounts)
        .sort((a, b) => b[1] - a[1]);

      const [topProvider, topCount] = sorted[0];

      providerPrimary.textContent =
        `${Math.round((topCount / totalProvider) * 100)}% ${topProvider}`;

      providerSecondary.textContent =
        sorted
          .slice(1)
          .map(([name, count]) =>
            `${Math.round((count / totalProvider) * 100)}% ${name}`)
          .join(" · ") || "Only one provider used";

      if (topCount / totalProvider >= 0.9) {
        providerCard.classList.add("ai-good");
      } else if (topCount / totalProvider >= 0.7) {
        providerCard.classList.add("ai-warning");
      } else {
        providerCard.classList.add("ai-danger");
      }

    }

    /* -----------------------------
       Average Confidence
    ----------------------------- */

    const confidenceCard = document.getElementById("confidenceCard");
    const avgConfidenceEl = document.getElementById("avgConfidence");
    const confidenceStatus = document.getElementById("confidenceStatus");

    confidenceCard.classList.remove("ai-good", "ai-warning", "ai-danger");

    const confidencePosts = allPosts.filter(
      p => p.ai_confidence !== null && p.ai_confidence !== undefined
    );

    if (!confidencePosts.length) {

      avgConfidenceEl.textContent = "—";
      confidenceStatus.textContent = "Waiting for data";

    } else {

      const avgConfidence =
        confidencePosts.reduce((sum, p) => sum + p.ai_confidence, 0) /
        confidencePosts.length;

      avgConfidenceEl.textContent = `${Math.round(avgConfidence * 100)}%`;

      if (avgConfidence >= 0.9) {
        confidenceCard.classList.add("ai-good");
        confidenceStatus.textContent = "Very confident";
      } else if (avgConfidence >= 0.8) {
        confidenceCard.classList.add("ai-warning");
        confidenceStatus.textContent = "Healthy confidence";
      } else {
        confidenceCard.classList.add("ai-danger");
        confidenceStatus.textContent = "Needs review";
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