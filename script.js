const navButtons = document.querySelectorAll('[data-view-target]');
const contentViews = document.querySelectorAll('[data-view]');
const postsGallery = document.querySelector('[data-posts-gallery]');
const comicsList = document.querySelector('[data-comics-list]');
const commissionTypes = document.querySelector('[data-commission-types]');
const commissionNext = document.querySelector('[data-commission-next]');
const commissionModal = document.querySelector('[data-commission-modal]');
const commissionForm = document.querySelector('[data-commission-form]');
const commissionCloseTargets = document.querySelectorAll('[data-commission-close]');
const commissionRequestTitle = document.querySelector('[data-commission-request-title]');
const commissionRequestPrice = document.querySelector('[data-commission-request-price]');
const commissionRequestLink = document.querySelector('[data-commission-request-link]');
const commissionFormMessage = document.querySelector('[data-commission-form-message]');
const commissionModalDescription = document.querySelector('[data-commission-modal-description]');
const commissionModalImage = document.querySelector('[data-commission-modal-image]');
const commissionModalPlaceholder = document.querySelector('[data-commission-modal-placeholder]');
const commissionModalThumbnails = document.querySelector('[data-commission-modal-thumbnails]');
const commissionImageLightbox = document.querySelector('[data-commission-image-lightbox]');
const commissionImageLightboxImage = document.querySelector('[data-commission-image-lightbox-image]');
const commissionImageLightboxClose = document.querySelector('[data-commission-image-lightbox-close]');
const commissionReferencePreview = document.querySelector('[data-commission-reference-preview]');
const commissionReferenceCount = document.querySelector('[data-commission-reference-count]');
const commissionReferenceGrid = document.querySelector('[data-commission-reference-grid]');
const commissionSuccess = document.querySelector('[data-commission-success]');
const commissionSuccessLink = document.querySelector('[data-commission-success-link]');
const commissionSuccessNote = document.querySelector('[data-commission-success-note]');
const commissionCopyLinkButton = document.querySelector('[data-commission-copy-link]');
const commissionSuccessClose = document.querySelector('[data-commission-success-close]');
const loginButton = document.querySelector('.login-button');
const postModal = document.querySelector('[data-post-modal]');
const postModalTitle = document.querySelector('[data-post-modal] .post-modal-title');
const postModalDescription = document.querySelector('[data-post-modal-description]');
const postModalEpisodes = document.querySelector('[data-post-modal-episodes]');
const seriesBackButton = document.querySelector('[data-series-back]');
const postModalRating = document.querySelector('[data-post-modal-rating]');
const postModalImage = document.querySelector('.post-modal-image');
const postModalCloseTargets = document.querySelectorAll('[data-post-close]');
const comicReader = document.querySelector('[data-comic-reader]');
const activityList = document.querySelector('[data-activity-list]');
const feedbackForm = document.querySelector('[data-feedback-form]');
const feedbackRating = document.querySelector('[data-feedback-rating]');
const feedbackStars = document.querySelector('[data-feedback-stars]');
const feedbackComment = document.querySelector('[data-feedback-comment]');
const feedbackMessage = document.querySelector('[data-feedback-message]');
const commissionReferenceInput = commissionForm?.elements.namedItem('reference');
let posts = [];
let comics = [];
let currentPostId = '';
let currentContentType = 'posts';
let currentSeries = null;
let currentUser = null;
let currentUserIsAdmin = false;
let longPressTimer = null;
let currentPostAudio = null;
let currentPostAudioFade = null;
let currentView = 'posts';
let selectedCommissionOfferingId = '';
let commissionOfferings = [];
let commissionReferencePreviewUrls = [];
let commissionReferenceFiles = [];
let logoutPending = false;
let commissionSlideshowTimer = null;
const BACKGROUND_MUSIC_VOLUME = 0.25;
const MUSIC_FADE_STEP_MS = 80;
const MUSIC_FADE_DURATION_MS = 1200;
const COMMISSION_SLIDE_INTERVAL_MS = 2600;
const VALID_VIEWS = new Set(['posts', 'comics', 'commissions']);
const WATERMARK_IMAGE_URL = 'assets/crazyland-watermark.png';

function getDashboardPath() {
  if (currentView === 'commissions') {
    return '/admin/commissions';
  }

  return currentView === 'comics' ? '/admin/comics' : '/admin/posts';
}

function updateLoginTarget() {
  if (!loginButton || !currentUser) {
    return;
  }

  loginButton.href = currentUserIsAdmin ? getDashboardPath() : '/logout';
}

function setLogoutConfirmation(isPending) {
  if (!loginButton || !currentUser || currentUserIsAdmin) {
    return;
  }

  logoutPending = isPending;
  const username = loginButton.querySelector('.login-username');

  if (username) {
    username.textContent = logoutPending ? 'Log out?' : currentUser.username;
  }

  loginButton.setAttribute(
    'aria-label',
    logoutPending ? 'Click again to log out' : `Signed in as ${currentUser.username}`
  );
}

