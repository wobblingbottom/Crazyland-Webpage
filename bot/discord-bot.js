import http from "node:http";
import crypto from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  Client,
  ContainerBuilder,
  GatewayIntentBits,
  MediaGalleryBuilder,
  MessageFlags,
  ModalBuilder,
  Partials,
  REST,
  Routes,
  SectionBuilder,
  SeparatorBuilder,
  SlashCommandBuilder,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle
} from "discord.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, "..");
const envFile = resolve(__dirname, ".env");

if (existsSync(envFile)) {
  const envLines = readFileSync(envFile, "utf8").split(/\r?\n/);

  envLines.forEach((line) => {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      return;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex === -1) {
      return;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();

    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  });
}

const requiredEnv = ["BOT_TOKEN", "CLIENT_ID", "GUILD_ID"];
const missingEnv = requiredEnv.filter((key) => !process.env[key]);

if (missingEnv.length > 0) {
  console.error(`Missing required environment variables: ${missingEnv.join(", ")}`);
  console.error("Create a .env file from bot/.env.example or set the variables in your shell.");
  process.exit(1);
}

const config = {
  token: process.env.BOT_TOKEN,
  clientId: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET || "",
  guildId: process.env.GUILD_ID,
  dataFile: resolve(rootDir, process.env.GIVEAWAYS_FILE || "data/giveaways.json"),
  settingsFile: resolve(rootDir, process.env.BOT_SETTINGS_FILE || "data/bot-config.json"),
  contactFile: resolve(rootDir, process.env.CONTACT_MESSAGES_FILE || "data/contact-messages.json"),
  contactInboxChannelId: process.env.CONTACT_INBOX_CHANNEL_ID || "",
  port: Number(process.env.PORT || process.env.CONTACT_API_PORT || 3000),
  authCallbackUrl: process.env.AUTH_CALLBACK_URL || "",
  defaultBannerUrl:
    process.env.DEFAULT_BANNER_URL ||
    "https://raw.githubusercontent.com/wobblingbottom/Crazyland-Webpage/main/banner.png"
};

const authStates = new Map();
const authTokens = new Map();
const AUTH_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const AUTH_STATE_TTL_MS = 1000 * 60 * 10;

const NUMBER_EMOJIS = {
  "0": "<:Zero:1512353896318894110>",
  "1": "<:One:1512353884327383140>",
  "2": "<:Two:1512353894460821504>",
  "3": "<:Three:1512353892766060665>",
  "4": "<:Four:1512353877725548586>",
  "5": "<:Five:1512353876274315364>",
  "6": "<:Six:1512353887716380762>",
  "7": "<:Seven:1512353885946249327>",
  "8": "<:Eight:1512353874910908528>",
  "9": "<:Nine:1512353879931621386>"
};

const emojifyDigits = (value) =>
  String(value).replace(/\d/g, (digit) => NUMBER_EMOJIS[digit] || digit);

const createAuthToken = () => crypto.randomBytes(24).toString("hex");
const createNonce = () => crypto.randomUUID();

const cleanupAuthMaps = () => {
  const now = Date.now();

  for (const [state, entry] of authStates.entries()) {
    if (entry.expiresAt <= now) {
      authStates.delete(state);
    }
  }

  for (const [token, entry] of authTokens.entries()) {
    if (entry.expiresAt <= now) {
      authTokens.delete(token);
    }
  }
};

const createAuthSession = (user) => {
  const token = createAuthToken();
  authTokens.set(token, {
    ...user,
    expiresAt: Date.now() + AUTH_TOKEN_TTL_MS
  });
  return token;
};

const readBearerToken = (req) => {
  const header = req.headers.authorization || "";
  if (!header.toLowerCase().startsWith("bearer ")) {
    return "";
  }
  return header.slice(7).trim();
};

const getAuthSession = (req) => {
  cleanupAuthMaps();
  const token = readBearerToken(req);

  if (!token) {
    return null;
  }

  const session = authTokens.get(token);

  if (!session) {
    return null;
  }

  session.expiresAt = Date.now() + AUTH_TOKEN_TTL_MS;
  authTokens.set(token, session);
  return {
    token,
    session
  };
};

