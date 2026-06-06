const themeToggle = document.querySelector(".theme-toggle");
const audioToggle = document.querySelector(".audio-toggle");
const backgroundAudio = document.querySelector(".background-audio");
const contactForm = document.querySelector(".contact-form");
const formNote = document.querySelector(".form-note");
const contactAuthStatus = document.querySelector(".contact-auth-status");
const discordLoginButton = document.querySelector("[data-discord-login]");
const discordLogoutButton = document.querySelector("[data-discord-logout]");
const fileUploadInput = document.querySelector(".file-upload-input");
const fileUploadName = document.querySelector(".file-upload-name");
const autoGrowTextareas = document.querySelectorAll("textarea");
const contactMethodInputs = document.querySelectorAll('input[name="contact_method"]');
const contactOptions = document.querySelectorAll("[data-contact-option]");
const filterButtons = document.querySelectorAll(".filter-button");
const galleryItems = document.querySelectorAll(".gallery-item");
const zoomViewer = document.querySelector(".zoom-viewer");
const zoomTitle = document.querySelector("#zoom-title");
const zoomCopy = document.querySelector(".zoom-copy");
const closeZoomButtons = document.querySelectorAll("[data-close-zoom]");
const navLinks = document.querySelectorAll(".site-nav a, .hero-actions a, .text-link");
const giveawayFeed = document.querySelector(".giveaway-feed");
const contactApiMeta = document.querySelector('meta[name="contact-api-url"]');
const themeStorageKey = "crazyland-theme";
const audioStorageKey = "crazyland-audio";
const audioTimeStorageKey = "crazyland-audio-time";
const contactTokenStorageKey = "crazyland-contact-token";
let contactAuthToken = window.localStorage.getItem(contactTokenStorageKey) || "";
const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Image could not be read."));
    reader.readAsDataURL(file);
  });
const createDotSnowfield = () => {
  const snowfield = document.createElement("div");
  snowfield.className = "dot-snowfield";

  for (let index = 0; index < 24; index += 1) {
    const flake = document.createElement("span");
    flake.className = "dot-flake";
    flake.style.setProperty("--flake-left", `${Math.random() * 100}%`);
    flake.style.setProperty("--flake-size", `${14 + Math.random() * 18}px`);
    flake.style.setProperty("--flake-duration", `${10 + Math.random() * 10}s`);
    flake.style.setProperty("--flake-delay", `${Math.random() * -20}s`);
    flake.style.setProperty("--flake-drift", `${-30 + Math.random() * 60}px`);
    snowfield.appendChild(flake);
  }

  document.body.prepend(snowfield);
};

const applyThemeLabel = () => {
  const darkModeEnabled = document.body.classList.contains("dark-mode");

  if (themeToggle) {
    themeToggle.setAttribute("aria-label", darkModeEnabled ? "Light Mode" : "Dark Mode");
    themeToggle.setAttribute("title", darkModeEnabled ? "Light Mode" : "Dark Mode");
    themeToggle.setAttribute("aria-pressed", String(darkModeEnabled));
  }
};

const storedTheme = window.localStorage.getItem(themeStorageKey);

if (storedTheme === "dark") {
  document.body.classList.add("dark-mode");
}

themeToggle?.addEventListener("click", () => {
  document.body.classList.toggle("dark-mode");
  window.localStorage.setItem(
    themeStorageKey,
    document.body.classList.contains("dark-mode") ? "dark" : "light"
  );
  applyThemeLabel();
});

createDotSnowfield();
applyThemeLabel();

const applyAudioLabel = (isPlaying) => {
  if (audioToggle) {
    audioToggle.textContent = isPlaying ? "Sound Off" : "Sound On";
    audioToggle.setAttribute("aria-pressed", String(isPlaying));
  }
};

if (backgroundAudio) {
  backgroundAudio.volume = 0.18;
  const storedAudioTime = Number(window.localStorage.getItem(audioTimeStorageKey) || "0");

  if (Number.isFinite(storedAudioTime) && storedAudioTime > 0) {
    backgroundAudio.currentTime = storedAudioTime;
  }

  backgroundAudio.addEventListener("timeupdate", () => {
    window.localStorage.setItem(audioTimeStorageKey, String(backgroundAudio.currentTime));
  });
}