function getDiscordAvatarUrl(user) {
  if (!user) {
    return '';
  }

  if (user.avatar) {
    return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64`;
  }

  return `https://cdn.discordapp.com/embed/avatars/${Number.parseInt(user.id, 10) % 5}.png`;
}

function renderLoginUserButton() {
  if (!loginButton || !currentUser) {
    return;
  }

  const avatarUrl = getDiscordAvatarUrl(currentUser);
  loginButton.innerHTML = `
    <img class="login-avatar" src="${avatarUrl}" alt="" aria-hidden="true" />
    <span class="login-username">${currentUser.username}</span>
  `;
  loginButton.setAttribute('aria-label', `Signed in as ${currentUser.username}`);
  loginButton.classList.add('login-button-user');
  logoutPending = false;
  updateLoginTarget();
}

function setActiveView(viewName) {
  if (!VALID_VIEWS.has(viewName)) {
    return;
  }

  currentView = viewName;

  if (window.location.hash !== `#${viewName}`) {
    window.location.hash = viewName;
  }

  navButtons.forEach((button) => {
    const isActive = button.getAttribute('data-view-target') === viewName;
    button.classList.toggle('sidebar-link-active', isActive);
  });

  contentViews.forEach((view) => {
    const isActive = view.getAttribute('data-view') === viewName;
    view.classList.toggle('content-view-active', isActive);
  });

  updateLoginTarget();
  setLogoutConfirmation(false);
}

function getInitialView() {
  const hashView = window.location.hash.replace('#', '').trim().toLowerCase();
  return VALID_VIEWS.has(hashView) ? hashView : 'posts';
}

function setCommissionMessage(message, isError = false) {
  if (!commissionFormMessage) {
    return;
  }

  commissionFormMessage.hidden = !message;
  commissionFormMessage.textContent = message;
  commissionFormMessage.classList.toggle('commission-form-message-error', Boolean(message) && isError);
  commissionFormMessage.classList.toggle('commission-form-message-success', Boolean(message) && !isError);
}

function hideCommissionSuccess() {
  if (commissionSuccess) {
    commissionSuccess.hidden = true;
  }

  if (commissionForm) {
    commissionForm.hidden = false;
  }

  if (commissionSuccessLink) {
    commissionSuccessLink.value = '';
  }

  if (commissionSuccessNote) {
    commissionSuccessNote.textContent = '';
  }
}

function showCommissionSuccess(linkUrl, dmDelivered, adminDelivered) {
  setCommissionMessage('');

  if (commissionForm) {
    commissionForm.hidden = true;
  }

  if (commissionSuccess) {
    commissionSuccess.hidden = false;
  }

  if (commissionSuccessLink) {
    commissionSuccessLink.value = linkUrl || '';
  }

  if (commissionSuccessNote) {
    const notices = [];

    notices.push("Don't share this link with anyone. It gives access to your commission request.");
    notices.push(adminDelivered ? 'The Discord bot has notified the admin channel.' : 'The admin channel notification could not be delivered.');
    notices.push(dmDelivered ? 'The Discord bot also sent you this link in a DM.' : 'I could not send you a Discord DM, so keep this link safe.');
    commissionSuccessNote.textContent = notices.join(' ');
  }
}

function clearCommissionReferencePreview() {
  commissionReferencePreviewUrls.forEach((url) => URL.revokeObjectURL(url));
  commissionReferencePreviewUrls = [];

  if (commissionReferenceGrid) {
    commissionReferenceGrid.innerHTML = '';
  }

  if (commissionReferenceCount) {
    commissionReferenceCount.textContent = '';
  }

  if (commissionReferencePreview) {
    commissionReferencePreview.hidden = true;
  }
}

function syncCommissionReferenceInput() {
  if (!(commissionReferenceInput instanceof HTMLInputElement)) {
    return;
  }

  const dataTransfer = new DataTransfer();
  commissionReferenceFiles.forEach((file) => dataTransfer.items.add(file));
  commissionReferenceInput.files = dataTransfer.files;
}

function resetCommissionReferenceFiles() {
  commissionReferenceFiles = [];
  syncCommissionReferenceInput();
  clearCommissionReferencePreview();
}

function renderCommissionReferencePreview() {
  if (!commissionReferencePreview || !commissionReferenceGrid || !commissionReferenceCount) {
    return;
  }

  clearCommissionReferencePreview();

  if (commissionReferenceFiles.length === 0) {
    return;
  }

  commissionReferenceCount.textContent = `${commissionReferenceFiles.length} reference image${commissionReferenceFiles.length === 1 ? '' : 's'} selected`;
  commissionReferencePreview.hidden = false;

  commissionReferenceFiles.forEach((file, index) => {
    const objectUrl = URL.createObjectURL(file);
    commissionReferencePreviewUrls.push(objectUrl);

    const item = document.createElement('figure');
    item.className = 'commission-reference-item';
    item.dataset.referenceIndex = String(index);

    const image = document.createElement('img');
    image.src = objectUrl;
    image.alt = file.name;

    const caption = document.createElement('figcaption');
    caption.textContent = file.name;

    const removeButton = document.createElement('button');
    removeButton.className = 'commission-reference-remove';
    removeButton.type = 'button';
    removeButton.dataset.referenceRemove = String(index);
    removeButton.setAttribute('aria-label', `Remove ${file.name}`);
    removeButton.textContent = 'x';

    item.append(image, caption, removeButton);
    commissionReferenceGrid.appendChild(item);
  });
}

function getSelectedCommissionOffering() {
  return commissionOfferings.find((offering) => offering.id === selectedCommissionOfferingId) || null;
}

function getCommissionOfferingImages(offering) {
  if (!offering) {
    return [];
  }

  const images = Array.isArray(offering.exampleImageUrls) ? offering.exampleImageUrls : [];

  if (images.length > 0) {
    return images.filter(Boolean);
  }

  return offering.exampleImageUrl ? [offering.exampleImageUrl] : [];
}

function stopCommissionSlideshows() {
  if (commissionSlideshowTimer) {
    window.clearInterval(commissionSlideshowTimer);
    commissionSlideshowTimer = null;
  }
}

function startCommissionSlideshows() {
  if (!commissionTypes || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  const slideTracks = [...commissionTypes.querySelectorAll('[data-commission-slide-images]')];

  if (slideTracks.length === 0) {
    return;
  }

  commissionSlideshowTimer = window.setInterval(() => {
    slideTracks.forEach((track) => {
      let images = [];

      try {
        images = JSON.parse(track.dataset.commissionSlideImages || '[]');
      } catch {
        images = [];
      }

      if (images.length < 2) {
        return;
      }

      const nextIndex = (Number.parseInt(track.dataset.commissionSlideIndex, 10) + 1 || 1) % images.length;
      track.dataset.commissionSlideIndex = String(nextIndex);
      track.style.transform = `translateX(-${nextIndex * 100}%)`;
    });
  }, COMMISSION_SLIDE_INTERVAL_MS);
}

function setCommissionModalPreview(imageUrl, title) {
  if (!commissionModalImage || !commissionModalPlaceholder) {
    return;
  }

  if (imageUrl) {
    commissionModalImage.hidden = false;
    commissionModalImage.src = imageUrl;
    commissionModalImage.alt = title ? `${title} example` : '';
    commissionModalPlaceholder.hidden = true;
    return;
  }

  commissionModalImage.hidden = true;
  commissionModalImage.removeAttribute('src');
  commissionModalImage.alt = '';
  commissionModalPlaceholder.hidden = false;
}

function renderCommissionModalImages(offering) {
  const images = getCommissionOfferingImages(offering);

  setCommissionModalPreview(images[0] || '', offering?.title || '');

  if (!commissionModalThumbnails) {
    return;
  }

  commissionModalThumbnails.innerHTML = '';
  commissionModalThumbnails.hidden = images.length < 2;

  images.forEach((imageUrl, index) => {
    const thumb = document.createElement('button');
    thumb.className = 'commission-modal-thumbnail';
    thumb.type = 'button';
    thumb.dataset.imageUrl = imageUrl;
    thumb.setAttribute('aria-label', `Show example image ${index + 1}`);
    thumb.classList.toggle('commission-modal-thumbnail-active', index === 0);

    const image = document.createElement('img');
    image.src = imageUrl;
    image.alt = '';
    thumb.appendChild(image);
    commissionModalThumbnails.appendChild(thumb);
  });
}

function openCommissionImageLightbox() {
  if (
    !commissionImageLightbox ||
    !(commissionImageLightboxImage instanceof HTMLImageElement) ||
    !(commissionModalImage instanceof HTMLImageElement) ||
    commissionModalImage.hidden ||
    !commissionModalImage.currentSrc
  ) {
    return;
  }

  commissionImageLightboxImage.src = commissionModalImage.currentSrc;
  commissionImageLightboxImage.alt = commissionModalImage.alt || 'Commission example image';
  commissionImageLightbox.hidden = false;
}

function closeCommissionImageLightbox() {
  if (!commissionImageLightbox || !(commissionImageLightboxImage instanceof HTMLImageElement)) {
    return;
  }

  commissionImageLightbox.hidden = true;
  commissionImageLightboxImage.removeAttribute('src');
}

function openCommissionModal() {
  const selectedOffering = getSelectedCommissionOffering();

  if (!selectedOffering || !commissionModal) {
    return;
  }

  if (commissionRequestTitle) {
    commissionRequestTitle.textContent = selectedOffering.title;
  }

  if (commissionRequestPrice) {
    commissionRequestPrice.textContent = selectedOffering.estimatePrice || 'Price on request';
  }

  if (commissionRequestLink instanceof HTMLAnchorElement) {
    const privateChatUrl = typeof selectedOffering.privateChatUrl === 'string' ? selectedOffering.privateChatUrl.trim() : '';
    commissionRequestLink.hidden = !privateChatUrl;

    if (privateChatUrl) {
      commissionRequestLink.href = privateChatUrl;
    } else {
      commissionRequestLink.removeAttribute('href');
    }
  }

  if (commissionModalDescription) {
    renderFormattedDescription(
      commissionModalDescription,
      selectedOffering.description || 'Tell me about your idea and I will follow up with the details.'
    );
    commissionModalDescription.scrollTop = 0;
  }

  renderCommissionModalImages(selectedOffering);

  if (commissionForm) {
    commissionForm.reset();
    resetCommissionReferenceFiles();
    hideCommissionSuccess();
    const discordNameInput = commissionForm.elements.namedItem('discordName');

    if (discordNameInput instanceof HTMLInputElement && currentUser?.username) {
      discordNameInput.value = currentUser.username;
    }
  }

  setCommissionMessage('');
  commissionModal.hidden = false;
  document.body.classList.add('modal-open');
  requestAnimationFrame(() => updateDescriptionScrollIndicator(commissionModalDescription));
}

function closeCommissionModal() {
  if (!commissionModal) {
    return;
  }

  closeCommissionImageLightbox();
  commissionModal.hidden = true;
  document.body.classList.remove('modal-open');

  if (commissionForm) {
    commissionForm.reset();
  }

  resetCommissionReferenceFiles();
  hideCommissionSuccess();
  setCommissionMessage('');
}

navButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const viewName = button.getAttribute('data-view-target');

    if (viewName) {
      setActiveView(viewName);
    }
  });
});