const commands = [
  new SlashCommandBuilder()
    .setName("giveaway_create")
    .setDescription("Create a Discord giveaway with a live entry button.")
    .addStringOption((option) =>
      option.setName("title").setDescription("Giveaway title").setRequired(true)
    )
    .addStringOption((option) =>
      option.setName("description").setDescription("Short giveaway description").setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName("duration_minutes")
        .setDescription("How long the giveaway stays active")
        .setRequired(true)
        .setMinValue(1)
    )
    .addStringOption((option) =>
      option.setName("prize").setDescription("Prize or reward").setRequired(false)
    )
    .addIntegerOption((option) =>
      option
        .setName("winner_count")
        .setDescription("How many winners to pick")
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(10)
    )
    .addStringOption((option) =>
      option
        .setName("image_url")
        .setDescription("Banner or giveaway image URL")
        .setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName("giveaway_list")
    .setDescription("List giveaways currently stored for the website."),
  new SlashCommandBuilder()
    .setName("giveaway_end")
    .setDescription("End a giveaway and automatically pick winner(s).")
    .addStringOption((option) =>
      option.setName("id").setDescription("Giveaway id").setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("giveaway_status")
    .setDescription("Update the status of a giveaway entry.")
    .addStringOption((option) =>
      option.setName("id").setDescription("Giveaway id").setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("status")
        .setDescription("New status")
        .setRequired(true)
        .addChoices(
          { name: "Active", value: "Active" },
          { name: "Paused", value: "Paused" },
          { name: "Winner Selected", value: "Winner Selected" },
          { name: "Closed", value: "Closed" }
        )
    ),
  new SlashCommandBuilder()
    .setName("giveaway_remove")
    .setDescription("Remove a giveaway from the website feed.")
    .addStringOption((option) =>
      option.setName("id").setDescription("Giveaway id").setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("giveaway_reroll")
    .setDescription("Pick a new winner from the existing entrants.")
    .addStringOption((option) =>
      option.setName("id").setDescription("Giveaway id").setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("panel")
    .setDescription("Post a giveaway setup panel in the current channel.")
];

const ensureJsonFile = (filePath, defaultContents) => {
  const dataDir = dirname(filePath);

  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  if (!existsSync(filePath)) {
    writeFileSync(filePath, `${JSON.stringify(defaultContents, null, 2)}\n`, "utf8");
  }
};

const ensureSettingsFile = () => {
  ensureJsonFile(config.settingsFile, { giveawayChannelId: "" });
};

const readSettings = () => {
  ensureSettingsFile();
  const raw = readFileSync(config.settingsFile, "utf8");
  return JSON.parse(raw);
};

const writeSettings = (settings) => {
  writeFileSync(config.settingsFile, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
};

const buildPanelComponents = (channelId) => {
  const configuredLine = channelId
    ? `Current channel: <#${channelId}>`
    : "Current channel: No channel selected.";

  const container = new ContainerBuilder();
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent("### Doctor Panel")
  );
  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent("### Giveaway Channel"),
    new TextDisplayBuilder().setContent("Choose which channel should receive giveaway posts and winner announcements.")
  );

  container.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(configuredLine)
      )
      .setButtonAccessory(
        new ButtonBuilder()
          .setCustomId("panel_clear_giveaway_channel")
          .setLabel("Clear Channel")
          .setStyle(ButtonStyle.Secondary)
      )
  );

  const selectRow = new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId("panel_select_giveaway_channel")
      .setPlaceholder("Select giveaway channel")
      .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.PublicThread)
      .setMinValues(1)
      .setMaxValues(1)
  );

  return [container, selectRow];
};

const updatePanelMessage = async (interactionOrMessage) => {
  const settings = readSettings();
  const payload = {
    flags: MessageFlags.IsComponentsV2,
    components: buildPanelComponents(settings.giveawayChannelId)
  };

  if ("update" in interactionOrMessage) {
    await interactionOrMessage.update(payload);
    return;
  }

  await interactionOrMessage.edit(payload);
};

const buildCommandBox = (title, lines = []) => {
  const container = new ContainerBuilder();
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`### ${title}`)
  );

  if (lines.length > 0) {
    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
    container.addTextDisplayComponents(
      ...lines.map((line) => new TextDisplayBuilder().setContent(line))
    );
  }

  return [container];
};

const buildDecisionBox = (title, lines = [], buttons = []) => {
  const container = new ContainerBuilder();
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`### ${title}`)
  );

  if (lines.length > 0) {
    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
    container.addTextDisplayComponents(
      ...lines.map((line) => new TextDisplayBuilder().setContent(line))
    );
  }

  if (buttons.length > 0) {
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(...buttons)
    );
  }

  return [container];
};

const buildWinnerAnnouncementBox = (giveaway) => {
  const hasWinners = Array.isArray(giveaway.winnerIds) && giveaway.winnerIds.length > 0;
  const winnerLine = hasWinners
    ? giveaway.winnerIds.map((id) => `<@${id}>`).join(", ")
    : "No entrants joined this giveaway.";
  const celebrationLine = hasWinners
    ? giveaway.winnerIds.length === 1
      ? `Congratulations ${winnerLine}! You won **${giveaway.title}**.`
      : `Congratulations ${winnerLine}! You won **${giveaway.title}**.`
    : `**${giveaway.title}** has ended.`;

  const container = new ContainerBuilder();
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(celebrationLine)
  );

  return [container];
};

const replyWithCommandBox = async (interaction, title, lines, options = {}) => {
  const payload = {
    flags: MessageFlags.IsComponentsV2 | (options.ephemeral ? MessageFlags.Ephemeral : 0),
    components: buildCommandBox(title, lines)
  };

  await interaction.reply(payload);
};

const editReplyWithCommandBox = async (interaction, title, lines, options = {}) => {
  const payload = {
    flags: MessageFlags.IsComponentsV2 | (options.ephemeral ? MessageFlags.Ephemeral : 0),
    components: buildCommandBox(title, lines)
  };

  await interaction.editReply(payload);
};

const replyWithDecisionBox = async (interaction, title, lines, buttons, options = {}) => {
  const payload = {
    flags: MessageFlags.IsComponentsV2 | (options.ephemeral ? MessageFlags.Ephemeral : 0),
    components: buildDecisionBox(title, lines, buttons)
  };

  await interaction.reply(payload);
};

