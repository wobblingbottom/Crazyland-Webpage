const themeToggle = document.querySelector(".theme-toggle");
const audioToggle = document.querySelector(".audio-toggle");
const backgroundAudio = document.querySelector(".background-audio");
const contactForm = document.querySelector(".contact-form");
const formNote = document.querySelector(".form-note");
const filterButtons = document.querySelectorAll(".filter-button");
const galleryItems = document.querySelectorAll(".gallery-item");
const zoomViewer = document.querySelector(".zoom-viewer");
const zoomTitle = document.querySelector("#zoom-title");
const zoomCopy = document.querySelector(".zoom-copy");
const closeZoomButtons = document.querySelectorAll("[data-close-zoom]");
const navLinks = document.querySelectorAll('.site-nav a[href^="#"], .hero-actions a[href^="#"]');
const giveawayFeed = document.querySelector(".giveaway-feed");

const applyThemeLabel = () => {
  const darkModeEnabled = document.body.classList.contains("dark-mode");

  if (themeToggle) {
    themeToggle.textContent = darkModeEnabled ? "Light Mode" : "Dark Mode";
    themeToggle.setAttribute("aria-pressed", String(darkModeEnabled));
  }
};

themeToggle?.addEventListener("click", () => {
  document.body.classList.toggle("dark-mode");
  applyThemeLabel();
});

applyThemeLabel();

const applyAudioLabel = (isPlaying) => {
  if (audioToggle) {
    audioToggle.textContent = isPlaying ? "Sound Off" : "Sound On";
    audioToggle.setAttribute("aria-pressed", String(isPlaying));
  }
};

const startAudio = async () => {
  if (!backgroundAudio) {
    return;
  }

  try {
    await backgroundAudio.play();
    applyAudioLabel(true);
  } catch {
    applyAudioLabel(false);
  }
};

audioToggle?.addEventListener("click", async () => {
  if (!backgroundAudio) {
    return;
  }

  if (backgroundAudio.paused) {
    await startAudio();
  } else {
    backgroundAudio.pause();
    applyAudioLabel(false);
  }
});

document.addEventListener(
  "click",
  () => {
    if (backgroundAudio?.paused) {
      startAudio();
    }
  },
  { once: true }
);

applyAudioLabel(false);

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
    document.body.classList.add("is-transitioning");
    window.setTimeout(() => {
      document.body.classList.remove("is-transitioning");
    }, 220);
  });
});

contactForm?.addEventListener("submit", (event) => {
  event.preventDefault();

  const name = contactForm.elements.namedItem("name")?.value.trim();
  formNote.textContent = name
    ? `Thanks, ${name}. Your message is ready to connect to your email or form backend.`
    : "Your message is ready to connect to your email or form backend.";
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
        <p><strong>Giveaway feed unavailable</strong></p>
        <p>Add or update <code>data/giveaways.json</code> to show active giveaways here.</p>
      </article>
    `;
  }
};

renderGiveawayFeed();