if (loginButton) {
  loginButton.addEventListener('click', (event) => {
    if (!currentUser || currentUserIsAdmin) {
      return;
    }

    if (!logoutPending) {
      event.preventDefault();
      setLogoutConfirmation(true);
    }
  });
}

document.addEventListener('click', (event) => {
  if (!logoutPending || !loginButton || loginButton.contains(event.target)) {
    return;
  }

  setLogoutConfirmation(false);
});

window.addEventListener('hashchange', () => {
  const nextView = getInitialView();

  if (nextView !== currentView) {
    setActiveView(nextView);
  }
});

function renderRating(ratingValue, averageRatingValue = ratingValue) {
  if (!postModalRating) {
    return;
  }

  const rating = Number.parseInt(ratingValue, 10) || 0;
  postModalRating.innerHTML = '';
  postModalRating.setAttribute('aria-label', `${averageRatingValue} average out of 5 stars`);

  for (let index = 0; index < 5; index += 1) {
    postModalRating.appendChild(createStar(index < rating));
  }
}

function createStar(isFilled) {
  const star = document.createElement('span');
  star.className = isFilled ? 'star star-filled' : 'star star-empty';
  const imageSrc = isFilled ? 'assets/star.png' : 'assets/graystar.png';
  star.innerHTML = `<img src="${imageSrc}" alt="" aria-hidden="true" />`;
  return star;
}

