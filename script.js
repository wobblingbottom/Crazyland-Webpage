const themeToggle = document.querySelector(".theme-toggle");
const audioToggle = document.querySelector(".audio-toggle");
const backgroundAudio = document.querySelector(".background-audio");
const contactForm = document.querySelector(".contact-form");
const formNote = document.querySelector(".form-note");
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
    themeToggle.textContent = darkModeEnabled ? "Light Mode" : "Dark Mode";
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

contactForm?.addEventListener("submit", (event) => {
  event.preventDefault();

  const endpoint = contactApiMeta?.content?.trim();
  const name = contactForm.elements.namedItem("name")?.value.trim();
  const discordUsername = contactForm.elements.namedItem("discord_username")?.value.trim();
  const message = contactForm.elements.namedItem("message")?.value.trim();

  if (!endpoint || endpoint.includes("your-bot-service")) {
    formNote.textContent = "Set your bot API URL first.";
    return;
  }

  if (!discordUsername || !message) {
    formNote.textContent = "Add your Discord username and message.";
    return;
  }

  formNote.textContent = "Sending...";

  fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      name,
      discordUsername,
      message
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
