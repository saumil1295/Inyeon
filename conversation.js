const SUPABASE_URL = "https://fjgshtktadaddwmshugw.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqZ3NodGt0YWRhZGR3bXNodWd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkzNzEzODQsImV4cCI6MjEwNDk0NzM4NH0.fMUzZ2chICrxSvRVdwrEb9TseFY532kC2KtsvV_zpGM";

const { createClient } = supabase;
const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const MAX_MESSAGES_PER_PERSON = 3;

let currentUser = null;
let conversationId = null;
let otherUserAlias = "them";

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

async function requireAuth() {
  const { data: { session } } = await client.auth.getSession();

  if (!session) {
    window.location.href = "auth.html";
    return false;
  }

  currentUser = session.user;
  return true;
}

function getConversationIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("conversation_id");
}

async function loadConversation() {
  const { data: convo, error } = await client
    .from("conversations")
    .select("*, posts(content)")
    .eq("id", conversationId)
    .maybeSingle();

  if (error || !convo) {
    console.error(error);
    document.getElementById("loadingState").textContent = "Conversation not found.";
    return;
  }

  if (convo.poster_id !== currentUser.id && convo.responder_id !== currentUser.id) {
    document.getElementById("loadingState").textContent = "You don't have access to this conversation.";
    return;
  }

  const otherUserId = convo.poster_id === currentUser.id ? convo.responder_id : convo.poster_id;

  const { data: otherProfile } = await client
    .from("profiles")
    .select("alias")
    .eq("id", otherUserId)
    .maybeSingle();

  otherUserAlias = otherProfile?.alias || "them";

  document.getElementById("originalPostContext").textContent = `About: "${convo.posts?.content || "a post"}"`;

  document.getElementById("loadingState").classList.add("hidden");
  document.getElementById("conversationView").classList.remove("hidden");

  const seenIntro = localStorage.getItem("inyeon_seen_conversation_intro");
  if (!seenIntro) {
    document.getElementById("introOverlay").classList.remove("hidden");
  }

  await renderMessages();
}

async function renderMessages() {
  const { data: messages, error } = await client
    .from("conversation_messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .neq("status", "flagged")
    .order("created_at", { ascending: true });

  if (error) {
    console.error(error);
    return;
  }

  const thread = document.getElementById("messageThread");
  thread.innerHTML = "";

  messages.forEach(msg => {
    const isMine = msg.sender_id === currentUser.id;
    const bubble = document.createElement("div");
    bubble.classList.add("message-bubble", isMine ? "message-mine" : "message-theirs");

    const senderLabel = document.createElement("span");
    senderLabel.classList.add("response-tag");
    senderLabel.textContent = isMine ? "You" : otherUserAlias;
    bubble.appendChild(senderLabel);

    const text = document.createElement("p");
    text.classList.add("response-text-content");
    text.textContent = msg.message_text;
    bubble.appendChild(text);

    thread.appendChild(bubble);
  });

  const myMessageCount = messages.filter(m => m.sender_id === currentUser.id).length;
  const counter = document.getElementById("messageCounter");
  const inputArea = document.getElementById("messageInputArea");
  const closingNote = document.getElementById("closingNote");

  const bothReachedMax = messages.length > 0 &&
    myMessageCount >= MAX_MESSAGES_PER_PERSON &&
    (messages.length - myMessageCount) >= MAX_MESSAGES_PER_PERSON;

  if (bothReachedMax) {
    counter.classList.add("hidden");
    inputArea.classList.add("hidden");
    closingNote.classList.remove("hidden");
    return;
  }

  if (myMessageCount >= MAX_MESSAGES_PER_PERSON) {
    counter.textContent = `You've sent all ${MAX_MESSAGES_PER_PERSON} of your messages. Waiting for ${otherUserAlias}.`;
    inputArea.classList.add("hidden");
    closingNote.classList.add("hidden");
    return;
  }

  const lastMessage = messages[messages.length - 1];
  const isMyTurn = !lastMessage || lastMessage.sender_id !== currentUser.id;

  if (!isMyTurn) {
    counter.textContent = `Waiting for ${otherUserAlias} to reply.`;
    inputArea.classList.add("hidden");
    closingNote.classList.add("hidden");
    return;
  }

  counter.textContent = `Message ${myMessageCount + 1} of ${MAX_MESSAGES_PER_PERSON} for you`;
  counter.classList.remove("hidden");
  inputArea.classList.remove("hidden");
  closingNote.classList.add("hidden");
}

document.getElementById("introOkBtn").addEventListener("click", () => {
  localStorage.setItem("inyeon_seen_conversation_intro", "true");
  document.getElementById("introOverlay").classList.add("hidden");
});

document.getElementById("sendMessageBtn").addEventListener("click", async () => {
  const input = document.getElementById("messageInput");
  const text = input.value.trim();
  if (!text) return;

  const sendBtn = document.getElementById("sendMessageBtn");
  sendBtn.disabled = true;

  const isCrisis = detectCrisis(text);

  const { error } = await client.from("conversation_messages").insert({
    conversation_id: conversationId,
    sender_id: currentUser.id,
    message_text: text,
    status: isCrisis ? "flagged" : "approved"
  });

  sendBtn.disabled = false;

  if (error) {
    console.error(error);
    alert("Something went wrong. Try again.");
    return;
  }

  input.value = "";

  if (isCrisis) {
    alert("It sounds like you're carrying a lot right now. Please reach out to iCall (+91 9152987821) or Vandrevala Foundation (+91 9999 666 555) — real support is available.");
  }

  await renderMessages();
});

async function init() {
  const authed = await requireAuth();
  if (!authed) return;

  conversationId = getConversationIdFromUrl();
  if (!conversationId) {
    document.getElementById("loadingState").textContent = "No conversation specified.";
    return;
  }

  await loadConversation();
}

init();