function escapeAttribute(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatDescription(value) {
  let html = escapeAttribute(value);

  html = html.replace(/&lt;color(?:=([#a-zA-Z0-9(),.%\s-]+))?&gt;([\s\S]*?)&lt;\/color&gt;/g, (_match, colorValue, text) => {
    const color = String(colorValue || '#f45f77').trim();
    const safeColor = /^#[0-9a-fA-F]{3,8}$/.test(color) ? color : '#f45f77';
    return `<span class="formatted-color" style="color: ${safeColor};">${text}</span>`;
  });

  html = html
    .replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__([\s\S]+?)__/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/(^|[^_])_([^_\n]+)_/g, '$1<em>$2</em>')
    .replace(/\r?\n/g, '<br>');

  return html;
}

function renderFormattedDescription(element, value) {
  if (!element) {
    return;
  }

  element.innerHTML = formatDescription(value || '');
}

function renderFeedbackStars(value) {
  if (!feedbackStars || !feedbackRating) {
    return;
  }

  const rating = Number.parseInt(value, 10) || 0;

  if (feedbackStars.children.length !== 5) {
    feedbackStars.innerHTML = '';

    for (let index = 1; index <= 5; index += 1) {
      const button = document.createElement('button');
      button.className = 'feedback-star-button';
      button.type = 'button';
      button.dataset.rating = String(index);
      button.setAttribute('role', 'radio');
      button.setAttribute('aria-label', `${index} star${index === 1 ? '' : 's'}`);
      button.appendChild(createStar(false));
      feedbackStars.appendChild(button);
    }
  }

  [...feedbackStars.children].forEach((button) => {
    const star = button.querySelector('.star');
    const image = star.querySelector('img');
    const isFilled = Number.parseInt(button.dataset.rating, 10) <= rating;

    button.setAttribute('aria-checked', String(Number.parseInt(button.dataset.rating, 10) === rating));
    star.className = isFilled ? 'star star-filled' : 'star star-empty';
    image.src = isFilled ? 'assets/star.png' : 'assets/graystar.png';
  });
}

function setFeedbackRating(value) {
  if (!feedbackRating) {
    return;
  }

  feedbackRating.value = String(value);
  renderFeedbackStars(value);
}

function getContentApiBase() {
  return currentContentType === 'comics' ? '/api/comics' : '/api/posts';
}

function getAdminContentApiBase() {
  return currentContentType === 'comics' ? '/api/admin/comics' : '/api/admin/posts';
}

function updateCurrentCollection(updatedItem) {
  if (currentContentType === 'comics') {
    comics = comics.map((comic) => (comic.id === updatedItem.id ? updatedItem : comic));
    renderComics(comics);
    return;
  }

  posts = posts.map((post) => (post.id === updatedItem.id ? updatedItem : post));
  renderPosts(posts);
}

async function saveRating(value) {
  if (!currentPostId || !currentUser) {
    return;
  }

  try {
    const ratingResponse = await fetch(`${getContentApiBase()}/${currentPostId}/ratings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating: value })
    });

    if (!ratingResponse.ok) {
      throw new Error('Rating failed.');
    }

    const data = await ratingResponse.json();
    const updatedPost = data.post || data.comic;
    updateCurrentCollection(updatedPost);
    renderRating(String(updatedPost.rating), String(updatedPost.averageRating || updatedPost.rating));
    renderActivity(updatedPost);
    setFeedbackState(updatedPost);
    feedbackMessage.textContent = 'Rating saved.';
  } catch {
    feedbackMessage.textContent = 'Could not save rating.';
  }
}

function previewFeedbackRating(value) {
  renderFeedbackStars(value);
}

function createPlaceholder() {
  const placeholder = document.createElement('div');
  placeholder.className = 'image-placeholder';
  placeholder.setAttribute('aria-hidden', 'true');
  placeholder.innerHTML =
    '<div class="placeholder-sun"></div><div class="placeholder-mountain placeholder-mountain-large"></div><div class="placeholder-mountain placeholder-mountain-small"></div>';
  return placeholder;
}

function createRatingOverlay(ratingValue, averageRatingValue = ratingValue) {
  const rating = document.createElement('div');
  rating.className = 'rating rating-overlay';
  rating.setAttribute('aria-label', `${averageRatingValue} average out of 5 stars`);

  for (let index = 0; index < 5; index += 1) {
    rating.appendChild(createStar(index < ratingValue));
  }

  return rating;
}

function applyItemDataset(element, item, contentType) {
  element.dataset.postTitle = item.title;
  element.dataset.postDescription = item.description;
  element.dataset.postRating = String(item.rating);
  element.dataset.postAverageRating = String(item.averageRating || item.rating);
  element.dataset.postImageUrl = item.imageUrl || '';
  element.dataset.postImageAlt = item.imageAlt || item.title;
  element.dataset.postMusicUrl = item.musicUrl || '';
  element.dataset.postId = item.id;
  element.dataset.contentType = contentType;
}

function createPostCard(post) {
  const card = document.createElement('button');
  card.className = 'gallery-card post-card';
  card.type = 'button';
  card.setAttribute('aria-label', `Open ${post.title}`);
  applyItemDataset(card, post, 'posts');

  const media = post.imageUrl ? document.createElement('div') : createPlaceholder();
  media.classList.add('post-media');

  if (post.imageUrl) {
    const image = document.createElement('img');
    image.className = 'post-image';
    image.src = post.imageUrl;
    image.alt = post.imageAlt || post.title;
    media.appendChild(image);
  }

  media.appendChild(createImageWatermark());
  media.appendChild(createRatingOverlay(post.rating, post.averageRating || post.rating));
  card.appendChild(media);
  return card;
}

function createImageWatermark() {
  const watermark = document.createElement('img');
  watermark.className = 'image-watermark';
  watermark.src = WATERMARK_IMAGE_URL;
  watermark.alt = '';
  watermark.setAttribute('aria-hidden', 'true');
  return watermark;
}

function createComicRow(comic) {
  const row = document.createElement('article');
  row.className = 'comic-row comic-card';
  row.tabIndex = 0;
  row.setAttribute('role', 'button');
  row.setAttribute('aria-label', `Open ${comic.title}`);
  applyItemDataset(row, comic, 'comics');

  const media = comic.imageUrl ? document.createElement('div') : createPlaceholder();
  media.classList.add('comic-image');

  if (comic.imageUrl) {
    const image = document.createElement('img');
    image.className = 'post-image';
    image.src = comic.imageUrl;
    image.alt = comic.imageAlt || comic.title;
    media.appendChild(image);
  }

  media.appendChild(createImageWatermark());
  media.appendChild(createRatingOverlay(comic.rating, comic.averageRating || comic.rating));

  const copy = document.createElement('div');
  copy.className = 'comic-copy';

  const heading = document.createElement('h3');
  heading.className = 'comic-heading';
  heading.textContent = comic.title;

  const text = document.createElement('p');
  text.className = 'comic-text';
  renderFormattedDescription(text, comic.description);

  copy.append(heading, text);
  row.append(media, copy);
  return row;
}

function renderModalEpisodes(item) {
  if (!postModalEpisodes) {
    return;
  }

  const episodes = item?.episodes || [];
  postModalEpisodes.innerHTML = '';
  postModalEpisodes.hidden = currentContentType !== 'comics' || episodes.length === 0;

  if (postModalEpisodes.hidden) {
    return;
  }

  episodes.forEach((episode) => {
    const episodeElement = document.createElement('button');
    episodeElement.className = 'modal-episode';
    episodeElement.type = 'button';
    episodeElement.dataset.episodeId = episode.id;
    episodeElement.setAttribute('aria-label', `Read ${episode.title}`);

    const thumb = document.createElement('div');
    thumb.className = 'modal-episode-thumb';

    const thumbUrl = episode.imageUrl || episode.panels?.[0]?.imageUrl;

    if (thumbUrl) {
      const image = document.createElement('img');
      image.src = thumbUrl;
      image.alt = episode.imageAlt || episode.title;
      thumb.appendChild(image);
    }

    const copy = document.createElement('div');

    const title = document.createElement('h3');
    title.textContent = episode.title;

    const description = document.createElement('p');
    renderFormattedDescription(description, episode.description);

    copy.append(title, description);
    episodeElement.append(thumb, copy);
    postModalEpisodes.appendChild(episodeElement);
  });
}

function setSeriesBackVisible(isVisible) {
  if (seriesBackButton) {
    seriesBackButton.hidden = !isVisible;
  }
}

function hideComicReader() {
  if (!comicReader) {
    return;
  }

  comicReader.hidden = true;
  comicReader.innerHTML = '';
}

function renderComicReader(episode) {
  if (!comicReader) {
    return;
  }

  comicReader.innerHTML = '';
  comicReader.hidden = false;

  const header = document.createElement('img');
  header.className = 'comic-reader-header';
  header.src = 'assets/comictop.png';
  header.alt = '';
  comicReader.appendChild(header);

  const panels = episode.panels?.length ? episode.panels : [];

  if (panels.length > 0) {
    panels.forEach((episodePanel) => {
      const panel = document.createElement('img');
      panel.className = 'comic-reader-panel';
      panel.src = episodePanel.imageUrl;
      panel.alt = episodePanel.imageAlt || episode.title;
      comicReader.appendChild(panel);
    });
  } else {
    const empty = document.createElement('p');
    empty.className = 'comic-reader-empty';
    empty.textContent = 'No episode panels uploaded yet.';
    comicReader.appendChild(empty);
  }

  comicReader.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function setModalImage(imageUrl, imageAlt) {
  if (!postModalImage) {
    return;
  }

  postModalImage.innerHTML = '';

  if (imageUrl) {
    const image = document.createElement('img');
    image.className = 'post-image post-image-large';
    image.src = imageUrl;
    image.alt = imageAlt || '';
    postModalImage.appendChild(image);
  } else {
    postModalImage.appendChild(createPlaceholder());
  }
}

function showSeriesCover() {
  if (!currentSeries) {
    return;
  }

  postModalTitle.textContent = currentSeries.title;
  renderFormattedDescription(postModalDescription, currentSeries.description);
  postModalDescription.scrollTop = 0;
  setModalImage(currentSeries.imageUrl, currentSeries.imageAlt || currentSeries.title);
  hideComicReader();
  setSeriesBackVisible(false);
  requestAnimationFrame(updatePostDescriptionScrollIndicator);
}

function showEpisode(episodeId) {
  const episode = currentSeries?.episodes?.find((item) => item.id === episodeId);

  if (!episode) {
    return;
  }

  postModalTitle.textContent = episode.title;
  renderFormattedDescription(postModalDescription, episode.description);
  postModalDescription.scrollTop = 0;
  setModalImage(episode.imageUrl, episode.imageAlt || episode.title);
  renderComicReader(episode);
  setSeriesBackVisible(true);
  requestAnimationFrame(updatePostDescriptionScrollIndicator);
}

function renderPosts(posts) {
  if (!postsGallery) {
    return;
  }

  postsGallery.innerHTML = '';

  if (posts.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'gallery-empty';
    empty.textContent = 'No posts yet.';
    postsGallery.appendChild(empty);
    return;
  }

  posts.forEach((post) => {
    postsGallery.appendChild(createPostCard(post));
  });
}

function renderComics(comics) {
  if (!comicsList) {
    return;
  }

  comicsList.innerHTML = '';

  if (comics.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'gallery-empty';
    empty.textContent = 'No comics yet.';
    comicsList.appendChild(empty);
    return;
  }

  comics.forEach((comic) => {
    comicsList.appendChild(createComicRow(comic));
  });
}

function getCurrentPost() {
  const collection = currentContentType === 'comics' ? comics : posts;
  return collection.find((post) => post.id === currentPostId);
}

function formatTime(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function appendCommentText(container, username, textValue) {
  const text = String(textValue || '');
  const mentionMatch = text.match(/^(@\S+)(\s*)/);

  container.appendChild(document.createTextNode(`${username} commented: `));

  if (!mentionMatch) {
    container.appendChild(document.createTextNode(text));
    return;
  }

  const mention = document.createElement('span');
  mention.className = 'mention';
  mention.textContent = mentionMatch[1];
  container.appendChild(mention);
  container.appendChild(document.createTextNode(`${mentionMatch[2]}${text.slice(mentionMatch[0].length)}`));
}

function renderActivity(post) {
  if (!activityList) {
    return;
  }

  const ratings = (post.ratings || []).map((rating) => ({
    type: 'rating',
    username: rating.username,
    rating: rating.rating,
    createdAt: rating.updatedAt || rating.createdAt
  }));
  const comments = (post.comments || []).map((comment) => ({
    type: 'comment',
    id: comment.id,
    username: comment.username,
    text: comment.text,
    createdAt: comment.createdAt
  }));
  const activity = [...ratings, ...comments].sort(
    (first, second) => new Date(second.createdAt) - new Date(first.createdAt)
  );

  activityList.innerHTML = '';

  if (activity.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'activity-empty';
    empty.textContent = 'No comments or ratings yet.';
    activityList.appendChild(empty);
    return;
  }

  activity.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'activity-row';

    const text = document.createElement('span');
    text.className = 'activity-text';

    if (item.type === 'rating') {
      text.textContent = `${item.username} rated`;
    } else {
      appendCommentText(text, item.username, item.text);
    }

    row.appendChild(text);

    if (item.type === 'comment' && currentUserIsAdmin) {
      const actions = document.createElement('span');
      actions.className = 'activity-actions';

      const replyButton = document.createElement('button');
      replyButton.className = 'activity-action';
      replyButton.type = 'button';
      replyButton.dataset.replyTo = item.username;
      replyButton.textContent = 'Reply';
      actions.appendChild(replyButton);

      const deleteButton = document.createElement('button');
      deleteButton.className = 'activity-action activity-delete';
      deleteButton.type = 'button';
      deleteButton.dataset.postId = post.id;
      deleteButton.dataset.commentId = item.id;
      deleteButton.textContent = 'Delete';
      actions.appendChild(deleteButton);

      row.appendChild(actions);
    }

    if (item.type === 'rating') {
      const stars = document.createElement('span');
      stars.className = 'activity-stars';

      for (let index = 0; index < 5; index += 1) {
        stars.appendChild(createStar(index < item.rating));
      }

      row.appendChild(stars);
    }

    const time = document.createElement('time');
    time.textContent = formatTime(item.createdAt);
    row.appendChild(time);
    activityList.appendChild(row);
  });
}

function setFeedbackState(post) {
  if (!feedbackForm || !feedbackMessage) {
    return;
  }

  if (!currentUser) {
    feedbackForm.hidden = true;
    feedbackMessage.hidden = false;
    feedbackMessage.innerHTML = '<a href="/login?returnTo=/">Login with Discord</a> to rate or comment.';
    return;
  }

  feedbackForm.hidden = false;
  feedbackMessage.hidden = false;
  feedbackMessage.textContent = '';

  setFeedbackRating(post.userRating || 3);
  feedbackComment.value = '';
}

async function loadPosts() {
  if (!postsGallery) {
    return;
  }

  try {
    const response = await fetch('/api/posts');
    const data = await response.json();
    posts = data.posts || [];
    renderPosts(posts);
  } catch {
    postsGallery.innerHTML = '<p class="gallery-empty">Could not load posts.</p>';
  }
}

async function loadComics() {
  if (!comicsList) {
    return;
  }

  try {
    const response = await fetch('/api/comics');
    const data = await response.json();
    comics = data.comics || [];
    renderComics(comics);
  } catch {
    comicsList.innerHTML = '<p class="gallery-empty">Could not load comics.</p>';
  }
}

function createCommissionTypeCard(offering) {
  const card = document.createElement('button');
  card.className = 'commission-type-card';
  card.type = 'button';
  card.dataset.commissionId = offering.id;
  const offeringImages = getCommissionOfferingImages(offering);
  const previewImageUrl = offeringImages[0] || '';

  if (previewImageUrl) {
    const imageFrame = document.createElement('span');
    imageFrame.className = 'commission-type-image';

    const slideTrack = document.createElement('span');
    slideTrack.className = 'commission-type-slide-track';

    if (offeringImages.length > 1) {
      slideTrack.dataset.commissionSlideImages = JSON.stringify(offeringImages);
      slideTrack.dataset.commissionSlideIndex = '0';
    }

    offeringImages.forEach((imageUrl) => {
      const slide = document.createElement('span');
      slide.className = 'commission-type-slide';

      const image = document.createElement('img');
      image.src = imageUrl;
      image.alt = `${offering.title} example`;

      slide.appendChild(image);
      slideTrack.appendChild(slide);
    });

    imageFrame.appendChild(slideTrack);
    card.appendChild(imageFrame);
  } else {
    const placeholder = document.createElement('span');
    placeholder.className = 'commission-type-image commission-type-image-placeholder';
    placeholder.setAttribute('aria-hidden', 'true');
    card.appendChild(placeholder);
  }

  const copy = document.createElement('span');
  copy.className = 'commission-type-copy';

  const title = document.createElement('span');
  title.className = 'commission-type-heading';
  title.textContent = offering.title;
  copy.appendChild(title);

  const price = document.createElement('span');
  price.className = 'commission-price';
  price.textContent = offering.estimatePrice || 'Ask';
  copy.appendChild(price);

  const descriptionTitle = document.createElement('span');
  descriptionTitle.className = 'commission-type-description-title';
  descriptionTitle.textContent = 'Additional info:';
  copy.appendChild(descriptionTitle);

  const description = document.createElement('span');
  description.className = 'commission-type-description';
  renderFormattedDescription(description, offering.description || '');
  copy.appendChild(description);

  const privateChatUrl = typeof offering.privateChatUrl === 'string' ? offering.privateChatUrl.trim() : '';

  if (privateChatUrl) {
    const link = document.createElement('a');
    link.className = 'commission-type-link';
    link.href = privateChatUrl;
    link.target = '_blank';
    link.rel = 'noreferrer';
    link.textContent = 'Open private chat / commission site';
    link.addEventListener('click', (event) => {
      event.stopPropagation();
    });
    copy.appendChild(link);
  }

  card.appendChild(copy);
  return card;
}

function renderCommissionTypes(offerings) {
  if (!commissionTypes) {
    return;
  }

  commissionOfferings = offerings;
  stopCommissionSlideshows();
  commissionTypes.innerHTML = '';
  selectedCommissionOfferingId = '';

  if (commissionNext) {
    commissionNext.disabled = true;
  }

  if (commissionForm) {
    commissionForm.reset();
  }

  setCommissionMessage('');

  if (offerings.length === 0) {
    commissionTypes.innerHTML = '<p class="gallery-empty">Commission types coming soon.</p>';
    return;
  }

  offerings.forEach((offering) => {
    commissionTypes.appendChild(createCommissionTypeCard(offering));
  });

  startCommissionSlideshows();
}

function launchCommissionSparkles(card) {
  const copy = card.querySelector('.commission-type-copy');

  if (!copy || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  copy.querySelectorAll('.commission-sparkle').forEach((sparkle) => sparkle.remove());

  const sparkleCount = 18;

  for (let index = 0; index < sparkleCount; index += 1) {
    const sparkle = document.createElement('span');
    const startX = 14 + Math.random() * 72;
    const velocityX = -140 + Math.random() * 360;
    const velocityY = -160 - Math.random() * 170;
    const fall = 190 + Math.random() * 170;
    const delay = Math.random() * 90;
    const duration = 850 + Math.random() * 450;

    sparkle.className = 'commission-sparkle';
    sparkle.textContent = '★';
    sparkle.style.left = `${startX}%`;
    sparkle.style.top = `${42 + Math.random() * 22}%`;
    sparkle.style.setProperty('--spark-x', `${velocityX}px`);
    sparkle.style.setProperty('--spark-y', `${velocityY}px`);
    sparkle.style.setProperty('--spark-fall', `${fall}px`);
    sparkle.style.setProperty('--spark-delay', `${delay}ms`);
    sparkle.style.setProperty('--spark-duration', `${duration}ms`);
    sparkle.style.setProperty('--spark-rotate', `${Math.random() * 360}deg`);
    copy.appendChild(sparkle);

    window.setTimeout(() => {
      sparkle.remove();
    }, delay + duration + 120);
  }
}

async function loadCommissionTypes() {
  if (!commissionTypes) {
    return;
  }

  try {
    const response = await fetch('/api/commission-offerings');
    const data = await response.json();
    renderCommissionTypes(data.offerings || []);
  } catch {
    commissionTypes.innerHTML = '<p class="gallery-empty">Could not load commission types.</p>';
  }
}

async function loadCurrentUser() {
  try {
    const response = await fetch('/api/me');
    const data = await response.json();
    currentUser = data.user;
    currentUserIsAdmin = Boolean(data.isAdmin);

    if (loginButton && currentUser) {
      renderLoginUserButton();
    }
  } catch {
    currentUser = null;
    currentUserIsAdmin = false;
  }
}

function stopPostMusic() {
  if (currentPostAudioFade) {
    window.clearInterval(currentPostAudioFade);
    currentPostAudioFade = null;
  }

  if (!currentPostAudio) {
    return;
  }

  currentPostAudio.pause();
  currentPostAudio.currentTime = 0;
  currentPostAudio = null;
}

function playPostMusic(musicUrl) {
  if (!musicUrl) {
    return;
  }

  currentPostAudio = new Audio(musicUrl);
  currentPostAudio.loop = true;
  currentPostAudio.volume = 0;
  currentPostAudio.play().catch(() => {
    stopPostMusic();
  });

  const fadeStep = BACKGROUND_MUSIC_VOLUME / (MUSIC_FADE_DURATION_MS / MUSIC_FADE_STEP_MS);
  currentPostAudioFade = window.setInterval(() => {
    if (!currentPostAudio) {
      window.clearInterval(currentPostAudioFade);
      currentPostAudioFade = null;
      return;
    }

    currentPostAudio.volume = Math.min(BACKGROUND_MUSIC_VOLUME, currentPostAudio.volume + fadeStep);

    if (currentPostAudio.volume >= BACKGROUND_MUSIC_VOLUME) {
      window.clearInterval(currentPostAudioFade);
      currentPostAudioFade = null;
    }
  }, MUSIC_FADE_STEP_MS);
}

function updateDescriptionScrollIndicator(descriptionElement) {
  if (!descriptionElement) {
    return;
  }

  const indicatorHost = descriptionElement.parentElement;
  const scrollableHeight = descriptionElement.scrollHeight - descriptionElement.clientHeight;

  if (scrollableHeight <= 1) {
    indicatorHost?.classList.remove('is-scrollable');
    indicatorHost?.style.removeProperty('--description-scroll-top');
    indicatorHost?.style.removeProperty('--description-scroll-thumb-height');
    return;
  }

  const thumbHeight = Math.max(
    32,
    (descriptionElement.clientHeight / descriptionElement.scrollHeight) * descriptionElement.clientHeight
  );
  const scrollProgress = descriptionElement.scrollTop / scrollableHeight;
  const thumbTop = scrollProgress * (descriptionElement.clientHeight - thumbHeight);

  indicatorHost?.classList.add('is-scrollable');
  indicatorHost?.style.setProperty('--description-scroll-top', `${thumbTop}px`);
  indicatorHost?.style.setProperty('--description-scroll-thumb-height', `${thumbHeight}px`);
}

function updatePostDescriptionScrollIndicator() {
  updateDescriptionScrollIndicator(postModalDescription);
}

function updateCommissionDescriptionScrollIndicator() {
  updateDescriptionScrollIndicator(commissionModalDescription);
}

function openPostModal(card) {
  if (!postModal || !postModalTitle || !postModalDescription) {
    return;
  }

  postModalTitle.textContent = card.getAttribute('data-post-title') || 'Title';
  renderFormattedDescription(
    postModalDescription,
    card.getAttribute('data-post-description') || 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.'
  );
  postModalDescription.scrollTop = 0;
  renderRating(card.getAttribute('data-post-rating'), card.getAttribute('data-post-average-rating'));
  currentPostId = card.getAttribute('data-post-id') || '';
  currentContentType = card.getAttribute('data-content-type') || 'posts';
  stopPostMusic();

  setModalImage(card.getAttribute('data-post-image-url'), card.getAttribute('data-post-image-alt') || '');

  const post = getCurrentPost();
  currentSeries = currentContentType === 'comics' ? post : null;

  if (post) {
    setSeriesBackVisible(false);
    hideComicReader();
    renderModalEpisodes(post);
    renderActivity(post);
    setFeedbackState(post);
  } else {
    setSeriesBackVisible(false);
    hideComicReader();
    renderModalEpisodes(null);
  }

  postModal.hidden = false;
  postModal.classList.toggle('comics-modal', currentContentType === 'comics');
  document.body.classList.add('modal-open');
  requestAnimationFrame(updatePostDescriptionScrollIndicator);
  playPostMusic(card.getAttribute('data-post-music-url'));
}

function closePostModal() {
  if (postModal) {
    postModal.hidden = true;
    postModal.classList.remove('comics-modal');
    document.body.classList.remove('modal-open');
    stopPostMusic();
  }
}

if (postsGallery) {
  postsGallery.addEventListener('click', (event) => {
    const card = event.target.closest('.post-card');

    if (card) {
      openPostModal(card);
    }
  });
}

if (comicsList) {
  comicsList.addEventListener('click', (event) => {
    const card = event.target.closest('.comic-card');

    if (card) {
      openPostModal(card);
    }
  });

  comicsList.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    const card = event.target.closest('.comic-card');

    if (card) {
      event.preventDefault();
      openPostModal(card);
    }
  });
}

if (commissionTypes) {
  commissionTypes.addEventListener('click', (event) => {
    const card = event.target.closest('[data-commission-id]');

    if (!card) {
      return;
    }

    selectedCommissionOfferingId = card.dataset.commissionId;

    commissionTypes.querySelectorAll('[data-commission-id]').forEach((item) => {
      item.classList.toggle('commission-type-card-selected', item === card);
    });

    if (commissionNext) {
      commissionNext.disabled = false;
    }
  });
}

if (commissionNext) {
  commissionNext.addEventListener('click', () => {
    if (!selectedCommissionOfferingId) {
      return;
    }

    openCommissionModal();
  });
}

commissionCloseTargets.forEach((target) => {
  target.addEventListener('click', closeCommissionModal);
});

if (commissionModalImage) {
  commissionModalImage.addEventListener('click', openCommissionImageLightbox);
}

if (commissionImageLightbox) {
  commissionImageLightbox.addEventListener('click', (event) => {
    if (event.target === commissionImageLightbox) {
      closeCommissionImageLightbox();
    }
  });
}

if (commissionImageLightboxClose) {
  commissionImageLightboxClose.addEventListener('click', closeCommissionImageLightbox);
}

if (commissionModalThumbnails) {
  commissionModalThumbnails.addEventListener('click', (event) => {
    const button = event.target.closest('[data-image-url]');
    const selectedOffering = getSelectedCommissionOffering();

    if (!button || !selectedOffering) {
      return;
    }

    setCommissionModalPreview(button.dataset.imageUrl, selectedOffering.title);

    commissionModalThumbnails.querySelectorAll('[data-image-url]').forEach((item) => {
      item.classList.toggle('commission-modal-thumbnail-active', item === button);
    });
  });
}

if (commissionReferenceInput instanceof HTMLInputElement) {
  commissionReferenceInput.addEventListener('change', () => {
    const nextFiles = [...(commissionReferenceInput.files || [])].filter((file) => file.type.startsWith('image/'));

    if (nextFiles.length === 0) {
      syncCommissionReferenceInput();
      return;
    }

    commissionReferenceFiles = [...commissionReferenceFiles, ...nextFiles];
    syncCommissionReferenceInput();
    renderCommissionReferencePreview();
  });
}

if (commissionReferenceGrid) {
  commissionReferenceGrid.addEventListener('click', (event) => {
    const button = event.target.closest('[data-reference-remove]');

    if (!button) {
      return;
    }

    const index = Number.parseInt(button.dataset.referenceRemove, 10);

    if (Number.isNaN(index)) {
      return;
    }

    commissionReferenceFiles = commissionReferenceFiles.filter((_, itemIndex) => itemIndex !== index);
    syncCommissionReferenceInput();
    renderCommissionReferencePreview();
  });
}

if (commissionCopyLinkButton) {
  commissionCopyLinkButton.addEventListener('click', async () => {
    if (!(commissionSuccessLink instanceof HTMLInputElement) || !commissionSuccessLink.value) {
      return;
    }

    try {
      await navigator.clipboard.writeText(commissionSuccessLink.value);
      commissionCopyLinkButton.textContent = 'Copied';
      window.setTimeout(() => {
        commissionCopyLinkButton.textContent = 'Copy';
      }, 1200);
    } catch {
      commissionSuccessLink.select();
    }
  });
}

if (commissionSuccessClose) {
  commissionSuccessClose.addEventListener('click', closeCommissionModal);
}

postModalCloseTargets.forEach((target) => {
  target.addEventListener('click', closePostModal);
});

if (postModalDescription) {
  postModalDescription.addEventListener('scroll', updatePostDescriptionScrollIndicator, { passive: true });
  window.addEventListener('resize', updatePostDescriptionScrollIndicator);
}

if (commissionModalDescription) {
  commissionModalDescription.addEventListener('scroll', updateCommissionDescriptionScrollIndicator, { passive: true });
  window.addEventListener('resize', updateCommissionDescriptionScrollIndicator);
}

if (postModalEpisodes) {
  postModalEpisodes.addEventListener('click', (event) => {
    const episodeButton = event.target.closest('[data-episode-id]');

    if (episodeButton) {
      showEpisode(episodeButton.dataset.episodeId);
    }
  });
}

if (seriesBackButton) {
  seriesBackButton.addEventListener('click', showSeriesCover);
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeCommissionImageLightbox();
    closePostModal();
    closeCommissionModal();
  }
});

if (feedbackForm) {
  if (feedbackStars) {
    feedbackStars.addEventListener('click', (event) => {
      const button = event.target.closest('[data-rating]');

      if (button) {
        setFeedbackRating(button.dataset.rating);
        saveRating(button.dataset.rating);
      }
    });

    feedbackStars.addEventListener('pointerover', (event) => {
      const button = event.target.closest('[data-rating]');

      if (button) {
        previewFeedbackRating(button.dataset.rating);
      }
    });

    feedbackStars.addEventListener('pointerleave', () => {
      renderFeedbackStars(feedbackRating.value);
    });

    feedbackStars.addEventListener('keydown', (event) => {
      const current = Number.parseInt(feedbackRating.value, 10) || 3;

      if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
        event.preventDefault();
        setFeedbackRating(Math.min(5, current + 1));
      }

      if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
        event.preventDefault();
        setFeedbackRating(Math.max(1, current - 1));
      }
    });
  }

  feedbackForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (!currentPostId || !currentUser) {
      return;
    }

    const comment = feedbackComment.value.trim();

    if (!comment) {
      feedbackMessage.textContent = 'Choose a star or write a comment.';
      return;
    }

    try {
      let updatedPost = getCurrentPost();

      const commentResponse = await fetch(`${getContentApiBase()}/${currentPostId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment })
      });

      if (!commentResponse.ok) {
        throw new Error('Comment failed.');
      }

      const data = await commentResponse.json();
      updatedPost = data.post || data.comic;
      updateCurrentCollection(updatedPost);
      renderRating(String(updatedPost.rating), String(updatedPost.averageRating || updatedPost.rating));
      renderActivity(updatedPost);
      setFeedbackState(updatedPost);
      feedbackMessage.textContent = 'Feedback saved.';
    } catch {
      feedbackMessage.textContent = 'Could not save feedback.';
    }
  });
}

