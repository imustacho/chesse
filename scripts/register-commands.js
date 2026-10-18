import 'dotenv/config';
import { REST, Routes, SlashCommandBuilder } from 'discord.js';

const requiredEnv = ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID'];
for (const key of requiredEnv) {
  if (!process.env[key]) {
    console.error(`Missing environment variable: ${key}`);
    process.exit(1);
  }
}

const command = new SlashCommandBuilder()
  .setName('chess')
  .setDescription('Open a chesse Activity or play the classic chat board.')
  .addUserOption((option) =>
    option
      .setName('opponent')
      .setDescription('The player you want to challenge (optional).')
      .setRequired(false),
  );

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
const route = process.env.DISCORD_GUILD_ID
  ? Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.DISCORD_GUILD_ID)
  : Routes.applicationCommands(process.env.DISCORD_CLIENT_ID);

// Upsert only /chess; bulk overwrites would remove Discord's Activity entry point.
await rest.post(route, { body: command.toJSON() });
console.log(process.env.DISCORD_GUILD_ID ? 'Server command registered.' : 'Global command registered.');
