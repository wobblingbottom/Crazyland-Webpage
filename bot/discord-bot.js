import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
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
  dataFile: resolve(rootDir, process.env.GIVEAWAYS_FILE || "data/giveaways.json")
};

const commands = [
  new SlashCommandBuilder()
    .setName("giveaway_create")
    .setDescription("Create a Discord giveaway with a live entry button.")
    .addStringOption((option) =>
      option.setName("title").setDescription("Giveaway title").setRequired(true)
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
    )
];

const ensureDataFile = () => {
  const dataDir = dirname(config.dataFile);

  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  if (!existsSync(config.dataFile)) {
    writeFileSync(config.dataFile, '{\n  "giveaways": []\n}\n', "utf8");
  }
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

  const container = new ContainerBuilder().setAccentColor(0x5865f2);

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`# ${giveaway.title}`)
  );

  container.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `**Time Remaining**\n<t:${toUnix(giveaway.endsAt)}:R> (${giveaway.status})`
        ),
        new TextDisplayBuilder().setContent(
          `**Hosted By**\n<@${giveaway.hostId}>`
        )
      )
      .setButtonAccessory(
        new ButtonBuilder()
          .setCustomId(`giveaway_enter:${giveaway.id}`)
          .setLabel(`Enter (${giveaway.entrantIds.length})`)
          .setStyle(ButtonStyle.Success)
          .setEmoji("🎉")
          .setDisabled(giveaway.status !== "Active")
      )
  );

  if (giveaway.imageUrl) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems({
        media: { url: giveaway.imageUrl },
        description: `${giveaway.title} giveaway banner`
      })
    );
  }

  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `**Prize**\n${giveaway.prize || "Mystery reward"}`
    ),
    new TextDisplayBuilder().setContent(
      `**Winners**\n${giveaway.winnerCount} winner(s) | Ends At <t:${toUnix(giveaway.endsAt)}:F>`
    ),
    new TextDisplayBuilder().setContent(
      `**Current Winner(s)**\n${formatWinnerLine(giveaway)}`
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
});