const startAudio = async () => {
  if (!backgroundAudio) {
    return;
  }

  try {
    await backgroundAudio.play();
    window.localStorage.setItem(audioStorageKey, "on");
    applyAudioLabel(true);
  } catch {
    applyAudioLabel(false);
  }
};

const stopAudio = () => {
  if (!backgroundAudio) {
    return;
  }

  window.localStorage.setItem(audioTimeStorageKey, String(backgroundAudio.currentTime));
  backgroundAudio.pause();
  window.localStorage.setItem(audioStorageKey, "off");
  applyAudioLabel(false);
};

audioToggle?.addEventListener("click", async () => {
  if (!backgroundAudio) {
    return;
  }

  if (backgroundAudio.paused) {
    await startAudio();
  } else {
    stopAudio();
  }
});

if (window.localStorage.getItem(audioStorageKey) === "on") {
  startAudio();
} else {
  applyAudioLabel(false);
}

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const filter = button.dataset.filter || "all";

    filterButtons.forEach((item) => item.classList.toggle("active", item === button));

    galleryItems.forEach((item) => {
      const shouldShow = filter === "all" || item.dataset.category === filter;
      item.hidden = !shouldShow;
    });
  });
});

galleryItems.forEach((item) => {
  item.addEventListener("click", () => {
    if (!zoomViewer || !zoomTitle || !zoomCopy) {
      return;
    }

    zoomTitle.textContent = item.dataset.zoomTitle || "Gallery Item";
    zoomCopy.textContent = item.dataset.zoomCopy || "";
    zoomViewer.hidden = false;
  });
});

closeZoomButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (zoomViewer) {
      zoomViewer.hidden = true;
    }
  });
});

navLinks.forEach((link) => {
  link.addEventListener("click", () => {
    if (backgroundAudio) {
      window.localStorage.setItem(audioTimeStorageKey, String(backgroundAudio.currentTime));
    }

    document.body.classList.add("is-transitioning");
    window.setTimeout(() => {
      document.body.classList.remove("is-transitioning");
    }, 220);
  });
});

window.addEventListener("beforeunload", () => {
  if (backgroundAudio) {
    window.localStorage.setItem(audioTimeStorageKey, String(backgroundAudio.currentTime));
  }
});

const getContactApiBase = () => {
  const endpoint = contactApiMeta?.content?.trim();

  if (!endpoint || endpoint.includes("your-bot-service")) {
    return "";
  }

  return endpoint.replace(/\/api\/contact\/?$/, "");
};

const setContactAuthState = (user) => {
  if (!contactAuthStatus || !discordLoginButton || !discordLogoutButton || !contactForm) {
    return;
  }

  if (user) {
    const displayName = user.globalName || user.username || "Discord user";
    contactAuthStatus.textContent = `Logged in as ${displayName}.`;
    discordLoginButton.hidden = true;
    discordLogoutButton.hidden = false;
    contactForm.hidden = false;
  } else {
    contactAuthStatus.textContent = "Log in with Discord to send a message.";
    discordLoginButton.hidden = false;
    discordLogoutButton.hidden = true;
    contactForm.hidden = true;
  }
};

const syncContactAuth = async () => {
  if (!contactAuthStatus || !contactForm) {
    return;
  }

  const apiBase = getContactApiBase();

  if (!apiBase) {
    contactAuthStatus.textContent = "Set your bot API URL first.";
    return;
  }

  if (!contactAuthToken) {
    setContactAuthState(null);
    return;
  }

  try {
    const response = await fetch(`${apiBase}/api/contact/me`, {
      headers: {
        Authorization: `Bearer ${contactAuthToken}`
      }
    });

    if (!response.ok) {
      throw new Error("Login required.");
    }

    const payload = await response.json();
    setContactAuthState(payload.user);
  } catch {
    contactAuthToken = "";
    window.localStorage.removeItem(contactTokenStorageKey);
    setContactAuthState(null);
  }
};

