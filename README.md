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
npm start
```

Use `/chess` to open a game or `/chess opponent:@player` to challenge someone. Enter moves such as `e4`, `Nf3`, `O-O`, or `e2e4` through **Make a move**.

Games are stored in memory and reset when the bot restarts.

## Assets and development

Upload the seven images in `assets/emojis/` using their filenames as emoji names. See [the asset guide](assets/README.md) for the organized artwork and rebuilding instructions.

```sh
npm test
npm run assets:build
```