const ensureDataFile = () => {
  ensureJsonFile(config.dataFile, { giveaways: [] });
};

const ensureContactFile = () => {
  ensureJsonFile(config.contactFile, { messages: [] });
};

const readContactMessages = () => {
  ensureContactFile();
  const raw = readFileSync(config.contactFile, "utf8");
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed.messages) ? parsed : { messages: [] };
};

const writeContactMessages = (data) => {
  writeFileSync(config.contactFile, `${JSON.stringify(data, null, 2)}\n`, "utf8");
};

const createContactId = () => `msg-${Date.now().toString(36)}`;

const buildContactInboxComponents = (entry) => {
  const container = new ContainerBuilder();
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent("### Website Contact")
  );
  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`**Name:** ${entry.name || "Not provided"}`),
    new TextDisplayBuilder().setContent(`**Discord:** ${entry.discordUsername}`),
    new TextDisplayBuilder().setContent(`**Status:** ${entry.status}`),
    new TextDisplayBuilder().setContent(`**Received:** <t:${Math.floor(new Date(entry.createdAt).getTime() / 1000)}:f>`),
    new TextDisplayBuilder().setContent(entry.message)
  );

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`contact_reply:${entry.id}`)
      .setLabel("Reply")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!entry.discordUserId || entry.status === "Closed"),
    new ButtonBuilder()
      .setCustomId(`contact_done:${entry.id}`)
      .setLabel(entry.status === "Closed" ? "Closed" : "Mark Done")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(entry.status === "Closed")
  );

  return [container, buttons];
};

const buildContactReturnComponents = (entry, messageText) => {
  const container = new ContainerBuilder();
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent("### Discord Reply")
  );
  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`**From:** ${entry.discordUsername}`),
    new TextDisplayBuilder().setContent(`**Contact:** ${entry.id}`),
    new TextDisplayBuilder().setContent(`**Received:** <t:${Math.floor(Date.now() / 1000)}:f>`),
    new TextDisplayBuilder().setContent(messageText)
  );
  return [container];
};

const buildContactThreadComponents = (title, lines = []) => {
  const container = new ContainerBuilder();
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`### ${title}`)
  );

  if (lines.length > 0) {
    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
    container.addTextDisplayComponents(
      ...lines.map((line) => new TextDisplayBuilder().setContent(line))
    );
  }

  return [container];
};

const syncContactInboxMessage = async (entry) => {
  if (!entry.inboxChannelId || !entry.inboxMessageId) {
    return;
  }

  const channel = await client.channels.fetch(entry.inboxChannelId);

  if (!channel?.isTextBased()) {
    return;
  }

  const message = await channel.messages.fetch(entry.inboxMessageId);
  await message.edit({
    flags: MessageFlags.IsComponentsV2,
    components: buildContactInboxComponents(entry)
  });
};

const getContactThreadChannel = async (entry) => {
  if (!entry.threadChannelId) {
    return null;
  }

  const channel = await client.channels.fetch(entry.threadChannelId).catch(() => null);
  return channel?.isTextBased() ? channel : null;
};

const sendContactThreadMessage = async (entry, title, lines) => {
  const thread = await getContactThreadChannel(entry);

  if (!thread) {
    return;
  }

  await thread.send({
    flags: MessageFlags.IsComponentsV2,
    components: buildContactThreadComponents(title, lines)
  });
};

const getContactInboxChannel = async () => {
  if (!config.contactInboxChannelId) {
    return null;
  }

  const channel = await client.channels.fetch(config.contactInboxChannelId);
  return channel?.isTextBased() ? channel : null;
};

const findLatestContactEntryByUserId = (discordUserId) => {
  const contactData = readContactMessages();
  const matches = contactData.messages.filter((entry) => entry.discordUserId === discordUserId);

  if (matches.length === 0) {
    return null;
  }

  const prioritized = [...matches].sort((left, right) => {
    const leftStamp = new Date(
      left.lastStaffReplyAt || left.lastUserReplyAt || left.repliedAt || left.createdAt
    ).getTime();
    const rightStamp = new Date(
      right.lastStaffReplyAt || right.lastUserReplyAt || right.repliedAt || right.createdAt
    ).getTime();
    return rightStamp - leftStamp;
  });

  return prioritized.find((entry) => entry.status !== "Closed") || prioritized[0] || null;
};

const findGuildMemberByDiscordName = async (discordUsername) => {
  const guild = await client.guilds.fetch(config.guildId);
  const members = await guild.members.fetch();
  const normalized = discordUsername.trim().toLowerCase();

  const matches = members.filter((member) => {
    const username = member.user.username?.toLowerCase();
    const globalName = member.user.globalName?.toLowerCase();
    const displayName = member.displayName?.toLowerCase();
    return username === normalized || globalName === normalized || displayName === normalized;
  });

  if (matches.size !== 1) {
    return null;
  }

  return matches.first() || null;
};