const handleDiscordTokenFromUrl = () => {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("discord_token");

  if (!token) {
    return;
  }

  contactAuthToken = token;
  window.localStorage.setItem(contactTokenStorageKey, token);
  params.delete("discord_token");
  const nextQuery = params.toString();
  const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}${window.location.hash}`;
  window.history.replaceState({}, "", nextUrl);
};

contactForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const endpoint = contactApiMeta?.content?.trim();
  const name = contactForm.elements.namedItem("name")?.value.trim();
  const message = contactForm.elements.namedItem("message")?.value.trim();
  const imageFile = contactForm.elements.namedItem("image")?.files?.[0];

  if (!endpoint || endpoint.includes("your-bot-service")) {
    formNote.textContent = "Set your bot API URL first.";
    return;
  }

  if (!contactAuthToken) {
    formNote.textContent = "Log in with Discord first.";
    return;
  }

  if (!message) {
    formNote.textContent = "Add your message.";
    return;
  }

  let image = null;

  if (imageFile) {
    if (!imageFile.type.startsWith("image/")) {
      formNote.textContent = "Use an image file.";
      return;
    }

    if (imageFile.size > 8 * 1024 * 1024) {
      formNote.textContent = "Image must be 8MB or smaller.";
      return;
    }

    try {
      image = {
        name: imageFile.name,
        type: imageFile.type,
        dataUrl: await readFileAsDataUrl(imageFile)
      };
    } catch (error) {
      formNote.textContent = error.message || "Image could not be read.";
      return;
    }
  }

  formNote.textContent = "Sending...";

  fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${contactAuthToken}`
    },
    body: JSON.stringify({
      name,
      message,
      image
    })
  })
    .then(async (response) => {
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || "Message failed.");
      }

      contactForm.reset();
      formNote.textContent = "Message sent.";
    })
    .catch((error) => {
      formNote.textContent = error.message || "Message failed.";
    });
});

discordLoginButton?.addEventListener("click", () => {
  const apiBase = getContactApiBase();

  if (!apiBase) {
    if (contactAuthStatus) {
      contactAuthStatus.textContent = "Set your bot API URL first.";
    }
    return;
  }

  const redirect = encodeURIComponent(window.location.href);
  window.location.href = `${apiBase}/auth/discord/login?redirect=${redirect}`;
});

discordLogoutButton?.addEventListener("click", async () => {
  const apiBase = getContactApiBase();

  try {
    if (apiBase && contactAuthToken) {
      await fetch(`${apiBase}/api/contact/logout`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${contactAuthToken}`
        }
      });
    }
  } catch {
    // Ignore logout transport failures and clear local state anyway.
  }

  contactAuthToken = "";
  window.localStorage.removeItem(contactTokenStorageKey);
  setContactAuthState(null);
  if (formNote) {
    formNote.textContent = "";
  }
});

fileUploadInput?.addEventListener("change", () => {
  const fileName = fileUploadInput.files?.[0]?.name;

  if (!fileUploadName) {
    return;
  }

  fileUploadName.textContent = fileName || "No image selected";
});

const renderGiveawayFeed = async () => {
  if (!giveawayFeed) {
    return;
  }

  try {
    const response = await fetch("./data/giveaways.json");
    const data = await response.json();

    giveawayFeed.innerHTML = data.giveaways
      .map(
        (item) => `
          <article class="giveaway-card">
            <p><strong>${item.title}</strong></p>
            <p>Status: ${item.status}</p>
            <p>Winner: ${item.winner || "Pending"}</p>
          </article>
        `
      )
      .join("");
  } catch {
    giveawayFeed.innerHTML = `
      <article class="giveaway-card">
        <p><strong>Giveaways unavailable</strong></p>
      </article>
    `;
  }
};

renderGiveawayFeed();
const resizeTextarea = (textarea) => {
  textarea.style.height = "auto";
  textarea.style.height = `${textarea.scrollHeight}px`;
};

autoGrowTextareas.forEach((textarea) => {
  resizeTextarea(textarea);
  textarea.addEventListener("input", () => resizeTextarea(textarea));
});

const applyContactMethod = (value) => {
  contactOptions.forEach((option) => {
    option.classList.toggle("is-active", option.dataset.contactOption === value);
  });

  if (contactForm) {
    contactForm.hidden = value !== "website";
  }
};

contactMethodInputs.forEach((input) => {
  input.addEventListener("change", () => {
    if (input.checked) {
      applyContactMethod(input.value);
    }
  });
});

const selectedContactMethod = [...contactMethodInputs].find((input) => input.checked)?.value || "website";
applyContactMethod(selectedContactMethod);
handleDiscordTokenFromUrl();
syncContactAuth();
