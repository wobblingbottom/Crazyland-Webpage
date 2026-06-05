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
  REST,
  Routes,
  SectionBuilder,
  SeparatorBuilder,
  SlashCommandBuilder,
  TextDisplayBuilder
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
  guildId: process.env.GUILD_ID,
  dataFile: resolve(rootDir, process.env.GIVEAWAYS_FILE || "data/giveaways.json"),
  settingsFile: resolve(rootDir, process.env.BOT_SETTINGS_FILE || "data/bot-config.json"),
  defaultBannerUrl:
    process.env.DEFAULT_BANNER_URL ||
    "https://raw.githubusercontent.com/wobblingbottom/Crazyland-Webpage/main/banner.png"
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

  const winnerLine =
    giveaway.winnerIds.length > 0
      ? giveaway.winnerIds.map((id) => `<@${id}>`).join(", ")
      : "No entrants";

  await channel.send(
    giveaway.winnerIds.length > 0
      ? `Giveaway ended: **${giveaway.title}**\nCongratulations ${winnerLine}!`
      : `Giveaway ended: **${giveaway.title}**\nNo entrants joined this giveaway.`
  );
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

  container.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `**${statusLabel}:**\n${statusValue}`
        )
      )
      .setButtonAccessory(
        new ButtonBuilder()
          .setCustomId(`giveaway_enter:${giveaway.id}`)
          .setLabel(`Enter (${giveaway.entrantIds.length})`)
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
      `Winners: ${giveaway.winnerCount} | Ends: <t:${toUnix(giveaway.endsAt)}:f>`
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

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once("clientReady", () => {
  console.log(`Logged in as ${client.user.tag}`);
  console.log(`Website giveaway file: ${config.dataFile}`);
  setInterval(() => {
    closeExpiredGiveaways().catch((error) => {
      console.error("Automatic giveaway close failed:", error);
    });
  }, 15_000);
});

client.on("interactionCreate", async (interaction) => {
  try {
    if (interaction.isButton()) {
      const [action, giveawayId] = interaction.customId.split(":");

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
          `Winners: ${giveaway.winnerCount}`,
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
            `${item.id} | ${item.title} | ${item.status} | Entries: ${(item.entrantIds || []).length} | Winners: ${formatWinnerLine(item)}`
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
  await registerCommands();
  await client.login(config.token);
};

bootstrap().catch((error) => {
  console.error("Failed to start Discord bot:", error);
  process.exit(1);
});