if (activityList) {
  activityList.addEventListener('pointerdown', (event) => {
    const row = event.target.closest('.activity-row');

    if (!row || event.pointerType === 'mouse') {
      return;
    }

    longPressTimer = window.setTimeout(() => {
      row.classList.add('activity-row-actions-visible');
    }, 550);
  });

  activityList.addEventListener('pointerup', () => {
    window.clearTimeout(longPressTimer);
  });

  activityList.addEventListener('pointercancel', () => {
    window.clearTimeout(longPressTimer);
  });

  activityList.addEventListener('click', async (event) => {
    const replyButton = event.target.closest('[data-reply-to]');

    if (replyButton && feedbackComment) {
      feedbackComment.value = `@${replyButton.dataset.replyTo} `;
      feedbackComment.focus();
      return;
    }

    const button = event.target.closest('[data-comment-id]');

    const postId = button?.dataset.postId || currentPostId;

    if (!button || !postId || !currentUserIsAdmin) {
      return;
    }

    try {
      const response = await fetch(`${getAdminContentApiBase()}/${postId}/comments/${button.dataset.commentId}`, {
        method: 'DELETE',
        credentials: 'same-origin'
      });

      if (!response.ok) {
        let details = '';

        try {
          const data = await response.json();
          details = data.error ? ` ${data.error}` : '';
        } catch {
          details = '';
        }

        throw new Error(`Delete failed (${response.status}).${details}`);
      }

      const data = await response.json();
      const updatedPost = data.post || data.comic;
      updateCurrentCollection(updatedPost);
      renderActivity(updatedPost);
      setFeedbackState(updatedPost);
      feedbackMessage.textContent = 'Comment deleted.';
    } catch (error) {
      feedbackMessage.textContent = `Could not delete comment. ${error.message}`;
    }
  });
}

