const SUPABASE_URL = "https://fjgshtktadaddwmshugw.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqZ3NodGt0YWRhZGR3bXNodWd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkzNzEzODQsImV4cCI6MjEwNDk0NzM4NH0.fMUzZ2chICrxSvRVdwrEb9TseFY532kC2KtsvV_zpGM";

const { createClient } = supabase;
const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const authStep = document.getElementById("authStep");
const checkEmailStep = document.getElementById("checkEmailStep");
const aliasStep = document.getElementById("aliasStep");
const authMessage = document.getElementById("authMessage");
const authHeading = document.getElementById("authHeading");
const authSubtext = document.getElementById("authSubtext");
const primaryActionBtn = document.getElementById("primaryActionBtn");
const toggleModeLink = document.getElementById("toggleModeLink");
const nameFields = document.getElementById("nameFields");

let mode = "signin";

const avatarColors = [
  "#7FA895", "#6C93A6", "#B8697A", "#C08A3E",
  "#7D5A7D", "#3E6E6B", "#A6555F", "#8A9A7E"
];

let selectedAvatarColor = avatarColors[0];

function renderAvatarColorGrid() {
  const grid = document.getElementById("avatarColorGrid");
  grid.innerHTML = "";
  avatarColors.forEach((color, index) => {
    const swatch = document.createElement("div");
    swatch.classList.add("avatar-color-swatch");
    swatch.style.background = color;
    if (index === 0) swatch.classList.add("selected");
    swatch.addEventListener("click", () => {
      selectedAvatarColor = color;
      document.querySelectorAll(".avatar-color-swatch").forEach(s => s.classList.remove("selected"));
      swatch.classList.add("selected");
      updateAvatarPreview();
    });
    grid.appendChild(swatch);
  });
}

function updateAvatarPreview() {
  const circle = document.getElementById("avatarPreviewCircle");
  const alias = document.getElementById("aliasInput").value.trim();
  circle.style.background = selectedAvatarColor;
  circle.textContent = alias ? alias[0].toUpperCase() : "?";
}

function showMessage(text) {
  authMessage.textContent = text;
  authMessage.classList.remove("hidden");
}

function switchMode(newMode) {
  mode = newMode;
  authMessage.classList.add("hidden");
  document.getElementById("passwordHint").classList.add("hidden");
  if (mode === "signup") {
    authHeading.textContent = "Create an account";
    authSubtext.textContent = "Sign up to get started.";
    primaryActionBtn.textContent = "Sign up";
    toggleModeLink.textContent = "Already have an account? Sign in";
    nameFields.classList.remove("hidden");
    document.getElementById("confirmPasswordInput").classList.remove("hidden");
  } else {
    authHeading.textContent = "Welcome back";
    authSubtext.textContent = "Sign in to continue.";
    primaryActionBtn.textContent = "Sign in";
    toggleModeLink.textContent = "New here? Create an account";
    nameFields.classList.add("hidden");
    document.getElementById("confirmPasswordInput").classList.add("hidden");
  }
}

document.getElementById("passwordInput").addEventListener("focus", () => {
  if (mode === "signup") {
    document.getElementById("passwordHint").classList.remove("hidden");
  }
});

document.getElementById("passwordInput").addEventListener("blur", () => {
  document.getElementById("passwordHint").classList.add("hidden");
});

toggleModeLink.addEventListener("click", () => {
  switchMode(mode === "signin" ? "signup" : "signin");
});

async function goToAppOrAlias(userId) {
  const { data: profile } = await client
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (profile) {
    window.location.href = "index.html";
  } else {
    authStep.classList.add("hidden");
    checkEmailStep.classList.add("hidden");
    aliasStep.classList.remove("hidden");
    renderAvatarColorGrid();
    updateAvatarPreview();
  }
}

async function checkExistingSession() {
  const { data: { session } } = await client.auth.getSession();
  if (session) {
    goToAppOrAlias(session.user.id);
  }
}

checkExistingSession();
switchMode("signin");

document.getElementById("aliasInput").addEventListener("input", updateAvatarPreview);

document.getElementById("bioInput").addEventListener("input", () => {
  const used = document.getElementById("bioInput").value.length;
  document.getElementById("bioCount").textContent = `${used}/150`;
});

primaryActionBtn.addEventListener("click", async () => {
  const email = document.getElementById("emailInput").value.trim();
  const password = document.getElementById("passwordInput").value;

  if (!email || !email.includes("@")) {
    showMessage("Please enter a valid email.");
    return;
  }

  if (mode === "signup") {
    if (password.length < 8) {
      showMessage("Password must be at least 8 characters.");
      return;
    }

    const hasLetter = /[a-zA-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);

    if (!hasLetter || !hasNumber) {
      showMessage("Password must include at least one letter and one number.");
      return;
    }

    const confirmPassword = document.getElementById("confirmPasswordInput").value;
    if (password !== confirmPassword) {
      showMessage("Passwords don't match.");
      return;
    }

    const firstName = document.getElementById("firstNameInput").value.trim();
    const lastName = document.getElementById("lastNameInput").value.trim();

    if (!firstName || !lastName) {
      showMessage("Please enter your first and last name.");
      return;
    }

    const { data, error } = await client.auth.signUp({
      email: email,
      password: password,
      options: {
        emailRedirectTo: window.location.origin + window.location.pathname,
        data: {
          first_name: firstName,
          last_name: lastName
        }
      }
    });

    if (error) {
      console.error(error);
      showMessage(error.message);
      return;
    }

    authStep.classList.add("hidden");
    checkEmailStep.classList.remove("hidden");
  } else {
    if (!password) {
      showMessage("Please enter your password.");
      return;
    }

    const { data, error } = await client.auth.signInWithPassword({
      email: email,
      password: password
    });

    if (error) {
      console.error(error);
      showMessage("Incorrect email or password.");
      return;
    }

    goToAppOrAlias(data.user.id);
  }
});

document.getElementById("saveAliasBtn").addEventListener("click", async () => {
  const alias = document.getElementById("aliasInput").value.trim();
  const bio = document.getElementById("bioInput").value.trim();
  const aliasError = document.getElementById("aliasError");

  if (!alias || alias.length < 2) {
    aliasError.textContent = "Please enter an alias with at least 2 characters.";
    aliasError.classList.remove("hidden");
    return;
  }

  const { data: { session } } = await client.auth.getSession();
  const firstName = session.user.user_metadata?.first_name || null;
  const lastName = session.user.user_metadata?.last_name || null;

  const { error } = await client.from("profiles").insert({
    id: session.user.id,
    alias: alias,
    first_name: firstName,
    last_name: lastName,
    avatar_color: selectedAvatarColor,
    bio: bio || null
  });

  if (error) {
    if (error.code === "23505") {
      aliasError.textContent = "That alias is taken. Try another.";
    } else {
      console.error(error);
      aliasError.textContent = "Something went wrong. Try again.";
    }
    aliasError.classList.remove("hidden");
    return;
  }

  window.location.href = "index.html";
});