const forwardContactMessage = async (entry) => {
  const inboxChannel = await getContactInboxChannel();

  if (!inboxChannel) {
    throw new Error("Contact inbox channel is not configured.");
  }

  const message = await inboxChannel.send({
    flags: MessageFlags.IsComponentsV2,
    components: buildContactInboxComponents(entry)
  });

  entry.inboxChannelId = inboxChannel.id;
  entry.inboxMessageId = message.id;

  if ("startThread" in message) {
    const thread = await message.startThread({
      name: `contact-${entry.id}`,
      autoArchiveDuration: 1440
    });

    entry.threadChannelId = thread.id;

    await thread.send({
      flags: MessageFlags.IsComponentsV2,
      components: buildContactThreadComponents("Website Contact Opened", [
        `**Name:** ${entry.name || "Not provided"}`,
        `**Discord:** ${entry.discordUsername}`,
        entry.message
      ])
    });
  }
};

const exchangeDiscordCode = async (code) => {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: config.authCallbackUrl
  });

  const response = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  if (!response.ok) {
    throw new Error("Discord token exchange failed.");
  }

  return response.json();
};

const fetchDiscordIdentity = async (accessToken) => {
  const response = await fetch("https://discord.com/api/users/@me", {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    throw new Error("Discord identity lookup failed.");
  }

  return response.json();
};

const sendRedirect = (res, location) => {
  res.writeHead(302, { Location: location });
  res.end();
};

const sendHtml = (res, statusCode, html) => {
  res.writeHead(statusCode, {
    "Content-Type": "text/html; charset=utf-8"
  });
  res.end(html);
};

const buildAuthErrorPage = (message) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Discord Login Error</title>
</head>
<body>
  <p>${message}</p>
</body>
</html>
`;

const getGiveawayChannel = async (fallbackChannelId) => {
  const settings = readSettings();
  const targetChannelId = settings.giveawayChannelId || fallbackChannelId;

  if (!targetChannelId) {
    return null;
  }

  const channel = await client.channels.fetch(targetChannelId);
  return channel?.isTextBased() ? channel : null;
};

const announceWinners = async (giveaway) => {
  if (!giveaway.channelId || !Array.isArray(giveaway.winnerIds)) {
    return;
  }

  const channel = await client.channels.fetch(giveaway.channelId);

  if (!channel?.isTextBased()) {
    return;
  }

  await channel.send({
    flags: MessageFlags.IsComponentsV2,
    components: buildWinnerAnnouncementBox(giveaway)
  });
};

const createGiveawayId = () => `gw-${Date.now().toString(36)}`;
const toUnix = (isoDate) => Math.floor(new Date(isoDate).getTime() / 1000);
const createMessageUrl = (guildId, channelId, messageId) =>
  `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;

const pickWinners = (entrants, winnerCount) => {
  const pool = [...entrants];
  const winners = [];

  while (pool.length > 0 && winners.length < winnerCount) {
    const index = Math.floor(Math.random() * pool.length);
    winners.push(pool.splice(index, 1)[0]);
  }

  return winners;
};

const formatWinnerLine = (giveaway) => {
  if (!Array.isArray(giveaway.winnerIds) || giveaway.winnerIds.length === 0) {
    return "Pending";
  }

  return giveaway.winnerIds.map((id) => `<@${id}>`).join(", ");
};

const buildGiveawayComponents = (giveaway) => {
  const viewUrl = giveaway.messageId
    ? createMessageUrl(config.guildId, giveaway.channelId, giveaway.messageId)
    : "https://discord.com/channels/@me";

  const container = new ContainerBuilder();

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`# ${giveaway.title}`)
  );

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `${giveaway.description || "No description provided."}`
    )
  );

  const hasWinners = Array.isArray(giveaway.winnerIds) && giveaway.winnerIds.length > 0;
  const winnerLabel = giveaway.winnerIds?.length === 1 ? "Winner" : "Winners";
  const statusLabel = hasWinners ? winnerLabel : "Time remaining";
  const statusValue = hasWinners
    ? giveaway.winnerIds.map((id) => `<@${id}>`).join(", ")
    : `<t:${toUnix(giveaway.endsAt)}:R>`;
  const participantCount = emojifyDigits(giveaway.entrantIds.length);

  container.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `**${statusLabel}:**\n${statusValue}\n**Participants:** ${participantCount}`
        )
      )
      .setButtonAccessory(
        new ButtonBuilder()
          .setCustomId(`giveaway_enter:${giveaway.id}`)
          .setLabel("Enter")
          .setStyle(ButtonStyle.Success)
          .setDisabled(giveaway.status !== "Active")
      )
  );

  if (giveaway.imageUrl) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems({
        media: { url: giveaway.imageUrl }
      })
    );
  }

  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `Winners: ${emojifyDigits(giveaway.winnerCount)} | Ends: <t:${toUnix(giveaway.endsAt)}:f>`
    )
  );

  const actionRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel("View Giveaway")
      .setStyle(ButtonStyle.Link)
      .setURL(viewUrl)
  );

  return [container, actionRow];
};

const readGiveaways = () => {
  ensureDataFile();
  const raw = readFileSync(config.dataFile, "utf8");
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed.giveaways) ? parsed : { giveaways: [] };
};

const writeGiveaways = (data) => {
  writeFileSync(config.dataFile, `${JSON.stringify(data, null, 2)}\n`, "utf8");
};

