const SUPABASE_URL = "https://fjgshtktadaddwmshugw.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqZ3NodGt0YWRhZGR3bXNodWd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkzNzEzODQsImV4cCI6MjEwNDk0NzM4NH0.fMUzZ2chICrxSvRVdwrEb9TseFY532kC2KtsvV_zpGM";

const { createClient } = supabase;
const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function checkModeratorAccess() {
  const { data: { session } } = await client.auth.getSession();

  if (!session) {
    return false;
  }

  const { data: profile } = await client
    .from("profiles")
    .select("is_moderator")
    .eq("id", session.user.id)
    .maybeSingle();

  return profile && profile.is_moderator === true;
}

const postsList = document.getElementById("postsList");
const pendingResponsesList = document.getElementById("pendingResponsesList");

async function loadAllPosts() {
  const { data: posts, error } = await client
    .from("posts")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    return;
  }

  postsList.innerHTML = "";

  posts.forEach(post => {
    const block = document.createElement("div");
    block.classList.add("post-block");

    const text = document.createElement("p");
    text.classList.add("post-text");
    text.textContent = post.content;
    block.appendChild(text);

    const meta = document.createElement("p");
    meta.classList.add("no-responses");
    meta.textContent = `Status: ${post.status} | Category: ${post.need_category || "none"} | ${new Date(post.created_at).toLocaleString()}`;
    block.appendChild(meta);

    const flagBtn = document.createElement("button");
    flagBtn.textContent = post.status === "flagged" ? "Unflag" : "Flag";
    flagBtn.classList.add("flag-btn");
    flagBtn.addEventListener("click", async () => {
      const newStatus = post.status === "flagged" ? "active" : "flagged";
      const { error: updateError } = await client
        .from("posts")
        .update({ status: newStatus })
        .eq("id", post.id);

      if (updateError) {
        console.error(updateError);
        alert("Couldn't update status.");
        return;
      }

      loadAllPosts();
    });
    block.appendChild(flagBtn);

    const categorySelect = document.createElement("select");
    categorySelect.classList.add("category-select");
    [
      "",
      "heartbreak",
      "loneliness",
      "work_burnout",
      "anxiety",
      "general",
      "family_conflict",
      "grief",
      "self_doubt",
      "exam_stress",
      "financial_stress",
      "existential_drift"
    ].forEach(cat => {
      const opt = document.createElement("option");
      opt.value = cat;
      opt.textContent = cat || "Set category...";
      if (post.need_category === cat) opt.selected = true;
      categorySelect.appendChild(opt);
    });
    categorySelect.addEventListener("change", async () => {
      const { error: catError } = await client
        .from("posts")
        .update({ need_category: categorySelect.value || null })
        .eq("id", post.id);

      if (catError) {
        console.error(catError);
        alert("Couldn't update category.");
      }
    });
    block.appendChild(categorySelect);

    postsList.appendChild(block);
  });
}

async function loadPendingResponses() {
  const { data: responses, error } = await client
    .from("responses")
    .select("*, posts(content)")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (error) {
    console.error(error);
    return;
  }

  pendingResponsesList.innerHTML = "";

  if (!responses || responses.length === 0) {
    pendingResponsesList.innerHTML = "<p class='no-responses'>Nothing waiting for review.</p>";
    return;
  }

  responses.forEach(response => {
    const block = document.createElement("div");
    block.classList.add("post-block");

    const originalPost = document.createElement("p");
    originalPost.classList.add("no-responses");
    originalPost.textContent = `In reply to: "${response.posts?.content || "unknown post"}"`;
    block.appendChild(originalPost);

    const responseText = document.createElement("p");
    responseText.classList.add("post-text");
    responseText.textContent = response.response_text;
    block.appendChild(responseText);

    const approveBtn = document.createElement("button");
    approveBtn.textContent = "Approve";
    approveBtn.classList.add("flag-btn");
    approveBtn.addEventListener("click", async () => {
      const { error: updateError } = await client
        .from("responses")
        .update({ status: "approved" })
        .eq("id", response.id);

      if (updateError) {
        console.error(updateError);
        alert("Couldn't approve.");
        return;
      }
      loadPendingResponses();
    });
    block.appendChild(approveBtn);

    const rejectBtn = document.createElement("button");
    rejectBtn.textContent = "Reject";
    rejectBtn.classList.add("flag-btn");
    rejectBtn.addEventListener("click", async () => {
      const { error: updateError } = await client
        .from("responses")
        .update({ status: "rejected" })
        .eq("id", response.id);

      if (updateError) {
        console.error(updateError);
        alert("Couldn't reject.");
        return;
      }
      loadPendingResponses();
    });
    block.appendChild(rejectBtn);

    pendingResponsesList.appendChild(block);
  });
}

async function loadFlaggedConversationMessages() {
  const { data: messages, error } = await client
    .from("conversation_messages")
    .select("*, conversations(posts(content))")
    .eq("status", "flagged")
    .order("created_at", { ascending: true });

  if (error) {
    console.error(error);
    return;
  }

  const container = document.getElementById("flaggedMessagesList");
  if (!container) return;

  container.innerHTML = "";

  if (!messages || messages.length === 0) {
    container.innerHTML = "<p class='no-responses'>No flagged conversation messages.</p>";
    return;
  }

  messages.forEach(msg => {
    const block = document.createElement("div");
    block.classList.add("post-block");

    const text = document.createElement("p");
    text.classList.add("post-text");
    text.textContent = msg.message_text;
    block.appendChild(text);

    const meta = document.createElement("p");
    meta.classList.add("no-responses");
    meta.textContent = `Flagged for review | ${new Date(msg.created_at).toLocaleString()}`;
    block.appendChild(meta);

    container.appendChild(block);
  });
}

async function init() {
  const isModerator = await checkModeratorAccess();

  if (!isModerator) {
    document.body.innerHTML = "<p style='text-align:center; margin-top:100px; color:#7C8B85; font-family: Inter, sans-serif;'>Access denied.</p>";
    return;
  }

  loadAllPosts();
  loadPendingResponses();
  loadFlaggedConversationMessages();
}

init();