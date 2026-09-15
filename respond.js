const SUPABASE_URL = "https://fjgshtktadaddwmshugw.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqZ3NodGt0YWRhZGR3bXNodWd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkzNzEzODQsImV4cCI6MjEwNDk0NzM4NH0.fMUzZ2chICrxSvRVdwrEb9TseFY532kC2KtsvV_zpGM";

const { createClient } = supabase;
const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function getAnonId() {
  let id = localStorage.getItem("inyeon_anon_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("inyeon_anon_id", id);
  }
  return id;
}

const postContainer = document.getElementById("postContainer");
const postTextEl = document.getElementById("postText");
const optionsContainer = document.getElementById("optionsContainer");
const confirmation = document.getElementById("confirmation");
const noPosts = document.getElementById("noPosts");

let currentPost = null;

async function loadNextPost() {
  confirmation.textContent = "Sent. That mattered.";
  confirmation.classList.add("hidden");

  const myAnonId = getAnonId();

  const { data: myResponses, error: myResponsesError } = await client
    .from("responses")
    .select("post_id")
    .eq("responder_anon_id", myAnonId);

  if (myResponsesError) {
    console.error(myResponsesError);
    return;
  }

  const respondedPostIds = myResponses.map(r => r.post_id);

  let query = client
    .from("posts")
    .select("*")
    .eq("status", "active")
    .not("need_category", "is", null)
    .order("created_at", { ascending: true })
    .limit(1);

  if (respondedPostIds.length > 0) {
    const idList = respondedPostIds.join(",");
    query = query.not("id", "in", `(${idList})`);
  }

  const { data: posts, error } = await query;

  if (error) {
    console.error(error);
    return;
  }

  if (!posts || posts.length === 0) {
    postContainer.classList.add("hidden");
    noPosts.classList.remove("hidden");
    return;
  }

  currentPost = posts[0];
  postContainer.classList.remove("hidden");
  noPosts.classList.add("hidden");
  postTextEl.textContent = currentPost.content;

  const { data: options, error: optionsError } = await client
    .from("response_options")
    .select("*")
    .eq("need_category", currentPost.need_category);

  if (optionsError) {
    console.error(optionsError);
    return;
  }

  optionsContainer.innerHTML = "";
  options.forEach(option => {
    const btn = document.createElement("button");
    btn.textContent = option.response_text;
    btn.classList.add("response-btn");
    btn.addEventListener("click", () => sendResponse(option.response_text));
    optionsContainer.appendChild(btn);
  });
}

loadNextPost();

async function sendResponse(responseText) {
  const anonId = getAnonId();

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const { data: todayResponses, error: countError } = await client
    .from("responses")
    .select("id")
    .eq("responder_anon_id", anonId)
    .gte("created_at", startOfDay.toISOString());

  if (!countError && todayResponses.length >= 50) {
    alert("You've reached today's response limit. Come back tomorrow.");
    return;
  }

  const { error } = await client.from("responses").insert({
    post_id: currentPost.id,
    response_text: responseText,
    responder_anon_id: anonId
  });

  if (error) {
    console.error(error);
    alert("Something went wrong. Try again.");
    return;
  }

  if (document.activeElement) {
    document.activeElement.blur();
  }

  postContainer.classList.add("hidden");
  confirmation.classList.remove("hidden");

  setTimeout(loadNextPost, 1500);
}