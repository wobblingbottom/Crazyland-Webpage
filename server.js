const path = require("path");
const crypto = require("crypto");
const fsSync = require("fs");
const fs = require("fs/promises");
const express = require("express");
const session = require("express-session");
const multer = require("multer");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
const port = Number.parseInt(process.env.PORT || "3000", 10);
const storageDir = process.env.STORAGE_DIR || "";
const dataDir = process.env.DATA_DIR || (storageDir ? path.join(storageDir, "data") : path.join(__dirname, "data"));
const postsFile = path.join(dataDir, "posts.json");
const comicsFile = path.join(dataDir, "comics.json");
const commissionsFile = path.join(dataDir, "commissions.json");
const commissionOfferingsFile = path.join(dataDir, "commission-offerings.json");
const uploadsDir = process.env.UPLOADS_DIR || (storageDir ? path.join(storageDir, "uploads") : path.join(__dirname, "uploads"));
const COMMENT_MAX_LENGTH = 240;

fsSync.mkdirSync(uploadsDir, { recursive: true });

const {
  DISCORD_CLIENT_ID,
  DISCORD_CLIENT_SECRET,
  DISCORD_REDIRECT_URI,
  SESSION_SECRET,
  ADMIN_DISCORD_ID,
  DISCORD_BOT_TOKEN,
  DISCORD_ADMIN_CHANNEL_ID
} = process.env;

const requiredEnv = [
  "DISCORD_CLIENT_ID",
  "DISCORD_CLIENT_SECRET",
  "DISCORD_REDIRECT_URI",
  "SESSION_SECRET",
  "ADMIN_DISCORD_ID"
];

const placeholderValues = new Set([
  "your-discord-client-id",
  "your-discord-client-secret",
  "your-discord-user-id",
  "replace-with-a-long-random-secret"
]);

app.use(
  session({
    name: "crazyland.sid",
    secret: SESSION_SECRET || "replace-me-in-production",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 24 * 7
    }
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname)));
app.use("/uploads", express.static(uploadsDir));

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, callback) => {
      callback(null, uploadsDir);
    },
    filename: (req, file, callback) => {
      const extension = path.extname(file.originalname).toLowerCase();
      callback(null, `${crypto.randomUUID()}${extension}`);
    }
  }),
  fileFilter: (req, file, callback) => {
    if (
      (file.fieldname === "image" ||
        file.fieldname === "episodeImage" ||
        file.fieldname === "episodePanels" ||
        file.fieldname === "exampleImage" ||
        file.fieldname === "exampleImages" ||
        file.fieldname === "chatImage" ||
        file.fieldname === "reference") &&
      file.mimetype.startsWith("image/")
    ) {
      callback(null, true);
      return;
    }

    if (file.fieldname === "music" && file.mimetype.startsWith("audio/")) {
      callback(null, true);
      return;
    }

    callback(new Error("Only image and audio uploads are allowed."));
  },
  limits: {
    fileSize: 1024 * 1024 * 15
  }
});

function getMissingEnv() {
  return requiredEnv.filter((key) => !process.env[key]);
}

function getPlaceholderEnv() {
  return requiredEnv.filter((key) => placeholderValues.has(String(process.env[key] || "")));
}

function ensureConfigured(req, res, next) {
  const missing = getMissingEnv();
  const placeholders = getPlaceholderEnv();

  if (missing.length > 0 || placeholders.length > 0) {
    const issues = [
      missing.length > 0 ? `Missing:\n${missing.join("\n")}` : "",
      placeholders.length > 0 ? `Placeholder values still set:\n${placeholders.join("\n")}` : ""
    ]
      .filter(Boolean)
      .join("\n\n");

    res.status(500).send(
      `<h1>Environment setup problem</h1><p>Fix these before using Discord login:</p><pre>${issues}</pre>`
    );
    return;
  }

  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user) {
    if (req.path.startsWith("/api/")) {
      res.status(401).json({ error: "Login required." });
      return;
    }

    res.redirect("/login?returnTo=/admin");
    return;
  }

  if (req.session.user.id !== ADMIN_DISCORD_ID) {
    if (req.path.startsWith("/api/")) {
      res.status(403).json({ error: "Admin access required." });
      return;
    }

    res.status(403).send("<h1>Access denied</h1><p>This dashboard is private.</p>");
    return;
  }

  next();
}

function requireUser(req, res, next) {
  if (!req.session.user) {
    res.status(401).json({ error: "Login required." });
    return;
  }

  next();
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function ensurePostsFile() {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.mkdir(uploadsDir, { recursive: true });

  try {
    await fs.access(postsFile);
  } catch {
    await fs.writeFile(postsFile, JSON.stringify([], null, 2));
  }
}

async function readPosts() {
  await ensurePostsFile();
  const contents = await fs.readFile(postsFile, "utf8");
  return JSON.parse(contents).map((post) => ({
    imageUrl: "",
    musicUrl: "",
    comments: [],
    ratings: [],
    rating: 0,
    ...post
  }));
}

async function writePosts(posts) {
  await fs.writeFile(postsFile, JSON.stringify(posts, null, 2));
}

async function ensureComicsFile() {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.mkdir(uploadsDir, { recursive: true });

  try {
    await fs.access(comicsFile);
  } catch {
    await fs.writeFile(comicsFile, JSON.stringify([], null, 2));
  }
}

async function readComics() {
  await ensureComicsFile();
  const contents = await fs.readFile(comicsFile, "utf8");
  return JSON.parse(contents).map((comic) => ({
    imageUrl: "",
    musicUrl: "",
    episodes: [],
    comments: [],
    ratings: [],
    rating: 0,
    ...comic
  }));
}

async function writeComics(comics) {
  await fs.writeFile(comicsFile, JSON.stringify(comics, null, 2));
}

async function ensureCommissionsFile() {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.mkdir(uploadsDir, { recursive: true });

  try {
    await fs.access(commissionsFile);
  } catch {
    await fs.writeFile(commissionsFile, JSON.stringify([], null, 2));
  }
}

async function readCommissions() {
  await ensureCommissionsFile();
  const contents = await fs.readFile(commissionsFile, "utf8");
  return JSON.parse(contents).map((commission) => ({
    status: "new",
    discordName: "",
    commissionType: "",
    description: "",
    contact: "",
    referenceUrl: "",
    accessToken: "",
    comments: [],
    ...commission,
    referenceUrls:
      Array.isArray(commission.referenceUrls) && commission.referenceUrls.length > 0
        ? commission.referenceUrls.filter(Boolean)
        : commission.referenceUrl
          ? [commission.referenceUrl]
          : [],
    comments: Array.isArray(commission.comments) ? commission.comments : []
  }));
}

async function writeCommissions(commissions) {
  await fs.writeFile(commissionsFile, JSON.stringify(commissions, null, 2));
}

async function ensureCommissionOfferingsFile() {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.mkdir(uploadsDir, { recursive: true });

  try {
    await fs.access(commissionOfferingsFile);
  } catch {
    await fs.writeFile(commissionOfferingsFile, JSON.stringify([], null, 2));
  }
}

async function readCommissionOfferings() {
  await ensureCommissionOfferingsFile();
  const contents = await fs.readFile(commissionOfferingsFile, "utf8");
  return JSON.parse(contents).map((offering) => ({
    title: "",
    description: "",
    estimatePrice: "",
    notes: "",
    privateChatUrl: "",
    exampleImageUrl: "",
    status: "open",
    ...offering,
    exampleImageUrls:
      Array.isArray(offering.exampleImageUrls) && offering.exampleImageUrls.length > 0
        ? offering.exampleImageUrls.filter(Boolean)
        : offering.exampleImageUrl
          ? [offering.exampleImageUrl]
          : []
  }));
}

async function writeCommissionOfferings(offerings) {
  await fs.writeFile(commissionOfferingsFile, JSON.stringify(offerings, null, 2));
}

function normalizeCommissionOfferingInput(input) {
  const title = String(input.title || "").trim().slice(0, 80);
  const description = String(input.description || "").trim().slice(0, 800);
  const estimatePrice = String(input.estimatePrice || "").trim().slice(0, 80);
  const notes = String(input.notes || "").trim().slice(0, 400);
  const privateChatUrl = String(input.privateChatUrl || "").trim().slice(0, 500);
  const status = input.status === "closed" ? "closed" : "open";

  if (!title || !description || !estimatePrice) {
    return { error: "Title, description, and estimated price are required." };
  }

  return {
    offering: {
      title,
      description,
      estimatePrice,
      notes,
      privateChatUrl,
      status
    }
  };
}

function getCollectionHandlers(type) {
  if (type === "comics") {
    return {
      label: "comic",
      read: readComics,
      write: writeComics
    };
  }

  return {
    label: "post",
    read: readPosts,
    write: writePosts
  };
}

function normalizePostInput(input) {
  const title = String(input.title || "").trim();
  const description = String(input.description || "").trim();
  const status = input.status === "draft" ? "draft" : "published";
  const imageAlt = String(input.imageAlt || "Placeholder image").trim();

  if (!title || !description) {
    return {
      error: "Title and description are required."
    };
  }

  return {
    post: {
      title,
      description,
      status,
      imageAlt
    }
  };
}

function getUploadedFileUrl(file) {
  return file ? `/uploads/${file.filename}` : "";
}

function buildAbsoluteUrl(req, relativePath) {
  const protocol = req.headers["x-forwarded-proto"] || req.protocol || "http";
  return `${protocol}://${req.get("host")}${relativePath}`;
}

function getDiscordBotHeaders() {
  return {
    Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
    "Content-Type": "application/json"
  };
}

async function sendDiscordChannelMessage(channelId, content) {
  if (!DISCORD_BOT_TOKEN || !channelId) {
    return false;
  }

  const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: "POST",
    headers: getDiscordBotHeaders(),
    body: JSON.stringify({ content })
  });

  return response.ok;
}

async function sendDiscordDm(userId, content) {
  if (!DISCORD_BOT_TOKEN || !userId) {
    return false;
  }

  const channelResponse = await fetch("https://discord.com/api/v10/users/@me/channels", {
    method: "POST",
    headers: getDiscordBotHeaders(),
    body: JSON.stringify({ recipient_id: userId })
  });

  if (!channelResponse.ok) {
    return false;
  }

  const channel = await channelResponse.json();
  return sendDiscordChannelMessage(channel.id, content);
}

function getPostRating(post) {
  if (!post.ratings || post.ratings.length === 0) {
    return Number.isFinite(post.rating) ? post.rating : 0;
  }

  const total = post.ratings.reduce((sum, item) => sum + item.rating, 0);
  return total / post.ratings.length;
}

function buildPublicCommission(commission) {
  return {
    id: commission.id,
    discordName: commission.discordName,
    commissionType: commission.commissionType,
    description: commission.description,
    contact: commission.contact,
    status: commission.status,
    createdAt: commission.createdAt,
    updatedAt: commission.updatedAt,
    referenceUrl: commission.referenceUrl,
    referenceUrls: commission.referenceUrls || [],
    comments: (commission.comments || []).map((comment) => ({
      id: comment.id,
      userId: comment.userId,
      username: comment.username,
      text: comment.text,
      imageUrl: comment.imageUrl || "",
      createdAt: comment.createdAt
    }))
  };
}

function buildPublicPost(post, viewerId = "") {
  const userRating = viewerId
    ? post.ratings.find((rating) => rating.userId === viewerId)?.rating || 0
    : 0;

  return {
    ...post,
    averageRating: Number(getPostRating(post).toFixed(2)),
    rating: Math.round(getPostRating(post)),
    userRating,
    comments: post.comments.map((comment) => ({
      id: comment.id,
      username: comment.username,
      text: comment.text,
      createdAt: comment.createdAt
    })),
    episodes: (post.episodes || []).map((episode) => ({
      id: episode.id,
      title: episode.title,
      description: episode.description,
      imageUrl: episode.imageUrl,
      imageAlt: episode.imageAlt,
      panels: episode.panels || [],
      createdAt: episode.createdAt
    })),
    ratings: post.ratings.map((rating) => ({
      id: rating.id,
      username: rating.username,
      rating: rating.rating,
      createdAt: rating.createdAt,
      updatedAt: rating.updatedAt
    })),
    ratingsCount: post.ratings.length,
    commentsCount: post.comments.length
  };
}

function buildDiscordAuthUrl(state) {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: DISCORD_CLIENT_ID,
    scope: "identify",
    redirect_uri: DISCORD_REDIRECT_URI,
    state,
    prompt: "consent"
  });

  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

function getDiscordAvatarUrl(user) {
  if (!user) {
    return "";
  }

  if (user.avatar) {
    return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64`;
  }

  return `https://cdn.discordapp.com/embed/avatars/${Number.parseInt(user.id, 10) % 5}.png`;
}

async function exchangeCodeForToken(code) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: DISCORD_REDIRECT_URI
  });

  const credentials = Buffer.from(`${DISCORD_CLIENT_ID}:${DISCORD_CLIENT_SECRET}`).toString("base64");
  const response = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  if (!response.ok) {
    throw new Error(`Discord token exchange failed with status ${response.status}`);
  }

  return response.json();
}

async function fetchDiscordUser(accessToken) {
  const response = await fetch("https://discord.com/api/users/@me", {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    throw new Error(`Discord user fetch failed with status ${response.status}`);
  }

  return response.json();
}

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    configured: getMissingEnv().length === 0 && getPlaceholderEnv().length === 0
  });
});

