// Replace these with your actual Supabase project values
// Find them in Supabase dashboard → Project Settings → API
const SUPABASE_URL = "https://fjgshtktadaddwmshugw.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqZ3NodGt0YWRhZGR3bXNodWd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkzNzEzODQsImV4cCI6MjEwNDk0NzM4NH0.fMUzZ2chICrxSvRVdwrEb9TseFY532kC2KtsvV_zpGM";

const { createClient } = supabase;
const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Generate a simple anonymous ID and store it locally per device/browser
function getAnonId() {
  let id = localStorage.getItem("inyeon_anon_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("inyeon_anon_id", id);
  }
  return id;
}

const submitBtn = document.getElementById("submitBtn");
const postText = document.getElementById("postText");
const confirmation = document.getElementById("confirmation");

function detectCrisis(text) {
  const lower = text.toLowerCase();

  const crisisKeywords = [
    "kill myself", "end my life", "suicide", "want to die",
    "don't want to live", "no reason to live", "better off dead",
    "hurt myself", "self harm", "cutting myself", "ending it all",
    "can't go on", "not worth living"
  ];

  return crisisKeywords.some(keyword => lower.includes(keyword));
}

function guessCategory(text) {
  const lower = text.toLowerCase();

  const categoryKeywords = {
    heartbreak: ["breakup", "broke up", "ex ", "heartbreak", "heartbroken", "dumped", "left me"],
    loneliness: ["lonely", "alone", "no one", "isolated", "nobody"],
    work_burnout: ["burnout", "exhausted", "overworked", "job", "boss", "workload", "tired of work"],
    anxiety: ["anxious", "anxiety", "panic", "overwhelmed", "can't breathe", "racing thoughts"],
    family_conflict: ["family", "parents", "mom", "dad", "sister", "brother"],
    grief: ["died", "passed away", "loss", "grief", "miss him", "miss her"],
    self_doubt: ["not good enough", "failure", "stuck", "worthless", "doubt myself"],
    exam_stress: ["exam", "results", "marks", "studying", "test tomorrow"],
    financial_stress: ["money", "debt", "broke", "can't afford", "financial"],
    existential_drift: ["lost", "no direction", "purpose", "what am i doing", "meaningless"]
  };

  for (const [category, keywords] of Object.entries(categoryKeywords)) {
    if (keywords.some(keyword => lower.includes(keyword))) {
      return category;
    }
  }

  return "general"; // fallback — never leave a post uncategorized
}

submitBtn.addEventListener("click", async () => {
  const text = postText.value.trim();
  if (!text) return;

  const isCrisis = detectCrisis(text);
  const guessedCategory = isCrisis ? null : guessCategory(text);

  const { error } = await client.from("posts").insert({
    content: text,
    anon_id: getAnonId(),
    need_category: guessedCategory,
    status: isCrisis ? "flagged" : "active"
  });

  if (error) {
    console.error(error);
    alert("Something went wrong. Try again.");
    return;
  }

  postText.value = "";

  if (isCrisis) {
    showCrisisResponse();
  } else {
    confirmation.classList.remove("hidden");
    setTimeout(() => confirmation.classList.add("hidden"), 3000);
  }
});

function showCrisisResponse() {
  confirmation.innerHTML = `
    <div class="crisis-message">
      <p>It sounds like you're carrying a lot right now.</p>
      <p>What you're feeling matters, and you deserve support beyond what this app can give.</p>
      <p><strong>iCall</strong> is free and confidential: <a href="tel:+919152987821">+91 9152987821</a></p>
      <p><strong>Vandrevala Foundation</strong> (24/7): <a href="tel:+919999666555">+91 9999 666 555</a></p>
      <p class="crisis-soft">You don't have to do anything right now. We're not going anywhere.</p>
    </div>
  `;
  confirmation.classList.remove("hidden");
};
