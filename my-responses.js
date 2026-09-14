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

const postsList = document.getElementById("postsList");
const emptyState = document.getElementById("emptyState");

async function loadMyPosts() {
  const myAnonId = getAnonId();

  const { data: posts, error } = await client
    .from("posts")
    .select("*")
    .eq("anon_id", myAnonId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    return;
  }

  if (!posts || posts.length === 0) {
    emptyState.classList.remove("hidden");
    return;
  }

  for (const post of posts) {
    const { data: responses, error: responsesError } = await client
      .from("responses")
      .select("*")
      .eq("post_id", post.id)
      .order("created_at", { ascending: true });

    if (responsesError) {
      console.error(responsesError);
      continue;
    }

    const postBlock = document.createElement("div");
    postBlock.classList.add("post-block");

    const postText = document.createElement("p");
    postText.classList.add("post-text");
    postText.textContent = post.content;
    postBlock.appendChild(postText);

    if (responses.length === 0) {
      const noResponses = document.createElement("p");
      noResponses.classList.add("no-responses");
      noResponses.textContent = "No one has responded yet.";
      postBlock.appendChild(noResponses);
    } else {
      responses.forEach(response => {
        const responseEl = document.createElement("p");
        responseEl.classList.add("response-item");
        responseEl.textContent = response.response_text;
        postBlock.appendChild(responseEl);
      });
    }

    postsList.appendChild(postBlock);
  }
}

loadMyPosts();