app.get("/login", ensureConfigured, (req, res) => {
  const state = crypto.randomUUID();
  const returnTo = typeof req.query.returnTo === "string" ? req.query.returnTo : "/";
  req.session.oauthState = state;
  req.session.returnTo = returnTo.startsWith("/") ? returnTo : "/";
  res.redirect(buildDiscordAuthUrl(state));
});

app.get("/auth/discord/callback", ensureConfigured, async (req, res) => {
  const { code, state } = req.query;

  if (!code || !state || state !== req.session.oauthState) {
    res.status(400).send("<h1>Invalid OAuth state</h1><p>Please try logging in again.</p>");
    return;
  }

  delete req.session.oauthState;

  try {
    const token = await exchangeCodeForToken(String(code));
    const user = await fetchDiscordUser(token.access_token);

    req.session.user = {
      id: user.id,
      username: user.username,
      avatar: user.avatar
    };

    const returnTo = req.session.returnTo || "/";
    delete req.session.returnTo;
    res.redirect(returnTo);
  } catch (error) {
    res.status(500).send(
      `<h1>Discord login failed</h1><p>${error.message}</p>`
    );
  }
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/");
  });
});

app.get("/api/me", (req, res) => {
  res.json({
    user: req.session.user || null,
    isAdmin: req.session.user ? req.session.user.id === ADMIN_DISCORD_ID : false
  });
});

app.get("/api/posts", async (req, res) => {
  const posts = await readPosts();
  res.json({
    posts: posts
      .filter((post) => post.status === "published")
      .map((post) => buildPublicPost(post, req.session.user?.id))
  });
});

app.post("/api/posts/:id/comments", requireUser, async (req, res) => {
  const text = String(req.body.comment || "").trim().slice(0, COMMENT_MAX_LENGTH);

  if (!text) {
    res.status(400).json({ error: "Comment is required." });
    return;
  }

  const posts = await readPosts();
  const post = posts.find((item) => item.id === req.params.id && item.status === "published");

  if (!post) {
    res.status(404).json({ error: "Post not found." });
    return;
  }

  const comment = {
    id: crypto.randomUUID(),
    userId: req.session.user.id,
    username: req.session.user.username,
    text,
    createdAt: new Date().toISOString()
  };

  post.comments.unshift(comment);
  await writePosts(posts);
  res.status(201).json({ post: buildPublicPost(post, req.session.user.id), comment });
});

app.delete("/api/admin/posts/:postId/comments/:commentId", ensureConfigured, requireAdmin, async (req, res) => {
  const posts = await readPosts();
  const post =
    posts.find((item) => item.id === req.params.postId) ||
    posts.find((item) => item.comments.some((comment) => comment.id === req.params.commentId));

  if (!post) {
    res.status(404).json({ error: "Post not found." });
    return;
  }

  const nextComments = post.comments.filter((comment) => comment.id !== req.params.commentId);

  if (nextComments.length === post.comments.length) {
    res.status(404).json({ error: "Comment not found." });
    return;
  }

  post.comments = nextComments;
  await writePosts(posts);
  res.json({ post: buildPublicPost(post, req.session.user.id) });
});


app.post("/api/posts/:id/ratings", requireUser, async (req, res) => {
  const rating = Math.max(1, Math.min(5, Number.parseInt(req.body.rating, 10) || 0));

  if (!rating) {
    res.status(400).json({ error: "Rating is required." });
    return;
  }

  const posts = await readPosts();
  const post = posts.find((item) => item.id === req.params.id && item.status === "published");

  if (!post) {
    res.status(404).json({ error: "Post not found." });
    return;
  }

  const existing = post.ratings.find((item) => item.userId === req.session.user.id);
  const now = new Date().toISOString();

  if (existing) {
    existing.rating = rating;
    existing.updatedAt = now;
  } else {
    post.ratings.unshift({
      id: crypto.randomUUID(),
      userId: req.session.user.id,
      username: req.session.user.username,
      rating,
      createdAt: now,
      updatedAt: now
    });
  }

  await writePosts(posts);
  res.json({ post: buildPublicPost(post, req.session.user.id) });
});

app.get("/api/admin/posts", ensureConfigured, requireAdmin, async (req, res) => {
  const posts = await readPosts();
  res.json({ posts });
});

app.post("/api/admin/posts", ensureConfigured, requireAdmin, upload.fields([{ name: "image", maxCount: 1 }, { name: "music", maxCount: 1 }]), async (req, res) => {
  const result = normalizePostInput(req.body);

  if (result.error) {
    res.status(400).json({ error: result.error });
    return;
  }

  const now = new Date().toISOString();
  const posts = await readPosts();
  const post = {
    id: crypto.randomUUID(),
    ...result.post,
    imageUrl: getUploadedFileUrl(req.files?.image?.[0]),
    musicUrl: getUploadedFileUrl(req.files?.music?.[0]),
    comments: [],
    ratings: [],
    createdAt: now,
    updatedAt: now
  };

  posts.unshift(post);
  await writePosts(posts);
  res.status(201).json({ post });
});

app.put("/api/admin/posts/:id", ensureConfigured, requireAdmin, upload.fields([{ name: "image", maxCount: 1 }, { name: "music", maxCount: 1 }]), async (req, res) => {
  const result = normalizePostInput(req.body);

  if (result.error) {
    res.status(400).json({ error: result.error });
    return;
  }

  const posts = await readPosts();
  const index = posts.findIndex((post) => post.id === req.params.id);

  if (index === -1) {
    res.status(404).json({ error: "Post not found." });
    return;
  }

  posts[index] = {
    ...posts[index],
    ...result.post,
    imageUrl:
      req.body.removeImage === "true"
        ? ""
        : req.files?.image?.[0]
          ? getUploadedFileUrl(req.files.image[0])
          : posts[index].imageUrl,
    musicUrl:
      req.body.removeMusic === "true"
        ? ""
        : req.files?.music?.[0]
          ? getUploadedFileUrl(req.files.music[0])
          : posts[index].musicUrl,
    updatedAt: new Date().toISOString()
  };

  await writePosts(posts);
  res.json({ post: posts[index] });
});

app.delete("/api/admin/posts/:id", ensureConfigured, requireAdmin, async (req, res) => {
  const posts = await readPosts();
  const nextPosts = posts.filter((post) => post.id !== req.params.id);

  if (nextPosts.length === posts.length) {
    res.status(404).json({ error: "Post not found." });
    return;
  }

  await writePosts(nextPosts);
  res.status(204).end();
});

app.get("/api/comics", async (req, res) => {
  const comics = await readComics();
  res.json({
    comics: comics
      .filter((comic) => comic.status === "published")
      .map((comic) => buildPublicPost(comic, req.session.user?.id))
  });
});

app.post("/api/comics/:id/comments", requireUser, async (req, res) => {
  const text = String(req.body.comment || "").trim().slice(0, COMMENT_MAX_LENGTH);

  if (!text) {
    res.status(400).json({ error: "Comment is required." });
    return;
  }

  const comics = await readComics();
  const comic = comics.find((item) => item.id === req.params.id && item.status === "published");

  if (!comic) {
    res.status(404).json({ error: "Comic not found." });
    return;
  }

  const comment = {
    id: crypto.randomUUID(),
    userId: req.session.user.id,
    username: req.session.user.username,
    text,
    createdAt: new Date().toISOString()
  };

  comic.comments.unshift(comment);
  await writeComics(comics);
  res.status(201).json({ comic: buildPublicPost(comic, req.session.user.id), comment });
});

app.post("/api/comics/:id/ratings", requireUser, async (req, res) => {
  const rating = Math.max(1, Math.min(5, Number.parseInt(req.body.rating, 10) || 0));

  if (!rating) {
    res.status(400).json({ error: "Rating is required." });
    return;
  }

  const comics = await readComics();
  const comic = comics.find((item) => item.id === req.params.id && item.status === "published");

  if (!comic) {
    res.status(404).json({ error: "Comic not found." });
    return;
  }

  const existing = comic.ratings.find((item) => item.userId === req.session.user.id);
  const now = new Date().toISOString();

  if (existing) {
    existing.rating = rating;
    existing.updatedAt = now;
  } else {
    comic.ratings.unshift({
      id: crypto.randomUUID(),
      userId: req.session.user.id,
      username: req.session.user.username,
      rating,
      createdAt: now,
      updatedAt: now
    });
  }

  await writeComics(comics);
  res.json({ comic: buildPublicPost(comic, req.session.user.id) });
});

app.delete("/api/admin/comics/:comicId/comments/:commentId", ensureConfigured, requireAdmin, async (req, res) => {
  const comics = await readComics();
  const comic =
    comics.find((item) => item.id === req.params.comicId) ||
    comics.find((item) => item.comments.some((comment) => comment.id === req.params.commentId));

  if (!comic) {
    res.status(404).json({ error: "Comic not found." });
    return;
  }

  const nextComments = comic.comments.filter((comment) => comment.id !== req.params.commentId);

  if (nextComments.length === comic.comments.length) {
    res.status(404).json({ error: "Comment not found." });
    return;
  }

  comic.comments = nextComments;
  await writeComics(comics);
  res.json({ comic: buildPublicPost(comic, req.session.user.id) });
});

app.get("/api/admin/comics", ensureConfigured, requireAdmin, async (req, res) => {
  const comics = await readComics();
  res.json({ comics });
});

app.post("/api/admin/comics", ensureConfigured, requireAdmin, upload.fields([{ name: "image", maxCount: 1 }, { name: "music", maxCount: 1 }]), async (req, res) => {
  const result = normalizePostInput(req.body);

  if (result.error) {
    res.status(400).json({ error: result.error });
    return;
  }

  const now = new Date().toISOString();
  const comics = await readComics();
  const comic = {
    id: crypto.randomUUID(),
    ...result.post,
    imageUrl: getUploadedFileUrl(req.files?.image?.[0]),
    musicUrl: getUploadedFileUrl(req.files?.music?.[0]),
    comments: [],
    ratings: [],
    createdAt: now,
    updatedAt: now
  };

  comics.unshift(comic);
  await writeComics(comics);
  res.status(201).json({ comic });
});

app.put("/api/admin/comics/:id", ensureConfigured, requireAdmin, upload.fields([{ name: "image", maxCount: 1 }, { name: "music", maxCount: 1 }]), async (req, res) => {
  const result = normalizePostInput(req.body);

  if (result.error) {
    res.status(400).json({ error: result.error });
    return;
  }

  const comics = await readComics();
  const index = comics.findIndex((comic) => comic.id === req.params.id);

  if (index === -1) {
    res.status(404).json({ error: "Comic not found." });
    return;
  }

  comics[index] = {
    ...comics[index],
    ...result.post,
    imageUrl:
      req.body.removeImage === "true"
        ? ""
        : req.files?.image?.[0]
          ? getUploadedFileUrl(req.files.image[0])
          : comics[index].imageUrl,
    musicUrl:
      req.body.removeMusic === "true"
        ? ""
        : req.files?.music?.[0]
          ? getUploadedFileUrl(req.files.music[0])
          : comics[index].musicUrl,
    updatedAt: new Date().toISOString()
  };

  await writeComics(comics);
  res.json({ comic: comics[index] });
});

app.post(
  "/api/admin/comics/:id/episodes",
  ensureConfigured,
  requireAdmin,
  upload.fields([{ name: "episodeImage", maxCount: 1 }, { name: "episodePanels", maxCount: 20 }]),
  async (req, res) => {
  const title = String(req.body.episodeTitle || "").trim();
  const description = String(req.body.episodeDescription || "").trim();
  const imageAlt = String(req.body.episodeImageAlt || title || "Comic episode image").trim();

  if (!title || !description) {
    res.status(400).json({ error: "Episode title and description are required." });
    return;
  }

  const comics = await readComics();
  const comic = comics.find((item) => item.id === req.params.id);

  if (!comic) {
    res.status(404).json({ error: "Comic not found." });
    return;
  }

  const now = new Date().toISOString();
  const panels = (req.files?.episodePanels || []).map((file, index) => ({
    id: crypto.randomUUID(),
    imageUrl: getUploadedFileUrl(file),
    imageAlt: `${imageAlt} panel ${index + 1}`,
    order: index
  }));
  const coverUrl = req.files?.episodeImage?.[0]
    ? getUploadedFileUrl(req.files.episodeImage[0])
    : panels[0]?.imageUrl || "";
  const episode = {
    id: crypto.randomUUID(),
    title,
    description,
    imageAlt,
    imageUrl: coverUrl,
    panels,
    createdAt: now,
    updatedAt: now
  };

  comic.episodes = [episode, ...(comic.episodes || [])];
  comic.updatedAt = now;
  await writeComics(comics);
  res.status(201).json({ comic });
  }
);