const finishGiveaway = async (giveaway, data, options = {}) => {
  const { announce = true } = options;

  if (!giveaway || giveaway.status === "Winner Selected" || giveaway.status === "Closed") {
    return [];
  }

  const winners = pickWinners(giveaway.entrantIds || [], giveaway.winnerCount || 1);
  giveaway.status = "Winner Selected";
  giveaway.winnerIds = winners;
  giveaway.winner = winners.length > 0 ? winners.join(", ") : "";
  giveaway.endedAt = new Date().toISOString();
  writeGiveaways(data);
  await syncGiveawayMessage(giveaway);

  if (announce) {
    await announceWinners(giveaway);
  }

  return winners;
};

const closeExpiredGiveaways = async () => {
  const data = readGiveaways();
  const now = Date.now();
  let changed = false;

  for (const giveaway of data.giveaways) {
    if (giveaway.status !== "Active") {
      continue;
    }

    if (new Date(giveaway.endsAt).getTime() > now) {
      continue;
    }

    await finishGiveaway(giveaway, data, { announce: true });
    changed = true;
  }

  if (changed) {
    writeGiveaways(data);
  }
};

const syncGiveawayMessage = async (giveaway) => {
  if (!giveaway.channelId || !giveaway.messageId) {
    return;
  }

  const channel = await client.channels.fetch(giveaway.channelId);

  if (!channel?.isTextBased()) {
    return;
  }

  const message = await channel.messages.fetch(giveaway.messageId);
  await message.edit({
    flags: MessageFlags.IsComponentsV2,
    components: buildGiveawayComponents(giveaway)
  });
};

const registerCommands = async () => {
  const rest = new REST({ version: "10" }).setToken(config.token);
  await rest.put(
    Routes.applicationGuildCommands(config.clientId, config.guildId),
    { body: commands.map((command) => command.toJSON()) }
  );
};

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.DirectMessages],
  partials: [Partials.Channel]
});

const requestHandler = async (req, res) => {
  cleanupAuthMaps();
  const sendJson = (statusCode, body) => {
    res.writeHead(statusCode, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    });
    res.end(JSON.stringify(body));
  };

  const requestUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (req.method === "OPTIONS") {
    sendJson(204, {});
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/auth/discord/login") {
    if (!config.clientSecret || !config.authCallbackUrl) {
      sendHtml(res, 500, buildAuthErrorPage("Discord login is not configured on the bot service."));
      return;
    }

    const state = createNonce();
    const redirectTarget = requestUrl.searchParams.get("redirect") || "";
    authStates.set(state, {
      redirectTarget,
      expiresAt: Date.now() + AUTH_STATE_TTL_MS
    });

    const discordUrl = new URL("https://discord.com/oauth2/authorize");
    discordUrl.searchParams.set("client_id", config.clientId);
    discordUrl.searchParams.set("response_type", "code");
    discordUrl.searchParams.set("scope", "identify");
    discordUrl.searchParams.set("redirect_uri", config.authCallbackUrl);
    discordUrl.searchParams.set("state", state);
    discordUrl.searchParams.set("prompt", "consent");
    sendRedirect(res, discordUrl.toString());
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/auth/discord/callback") {
    const code = requestUrl.searchParams.get("code") || "";
    const state = requestUrl.searchParams.get("state") || "";
    const authState = authStates.get(state);

    if (!code || !authState) {
      sendHtml(res, 400, buildAuthErrorPage("Discord login could not be completed."));
      return;
    }

    authStates.delete(state);

    try {
      const tokenData = await exchangeDiscordCode(code);
      const identity = await fetchDiscordIdentity(tokenData.access_token);
      const token = createAuthSession({
        discordUserId: identity.id,
        username: identity.username || "",
        globalName: identity.global_name || "",
        avatar: identity.avatar || ""
      });
      const redirectTarget = authState.redirectTarget || "/";
      const redirectUrl = new URL(redirectTarget);
      redirectUrl.searchParams.set("discord_token", token);
      sendRedirect(res, redirectUrl.toString());
    } catch (error) {
      console.error("Discord auth callback failed:", error);
      sendHtml(res, 500, buildAuthErrorPage("Discord login failed."));
    }

    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/api/contact") {
    sendJson(200, { ok: true });
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/api/contact/me") {
    const auth = getAuthSession(req);

    if (!auth) {
      sendJson(401, { error: "Login required." });
      return;
    }

    sendJson(200, {
      ok: true,
      user: {
        discordUserId: auth.session.discordUserId,
        username: auth.session.username,
        globalName: auth.session.globalName,
        avatar: auth.session.avatar
      }
    });
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/api/contact/logout") {
    const auth = getAuthSession(req);

    if (auth) {
      authTokens.delete(auth.token);
    }

    sendJson(200, { ok: true });
    return;
  }

  if (req.method !== "POST" || requestUrl.pathname !== "/api/contact") {
    sendJson(404, { error: "Not found." });
    return;
  }

  let raw = "";
  req.on("data", (chunk) => {
    raw += chunk;
  });

  req.on("end", async () => {
    try {
      const auth = getAuthSession(req);

      if (!auth) {
        sendJson(401, { error: "Login required." });
        return;
      }

      const payload = JSON.parse(raw || "{}");
      const name = String(payload.name || "").trim();
      const message = String(payload.message || "").trim();

      if (!message) {
        sendJson(400, { error: "Message is required." });
        return;
      }

      const data = readContactMessages();
      const entry = {
        id: createContactId(),
        name,
        discordUsername: auth.session.globalName || auth.session.username,
        discordUserId: auth.session.discordUserId,
        message,
        status: "Open",
        createdAt: new Date().toISOString(),
        inboxChannelId: "",
        inboxMessageId: "",
        threadChannelId: ""
      };

      await forwardContactMessage(entry);
      data.messages.unshift(entry);
      writeContactMessages(data);

      sendJson(200, { ok: true, id: entry.id });
    } catch (error) {
      console.error("Contact API error:", error);
      sendJson(500, { error: "Message failed." });
    }
  });
};