client.on("interactionCreate", async (interaction) => {
  try {
    if (interaction.isButton()) {
      const [action, giveawayId] = interaction.customId.split(":");

      if (action !== "giveaway_enter") {
        return;
      }

      const data = readGiveaways();
      const giveaway = data.giveaways.find((item) => item.id === giveawayId);

      if (!giveaway) {
        await interaction.reply({ content: "This giveaway no longer exists.", flags: MessageFlags.Ephemeral });
        return;
      }

      if (giveaway.status !== "Active") {
        await interaction.reply({ content: "This giveaway is not accepting entries right now.", flags: MessageFlags.Ephemeral });
        return;
      }

      if (!Array.isArray(giveaway.entrantIds)) {
        giveaway.entrantIds = [];
      }

      if (giveaway.entrantIds.includes(interaction.user.id)) {
        await interaction.reply({ content: "You are already entered in this giveaway.", flags: MessageFlags.Ephemeral });
        return;
      }

      giveaway.entrantIds.push(interaction.user.id);
      writeGiveaways(data);
      await syncGiveawayMessage(giveaway);
      await interaction.reply({ content: `You are entered in "${giveaway.title}".`, flags: MessageFlags.Ephemeral });
      return;
    }

    if (!interaction.isChatInputCommand()) {
      return;
    }

    const data = readGiveaways();

    if (interaction.commandName === "giveaway_create") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const title = interaction.options.getString("title", true);
      const durationMinutes = interaction.options.getInteger("duration_minutes", true);
      const prize = interaction.options.getString("prize") || "";
      const winnerCount = interaction.options.getInteger("winner_count") || 1;
      const imageUrl = interaction.options.getString("image_url") || "";
      const createdAt = new Date();
      const endsAt = new Date(createdAt.getTime() + durationMinutes * 60 * 1000);

      const giveaway = {
        id: createGiveawayId(),
        title,
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

      if (!interaction.channel?.isTextBased()) {
        await interaction.editReply("This command can only be used in a text channel.");
        return;
      }

      const message = await interaction.channel.send({
        flags: MessageFlags.IsComponentsV2,
        components: buildGiveawayComponents(giveaway)
      });

      giveaway.messageId = message.id;
      data.giveaways.unshift(giveaway);
      writeGiveaways(data);
      await syncGiveawayMessage(giveaway);

      await interaction.editReply(`Created giveaway \`${giveaway.id}\` and posted it in this channel.`);
      return;
    }

    if (interaction.commandName === "giveaway_list") {
      if (data.giveaways.length === 0) {
        await interaction.reply("No giveaways are currently stored.");
        return;
      }

      const summary = data.giveaways
        .map(
          (item) =>
            `${item.id} | ${item.title} | ${item.status} | Entries: ${(item.entrantIds || []).length} | Winners: ${formatWinnerLine(item)}`
        )
        .join("\n");

      await interaction.reply(`Current giveaways:\n${summary}`);
      return;
    }

    if (interaction.commandName === "giveaway_end") {
      const id = interaction.options.getString("id", true);
      const giveaway = data.giveaways.find((item) => item.id === id);

      if (!giveaway) {
        await interaction.reply({ content: `No giveaway found for id \`${id}\`.`, flags: MessageFlags.Ephemeral });
        return;
      }

      const winners = pickWinners(giveaway.entrantIds || [], giveaway.winnerCount || 1);
      giveaway.status = "Winner Selected";
      giveaway.winnerIds = winners;
      giveaway.winner = winners.length > 0 ? winners.join(", ") : "";
      giveaway.endedAt = new Date().toISOString();
      writeGiveaways(data);
      await syncGiveawayMessage(giveaway);

      await interaction.reply(
        winners.length > 0
          ? `Giveaway ended. Winner(s): ${winners.map((id) => `<@${id}>`).join(", ")}`
          : "Giveaway ended, but there were no entrants to pick from."
      );
      return;
    }

    if (interaction.commandName === "giveaway_status") {
      const id = interaction.options.getString("id", true);
      const status = interaction.options.getString("status", true);
      const giveaway = data.giveaways.find((item) => item.id === id);

      if (!giveaway) {
        await interaction.reply({ content: `No giveaway found for id \`${id}\`.`, flags: MessageFlags.Ephemeral });
        return;
      }

      giveaway.status = status;
      writeGiveaways(data);
      await syncGiveawayMessage(giveaway);

      await interaction.reply(`Updated \`${id}\` to status: ${status}.`);
      return;
    }

    if (interaction.commandName === "giveaway_remove") {
      const id = interaction.options.getString("id", true);
      const giveaway = data.giveaways.find((item) => item.id === id);
      const nextGiveaways = data.giveaways.filter((item) => item.id !== id);

      if (!giveaway || nextGiveaways.length === data.giveaways.length) {
        await interaction.reply({ content: `No giveaway found for id \`${id}\`.`, flags: MessageFlags.Ephemeral });
        return;
      }

      writeGiveaways({ giveaways: nextGiveaways });
      await interaction.reply(`Removed giveaway \`${id}\` from the website feed.`);
      return;
    }

    if (interaction.commandName === "giveaway_reroll") {
      const id = interaction.options.getString("id", true);
      const giveaway = data.giveaways.find((item) => item.id === id);

      if (!giveaway) {
        await interaction.reply({ content: `No giveaway found for id \`${id}\`.`, flags: MessageFlags.Ephemeral });
        return;
      }

      const remainingEntrants = (giveaway.entrantIds || []).filter(
        (entrantId) => !(giveaway.winnerIds || []).includes(entrantId)
      );
      const winners = pickWinners(remainingEntrants, giveaway.winnerCount || 1);

      if (winners.length === 0) {
        await interaction.reply({ content: "No remaining entrants available for reroll.", flags: MessageFlags.Ephemeral });
        return;
      }

      giveaway.winnerIds = winners;
      giveaway.winner = winners.join(", ");
      giveaway.status = "Winner Selected";
      writeGiveaways(data);
      await syncGiveawayMessage(giveaway);

      await interaction.reply(`Rerolled winner(s): ${winners.map((id) => `<@${id}>`).join(", ")}`);
    }
  } catch (error) {
    console.error("Interaction handling failed:", error);

    if (interaction.isRepliable()) {
      const message = "The giveaway command failed. Check Railway logs for the detailed error.";

      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(message).catch(() => {});
      } else {
        await interaction.reply({ content: message, flags: MessageFlags.Ephemeral }).catch(() => {});
      }
    }
  }
});

const bootstrap = async () => {
  ensureDataFile();
  await registerCommands();
  await client.login(config.token);
};

bootstrap().catch((error) => {
  console.error("Failed to start Discord bot:", error);
  process.exit(1);
});
