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

submitBtn.addEventListener("click", async () => {
  const text = postText.value.trim();
  if (!text) return;

  const { error } = await client.from("posts").insert({
    content: text,
    anon_id: getAnonId(),
    need_category: null,   // we'll add category tagging later
    status: "active"
  });

  if (error) {
    console.error(error);
    alert("Something went wrong. Try again.");
    return;
  }

  postText.value = "";
  confirmation.classList.remove("hidden");
  setTimeout(() => confirmation.classList.add("hidden"), 3000);
});