const apiServer = http.createServer((req, res) => {
  requestHandler(req, res).catch((error) => {
    console.error("Unhandled contact server error:", error);
    res.writeHead(500, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    });
    res.end(JSON.stringify({ error: "Server error." }));
  });
});

client.once("clientReady", () => {
  console.log(`Logged in as ${client.user.tag}`);
  console.log(`Website giveaway file: ${config.dataFile}`);
  console.log(`Contact message file: ${config.contactFile}`);
  setInterval(() => {
    closeExpiredGiveaways().catch((error) => {
      console.error("Automatic giveaway close failed:", error);
    });
  }, 15_000);
});

client.on("messageCreate", async (message) => {
  try {
    if (message.author.bot || message.guildId) {
      return;
    }

    const entry = findLatestContactEntryByUserId(message.author.id);

    if (!entry) {
      return;
    }

    const contactData = readContactMessages();
    const storedEntry = contactData.messages.find((item) => item.id === entry.id);

    if (!storedEntry) {
      return;
    }

    storedEntry.status = "User Replied";
    storedEntry.lastUserReply = message.content;
    storedEntry.lastUserReplyAt = new Date().toISOString();
    writeContactMessages(contactData);
    await sendContactThreadMessage(storedEntry, "User Reply", [message.content]);
    await syncContactInboxMessage(storedEntry);
  } catch (error) {
    console.error("DM relay failed:", error);
  }
});

