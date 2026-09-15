const MODERATOR_PASSWORD = "Nmvakrnj12";

function checkModeratorAccess() {
  const stored = sessionStorage.getItem("inyeon_mod_access");
  if (stored === "granted") return true;

  const entered = prompt("Enter moderator password:");
  if (entered === MODERATOR_PASSWORD) {
    sessionStorage.setItem("inyeon_mod_access", "granted");
    return true;
  }
  return false;
}

if (!checkModeratorAccess()) {
  document.body.innerHTML = "<p style='text-align:center; margin-top:100px; color:#7C8B85; font-family: Inter, sans-serif;'>Access denied.</p>";
  throw new Error("Unauthorized access to moderation page");
}

const SUPABASE_URL = "https://fjgshtktadaddwmshugw.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqZ3NodGt0YWRhZGR3bXNodWd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkzNzEzODQsImV4cCI6MjEwNDk0NzM4NH0.fMUzZ2chICrxSvRVdwrEb9TseFY532kC2KtsvV_zpGM";

const { createClient } = supabase;
const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const postsList = document.getElementById("postsList");

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
    ["", "heartbreak", "loneliness", "work_burnout", "anxiety", "general"].forEach(cat => {
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

loadAllPosts();