app.put(
  "/api/admin/comics/:id/episodes/:episodeId",
  ensureConfigured,
  requireAdmin,
  upload.fields([{ name: "episodeImage", maxCount: 1 }, { name: "episodePanels", maxCount: 20 }]),
  async (req, res) => {
  const title = String(req.body.episodeTitle || "").trim();
  const description = String(req.body.episodeDescription || "").trim();
  const imageAlt = String(req.body.episodeImageAlt || title || "Comic episode image").trim();

  if (!title || !description) {
    res.status(400).json({ error: "Episode title and description are required." });
    return;
  }

  const comics = await readComics();
  const comic = comics.find((item) => item.id === req.params.id);

  if (!comic) {
    res.status(404).json({ error: "Comic not found." });
    return;
  }

  const episode = (comic.episodes || []).find((item) => item.id === req.params.episodeId);

  if (!episode) {
    res.status(404).json({ error: "Episode not found." });
    return;
  }

  const requestedPanelOrder = (() => {
    try {
      const parsed = JSON.parse(String(req.body.episodePanelOrder || "[]"));
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  })();
  const existingPanels = episode.panels || [];
  const orderedExistingPanels =
    requestedPanelOrder.length > 0
      ? [
          ...requestedPanelOrder
            .map((id) => existingPanels.find((panel) => panel.id === id))
            .filter(Boolean),
          ...existingPanels.filter((panel) => !requestedPanelOrder.includes(panel.id))
        ]
      : existingPanels;
  const uploadedPanels = (req.files?.episodePanels || []).map((file, index) => ({
    id: crypto.randomUUID(),
    imageUrl: getUploadedFileUrl(file),
    imageAlt: `${imageAlt} panel ${index + 1}`,
    order: orderedExistingPanels.length + index
  }));
  const panels = [...orderedExistingPanels, ...uploadedPanels].map((panel, index) => ({
    ...panel,
    order: index
  }));
  const coverUrl = req.files?.episodeImage?.[0]
    ? getUploadedFileUrl(req.files.episodeImage[0])
    : episode.imageUrl || panels[0]?.imageUrl || "";
  const now = new Date().toISOString();

  episode.title = title;
  episode.description = description;
  episode.imageAlt = imageAlt;
  episode.panels = panels;
  episode.imageUrl = coverUrl;
  episode.updatedAt = now;
  comic.updatedAt = now;

  await writeComics(comics);
  res.json({ comic });
  }
);

app.delete("/api/admin/comics/:id/episodes/:episodeId", ensureConfigured, requireAdmin, async (req, res) => {
  const comics = await readComics();
  const comic = comics.find((item) => item.id === req.params.id);

  if (!comic) {
    res.status(404).json({ error: "Comic not found." });
    return;
  }

  const episodes = comic.episodes || [];
  const nextEpisodes = episodes.filter((episode) => episode.id !== req.params.episodeId);

  if (nextEpisodes.length === episodes.length) {
    res.status(404).json({ error: "Episode not found." });
    return;
  }

  comic.episodes = nextEpisodes;
  comic.updatedAt = new Date().toISOString();

  await writeComics(comics);
  res.json({ comic });
});

app.delete("/api/admin/comics/:id", ensureConfigured, requireAdmin, async (req, res) => {
  const comics = await readComics();
  const nextComics = comics.filter((comic) => comic.id !== req.params.id);

  if (nextComics.length === comics.length) {
    res.status(404).json({ error: "Comic not found." });
    return;
  }

  await writeComics(nextComics);
  res.status(204).end();
});

app.post("/api/commissions", upload.array("reference", 12), async (req, res) => {
  const discordName = String(req.body.discordName || "").trim().slice(0, 80);
  const commissionType = String(req.body.commissionType || "").trim().slice(0, 80);
  const description = String(req.body.description || "").trim().slice(0, 800);

  if (!discordName || !commissionType || !description) {
    res.status(400).json({ error: "Discord name, commission type, and description are required." });
    return;
  }

  const now = new Date().toISOString();
  const commissions = await readCommissions();
  const referenceUrls = (req.files || []).map((file) => getUploadedFileUrl(file)).filter(Boolean);
  const accessToken = crypto.randomUUID();
  const commission = {
    id: crypto.randomUUID(),
    discordName,
    commissionType,
    description,
    contact: "",
    referenceUrl: referenceUrls[0] || "",
    referenceUrls,
    accessToken,
    requesterUserId: req.session.user?.id || "",
    requesterUsername: req.session.user?.username || "",
    status: "new",
    createdAt: now,
    updatedAt: now
  };

  commissions.unshift(commission);
  await writeCommissions(commissions);

  const accessUrl = buildAbsoluteUrl(req, `/commission/${accessToken}`);
  const requesterLabel = req.session.user
    ? `${discordName} (${req.session.user.username}, ${req.session.user.id})`
    : discordName;
  const notificationLines = [
    "New commission request received.",
    `Type: ${commissionType}`,
    `Requester: ${requesterLabel}`,
    `Private link: ${accessUrl}`
  ].filter(Boolean);
  const notificationMessage = notificationLines.join("\n");

  let adminDelivered = false;
  let dmDelivered = false;

  try {
    adminDelivered = await sendDiscordChannelMessage(DISCORD_ADMIN_CHANNEL_ID, notificationMessage);
  } catch {
    adminDelivered = false;
  }

  if (req.session.user?.id) {
    try {
      dmDelivered = await sendDiscordDm(
        req.session.user.id,
        `Your commission request for "${commissionType}" has been saved.\nKeep this private link safe:\n${accessUrl}`
      );
    } catch {
      dmDelivered = false;
    }
  }

  res.status(201).json({ commission, accessUrl, adminDelivered, dmDelivered });
});

app.get("/api/commission-offerings", async (req, res) => {
  const offerings = await readCommissionOfferings();
  res.json({ offerings: offerings.filter((offering) => offering.status === "open") });
});

app.get("/api/commissions/:token", async (req, res) => {
  const commissions = await readCommissions();
  const commission = commissions.find((item) => item.accessToken === req.params.token);

  if (!commission) {
    res.status(404).json({ error: "Commission not found." });
    return;
  }

  res.json({ commission: buildPublicCommission(commission) });
});

app.post("/api/commissions/:token/comments", upload.single("chatImage"), async (req, res) => {
  const text = String(req.body.comment || "").trim().slice(0, COMMENT_MAX_LENGTH);
  const imageUrl = getUploadedFileUrl(req.file);

  if (!text && !imageUrl) {
    res.status(400).json({ error: "Message or image is required." });
    return;
  }

  const commissions = await readCommissions();
  const commission = commissions.find((item) => item.accessToken === req.params.token);

  if (!commission) {
    res.status(404).json({ error: "Commission not found." });
    return;
  }

  const comment = {
    id: crypto.randomUUID(),
    userId: req.session.user?.id || "",
    username: req.session.user?.username || commission.discordName || "Commissioner",
    text,
    imageUrl,
    createdAt: new Date().toISOString()
  };

  commission.comments.unshift(comment);
  commission.updatedAt = new Date().toISOString();
  await writeCommissions(commissions);

  const accessUrl = buildAbsoluteUrl(req, `/commission/${commission.accessToken}`);
  const notificationMessage = [
    "New private commission chat message.",
    `Commission: ${commission.commissionType}`,
    `From: ${comment.username}`,
    comment.text ? `Message: ${comment.text}` : "",
    comment.imageUrl ? `Image: ${buildAbsoluteUrl(req, comment.imageUrl)}` : "",
    `Private link: ${accessUrl}`
  ].filter(Boolean).join("\n").slice(0, 1900);

  let adminDelivered = false;
  let dmDelivered = false;

  try {
    adminDelivered = await sendDiscordChannelMessage(DISCORD_ADMIN_CHANNEL_ID, notificationMessage);
  } catch {
    adminDelivered = false;
  }

  const isAdminReply = req.session.user?.id && req.session.user.id === ADMIN_DISCORD_ID;
  const requesterUserId = commission.requesterUserId || "";

  if (isAdminReply && requesterUserId && requesterUserId !== req.session.user.id) {
    try {
      dmDelivered = await sendDiscordDm(
        requesterUserId,
        `There is a new reply on your commission "${commission.commissionType}".\n${accessUrl}`
      );
    } catch {
      dmDelivered = false;
    }
  }

  res.status(201).json({ commission: buildPublicCommission(commission), comment, adminDelivered, dmDelivered });
});

app.get("/commission/:token", async (req, res) => {
  const commissions = await readCommissions();
  const commission = commissions.find((item) => item.accessToken === req.params.token);

  if (!commission) {
    res.status(404).send(`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Commission Closed</title>
    <style>
      @font-face {
        font-family: "Rayman";
        src: url("/fonts/rayman3.ttf") format("truetype");
        font-weight: 400;
        font-style: normal;
        font-display: swap;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        background:
          repeating-linear-gradient(
            90deg,
            #e98f9a 0 32px,
            #b8c3a0 32px 160px,
            #e98f9a 160px 215px,
            #b8bad3 215px 342px,
            #e98f9a 342px 396px,
            #efba82 396px 523px,
            #e98f9a 523px 578px,
            #c9b2d5 578px 705px,
            #e98f9a 705px 760px
          );
        color: #1b1b1b;
        font-family: "Rayman", "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
      }
      .shell {
        width: min(1260px, calc(100vw - 70px));
        margin: 54px auto;
      }
      .panel {
        background: #ffffff;
        border-radius: 10px;
        padding: 40px 36px;
      }
      h1 {
        margin: 0 0 18px;
        color: #f45f77;
        font-size: 2.75rem;
        font-weight: 400;
      }
      p {
        margin: 0;
        max-width: 700px;
        color: #5d5047;
        font-size: 1.1rem;
        line-height: 1.5;
      }
      .actions {
        margin-top: 28px;
      }
      .button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 140px;
        min-height: 38px;
        border: 1px solid #574d44;
        border-radius: 7px;
        background: #fbfffe;
        color: #1b1b1b;
        font: inherit;
        text-decoration: none;
        padding: 0 16px;
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <section class="panel">
        <h1>Commission Closed</h1>
        <p>This commission has been closed. If you think it was a mistake, please create a new commission request.</p>
        <div class="actions">
          <a class="button" href="/">Back to Main Page</a>
        </div>
      </section>
    </main>
  </body>
</html>`);
    return;
  }

  const returnTo = `/commission/${commission.accessToken}`;
  const loginButtonMarkup = req.session.user
    ? `<a class="login-button login-button-user" href="/logout" aria-label="Signed in as ${escapeHtml(req.session.user.username)}">
        <img class="login-avatar" src="${escapeHtml(getDiscordAvatarUrl(req.session.user))}" alt="" aria-hidden="true" />
        <span class="login-username">${escapeHtml(req.session.user.username)}</span>
      </a>`
    : `<a class="login-button" href="/login?returnTo=${encodeURIComponent(returnTo)}">Login with Discord</a>`;

  res.send(`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(commission.commissionType)} Commission</title>
    <script src="https://www.paypal.com/sdk/js?client-id=BAA1811bAD4gWiOeeiHFp77qW3g0DrVUIi3OccZqde7JfgUEy3jeG5duNjAeiOI4z1Rb5HpJaa9MyuQID4&components=buttons&disable-funding=venmo&currency=EUR"></script>
    <style>
      @font-face {
        font-family: "Rayman";
        src: url("/fonts/rayman3.ttf") format("truetype");
        font-weight: 400;
        font-style: normal;
        font-display: swap;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background:
          repeating-linear-gradient(
            90deg,
            #e98f9a 0 32px,
            #b8c3a0 32px 160px,
            #e98f9a 160px 215px,
            #b8bad3 215px 342px,
            #e98f9a 342px 396px,
            #efba82 396px 523px,
            #e98f9a 523px 578px,
            #c9b2d5 578px 705px,
            #e98f9a 705px 760px
          );
        color: #1b1b1b;
        font-family: "Rayman", "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
      }
      .shell { width: min(1260px, calc(100vw - 70px)); margin: 54px auto; }
      .topbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 18px;
      }
      .page-heading {
        margin: 0;
        color: #000000;
        font-size: 1.125rem;
        font-weight: 400;
      }
      .login-button {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 103px;
        height: 29px;
        border: 1px solid #574d44;
        border-radius: 7px;
        background: #fbfffe;
        color: #1b1b1b;
        font: inherit;
        text-decoration: none;
        padding: 0 12px;
      }
      .login-button-user {
        min-width: 150px;
        padding: 0 12px 0 34px;
      }
      .login-avatar {
        position: absolute;
        left: 6px;
        width: 20px;
        height: 20px;
        border-radius: 999px;
        object-fit: cover;
      }
      .login-username {
        display: block;
        min-width: 0;
        overflow: hidden;
        text-align: center;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: #f45f77;
      }
      .panel {
        border: 0;
        border-radius: 10px;
        background: #ffffff;
        padding: 28px;
      }
      h1 { margin: 0 0 10px; color: #000000; font-size: 40px; font-weight: 400; }
      h2 { font-weight: 400; }
      .meta { display: flex; flex-wrap: wrap; gap: 12px; margin: 0 0 18px; color: #5d5047; }
      .meta-value { color: #f45f77; }
      .description { margin: 0 0 24px; line-height: 1.6; color: #5d5047; }
      .notice { margin: 0 0 24px; color: #5d5047; }
      .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 14px; }
      .grid img { width: 100%; aspect-ratio: 1 / 1; object-fit: cover; border: 1px solid #cdbfa7; border-radius: 12px; background: #ececeb; }
      .chat { min-height: 518px; margin-top: 42px; padding: 24px 10px; background: #f8fffd; border: 0; border-radius: 14px; }
      .chat h2 { margin: 0 10px 18px; font-size: 28px; color: #5d5047; }
      .payment { margin: 0 10px 22px; padding: 16px; border: 1px solid #dccfb9; border-radius: 12px; background: #ffffff; }
      .payment h3 { margin: 0 0 6px; color: #5d5047; font-size: 20px; font-weight: 400; }
      .payment p { margin: 0 0 12px; color: #5d5047; font-size: 13px; line-height: 1.4; }
      .feedback-form { display: grid; gap: 10px; margin: 0 0 18px; padding: 0 10px 18px; border-bottom: 1px solid #dccfb9; }
      .feedback-form[hidden] { display: none; }
      .feedback-form label { display: grid; gap: 5px; font-size: 13px; }
      .feedback-form textarea { width: 100%; min-height: 70px; border: 1px solid #cdbfa7; border-radius: 10px; background: #fbfffe; color: #1b1b1b; font: inherit; padding: 7px; resize: vertical; }
      .feedback-form button { justify-self: start; min-height: 30px; border: 1px solid #1b1b1b; border-radius: 7px; background: #ffffff; color: #000000; cursor: pointer; font: inherit; padding: 0 12px; }
      .chat-toolbar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
      .chat-image-input { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
      .chat-tool-button { display: inline-flex; align-items: center; gap: 6px; min-height: 34px; border: 1px solid #1b1b1b; border-radius: 8px; background: #ffffff; color: #000000; cursor: pointer; font: inherit; padding: 0 10px; }
      .chat-tool-button svg { width: 20px; height: 20px; flex: 0 0 auto; }
      .chat-image-chip[hidden] { display: none; }
      .chat-image-chip { display: inline-flex; align-items: center; gap: 8px; min-height: 34px; max-width: 100%; border: 1px solid #cdbfa7; border-radius: 999px; background: #f8f3ef; color: #5d5047; font-size: 13px; padding: 0 8px 0 12px; }
      .chat-image-chip span { max-width: min(260px, 52vw); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .chat-image-clear { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; min-height: 0; border: 0; border-radius: 999px; background: rgba(244, 95, 119, 0.12); color: #b74a5b; cursor: pointer; font: inherit; line-height: 1; padding: 0; }
      .feedback-message, .activity-empty { margin: 0 10px 14px; color: #555555; font-size: 13px; }
      .feedback-message a { text-decoration: underline; color: inherit; }
      .activity-row { display: flex; gap: 10px; align-items: flex-start; min-height: 44px; padding: 10px; border-bottom: 1px solid #dccfb9; font-size: 15px; line-height: 1.28; }
      .activity-row:last-child { border-bottom: 0; }
      .activity-text { min-width: 0; overflow-wrap: anywhere; word-break: break-word; }
      .activity-content { min-width: 0; display: grid; gap: 8px; }
      .chat-image { display: block; max-width: min(260px, 100%); border: 1px solid #cdbfa7; border-radius: 12px; background: #ececeb; }
      .activity-row time { flex: 0 0 auto; margin-left: auto; padding-left: 8px; color: #808080; font-size: 12px; white-space: nowrap; }
      .mention { color: #f45f77; }
      @media (max-width: 720px) { .shell { width: calc(100vw - 24px); margin: 16px auto; } .panel, .chat { padding: 18px; } .activity-row { flex-direction: column; } .activity-row time { margin-left: 0; padding-left: 0; } }
    </style>
  </head>
  <body>
    <main class="shell">
      <header class="topbar">
        <p class="page-heading">Private Commission Page</p>
        ${loginButtonMarkup}
      </header>
      <section class="panel">
        <h1>${escapeHtml(commission.commissionType)}</h1>
        <p class="meta">
          <span>Status: <span class="meta-value">${escapeHtml(commission.status)}</span></span>
          <span>Requester: <span class="meta-value">${escapeHtml(commission.discordName)}</span></span>
        </p>
        <p class="description">${escapeHtml(commission.description)}</p>
        <p class="notice">Keep this page private. Anyone with this link can view your commission request.</p>
        <div class="grid" id="reference-grid"></div>
      </section>
      <section class="chat">
        <section class="payment" aria-label="Commission payment">
          <h3>Payment</h3>
          <p>Use this button to pay for your commission once the details have been agreed.</p>
          <div id="paypal-container-3UHWK9Z7DE8WY"></div>
          <script>
            paypal.HostedButtons({
              hostedButtonId: "3UHWK9Z7DE8WY"
            }).render("#paypal-container-3UHWK9Z7DE8WY");
          </script>
        </section>
        <h2>Chat</h2>
        <form class="feedback-form" id="chat-form">
          <label>
            Message
            <textarea id="chat-input" maxlength="${COMMENT_MAX_LENGTH}" placeholder="Write a message about your commission"></textarea>
          </label>
          <div class="chat-toolbar" aria-label="Chat attachments">
            <input class="chat-image-input" id="chat-image" type="file" accept="image/*" />
            <button class="chat-tool-button" id="chat-image-button" type="button" aria-label="Attach image">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path fill="currentColor" d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2Zm0 15.2-4.5-4.5a1 1 0 0 0-1.4 0L11 15.8 8.9 13.7a1 1 0 0 0-1.4 0L5 16.2V5h14v13.2ZM8.5 10A1.5 1.5 0 1 0 7 8.5 1.5 1.5 0 0 0 8.5 10Z"/>
              </svg>
              Image
            </button>
            <span class="chat-image-chip" id="chat-image-chip" hidden>
              <span id="chat-image-name"></span>
              <button class="chat-image-clear" id="chat-image-clear" type="button" aria-label="Remove selected image">x</button>
            </span>
          </div>
          <button type="submit">Send message</button>
        </form>
        <p class="feedback-message" id="chat-message"></p>
        <div id="chat-list"></div>
      </section>
    </main>
    <script>
      const token = ${JSON.stringify(commission.accessToken)};
      const chatForm = document.querySelector("#chat-form");
      const chatInput = document.querySelector("#chat-input");
      const chatImage = document.querySelector("#chat-image");
      const chatImageButton = document.querySelector("#chat-image-button");
      const chatImageChip = document.querySelector("#chat-image-chip");
      const chatImageName = document.querySelector("#chat-image-name");
      const chatImageClear = document.querySelector("#chat-image-clear");
      const chatMessage = document.querySelector("#chat-message");
      const chatList = document.querySelector("#chat-list");
      const referenceGrid = document.querySelector("#reference-grid");

      function escapeHtml(value) {
        return String(value)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#39;");
      }

      function formatTime(value) {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
      }

      function renderReferences(commission) {
        const images = Array.isArray(commission.referenceUrls) ? commission.referenceUrls : [];
        if (images.length === 0) {
          referenceGrid.innerHTML = "<p>No reference images were attached.</p>";
          return;
        }

        referenceGrid.innerHTML = images
          .map((url) => '<img src="' + escapeHtml(url) + '" alt="Reference image for ' + escapeHtml(commission.commissionType) + '" />')
          .join("");
      }

      function renderComments(commission) {
        const comments = Array.isArray(commission.comments) ? commission.comments : [];
        if (comments.length === 0) {
          chatList.innerHTML = '<p class="activity-empty">No messages yet.</p>';
          return;
        }

        chatList.innerHTML = comments.map((comment) => \`
          <div class="activity-row">
            <span class="activity-content">
              <span class="activity-text"><span style="color:#f45f77;">\${escapeHtml(comment.username)}</span>:\${comment.text ? ' ' + escapeHtml(comment.text) : ''}</span>
              \${comment.imageUrl ? '<img class="chat-image" src="' + escapeHtml(comment.imageUrl) + '" alt="Chat image from ' + escapeHtml(comment.username) + '" />' : ''}
            </span>
            <time>\${escapeHtml(formatTime(comment.createdAt))}</time>
          </div>
        \`).join("");
      }

      async function loadCommission() {
        const response = await fetch('/api/commissions/' + encodeURIComponent(token));
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Could not load commission.');
        }
        renderReferences(data.commission);
        renderComments(data.commission);
      }

      function updateImageChip() {
        const image = chatImage.files && chatImage.files[0];
        chatImageChip.hidden = !image;
        chatImageName.textContent = image ? image.name : '';
      }

      chatImageButton.addEventListener('click', () => {
        chatImage.click();
      });

      chatImage.addEventListener('change', updateImageChip);

      chatImageClear.addEventListener('click', () => {
        chatImage.value = '';
        updateImageChip();
      });

      chatForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const comment = chatInput.value.trim();
        const image = chatImage.files && chatImage.files[0];

        if (!comment && !image) {
          chatMessage.textContent = 'Write a message or choose an image first.';
          return;
        }

        try {
          const body = new FormData();
          body.append('comment', comment);
          if (image) {
            body.append('chatImage', image);
          }

          const response = await fetch('/api/commissions/' + encodeURIComponent(token) + '/comments', {
            method: 'POST',
            body
          });
          const data = await response.json();
          if (!response.ok) {
            throw new Error(data.error || 'Could not send message.');
          }
          chatInput.value = '';
          chatImage.value = '';
          updateImageChip();
          chatMessage.textContent = 'Message sent.';
          renderComments(data.commission);
        } catch (error) {
          chatMessage.textContent = error.message || 'Could not send message.';
        }
      });

      chatMessage.textContent = 'Use this private page to chat about your commission.';
      loadCommission().catch((error) => {
        chatList.innerHTML = '<p class="activity-empty">' + escapeHtml(error.message || 'Could not load commission.') + '</p>';
      });
    </script>
  </body>
</html>`);
});

app.get("/api/admin/commissions", ensureConfigured, requireAdmin, async (req, res) => {
  res.json({
    commissions: await readCommissions(),
    offerings: await readCommissionOfferings()
  });
});

app.post("/api/admin/commission-offerings", ensureConfigured, requireAdmin, upload.array("exampleImages", 12), async (req, res) => {
  const result = normalizeCommissionOfferingInput(req.body);

  if (result.error) {
    res.status(400).json({ error: result.error });
    return;
  }

  const now = new Date().toISOString();
  const offerings = await readCommissionOfferings();
  const exampleImageUrls = (req.files || []).map((file) => getUploadedFileUrl(file)).filter(Boolean);
  const offering = {
    id: crypto.randomUUID(),
    ...result.offering,
    exampleImageUrl: exampleImageUrls[0] || "",
    exampleImageUrls,
    createdAt: now,
    updatedAt: now
  };

  offerings.unshift(offering);
  await writeCommissionOfferings(offerings);
  res.status(201).json({ offering });
});

app.put("/api/admin/commission-offerings/:id", ensureConfigured, requireAdmin, upload.array("exampleImages", 12), async (req, res) => {
  const result = normalizeCommissionOfferingInput(req.body);

  if (result.error) {
    res.status(400).json({ error: result.error });
    return;
  }

  const offerings = await readCommissionOfferings();
  const offering = offerings.find((item) => item.id === req.params.id);

  if (!offering) {
    res.status(404).json({ error: "Commission offering not found." });
    return;
  }

  const uploadedExampleImageUrls = (req.files || []).map((file) => getUploadedFileUrl(file)).filter(Boolean);
  const existingExampleImageUrls =
    Array.isArray(offering.exampleImageUrls) && offering.exampleImageUrls.length > 0
      ? offering.exampleImageUrls.filter(Boolean)
      : offering.exampleImageUrl
        ? [offering.exampleImageUrl]
        : [];
  let requestedExampleImageOrder = [];

  try {
    const parsedOrder = JSON.parse(String(req.body.exampleImageOrder || "[]"));
    requestedExampleImageOrder = Array.isArray(parsedOrder) ? parsedOrder.filter(Boolean) : [];
  } catch {
    requestedExampleImageOrder = [];
  }

  const orderedExistingExampleImageUrls =
    requestedExampleImageOrder.length > 0
      ? [
          ...requestedExampleImageOrder.filter((url) => existingExampleImageUrls.includes(url)),
          ...existingExampleImageUrls.filter((url) => !requestedExampleImageOrder.includes(url))
        ]
      : existingExampleImageUrls;
  const nextExampleImageUrls =
    uploadedExampleImageUrls.length > 0
      ? [...orderedExistingExampleImageUrls, ...uploadedExampleImageUrls]
      : orderedExistingExampleImageUrls;

  Object.assign(offering, result.offering, {
    exampleImageUrl: nextExampleImageUrls[0] || "",
    exampleImageUrls: nextExampleImageUrls,
    updatedAt: new Date().toISOString()
  });

  await writeCommissionOfferings(offerings);
  res.json({ offering });
});

app.delete("/api/admin/commission-offerings/:id", ensureConfigured, requireAdmin, async (req, res) => {
  const offerings = await readCommissionOfferings();
  const nextOfferings = offerings.filter((offering) => offering.id !== req.params.id);

  if (nextOfferings.length === offerings.length) {
    res.status(404).json({ error: "Commission offering not found." });
    return;
  }

  await writeCommissionOfferings(nextOfferings);
  res.status(204).end();
});

app.patch("/api/admin/commissions/:id", ensureConfigured, requireAdmin, async (req, res) => {
  const allowedStatuses = new Set(["new", "accepted", "in progress", "done", "declined"]);
  const status = String(req.body.status || "").trim().toLowerCase();

  if (!allowedStatuses.has(status)) {
    res.status(400).json({ error: "Invalid commission status." });
    return;
  }

  const commissions = await readCommissions();
  const commission = commissions.find((item) => item.id === req.params.id);

  if (!commission) {
    res.status(404).json({ error: "Commission request not found." });
    return;
  }

  commission.status = status;
  commission.updatedAt = new Date().toISOString();
  await writeCommissions(commissions);
  res.json({ commission });
});

app.delete("/api/admin/commissions/:id", ensureConfigured, requireAdmin, async (req, res) => {
  const commissions = await readCommissions();
  const nextCommissions = commissions.filter((commission) => commission.id !== req.params.id);

  if (nextCommissions.length === commissions.length) {
    res.status(404).json({ error: "Commission request not found." });
    return;
  }

  await writeCommissions(nextCommissions);
  res.status(204).end();
});

app.get(["/admin/comissions", "/admin/commission"], (req, res) => {
  res.redirect("/admin/commissions");
});

app.get("/admin/commissions", ensureConfigured, requireAdmin, (req, res) => {
  const username = escapeHtml(req.session.user.username);

  res.send(`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Crazyland Commissions Admin</title>
    <style>
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: #141414;
        color: #f5f5f5;
        font-family: Arial, sans-serif;
      }
      .shell {
        width: min(1180px, calc(100vw - 48px));
        margin: 32px auto;
      }
      .topbar,
      .top-actions,
      .offering-actions {
        display: flex;
        gap: 10px;
        align-items: center;
      }
      .topbar {
        gap: 20px;
        justify-content: space-between;
        margin-bottom: 24px;
      }
      h1 { margin: 0 0 6px; font-size: 34px; }
      p { margin-top: 0; }
      .eyebrow { margin: 0; color: #bdbdbd; font-size: 14px; }
      .dashboard-tabs {
        display: flex;
        gap: 10px;
        margin-bottom: 18px;
      }
      .section-tabs {
        display: flex;
        gap: 10px;
        margin-bottom: 18px;
      }
      .section-tab-active {
        border-color: #eeeeee;
        background: #f0f0f0;
        color: #111111;
      }
      .panel {
        border: 1px solid #343434;
        border-radius: 8px;
        background: #202020;
        padding: 22px;
      }
      .panel h2 {
        margin: 0 0 18px;
        font-size: 22px;
      }
      .dashboard-grid {
        display: grid;
        grid-template-columns: 380px minmax(0, 1fr);
        gap: 18px;
        align-items: start;
      }
      .dashboard-section[hidden] {
        display: none;
      }
      .requests-panel {
        width: 100%;
      }
      label {
        display: grid;
        gap: 8px;
        margin-bottom: 14px;
        color: #d8d8d8;
        font-size: 14px;
      }
      input,
      textarea {
        width: 100%;
        border: 1px solid #484848;
        border-radius: 6px;
        background: #151515;
        color: #ffffff;
        font: inherit;
        padding: 10px 12px;
      }
      textarea {
        min-height: 150px;
        resize: vertical;
      }
      .form-actions {
        display: flex;
        gap: 10px;
        align-items: center;
      }
      .message {
        min-height: 22px;
        margin: 12px 0 0;
        color: #bdbdbd;
        font-size: 14px;
      }
      a.button,
      button,
      select {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 38px;
        border: 1px solid #eeeeee;
        border-radius: 6px;
        background: #f0f0f0;
        color: #111111;
        cursor: pointer;
        font: inherit;
        padding: 0 14px;
        text-decoration: none;
      }
      a.secondary,
      button.secondary {
        border-color: #4f4f4f;
        background: transparent;
        color: #f5f5f5;
      }
      select {
        border-color: #484848;
        background: #151515;
        color: #ffffff;
      }
      button.danger {
        border-color: #7d3636;
        background: #351818;
        color: #f5f5f5;
      }
      .commission-list,
      .offering-list {
        display: grid;
        gap: 14px;
      }
      .commission-card,
      .offering-card {
        display: grid;
        grid-template-columns: 120px minmax(0, 1fr) auto;
        gap: 18px;
        align-items: start;
        border: 1px solid #343434;
        border-radius: 8px;
        background: #202020;
        padding: 16px;
      }
      .offering-card {
        grid-template-columns: minmax(260px, 360px) minmax(0, 1fr) auto;
      }
      .commission-reference,
      .offering-image {
        width: 120px;
        height: 120px;
        border: 1px solid #343434;
        border-radius: 8px;
        background: #ececeb;
        object-fit: cover;
      }
      .commission-placeholder {
        display: grid;
        place-items: center;
        color: #777777;
        font-size: 12px;
      }
      .offering-image-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(58px, 1fr));
        gap: 8px;
        align-content: start;
        padding: 12px;
        border: 1px solid #cdbfa7;
        border-radius: 12px;
        background: #fbfffe;
      }
      .offering-image-thumb {
        position: relative;
        display: block;
        width: 100%;
        aspect-ratio: 1;
        border: 1px solid #cdbfa7;
        border-radius: 10px;
        background: #ececeb;
        cursor: pointer;
        overflow: hidden;
      }
      .offering-image-thumb.is-selected {
        border-color: #f45f77;
        box-shadow: 0 0 0 3px rgba(244, 95, 119, 0.18);
      }
      .offering-image-thumb img {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
        pointer-events: none;
      }
      .offering-image-remove {
        position: absolute;
        top: 5px;
        right: 5px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        box-sizing: border-box;
        width: 16px;
        height: 16px;
        min-width: 0;
        min-height: 0;
        padding: 0;
        border: 0;
        border-radius: 999px;
        background: rgba(255, 244, 245, 0.92);
        color: #b74a5b;
        font-size: 11px;
        line-height: 1;
        cursor: pointer;
      }
      .commission-title,
      .offering-title {
        margin: 0 0 8px;
        font-size: 22px;
      }
      .commission-content,
      .offering-content {
        min-width: 0;
      }
      .commission-meta,
      .offering-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        color: #bdbdbd;
        font-size: 13px;
      }
      .commission-actions {
        display: grid;
        gap: 10px;
        align-content: start;
        min-width: 154px;
      }
      .commission-description,
      .offering-description {
        color: #e0e0e0;
        line-height: 1.45;
        overflow-wrap: anywhere;
      }
      .commission-link {
        margin-top: 12px;
        color: #bdbdbd;
        font-size: 13px;
      }
      .commission-link a {
        color: #f5f5f5;
      }
      .empty {
        border: 1px dashed #444444;
        border-radius: 8px;
        padding: 28px;
        color: #c8c8c8;
        text-align: center;
      }
      @media (max-width: 760px) {
        .topbar,
        .commission-card,
        .commission-actions {
          align-items: flex-start;
          grid-template-columns: 1fr;
          flex-direction: column;
        }
        .dashboard-grid {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <header class="topbar">
        <div>
          <h1>Crazyland Commissions</h1>
          <p class="eyebrow">Signed in as ${username}. Managing commission requests.</p>
        </div>
        <div class="top-actions">
          <a class="button secondary" href="/">Back to site</a>
          <a class="button secondary" href="/logout">Log out</a>
        </div>
      </header>

      <nav class="dashboard-tabs" aria-label="Dashboard sections">
        <a class="button secondary" href="/admin/posts">Posts dashboard</a>
        <a class="button secondary" href="/admin/comics">Comics dashboard</a>
        <a class="button" href="/admin/commissions">Commissions dashboard</a>
      </nav>

      <nav class="section-tabs" aria-label="Commission admin views">
        <button class="button section-tab-active" type="button" data-section-target="offerings">Offerings</button>
        <button class="button secondary" type="button" data-section-target="requests">Requests</button>
      </nav>

      <section class="dashboard-section" data-section="offerings">
        <div class="dashboard-grid">
          <section class="panel">
            <h2 id="offering-form-title">Create commission offering</h2>
            <form id="offering-form">
              <input type="hidden" name="id" />
              <label>
                Title
                <input name="title" maxlength="80" required />
              </label>
              <label>
                Description
                <textarea name="description" maxlength="800" required></textarea>
              </label>
              <label>
                Estimated price
                <input name="estimatePrice" maxlength="80" required placeholder="$25+, 20 EUR, ask first..." />
              </label>
              <label>
                Notes
                <textarea name="notes" maxlength="400" placeholder="Rules, delivery notes, what is included..."></textarea>
              </label>
              <label>
                Private chat / commission site link
                <input name="privateChatUrl" maxlength="500" placeholder="https://..." />
              </label>
              <label>
                Example images
                <input name="exampleImages" type="file" accept="image/*" multiple />
              </label>
              <p class="eyebrow">You can select multiple files at once, and editing an offering will add new images to its existing gallery.</p>
              <label>
                Status
                <select name="status">
                  <option value="open">Open</option>
                  <option value="closed">Closed</option>
                </select>
              </label>
              <div class="form-actions">
                <button type="submit">Save offering</button>
                <button class="secondary" type="button" id="clear-offering-form">Clear</button>
              </div>
              <p class="message" id="offering-message"></p>
            </form>
          </section>

          <section class="panel">
            <h2>Commission offerings</h2>
            <div class="offering-list" id="offering-list">
              <div class="empty">Loading commission offerings...</div>
            </div>
          </section>
        </div>
      </section>

      <section class="dashboard-section requests-panel" data-section="requests" hidden>
        <section class="panel">
          <h2>Customer requests</h2>
          <div class="commission-list" id="commission-list">
            <div class="empty">Loading commission requests...</div>
          </div>
        </section>
      </section>
    </main>
    <script>
      const sectionTabs = document.querySelectorAll("[data-section-target]");
      const dashboardSections = document.querySelectorAll("[data-section]");
      const offeringForm = document.querySelector("#offering-form");
      const offeringFormTitle = document.querySelector("#offering-form-title");
      const offeringList = document.querySelector("#offering-list");
      const offeringMessage = document.querySelector("#offering-message");
      const clearOfferingForm = document.querySelector("#clear-offering-form");
      const commissionList = document.querySelector("#commission-list");
      const statuses = ["new", "accepted", "in progress", "done", "declined"];
      let offerings = [];

      function setActiveSection(sectionName) {
        dashboardSections.forEach((section) => {
          section.hidden = section.dataset.section !== sectionName;
        });

        sectionTabs.forEach((tab) => {
          const isActive = tab.dataset.sectionTarget === sectionName;
          tab.classList.toggle("section-tab-active", isActive);
          tab.classList.toggle("secondary", !isActive);
        });
      }

      sectionTabs.forEach((tab) => {
        tab.addEventListener("click", () => {
          setActiveSection(tab.dataset.sectionTarget);
        });
      });

      function resetOfferingForm() {
        offeringForm.reset();
        offeringForm.elements.id.value = "";
        offeringFormTitle.textContent = "Create commission offering";
        offeringMessage.textContent = "";
      }

      function escapeText(value) {
        return String(value)
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;")
          .replaceAll("'", "&#39;");
      }

      function getCommissionAccessUrl(commission) {
        if (!commission.accessToken) {
          return "";
        }

        return window.location.origin + "/commission/" + encodeURIComponent(commission.accessToken);
      }

      function renderCommissions(commissions) {
        if (commissions.length === 0) {
          commissionList.innerHTML = '<div class="empty">No commission requests yet.</div>';
          return;
        }

        commissionList.innerHTML = commissions
          .map((commission) => {
            const accessUrl = getCommissionAccessUrl(commission);

            return \`
            <article class="commission-card">
              \${
                commission.referenceUrl
                  ? \`<img class="commission-reference" src="\${escapeText(commission.referenceUrl)}" alt="Reference for \${escapeText(commission.commissionType)}" />\`
                  : '<div class="commission-reference commission-placeholder">No image</div>'
              }
              <div class="commission-content">
                <h2 class="commission-title">\${escapeText(commission.commissionType)}</h2>
                <p class="commission-meta">
                  <span>\${escapeText(commission.discordName)}</span>
                  <span>\${escapeText(commission.status)}</span>
                  <span>\${new Date(commission.createdAt).toLocaleString()}</span>
                </p>
                <p class="commission-description">\${escapeText(commission.description)}</p>
                \${commission.contact ? \`<p class="commission-meta">Contact: \${escapeText(commission.contact)}</p>\` : ""}
                \${accessUrl ? \`<p class="commission-link"><a href="\${escapeText(accessUrl)}" target="_blank" rel="noreferrer">Open chat</a><br />\${escapeText(accessUrl)}</p>\` : ""}
              </div>
              <div class="commission-actions">
                <select data-action="status" data-id="\${commission.id}">
                  \${statuses.map((status) => \`<option value="\${status}" \${status === commission.status ? "selected" : ""}>\${status}</option>\`).join("")}
                </select>
                <button class="danger" type="button" data-action="delete" data-id="\${commission.id}">Delete</button>
              </div>
            </article>
          \`;
          })
          .join("");
      }

      function getOfferingImages(offering) {
        if (Array.isArray(offering.exampleImageUrls) && offering.exampleImageUrls.length > 0) {
          return offering.exampleImageUrls.filter(Boolean);
        }

        return offering.exampleImageUrl ? [offering.exampleImageUrl] : [];
      }

      function renderOfferingImageGrid(offering) {
        const images = getOfferingImages(offering);

        if (images.length === 0) {
          return '<div class="offering-image commission-placeholder">No image</div>';
        }

        return \`
          <div class="offering-image-grid" data-offering-image-grid data-id="\${escapeText(offering.id)}">
            \${images
              .map(
                (imageUrl) => \`
                  <div class="offering-image-thumb" data-image-url="\${escapeText(imageUrl)}" title="Click to select, then click another image to move it">
                    <img src="\${escapeText(imageUrl)}" alt="Example for \${escapeText(offering.title)}" draggable="false" />
                    <button class="offering-image-remove" type="button" data-offering-action="remove-image" aria-label="Remove image">x</button>
                  </div>
                \`
              )
              .join("")}
          </div>
        \`;
      }

      function renderOfferings() {
        if (offerings.length === 0) {
          offeringList.innerHTML = '<div class="empty">No commission offerings yet.</div>';
          return;
        }

        offeringList.innerHTML = offerings
          .map((offering) => \`
            <article class="offering-card">
              \${renderOfferingImageGrid(offering)}
              <div class="offering-content">
                <h2 class="offering-title">\${escapeText(offering.title)}</h2>
                <p class="offering-meta">
                  <span>\${escapeText(offering.status)}</span>
                  <span>\${escapeText(offering.estimatePrice)}</span>
                  <span>\${getOfferingImages(offering).length} image(s)</span>
                </p>
                <p class="offering-description">\${escapeText(offering.description)}</p>
                \${offering.notes ? \`<p class="offering-meta">Notes: \${escapeText(offering.notes)}</p>\` : ""}
                \${offering.privateChatUrl ? \`<p class="commission-link"><a href="\${escapeText(offering.privateChatUrl)}" target="_blank" rel="noreferrer">Open private chat / commission site</a></p>\` : ""}
              </div>
              <div class="offering-actions">
                <button class="secondary" type="button" data-offering-action="edit" data-id="\${offering.id}">Edit</button>
                <button class="danger" type="button" data-offering-action="delete" data-id="\${offering.id}">Delete</button>
              </div>
            </article>
          \`)
          .join("");
      }

      function getOfferingImageOrder(grid) {
        return [...grid.querySelectorAll("[data-image-url]")].map((item) => item.dataset.imageUrl);
      }

      async function saveOfferingImageOrder(grid) {
        const offering = offerings.find((item) => item.id === grid.dataset.id);

        if (!offering) return;

        const payload = new FormData();
        payload.append("title", offering.title);
        payload.append("description", offering.description);
        payload.append("estimatePrice", offering.estimatePrice);
        payload.append("notes", offering.notes || "");
        payload.append("privateChatUrl", offering.privateChatUrl || "");
        payload.append("status", offering.status);
        payload.append("exampleImageOrder", JSON.stringify(getOfferingImageOrder(grid)));

        const response = await fetch(\`/api/admin/commission-offerings/\${offering.id}\`, {
          method: "PUT",
          body: payload
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(data.error || "Could not save image order.");
        }

        offerings = offerings.map((item) => (item.id === offering.id ? data.offering : item));
      }

      async function loadCommissions() {
        const response = await fetch("/api/admin/commissions");
        const data = await response.json();
        offerings = data.offerings || [];
        renderOfferings();
        renderCommissions(data.commissions || []);
      }

      offeringForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        offeringMessage.textContent = "Saving offering...";

        try {
          const offeringId = offeringForm.elements.id.value;
          const response = await fetch(
            offeringId ? \`/api/admin/commission-offerings/\${offeringId}\` : "/api/admin/commission-offerings",
            {
              method: offeringId ? "PUT" : "POST",
              body: new FormData(offeringForm)
            }
          );
          const data = await response.json().catch(() => ({}));

          if (!response.ok) {
            throw new Error(data.error || "Could not save offering.");
          }

          resetOfferingForm();
          offeringMessage.textContent = "Offering saved.";
          await loadCommissions();
        } catch (error) {
          offeringMessage.textContent = error.message || "Could not save offering.";
        }
      });

      clearOfferingForm.addEventListener("click", resetOfferingForm);

      offeringList.addEventListener("click", async (event) => {
        const button = event.target.closest("[data-offering-action]");

        if (button?.dataset.offeringAction === "remove-image") {
          const thumb = button.closest(".offering-image-thumb");
          const grid = thumb?.closest("[data-offering-image-grid]");

          if (!thumb || !grid) return;

          thumb.remove();

          try {
            await saveOfferingImageOrder(grid);
            offeringMessage.textContent = "Image removed.";
          } catch (error) {
            offeringMessage.textContent = error.message || "Could not remove image.";
            await loadCommissions();
          }

          return;
        }

        const targetThumb = event.target.closest(".offering-image-thumb");

        if (targetThumb) {
          const grid = targetThumb.closest("[data-offering-image-grid]");
          const selectedThumb = grid?.querySelector(".offering-image-thumb.is-selected");

          if (!grid) return;

          if (!selectedThumb) {
            targetThumb.classList.add("is-selected");
            offeringMessage.textContent = "Select where to move this image.";
            return;
          }

          if (selectedThumb === targetThumb) {
            selectedThumb.classList.remove("is-selected");
            offeringMessage.textContent = "";
            return;
          }

          const targetWasAfterSelection = Boolean(
            selectedThumb.compareDocumentPosition(targetThumb) & Node.DOCUMENT_POSITION_FOLLOWING
          );
          grid.insertBefore(selectedThumb, targetWasAfterSelection ? targetThumb.nextSibling : targetThumb);
          selectedThumb.classList.remove("is-selected");

          try {
            await saveOfferingImageOrder(grid);
            offeringMessage.textContent = "Image order saved.";
          } catch (error) {
            offeringMessage.textContent = error.message || "Could not save image order.";
            await loadCommissions();
          }

          return;
        }

        if (!button) return;

        const offering = offerings.find((item) => item.id === button.dataset.id);

        if (button.dataset.offeringAction === "edit" && offering) {
          offeringForm.elements.id.value = offering.id;
          offeringForm.elements.title.value = offering.title;
          offeringForm.elements.description.value = offering.description;
          offeringForm.elements.estimatePrice.value = offering.estimatePrice;
          offeringForm.elements.notes.value = offering.notes || "";
          offeringForm.elements.privateChatUrl.value = offering.privateChatUrl || "";
          offeringForm.elements.status.value = offering.status;
          offeringForm.elements.exampleImages.value = "";
          offeringFormTitle.textContent = "Edit commission offering";
          offeringMessage.textContent = "Upload more example images to add them to the current gallery.";
          offeringForm.elements.title.focus();
          return;
        }

        if (button.dataset.offeringAction === "delete" && window.confirm("Delete this commission offering?")) {
          await fetch(\`/api/admin/commission-offerings/\${button.dataset.id}\`, {
            method: "DELETE"
          });
          await loadCommissions();
        }
      });

      commissionList.addEventListener("change", async (event) => {
        const select = event.target.closest('[data-action="status"]');

        if (!select) return;

        await fetch(\`/api/admin/commissions/\${select.dataset.id}\`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: select.value })
        });
        await loadCommissions();
      });

      commissionList.addEventListener("click", async (event) => {
        const button = event.target.closest('[data-action="delete"]');

        if (!button || !window.confirm("Delete this commission request?")) return;

        await fetch(\`/api/admin/commissions/\${button.dataset.id}\`, { method: "DELETE" });
        await loadCommissions();
      });

      loadCommissions().catch(() => {
        commissionList.innerHTML = '<div class="empty">Could not load commission requests.</div>';
      });
    </script>
  </body>
</html>`);
});

app.get(["/admin", "/admin/posts", "/admin/comics"], ensureConfigured, requireAdmin, (req, res) => {
  const username = escapeHtml(req.session.user.username);
  const dashboardSection = req.path === "/admin/comics" ? "comics" : "posts";
  const isComicsDashboard = dashboardSection === "comics";
  const dashboardItemName = isComicsDashboard ? "comic" : "post";
  const dashboardTitle = isComicsDashboard ? "Comics" : "Posts";

  res.send(`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Crazyland Admin</title>
    <style>
      * {
        box-sizing: border-box;
      }
      [hidden] {
        display: none !important;
      }
      body {
        margin: 0;
        background: #141414;
        color: #f5f5f5;
        font-family: Arial, sans-serif;
      }
      .shell {
        width: min(1180px, calc(100vw - 48px));
        margin: 32px auto;
      }
      .topbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 20px;
        margin-bottom: 24px;
      }
      h1,
      h2,
      h3,
      p {
        margin-top: 0;
      }
      h1 {
        margin-bottom: 6px;
        font-size: 34px;
      }
      .eyebrow {
        margin: 0;
        color: #bdbdbd;
        font-size: 14px;
      }
      .top-actions,
      .form-actions,
      .post-actions {
        display: flex;
        gap: 10px;
        align-items: center;
      }
      .dashboard-tabs {
        display: flex;
        gap: 10px;
        margin-bottom: 18px;
      }
      .dashboard-grid {
        display: grid;
        grid-template-columns: 380px minmax(0, 1fr);
        gap: 18px;
        align-items: start;
      }
      .panel {
        border: 1px solid #343434;
        border-radius: 8px;
        background: #202020;
        padding: 22px;
      }
      .panel h2 {
        margin-bottom: 18px;
        font-size: 22px;
      }
      label {
        display: grid;
        gap: 8px;
        margin-bottom: 14px;
        color: #d8d8d8;
        font-size: 14px;
      }
      input,
      textarea,
      select {
        width: 100%;
        border: 1px solid #484848;
        border-radius: 6px;
        background: #151515;
        color: #ffffff;
        font: inherit;
        padding: 10px 12px;
      }
      .upload-row {
        display: flex;
        gap: 8px;
        align-items: center;
        width: 100%;
        min-width: 0;
        border: 1px solid #484848;
        border-radius: 6px;
        background: #151515;
        padding: 10px 12px;
      }
      .visually-hidden-file {
        position: absolute;
        width: 1px;
        height: 1px;
        opacity: 0;
        pointer-events: none;
      }
      .upload-filename {
        flex: 1;
        min-width: 0;
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      textarea {
        min-height: 150px;
        resize: vertical;
      }
      button,
      a.button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 38px;
        border: 1px solid #eeeeee;
        border-radius: 6px;
        background: #f0f0f0;
        color: #111111;
        cursor: pointer;
        font: inherit;
        padding: 0 14px;
        text-decoration: none;
      }
      button.secondary,
      a.secondary {
        border-color: #4f4f4f;
        background: transparent;
        color: #f5f5f5;
      }
      button.danger {
        border-color: #7d3636;
        background: #351818;
        color: #ffffff;
      }
      label.file-button,
      button.file-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: auto;
        min-width: 0;
        min-height: 24px;
        flex: 0 0 auto;
        margin: 0;
        border: 1px solid #9a9a9a;
        border-radius: 3px;
        background: #f4f4f4;
        color: #1b1b1b;
        cursor: pointer;
        font: inherit;
        font-size: 12px;
        line-height: 1;
        padding: 0 8px;
        text-decoration: none;
      }
      label.file-button:hover,
      label.file-button:focus-visible,
      button.file-button:hover,
      button.file-button:focus-visible {
        background: #ffffff;
      }
      .message {
        min-height: 22px;
        margin: 12px 0 0;
        color: #bdbdbd;
        font-size: 14px;
        overflow-wrap: anywhere;
      }
      .post-list {
        display: grid;
        gap: 12px;
      }
      .post-item {
        display: grid;
        grid-template-columns: 92px minmax(0, 1fr) auto;
        gap: 16px;
        align-items: center;
        border: 1px solid #343434;
        border-radius: 8px;
        padding: 12px;
        background: #181818;
      }
      .post-item-details {
        grid-column: 1 / -1;
        max-height: 420px;
        overflow-y: auto;
        scrollbar-color: #f45f77 transparent;
        scrollbar-width: thin;
        border-top: 1px solid #343434;
        padding: 18px 0 0;
      }
      .post-item-details::-webkit-scrollbar {
        width: 10px;
      }
      .post-item-details::-webkit-scrollbar-track {
        background: transparent;
      }
      .post-item-details::-webkit-scrollbar-thumb {
        min-height: 48px;
        border-radius: 999px;
        background: #f45f77;
      }
      .post-item-details::-webkit-scrollbar-thumb:hover {
        background: #d94d63;
      }
      .post-item-details::-webkit-scrollbar-button {
        display: none;
        width: 0;
        height: 0;
      }
      .post-item-details::-webkit-scrollbar-corner {
        background: transparent;
      }
      .series-toggle {
        border-color: #4f4f4f;
        background: transparent;
        color: #f5f5f5;
      }
      .series-episodes {
        display: grid;
        gap: 12px;
      }
      .series-sub {
        display: grid;
        grid-template-columns: 170px minmax(0, 1fr) auto;
        gap: 22px;
        align-items: center;
        border: 1px solid #343434;
        border-radius: 6px;
        background: #141414;
        min-height: 132px;
        padding: 18px;
      }
      .series-sub-copy {
        min-width: 0;
      }
      .series-sub-copy h4 {
        margin: 0 0 14px;
        font-size: 22px;
      }
      .series-sub-copy .post-description {
        -webkit-line-clamp: 3;
      }
      .series-sub-preview {
        width: 170px;
        height: 112px;
        border: 1px solid #343434;
        border-radius: 6px;
        background: #ececeb;
        overflow: hidden;
      }
      .series-sub-preview img {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .series-sub-actions {
        display: flex;
        gap: 10px;
        justify-content: flex-end;
      }
      .thumb {
        position: relative;
        width: 92px;
        height: 92px;
        background: #ececeb;
        overflow: hidden;
      }
      .thumb::before,
      .thumb::after {
        content: "";
        position: absolute;
        background: #b7b7b7;
      }
      .thumb::before {
        width: 34px;
        height: 34px;
        top: 20px;
        right: 16px;
        border-radius: 999px;
      }
      .thumb::after {
        left: 18px;
        bottom: 24px;
        width: 54px;
        height: 38px;
        clip-path: polygon(0% 100%, 38% 18%, 58% 58%, 74% 42%, 100% 100%);
      }
      .thumb img {
        position: relative;
        z-index: 1;
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .post-title {
        margin: 0 0 7px;
        font-size: 19px;
      }
      .post-meta {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
        margin: 0 0 8px;
        color: #bdbdbd;
        font-size: 13px;
      }
      .post-description {
        display: -webkit-box;
        margin: 0;
        color: #e0e0e0;
        font-size: 14px;
        line-height: 1.35;
        overflow: hidden;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
      }
      .empty {
        border: 1px dashed #444444;
        border-radius: 8px;
        padding: 28px;
        color: #c8c8c8;
        text-align: center;
      }
      .dashboard-note {
        color: #d8d8d8;
        line-height: 1.5;
      }
      .episode-panel {
        margin-top: 18px;
        border-top: 1px solid #343434;
        padding-top: 18px;
      }
      .episode-list {
        margin-top: 12px;
      }
      .episode-item {
        border: 1px solid #343434;
        border-radius: 6px;
        padding: 10px;
        background: #181818;
      }
      .episode-item h4 {
        margin: 0 0 6px;
      }
      .episode-panels {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin-top: 10px;
      }
      .episode-panel-thumb {
        width: 92px;
        height: 92px;
        border: 1px solid #343434;
        border-radius: 5px;
        background: #ececeb;
        cursor: grab;
        overflow: hidden;
      }
      .episode-panel-thumb:active {
        cursor: grabbing;
      }
      .episode-panel-thumb.is-dragging {
        opacity: 0.45;
      }
      .episode-panel-thumb img {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .episode-panel-empty {
        color: #bdbdbd;
        font-size: 13px;
      }
      @media (max-width: 920px) {
        .dashboard-grid,
        .post-item {
          grid-template-columns: 1fr;
        }
        .topbar {
          align-items: flex-start;
          flex-direction: column;
        }
        .post-actions {
          justify-content: flex-start;
        }
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <header class="topbar">
        <div>
          <h1>Crazyland Dashboard</h1>
          <p class="eyebrow">Signed in as ${username}. Viewing ${isComicsDashboard ? "Comics" : "Posts"} dashboard.</p>
        </div>
        <div class="top-actions">
          <a class="button secondary" href="/">Back to site</a>
          <a class="button secondary" href="/logout">Log out</a>
        </div>
      </header>

      <nav class="dashboard-tabs" aria-label="Dashboard sections">
        <a class="button ${isComicsDashboard ? "secondary" : ""}" href="/admin/posts">Posts dashboard</a>
        <a class="button ${isComicsDashboard ? "" : "secondary"}" href="/admin/comics">Comics dashboard</a>
        <a class="button secondary" href="/admin/commissions">Commissions dashboard</a>
      </nav>

      <div class="dashboard-grid">
        <section class="panel">
          <h2 id="form-title">Add ${dashboardItemName}</h2>
          <form id="post-form">
            <input type="hidden" id="post-id" />
            <label>
              Title
              <input id="post-title" name="title" required maxlength="80" />
            </label>
            <label>
              Description
              <textarea id="post-description" name="description" required></textarea>
            </label>
            <label>
              Image description
              <input id="post-image-alt" name="imageAlt" value="Placeholder image" maxlength="120" />
            </label>
            <label>
              Image
              <span class="upload-row">
                <input class="visually-hidden-file" id="post-image" name="image" type="file" accept="image/*" />
                <label class="file-button" for="post-image">Choose File</label>
                <span class="upload-filename" id="image-file-name">No file chosen</span>
                <button class="file-button" type="button" id="remove-image-button" hidden>Remove image</button>
              </span>
            </label>
            <input type="hidden" id="remove-image" name="removeImage" value="false" />
            <label>
              Music
              <span class="upload-row">
                <input class="visually-hidden-file" id="post-music" name="music" type="file" accept="audio/*" />
                <label class="file-button" for="post-music">Choose File</label>
                <span class="upload-filename" id="music-file-name">No file chosen</span>
                <button class="file-button" type="button" id="remove-music-button" hidden>Remove music</button>
              </span>
            </label>
            <input type="hidden" id="remove-music" name="removeMusic" value="false" />
            <label>
              Status
              <select id="post-status" name="status">
                <option value="published">Published</option>
                <option value="draft">Draft</option>
              </select>
            </label>
            <div class="form-actions">
              <button type="submit">Save ${dashboardItemName}</button>
              <button class="secondary" type="button" id="reset-form">Clear</button>
            </div>
            <p class="message" id="message"></p>
          </form>
          <section class="episode-panel" id="episode-panel" ${isComicsDashboard ? "hidden" : "hidden"}>
            <h2>Add episode</h2>
            <p class="message" id="episode-help">Select a comic series with Edit first.</p>
            <form id="episode-form">
              <label>
                Episode to edit
                <select id="episode-select">
                  <option value="">New episode</option>
                </select>
              </label>
              <label>
                Episode title
                <input id="episode-title" name="episodeTitle" maxlength="80" />
              </label>
              <label>
                Episode description
                <textarea id="episode-description" name="episodeDescription"></textarea>
              </label>
              <label>
                Episode panels description
                <input id="episode-image-alt" name="episodeImageAlt" maxlength="120" />
              </label>
              <label>
                Episode cover
                <span class="upload-row">
                  <input class="visually-hidden-file" id="episode-cover" name="episodeImage" type="file" accept="image/*" />
                  <label class="file-button" for="episode-cover">Choose File</label>
                  <span class="upload-filename" id="episode-cover-file-name">No file chosen</span>
                </span>
              </label>
              <label>
                Episode panels
                <span class="upload-row">
                  <input class="visually-hidden-file" id="episode-image" name="episodePanels" type="file" accept="image/*" multiple />
                  <label class="file-button" for="episode-image">Choose Files</label>
                  <span class="upload-filename" id="episode-image-file-name">No file chosen</span>
                </span>
              </label>
              <div class="form-actions">
                <button type="submit">Add episode</button>
              </div>
              <p class="message" id="episode-message"></p>
            </form>
            <div class="episode-list" id="episode-list"></div>
          </section>
        </section>

        <section class="panel">
          <h2>${dashboardTitle}</h2>
          <div class="post-list" id="post-list"></div>
        </section>
      </div>

      <div class="dashboard-grid" hidden>
        <section class="panel">
          <h2>Comics dashboard</h2>
          <p class="dashboard-note">
            This is the separate admin area for comics. Next we can wire it to comic data,
            images, descriptions, ordering, and publish/draft controls the same way posts work.
          </p>
        </section>

        <section class="panel">
          <h2>Comics</h2>
          <div class="empty">Comic management is ready for the next data step.</div>
        </section>
      </div>
    </main>
    <script>
      const postList = document.querySelector("#post-list");
      const resourceType = "${dashboardSection}";
      const resourceSingular = "${dashboardItemName}";
      const form = document.querySelector("#post-form");
      const formTitle = document.querySelector("#form-title");
      const message = document.querySelector("#message");
      const fields = {
        id: document.querySelector("#post-id"),
        title: document.querySelector("#post-title"),
        description: document.querySelector("#post-description"),
        imageAlt: document.querySelector("#post-image-alt"),
        image: document.querySelector("#post-image"),
        removeImage: document.querySelector("#remove-image"),
        music: document.querySelector("#post-music"),
        removeMusic: document.querySelector("#remove-music"),
        status: document.querySelector("#post-status")
      };
      const imageFileName = document.querySelector("#image-file-name");
      const musicFileName = document.querySelector("#music-file-name");
      const removeImageButton = document.querySelector("#remove-image-button");
      const removeMusicButton = document.querySelector("#remove-music-button");
      const episodePanel = document.querySelector("#episode-panel");
      const episodeForm = document.querySelector("#episode-form");
      const episodeMessage = document.querySelector("#episode-message");
      const episodeList = document.querySelector("#episode-list");
      const episodeSelect = document.querySelector("#episode-select");
      const episodeFields = {
        title: document.querySelector("#episode-title"),
        description: document.querySelector("#episode-description"),
        imageAlt: document.querySelector("#episode-image-alt"),
        cover: document.querySelector("#episode-cover"),
        image: document.querySelector("#episode-image")
      };
      const episodeCoverFileName = document.querySelector("#episode-cover-file-name");
      const episodeImageFileName = document.querySelector("#episode-image-file-name");
      let posts = [];

      function renderThumb(post) {
        if (!post.imageUrl) {
          return '<div class="thumb" aria-hidden="true"></div>';
        }

        return \`<div class="thumb"><img src="\${escapeText(post.imageUrl)}" alt="\${escapeText(post.imageAlt || post.title)}" /></div>\`;
      }

      function escapeText(value) {
        return String(value)
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;")
          .replaceAll("'", "&#39;");
      }

      function setMessage(text) {
        message.textContent = text;
      }

      function fileNameFromUrl(url) {
        return url ? url.split("/").pop() : "";
      }

      function setRemoveButton(button, isVisible) {
        button.hidden = !isVisible;
      }

      function setFileLabel(label, text) {
        label.textContent = text || "No file chosen";
      }

      async function readResponseData(response) {
        const text = await response.text();

        if (!text) {
          return {};
        }

        try {
          return JSON.parse(text);
        } catch {
          return { error: text.replace(/<[^>]*>/g, " ").replace(/\\s+/g, " ").trim() };
        }
      }

      function getSelectedPost() {
        return posts.find((item) => item.id === fields.id.value);
      }

      function renderEpisodeDetails(episode) {
        if (!episodeList) {
          return;
        }

        if (!episode) {
          episodeList.innerHTML = "";
          return;
        }

        episodeList.innerHTML = \`
          <article class="episode-item">
            <h4>\${escapeText(episode.title)}</h4>
            <p class="post-meta">\${(episode.panels || []).length} panels</p>
            <p class="post-description">\${escapeText(episode.description)}</p>
            <div class="episode-panels">
              \${
                (episode.panels || []).length
                  ? episode.panels
                      .map(
                        (panel) => \`
                          <div class="episode-panel-thumb" draggable="true" data-panel-id="\${escapeText(panel.id)}" title="Drag to reorder">
                            <img src="\${escapeText(panel.imageUrl)}" alt="\${escapeText(panel.imageAlt || episode.title)}" />
                          </div>
                        \`
                      )
                      .join("")
                  : '<span class="episode-panel-empty">No panels uploaded yet.</span>'
              }
            </div>
          </article>
        \`;
      }

      function getEpisodePanelOrder() {
        if (!episodeList) {
          return [];
        }

        return [...episodeList.querySelectorAll("[data-panel-id]")].map((panel) => panel.dataset.panelId);
      }

      function getDragAfterElement(container, x) {
        const draggableElements = [...container.querySelectorAll(".episode-panel-thumb:not(.is-dragging)")];

        return draggableElements.reduce(
          (closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = x - box.left - box.width / 2;

            if (offset < 0 && offset > closest.offset) {
              return { offset, element: child };
            }

            return closest;
          },
          { offset: Number.NEGATIVE_INFINITY, element: null }
        ).element;
      }

      function renderSeriesEpisodes(post) {
        const episodes = post?.episodes || [];

        if (resourceType !== "comics") {
          return "";
        }

        if (episodes.length === 0) {
          return '<div class="post-item-details" hidden data-series-details><div class="empty">No episodes yet.</div></div>';
        }

        return \`
          <div class="post-item-details" hidden data-series-details>
            <div class="series-episodes">
              \${
                episodes
                  .map(
                    (episode) => \`
                      <article class="series-sub">
                        <div class="series-sub-preview">
                          \${episode.imageUrl || (episode.panels || [])[0]?.imageUrl ? \`<img src="\${escapeText(episode.imageUrl || (episode.panels || [])[0]?.imageUrl)}" alt="\${escapeText(episode.imageAlt || (episode.panels || [])[0]?.imageAlt || episode.title)}" />\` : ""}
                        </div>
                        <div class="series-sub-copy">
                          <h4>\${escapeText(episode.title)}</h4>
                          <p class="post-meta">\${(episode.panels || []).length} panels</p>
                          <p class="post-description">\${escapeText(episode.description)}</p>
                        </div>
                        <div class="series-sub-actions">
                          <button class="secondary" type="button" data-action="edit-episode" data-series-id="\${post.id}" data-episode-id="\${episode.id}">Edit</button>
                          <button class="danger" type="button" data-action="delete-episode" data-series-id="\${post.id}" data-episode-id="\${episode.id}">Delete</button>
                        </div>
                      </article>
                    \`
                  )
                  .join("")
              }
            </div>
          </div>
        \`;
      }

      function resetEpisodeForm() {
        if (!episodeForm) {
          return;
        }

        episodeForm.reset();
        episodeSelect.value = "";
        setFileLabel(episodeCoverFileName, "");
        setFileLabel(episodeImageFileName, "");
        renderEpisodeDetails(null);
        episodeMessage.textContent = "";
      }

      function renderEpisodeOptions(post) {
        if (!episodeSelect) {
          return;
        }

        const episodes = post?.episodes || [];
        episodeSelect.innerHTML =
          '<option value="">New episode</option>' +
          episodes.map((episode) => \`<option value="\${episode.id}">\${escapeText(episode.title)}</option>\`).join("");
      }

      function editEpisode(episodeId) {
        const post = getSelectedPost();
        const episode = post?.episodes?.find((item) => item.id === episodeId);

        if (!episode) {
          resetEpisodeForm();
          return;
        }

        episodeFields.title.value = episode.title;
        episodeFields.description.value = episode.description;
        episodeFields.imageAlt.value = episode.imageAlt || "";
        episodeFields.cover.value = "";
        episodeFields.image.value = "";
        setFileLabel(episodeCoverFileName, fileNameFromUrl(episode.imageUrl));
        setFileLabel(episodeImageFileName, (episode.panels || []).length + " saved panels");
        renderEpisodeDetails(episode);
        episodeMessage.textContent = "Upload a new cover to replace it, or add more panels.";
      }

      function setEpisodePanel(post) {
        if (!episodePanel || resourceType !== "comics") {
          return;
        }

        episodePanel.hidden = !post;

        if (post) {
          renderEpisodeOptions(post);
          resetEpisodeForm();
        }
      }

      function resetForm() {
        form.reset();
        fields.id.value = "";
        fields.imageAlt.value = "Placeholder image";
        fields.image.value = "";
        fields.removeImage.value = "false";
        fields.music.value = "";
        fields.removeMusic.value = "false";
        fields.status.value = "published";
        formTitle.textContent = \`Add \${resourceSingular}\`;
        setFileLabel(imageFileName, "");
        setFileLabel(musicFileName, "");
        setRemoveButton(removeImageButton, false);
        setRemoveButton(removeMusicButton, false);
        setEpisodePanel(null);
        setMessage("");
      }

      function renderPosts() {
        if (posts.length === 0) {
          postList.innerHTML = \`<div class="empty">No \${resourceType} yet.</div>\`;
          return;
        }

        postList.innerHTML = posts
          .map(
            (post) => \`
              <article class="post-item">
                \${renderThumb(post)}
                <div>
                  <h3 class="post-title">\${escapeText(post.title)}</h3>
                  <p class="post-meta">
                    <span>\${escapeText(post.status)}</span>
                    <span>\${post.musicUrl ? "music" : "no music"}</span>
                    \${resourceType === "comics" ? \`<span>\${(post.episodes || []).length} episodes</span>\` : ""}
                    <span>\${post.ratings.length} ratings</span>
                    <span>\${post.comments.length} comments</span>
                  </p>
                  <p class="post-description">\${escapeText(post.description)}</p>
                </div>
                <div class="post-actions">
                  \${resourceType === "comics" ? \`<button class="series-toggle" type="button" data-action="toggle-episodes" data-id="\${post.id}" aria-expanded="false">Episodes</button>\` : ""}
                  <button class="secondary" type="button" data-action="edit" data-id="\${post.id}">Edit</button>
                  <button class="danger" type="button" data-action="delete" data-id="\${post.id}">Delete</button>
                </div>
                \${renderSeriesEpisodes(post)}
              </article>
            \`
          )
          .join("");
      }

      async function loadPosts() {
        const response = await fetch(\`/api/admin/\${resourceType}\`);
        const data = await response.json();
        posts = data[resourceType];
        renderPosts();
      }

      function editPost(id) {
        const post = posts.find((item) => item.id === id);

        if (!post) {
          return;
        }

        fields.id.value = post.id;
        fields.title.value = post.title;
        fields.description.value = post.description;
        fields.imageAlt.value = post.imageAlt || "Placeholder image";
        fields.image.value = "";
        fields.removeImage.value = "false";
        fields.music.value = "";
        fields.removeMusic.value = "false";
        fields.status.value = post.status;
        formTitle.textContent = \`Edit \${resourceSingular}\`;
        setFileLabel(imageFileName, fileNameFromUrl(post.imageUrl));
        setFileLabel(musicFileName, fileNameFromUrl(post.musicUrl));
        setRemoveButton(removeImageButton, Boolean(post.imageUrl));
        setRemoveButton(removeMusicButton, Boolean(post.musicUrl));
        setEpisodePanel(post);
        setMessage("");
        fields.title.focus();
      }

      async function deletePost(id) {
        const post = posts.find((item) => item.id === id);

        if (!post || !window.confirm(\`Delete "\${post.title}"?\`)) {
          return;
        }

        await fetch(\`/api/admin/\${resourceType}/\${id}\`, { method: "DELETE" });
        resetForm();
        await loadPosts();
        setMessage(\`\${resourceSingular[0].toUpperCase()}\${resourceSingular.slice(1)} deleted.\`);
      }

      async function deleteEpisode(seriesId, episodeId) {
        const post = posts.find((item) => item.id === seriesId);
        const episode = post?.episodes?.find((item) => item.id === episodeId);

        if (!post || !episode || !window.confirm(\`Delete episode "\${episode.title}"?\`)) {
          return;
        }

        const response = await fetch(\`/api/admin/comics/\${seriesId}/episodes/\${episodeId}\`, { method: "DELETE" });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          setMessage(data.error || "Could not delete episode.");
          return;
        }

        posts = posts.map((item) => (item.id === data.comic.id ? data.comic : item));
        renderPosts();

        if (fields.id.value === data.comic.id) {
          setEpisodePanel(data.comic);
        }

        setMessage("Episode deleted.");
      }

      postList.addEventListener("click", async (event) => {
        const button = event.target.closest("button[data-action]");

        if (!button) {
          return;
        }

        if (button.dataset.action === "edit-episode") {
          editPost(button.dataset.seriesId);
          episodeSelect.value = button.dataset.episodeId;
          editEpisode(button.dataset.episodeId);
          episodePanel?.scrollIntoView({ behavior: "smooth", block: "start" });
          return;
        }

        if (button.dataset.action === "delete-episode") {
          await deleteEpisode(button.dataset.seriesId, button.dataset.episodeId);
          return;
        }

        if (button.dataset.action === "toggle-episodes") {
          const item = button.closest(".post-item");
          const details = item?.querySelector("[data-series-details]");

          if (details) {
            const isOpening = details.hidden;
            details.hidden = !isOpening;
            button.setAttribute("aria-expanded", String(isOpening));
            button.textContent = isOpening ? "Hide episodes" : "Episodes";
          }

          return;
        }

        if (button.dataset.action === "edit") {
          editPost(button.dataset.id);
          return;
        }

        if (button.dataset.action === "delete") {
          await deletePost(button.dataset.id);
        }
      });

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const payload = new FormData();
        payload.append("title", fields.title.value);
        payload.append("description", fields.description.value);
        payload.append("imageAlt", fields.imageAlt.value);
        payload.append("status", fields.status.value);
        payload.append("removeImage", fields.removeImage.value);
        payload.append("removeMusic", fields.removeMusic.value);

        if (fields.image.files[0]) {
          payload.append("image", fields.image.files[0]);
        }

        if (fields.music.files[0]) {
          payload.append("music", fields.music.files[0]);
        }

        const isEditing = Boolean(fields.id.value);
        const url = isEditing ? \`/api/admin/\${resourceType}/\${fields.id.value}\` : \`/api/admin/\${resourceType}\`;
        const method = isEditing ? "PUT" : "POST";
        try {
          const response = await fetch(url, {
            method,
            body: payload
          });
          const data = response.status === 204 ? {} : await readResponseData(response);

          if (!response.ok) {
            setMessage(data.error || "Something went wrong.");
            return;
          }

          resetForm();
          await loadPosts();
          setMessage(isEditing ? \`\${resourceSingular[0].toUpperCase()}\${resourceSingular.slice(1)} updated.\` : \`\${resourceSingular[0].toUpperCase()}\${resourceSingular.slice(1)} created.\`);
        } catch (error) {
          setMessage(error.message || "Could not save. Please try again.");
        }
      });

      fields.image.addEventListener("change", () => {
        fields.removeImage.value = "false";
        setFileLabel(imageFileName, fields.image.files[0]?.name || "");
        setRemoveButton(removeImageButton, Boolean(fields.image.files[0] || getSelectedPost()?.imageUrl));
      });

      fields.music.addEventListener("change", () => {
        fields.removeMusic.value = "false";
        setFileLabel(musicFileName, fields.music.files[0]?.name || "");
        setRemoveButton(removeMusicButton, Boolean(fields.music.files[0] || getSelectedPost()?.musicUrl));
      });

      removeImageButton.addEventListener("click", () => {
        fields.image.value = "";
        fields.removeImage.value = "true";
        setFileLabel(imageFileName, "");
        setRemoveButton(removeImageButton, false);
      });

      removeMusicButton.addEventListener("click", () => {
        fields.music.value = "";
        fields.removeMusic.value = "true";
        setFileLabel(musicFileName, "");
        setRemoveButton(removeMusicButton, false);
      });

      if (episodeFields.image) {
        episodeFields.image.addEventListener("change", () => {
          const fileCount = episodeFields.image.files.length;
          setFileLabel(
            episodeImageFileName,
            fileCount > 1 ? \`\${fileCount} files selected\` : episodeFields.image.files[0]?.name || ""
          );
        });
      }

      if (episodeFields.cover) {
        episodeFields.cover.addEventListener("change", () => {
          setFileLabel(episodeCoverFileName, episodeFields.cover.files[0]?.name || "");
        });
      }

      if (episodeSelect) {
        episodeSelect.addEventListener("change", () => {
          editEpisode(episodeSelect.value);
        });
      }

      if (episodeList) {
        episodeList.addEventListener("dragstart", (event) => {
          const thumb = event.target.closest(".episode-panel-thumb");

          if (!thumb) {
            return;
          }

          thumb.classList.add("is-dragging");
          event.dataTransfer.effectAllowed = "move";
        });

        episodeList.addEventListener("dragend", (event) => {
          event.target.closest(".episode-panel-thumb")?.classList.remove("is-dragging");
        });

        episodeList.addEventListener("dragover", (event) => {
          const container = event.target.closest(".episode-panels");
          const dragging = episodeList.querySelector(".episode-panel-thumb.is-dragging");

          if (!container || !dragging) {
            return;
          }

          event.preventDefault();
          const afterElement = getDragAfterElement(container, event.clientX);

          if (afterElement) {
            container.insertBefore(dragging, afterElement);
          } else {
            container.appendChild(dragging);
          }
        });
      }

      if (episodeForm) {
        episodeForm.addEventListener("submit", async (event) => {
          event.preventDefault();

          if (resourceType !== "comics" || !fields.id.value) {
            episodeMessage.textContent = "Select a comic series first.";
            return;
          }

          const payload = new FormData();
          payload.append("episodeTitle", episodeFields.title.value);
          payload.append("episodeDescription", episodeFields.description.value);
          payload.append("episodeImageAlt", episodeFields.imageAlt.value);
          payload.append("episodePanelOrder", JSON.stringify(getEpisodePanelOrder()));

          if (episodeFields.cover.files[0]) {
            payload.append("episodeImage", episodeFields.cover.files[0]);
          }

          [...episodeFields.image.files].forEach((file) => {
            payload.append("episodePanels", file);
          });

          const selectedEpisodeId = episodeSelect.value;
          const response = await fetch(
            selectedEpisodeId
              ? \`/api/admin/comics/\${fields.id.value}/episodes/\${selectedEpisodeId}\`
              : \`/api/admin/comics/\${fields.id.value}/episodes\`,
            {
            method: selectedEpisodeId ? "PUT" : "POST",
            body: payload
            }
          );
          const data = await response.json();

          if (!response.ok) {
            episodeMessage.textContent = data.error || "Could not save episode.";
            return;
          }

          posts = posts.map((post) => (post.id === data.comic.id ? data.comic : post));
          renderEpisodeOptions(data.comic);
          const nextEpisodeId = selectedEpisodeId || data.comic.episodes?.[0]?.id || "";
          episodeSelect.value = nextEpisodeId;
          editEpisode(nextEpisodeId);
          renderPosts();
          episodeMessage.textContent = selectedEpisodeId ? "Episode updated." : "Episode added.";
        });
      }

      document.querySelector("#reset-form").addEventListener("click", resetForm);
      loadPosts().catch(() => setMessage("Could not load posts."));
    </script>
  </body>
</html>`);
});

app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    const message =
      error.code === "LIMIT_FILE_SIZE"
        ? "Upload is too large. Images and audio must be 15 MB or smaller."
        : error.message || "Upload failed.";
    res.status(400).json({ error: message });
    return;
  }

  if (error?.message === "Only image and audio uploads are allowed.") {
    res.status(400).json({ error: error.message });
    return;
  }

  next(error);
});

app.listen(port, () => {
  console.log(`Crazyland server running on http://localhost:${port}`);
});
