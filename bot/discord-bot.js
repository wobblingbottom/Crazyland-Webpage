import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder
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
    .setDescription("Create a new giveaway and sync it to the website.")
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
    ),
  new SlashCommandBuilder()
    .setName("giveaway_list")
    .setDescription("List the giveaways currently stored for the website."),
  new SlashCommandBuilder()
    .setName("giveaway_end")
    .setDescription("End a giveaway and publish a winner to the website.")
    .addStringOption((option) =>
      option.setName("id").setDescription("Giveaway id").setRequired(true)
    )
    .addStringOption((option) =>
      option.setName("winner").setDescription("Winner name").setRequired(true)
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
    )
];

const ensureDataFile = () => {
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

const registerCommands = async () => {
  const rest = new REST({ version: "10" }).setToken(config.token);
  await rest.put(
    Routes.applicationGuildCommands(config.clientId, config.guildId),
    { body: commands.map((command) => command.toJSON()) }
  );
};

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
  console.log(`Website giveaway file: ${config.dataFile}`);
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) {
    return;
  }

  const data = readGiveaways();

  if (interaction.commandName === "giveaway_create") {
    const title = interaction.options.getString("title", true);
    const prize = interaction.options.getString("prize") || "";
    const durationMinutes = interaction.options.getInteger("duration_minutes", true);
    const createdAt = new Date();
    const endsAt = new Date(createdAt.getTime() + durationMinutes * 60 * 1000);

    const giveaway = {
      id: createGiveawayId(),
      title,
      prize,
      status: "Active",
      winner: "",
      createdAt: createdAt.toISOString(),
      endsAt: endsAt.toISOString()
    };

    data.giveaways.unshift(giveaway);
    writeGiveaways(data);

    await interaction.reply(
      `Created giveaway \`${giveaway.id}\` for "${title}" ending at ${endsAt.toISOString()}.`
    );
    return;
  }

  if (interaction.commandName === "giveaway_list") {
    if (data.giveaways.length === 0) {
      await interaction.reply("No giveaways are currently stored.");
      return;
    }

    const summary = data.giveaways
      .map((item) => `${item.id} | ${item.title} | ${item.status} | Winner: ${item.winner || "Pending"}`)
      .join("\n");

    await interaction.reply(`Current giveaways:\n${summary}`);
    return;
  }

  if (interaction.commandName === "giveaway_end") {
    const id = interaction.options.getString("id", true);
    const winner = interaction.options.getString("winner", true);
    const giveaway = data.giveaways.find((item) => item.id === id);

    if (!giveaway) {
      await interaction.reply({ content: `No giveaway found for id \`${id}\`.`, ephemeral: true });
      return;
    }

    giveaway.status = "Winner Selected";
    giveaway.winner = winner;
    giveaway.endedAt = new Date().toISOString();
    writeGiveaways(data);

    await interaction.reply(`Marked \`${id}\` as complete. Winner: ${winner}.`);
    return;
  }

  if (interaction.commandName === "giveaway_status") {
    const id = interaction.options.getString("id", true);
    const status = interaction.options.getString("status", true);
    const giveaway = data.giveaways.find((item) => item.id === id);

    if (!giveaway) {
      await interaction.reply({ content: `No giveaway found for id \`${id}\`.`, ephemeral: true });
      return;
    }

    giveaway.status = status;
    writeGiveaways(data);

    await interaction.reply(`Updated \`${id}\` to status: ${status}.`);
    return;
  }

  if (interaction.commandName === "giveaway_remove") {
    const id = interaction.options.getString("id", true);
    const nextGiveaways = data.giveaways.filter((item) => item.id !== id);

    if (nextGiveaways.length === data.giveaways.length) {
      await interaction.reply({ content: `No giveaway found for id \`${id}\`.`, ephemeral: true });
      return;
    }

    writeGiveaways({ giveaways: nextGiveaways });
    await interaction.reply(`Removed giveaway \`${id}\` from the website feed.`);
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
