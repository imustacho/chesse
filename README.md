# 🧀 chesse

A cheese-themed Discord chess bot and multiplayer Discord Activity, built with discord.js, Components v2, Canvas, and the Embedded App SDK.

## Features

- `/chess` offers a voice Activity invite and **Play legacy**.
- Activity lobby with friend invitations, player matchmaking across Discord instances, room settings and spectator access.
- Cream-and-gold board with drag-and-drop pieces, real player names, server clocks, legal moves, promotion, draws and rematches. Both players ready up before a match starts. No Canvas in the Activity.
- Image-based boards with custom cheese pieces.
- SAN and coordinate moves, checkmate, draws, and resignations.
- Custom emojis, high-resolution thumbnails, and private error messages.

## Setup

Requires Node.js 22.12 or later (Node 24 recommended).

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

Use `/chess` to choose Activity or **Play legacy**. Join a voice channel first to get a voice invite. `/chess opponent:@player` preserves direct challenges in legacy mode. Enter legacy moves such as `e4`, `Nf3`, `O-O`, or `e2e4` through **Make a move**.

Legacy games are stored in memory and reset when the bot restarts. Activity games are saved to disk per Discord instance.

## Activity setup

The Activity needs its own HTTPS endpoint, a Developer Portal URL Mapping, Activities enabled, and `DISCORD_CLIENT_SECRET` in `.env`. See the [complete setup and manual launch guide](docs/activity.md).

```sh
npm run activity:build
```

Building does **not** start either service. When configured and ready, start the backend with `npm run activity:start`, and run only one copy of the bot with `npm start`.

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
