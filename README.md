# 🧀 chesse

A cheese-themed Discord chess bot built with discord.js, Components v2, and Canvas.

## Features

- Public games and direct player challenges with `/chess`.
- Image-based boards with custom cheese pieces.
- SAN and coordinate moves, checkmate, draws, and resignations.
- Custom emojis, high-resolution thumbnails, and private error messages.

## Setup

Requires Node.js 20 or later.

```sh
npm install
cp .env.example .env
```

Fill in `DISCORD_TOKEN` and `DISCORD_CLIENT_ID` in `.env`. Optionally set `DISCORD_GUILD_ID` for a development server.

```sh
npm run register
npm run emojis:upload
npm start
```

Use `/chess` to open a game or `/chess opponent:@player` to challenge someone. Enter moves such as `e4`, `Nf3`, `O-O`, or `e2e4` through **Make a move**.

Games are stored in memory and reset when the bot restarts.

## Assets and development

See [the asset guide](assets/README.md) for the organized artwork and rebuilding instructions.

### Upload emojis to the bot

```sh
npm run emojis:upload -- --dry-run
npm run emojis:upload
```

The script validates every PNG in `assets/emojis/` before contacting Discord, checks that the token belongs to `DISCORD_CLIENT_ID`, and uploads missing emojis directly to the **bot application**, not to a server. It only needs `DISCORD_TOKEN` and `DISCORD_CLIENT_ID`; `DISCORD_GUILD_ID` is not used.

Existing emoji names are skipped, so rerunning is safe and does not delete or replace anything. Restart a running bot after uploading to refresh its application emoji cache. Application emojis take priority over server emojis. `--dry-run` checks the local files without making Discord requests or requiring credentials.

If an upload fails halfway through, fix the reported issue and rerun the command; completed uploads will be skipped. [Discord application emoji documentation](https://github.com/discord/discord-api-docs/blob/main/developers/resources/emoji.mdx#application-owned-emoji).

```sh
npm test
npm run assets:build
```