if (commissionForm) {
  commissionForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const selectedOffering = getSelectedCommissionOffering();

    if (!selectedOffering) {
      setCommissionMessage('Pick a commission type first.', true);
      closeCommissionModal();
      return;
    }

    const formData = new FormData(commissionForm);
    formData.append('commissionType', selectedOffering.title);

    const submitButton = commissionForm.querySelector('[type="submit"]');

    if (submitButton instanceof HTMLButtonElement) {
      submitButton.disabled = true;
    }

    setCommissionMessage('Sending request...');

    try {
      const response = await fetch('/api/commissions', {
        method: 'POST',
        body: formData
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || 'Could not send commission request.');
      }

      commissionForm.reset();
      resetCommissionReferenceFiles();
      if (currentUser?.username) {
        const discordNameInput = commissionForm.elements.namedItem('discordName');

        if (discordNameInput instanceof HTMLInputElement) {
          discordNameInput.value = currentUser.username;
        }
      }
      hideCommissionSuccess();
      showCommissionSuccess(data.accessUrl || '', Boolean(data.dmDelivered), Boolean(data.adminDelivered));
    } catch (error) {
      setCommissionMessage(error.message || 'Could not send commission request.', true);
    } finally {
      if (submitButton instanceof HTMLButtonElement) {
        submitButton.disabled = false;
      }
    }
  });
}

loadCurrentUser();
setActiveView(getInitialView());
loadPosts();
loadComics();
loadCommissionTypes();