client.on("interactionCreate", async (interaction) => {
  try {
    if (interaction.isButton()) {
      const [action, giveawayId] = interaction.customId.split(":");

      if (action === "contact_reply") {
        const modal = new ModalBuilder()
          .setCustomId(`contact_reply_modal:${giveawayId}`)
          .setTitle("Reply to Contact");

        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("reply_message")
              .setLabel("Reply")
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
              .setMaxLength(1800)
          )
        );

        await interaction.showModal(modal);
        return;
      }

      if (action === "contact_done") {
        const contactData = readContactMessages();
        const entry = contactData.messages.find((item) => item.id === giveawayId);

        if (!entry) {
          await replyWithCommandBox(interaction, "Contact Reply", ["Message not found."], { ephemeral: true });
          return;
        }

        entry.status = "Closed";
        writeContactMessages(contactData);
        await syncContactInboxMessage(entry);
        await replyWithCommandBox(interaction, "Contact Reply", ["Message marked as closed."], { ephemeral: true });
        return;
      }

      if (action === "panel_set_giveaway_channel") {
        const settings = readSettings();
        settings.giveawayChannelId = interaction.channelId;
        writeSettings(settings);
        await updatePanelMessage(interaction);
        return;
      }

      if (action === "panel_clear_giveaway_channel") {
        const settings = readSettings();
        settings.giveawayChannelId = "";
        writeSettings(settings);
        await updatePanelMessage(interaction);
        return;
      }

      if (action === "giveaway_leave_confirm") {
        const data = readGiveaways();
        const giveaway = data.giveaways.find((item) => item.id === giveawayId);

        if (!giveaway) {
          await replyWithCommandBox(
            interaction,
            "Giveaway Entry",
            ["This giveaway no longer exists."],
            { ephemeral: true }
          );
          return;
        }

        giveaway.entrantIds = (giveaway.entrantIds || []).filter(
          (entrantId) => entrantId !== interaction.user.id
        );
        writeGiveaways(data);
        await syncGiveawayMessage(giveaway);
        await replyWithCommandBox(
          interaction,
          "Giveaway Entry",
          [`You left "${giveaway.title}".`],
          { ephemeral: true }
        );
        return;
      }

      if (action === "giveaway_leave_cancel") {
        await replyWithCommandBox(
          interaction,
          "Giveaway Entry",
          ["You stayed in the giveaway."],
          { ephemeral: true }
        );
        return;
      }

      if (action !== "giveaway_enter") {
        return;
      }

      const data = readGiveaways();
      const giveaway = data.giveaways.find((item) => item.id === giveawayId);

      if (!giveaway) {
        await replyWithCommandBox(
          interaction,
          "Giveaway Entry",
          ["This giveaway no longer exists."],
          { ephemeral: true }
        );
        return;
      }

      if (giveaway.status !== "Active") {
        await replyWithCommandBox(
          interaction,
          "Giveaway Entry",
          ["This giveaway is not accepting entries right now."],
          { ephemeral: true }
        );
        return;
      }

      if (!Array.isArray(giveaway.entrantIds)) {
        giveaway.entrantIds = [];
      }

      if (giveaway.entrantIds.includes(interaction.user.id)) {
        await replyWithDecisionBox(
          interaction,
          "Giveaway Entry",
          ["You have already entered the giveaway.", "Do you want to leave?"],
          [
            new ButtonBuilder()
              .setCustomId(`giveaway_leave_confirm:${giveaway.id}`)
              .setLabel("Leave Giveaway")
              .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
              .setCustomId(`giveaway_leave_cancel:${giveaway.id}`)
              .setLabel("Stay Entered")
              .setStyle(ButtonStyle.Secondary)
          ],
          { ephemeral: true }
        );
        return;
      }

      giveaway.entrantIds.push(interaction.user.id);
      writeGiveaways(data);
      await syncGiveawayMessage(giveaway);
      await replyWithCommandBox(
        interaction,
        "Giveaway Entry",
        [`You are entered in "${giveaway.title}".`],
        { ephemeral: true }
      );
      return;
    }

    if (interaction.isModalSubmit()) {
      const [action, contactId] = interaction.customId.split(":");

      if (action !== "contact_reply_modal") {
        return;
      }

      const contactData = readContactMessages();
      const entry = contactData.messages.find((item) => item.id === contactId);

      if (!entry) {
        await interaction.reply({
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
          components: buildCommandBox("Contact Reply", ["Message not found."])
        });
        return;
      }

      const replyMessage = interaction.fields.getTextInputValue("reply_message").trim();
      const user = await client.users.fetch(entry.discordUserId);

      await user.send({
        flags: MessageFlags.IsComponentsV2,
        components: buildCommandBox("Reply from Crazyland", [replyMessage])
      });

      entry.status = "Replied";
      entry.reply = replyMessage;
      entry.repliedAt = new Date().toISOString();
      entry.lastStaffReplyAt = entry.repliedAt;
      writeContactMessages(contactData);
      await sendContactThreadMessage(entry, "Reply Sent", [replyMessage]);
      await syncContactInboxMessage(entry);
      await interaction.reply({
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        components: buildCommandBox("Contact Reply", [`Sent reply to ${entry.discordUsername}.`])
      });
      return;
    }

    if (interaction.isChannelSelectMenu()) {
      if (interaction.customId !== "panel_select_giveaway_channel") {
        return;
      }

      const selectedChannelId = interaction.values[0];
      const settings = readSettings();
      settings.giveawayChannelId = selectedChannelId;
      writeSettings(settings);
      await updatePanelMessage(interaction);
      return;
    }

    if (!interaction.isChatInputCommand()) {
      return;
    }

    const data = readGiveaways();

    if (interaction.commandName === "giveaway_create") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const title = interaction.options.getString("title", true);
      const description = interaction.options.getString("description", true);
      const durationMinutes = interaction.options.getInteger("duration_minutes", true);
      const prize = interaction.options.getString("prize") || "";
      const winnerCount = interaction.options.getInteger("winner_count") || 1;
      const imageUrl = interaction.options.getString("image_url") || config.defaultBannerUrl;
      const createdAt = new Date();
      const endsAt = new Date(createdAt.getTime() + durationMinutes * 60 * 1000);

      const giveaway = {
        id: createGiveawayId(),
        title,
        description,
        prize,
        imageUrl,
        status: "Active",
        winner: "",
        winnerIds: [],
        winnerCount,
        hostId: interaction.user.id,
        entrantIds: [],
        createdAt: createdAt.toISOString(),
        endsAt: endsAt.toISOString(),
        channelId: interaction.channelId,
        messageId: ""
      };

      const giveawayChannel = await getGiveawayChannel(interaction.channelId);

      if (!giveawayChannel) {
        await editReplyWithCommandBox(
          interaction,
          "Giveaway Create",
          ["No valid giveaway channel is configured.", "Use `/panel` first."],
          { ephemeral: true }
        );
        return;
      }

      giveaway.channelId = giveawayChannel.id;

      const message = await giveawayChannel.send({
        flags: MessageFlags.IsComponentsV2,
        components: buildGiveawayComponents(giveaway)
      });

      giveaway.messageId = message.id;
      data.giveaways.unshift(giveaway);
      writeGiveaways(data);
      await syncGiveawayMessage(giveaway);

      await editReplyWithCommandBox(
        interaction,
        "Giveaway Created",
        [
          `ID: \`${giveaway.id}\``,
          `Channel: <#${giveaway.channelId}>`,
          `Winners: ${emojifyDigits(giveaway.winnerCount)}`,
          `Ends: <t:${toUnix(giveaway.endsAt)}:f>`
        ],
        { ephemeral: true }
      );
      return;
    }

    if (interaction.commandName === "giveaway_list") {
      if (data.giveaways.length === 0) {
        await replyWithCommandBox(
          interaction,
          "Giveaway List",
          ["No giveaways are currently stored."],
          { ephemeral: true }
        );
        return;
      }

      const summary = data.giveaways
        .map(
          (item) =>
            `${item.id} | ${item.title} | ${item.status} | Entries: ${emojifyDigits((item.entrantIds || []).length)} | Winners: ${formatWinnerLine(item)}`
        );

      await replyWithCommandBox(interaction, "Giveaway List", summary, { ephemeral: true });
      return;
    }

    if (interaction.commandName === "giveaway_end") {
      const id = interaction.options.getString("id", true);
      const giveaway = data.giveaways.find((item) => item.id === id);

      if (!giveaway) {
        await replyWithCommandBox(
          interaction,
          "Giveaway End",
          [`No giveaway found for id \`${id}\`.`],
          { ephemeral: true }
        );
        return;
      }

      const winners = await finishGiveaway(giveaway, data, { announce: true });

      await replyWithCommandBox(
        interaction,
        "Giveaway Ended",
        winners.length > 0
          ? [
              `ID: \`${giveaway.id}\``,
              `Winner(s): ${winners.map((winnerId) => `<@${winnerId}>`).join(", ")}`,
              `Announced in: <#${giveaway.channelId}>`
            ]
          : [
              `ID: \`${giveaway.id}\``,
              "Giveaway ended, but there were no entrants to pick from."
            ],
        { ephemeral: true }
      );
      return;
    }

    if (interaction.commandName === "giveaway_status") {
      const id = interaction.options.getString("id", true);
      const status = interaction.options.getString("status", true);
      const giveaway = data.giveaways.find((item) => item.id === id);

      if (!giveaway) {
        await replyWithCommandBox(
          interaction,
          "Giveaway Status",
          [`No giveaway found for id \`${id}\`.`],
          { ephemeral: true }
        );
        return;
      }

      giveaway.status = status;
      writeGiveaways(data);
      await syncGiveawayMessage(giveaway);

      await replyWithCommandBox(
        interaction,
        "Giveaway Status",
        [`Updated \`${id}\` to status: ${status}.`],
        { ephemeral: true }
      );
      return;
    }

    if (interaction.commandName === "giveaway_remove") {
      const id = interaction.options.getString("id", true);
      const giveaway = data.giveaways.find((item) => item.id === id);
      const nextGiveaways = data.giveaways.filter((item) => item.id !== id);

      if (!giveaway || nextGiveaways.length === data.giveaways.length) {
        await replyWithCommandBox(
          interaction,
          "Giveaway Remove",
          [`No giveaway found for id \`${id}\`.`],
          { ephemeral: true }
        );
        return;
      }

      writeGiveaways({ giveaways: nextGiveaways });
      await replyWithCommandBox(
        interaction,
        "Giveaway Removed",
        [`Removed giveaway \`${id}\` from the website feed.`],
        { ephemeral: true }
      );
      return;
    }

    if (interaction.commandName === "giveaway_reroll") {
      const id = interaction.options.getString("id", true);
      const giveaway = data.giveaways.find((item) => item.id === id);

      if (!giveaway) {
        await replyWithCommandBox(
          interaction,
          "Giveaway Reroll",
          [`No giveaway found for id \`${id}\`.`],
          { ephemeral: true }
        );
        return;
      }

      const remainingEntrants = (giveaway.entrantIds || []).filter(
        (entrantId) => !(giveaway.winnerIds || []).includes(entrantId)
      );
      const winners = pickWinners(remainingEntrants, giveaway.winnerCount || 1);

      if (winners.length === 0) {
        await replyWithCommandBox(
          interaction,
          "Giveaway Reroll",
          ["No remaining entrants available for reroll."],
          { ephemeral: true }
        );
        return;
      }

      giveaway.winnerIds = winners;
      giveaway.winner = winners.join(", ");
      giveaway.status = "Winner Selected";
      writeGiveaways(data);
      await syncGiveawayMessage(giveaway);

      await replyWithCommandBox(
        interaction,
        "Giveaway Reroll",
        [`Rerolled winner(s): ${winners.map((winnerId) => `<@${winnerId}>`).join(", ")}`],
        { ephemeral: true }
      );
      return;
    }

    if (interaction.commandName === "panel") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      if (!interaction.channel?.isTextBased()) {
        await editReplyWithCommandBox(
          interaction,
          "Doctor Panel",
          ["This command can only be used in a text channel."],
          { ephemeral: true }
        );
        return;
      }

      const settings = readSettings();
      await interaction.channel.send({
        flags: MessageFlags.IsComponentsV2,
        components: buildPanelComponents(settings.giveawayChannelId)
      });

      await editReplyWithCommandBox(
        interaction,
        "Doctor Panel",
        ["Setup panel posted in this channel."],
        { ephemeral: true }
      );
    }
  } catch (error) {
    console.error("Interaction handling failed:", error);

    if (interaction.isRepliable()) {
      if (interaction.deferred || interaction.replied) {
        await editReplyWithCommandBox(
          interaction,
          "Command Failed",
          ["The giveaway command failed.", "Check Railway logs for the detailed error."],
          { ephemeral: true }
        ).catch(() => {});
      } else {
        await replyWithCommandBox(
          interaction,
          "Command Failed",
          ["The giveaway command failed.", "Check Railway logs for the detailed error."],
          { ephemeral: true }
        ).catch(() => {});
      }
    }
  }
});

const bootstrap = async () => {
  ensureDataFile();
  ensureSettingsFile();
  ensureContactFile();
  await registerCommands();
  await client.login(config.token);
  apiServer.listen(config.port, () => {
    console.log(`Contact API listening on port ${config.port}`);
  });
};

bootstrap().catch((error) => {
  console.error("Failed to start Discord bot:", error);
  process.exit(1);
});
