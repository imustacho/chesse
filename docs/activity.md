# chesse Activity

The Activity uses the **same Discord application** as the bot. The bot and Activity backend are separate processes. Neither is started by the build command.

## What is implemented

- `/chess` opens a colorless Components v2 launcher with a voice-channel Activity invite (when the challenger is in voice) and **Play legacy**.
- Without a voice channel, **Open Activity** launches in the current Discord context. Join voice and rerun `/chess` to generate a voice invite.
- Legacy retains its opponent challenge, message-based Canvas board, buttons and move modal. Only the challenger can open the legacy game from their launcher.
- Joining voice or opening the Activity lands in a lobby. It never creates or starts a match automatically. The optional slash-command opponent remains a legacy challenge; Activity invitations are chosen in the lobby.
- **Play in this room:** two people in the same verified Discord Activity each press this button and are paired directly, without codes, invitations or a settings form. The queue is isolated from other rooms and global matchmaking. It defaults to 10+0; the host can adjust settings before both press Ready. Simply being present does not opt someone into play.
- **Play with a friend:** create a room, choose an available authenticated participant in your Activity, or share its eight-character code. The invitee accepts explicitly. Both seated players must press **Ready to play** before the board unlocks or clocks start. Changing settings clears ready confirmations.
- **Find players:** opt into a queue across all Discord instances connected to this backend. Matching requires the same time, increment and spectator setting. There are no bots, fake opponents or rating claims. Both matched players still confirm readiness. Search can be cancelled; disconnected queue entries expire after 20 seconds. Queues are cleared on backend restart.
- **Watch:** the lobby lists public tables across instances and local tables in your Activity. A private room outside your Activity needs its code or a personal invitation. Spectator permission is checked by the server, and spectators cannot make moves, take over matched seats or edit settings. Viewer names/counts and player connection status use heartbeats.
- The lobby is an in-game menu beside an idle board: friend play, matchmaking, spectating and room-code entry. Player lists, tables and settings open in dialogs, without a scrolling landing-page layout. The cream/gold match screen uses cheese artwork, Discord display names/handles, Gold/Charcoal sides, clocks and a reactive mascot. The background stays flat; the mascot has no enclosing card or glow. Pieces support mouse/touch/pen dragging, keyboard moves, legal hints and automatic player orientation. No Canvas rendering in Activity; Canvas remains in legacy and the asset build pipeline.
- The wordmark has golden **ss** letters and no trailing dot. It is centered over the whole viewport, with **Room settings** at the far top-right. The board and player/status panel form one centered group that resizes for the available viewport. Boxes have no fine outline. Room codes and the full spectator list live in the room-settings dialog; last move and viewer count remain beside the board.
- **Room settings:** friend-room hosts can change time (untimed, 3, 5, 10, 15 or 30 minutes), increment (0, 2 or 5 seconds), public visibility and spectator access before the match starts. Matchmaking settings are fixed for the matched pair. Disabling spectators removes their view on the next sync.
- Server-authoritative moves, revision checks and clocks. Clients synchronize every second (four seconds in background). Timed games continue while players disconnect or the server is down; timeout is settled when the room is next read. Both players can request a rematch; colors swap and a new ready check is required.
- Room snapshots are atomically saved under `data/activity/`, including the complete history for repetition detection. Seated users can resume an unfinished room after signing back in, even from a different instance. The room and its code are independent of Discord's instance lifetime. Legacy games remain memory-only. Presence and spectator locations are temporary.
- OAuth identity and Activity instance membership are verified with Discord on the server. Clients cannot choose another user's identity or submit an arbitrary room ID to game routes. Membership is rechecked every 30 seconds. Sessions expire after 30 minutes of inactivity; after a backend restart, close/reopen the Activity to sign in again.

## Developer Portal setup (required before live use)

1. Open application **1546855614951727104** in the [Discord Developer Portal](https://discord.com/developers/applications/1546855614951727104).
2. Under **OAuth2**, obtain the **Client Secret**. Put it in `.env` as `DISCORD_CLIENT_SECRET`. This is different from the bot token. Keep `DISCORD_CLIENT_ID` and `DISCORD_TOKEN` as configured. Never put the secret or bot token in browser code.
3. Add a placeholder OAuth2 Redirect URI such as `https://127.0.0.1` as required by the [Discord Activity tutorial](https://docs.discord.com/developers/activities/building-an-activity). The embedded SDK handles authorization; this backend follows Discord's authorization-code exchange flow.
4. Serve this backend through an HTTPS domain or development tunnel. In **Activities → URL Mappings**, map `/` to that host (without `https://` and without `/index.html`). One mapping serves the page, assets and API.
5. In **Activities → Settings**, enable Activities. Keep the default **Launch** entry point. The command-registration script upserts only `/chess` and preserves that entry point.
6. Give the sebot **View Channel** and **Create Invite** permission in the voice channel, and message/attachment permissions in the command channel. Users need permission to join the voice channel and use Activities. No microphone permission is requested by the web app; Discord handles voice.
7. In-development Activity access may be restricted to the application owner/developer team. Follow Discord's distribution requirements before inviting the public.

Official references: [launching and SDK setup](https://docs.discord.com/developers/activities/building-an-activity), [instance membership and lifetime](https://github.com/discord/discord-api-docs/blob/main/developers/activities/development-guides/multiplayer-experience.mdx), [URL mappings](https://github.com/discord/discord-api-docs/blob/main/developers/activities/development-guides/local-development.mdx).

## Start it locally

Requires Node.js **22.12+** (Node 24 recommended).

```sh
npm install
npm run register
npm run activity:build
```

The build outputs `dist/activity/`. No `.env` values are bundled. Confirm your `.env` contains `DISCORD_CLIENT_ID`, `DISCORD_TOKEN`, and the OAuth2 **Client Secret** under the exact name `DISCORD_CLIENT_SECRET`. All three must belong to the same application. Keep the secret and bot token private.

Open three PowerShell terminals in the project folder. Start one copy of each process:

Terminal 1, the bot:
```sh
npm start
```

If the bot is already running, leave that process alone; do not start a second copy. The earlier duplicate-process issue caused button failures.

Terminal 2, the Activity web app and API:

```sh
npm run activity:start
```

It should print `chesse Activity server is ready.` and listen locally at `http://127.0.0.1:3001`.

Terminal 3, an HTTPS tunnel for Discord to reach your computer (install `cloudflared` once if needed):

```sh
cloudflared tunnel --url http://127.0.0.1:3001
```

Copy the temporary `https://…trycloudflare.com` hostname from its output. In the Developer Portal, open **Activities → URL Mappings**, map prefix `/` to that hostname (hostname only: omit `https://` and any path), then save. In **Activities → Settings**, enable Activities and leave the default **Launch** entry point enabled. The tunnel must remain open while testing; restarting a quick tunnel can change its hostname, requiring you to update the mapping.

## Play in Discord

1. Join a server voice channel. The bot needs **View Channel** and **Create Invite** there.
2. Run `/chess` in a text channel. Choose **Join voice & play** to invite people directly into the Activity, or **Play legacy** to use the existing chat-based board. If you did not join voice first, use **Open Activity**.
3. For a quick game together, both players press **Play in this room**. You will be paired with another person who pressed it in this same Activity. For a specific opponent or custom setup, choose **Play with a friend**, set the time and visibility, and select an available friend. They receive an **Accept / Decline** invitation. Alternatively share a room code or use **Invite friends**. A private room is visible locally in the same Activity; its code is required from other instances.
4. Choose **Find players** for matchmaking. Select your time control and wait for another real player with matching settings. This queue spans Activity instances served by this backend, but does not move users between Discord voice channels. Use **Cancel search** to leave it.
5. Once paired, review both Discord names, the sides and settings. Each player presses **Ready to play**. Only then does the match start. Drag a piece to a highlighted square, or select squares with the keyboard. Promotion opens a piece picker.
6. Use **Offer draw**, **Resign**, **Flip board**, **Room settings**, and **Lobby** beside the board. Leaving an active match requires confirming resignation. After a finished match, both players can agree to a rematch; colors swap and they ready up again.
7. To spectate, open **Watch a match**, choose a table, and press **Watch**. Alternatively use **Join with a code → Watch**. Watching is possible only when the room permits it. Players see watcher names and the count; viewers have no game-changing controls. **Players here** opens your current Activity's participant list.

For a local lobby preview without Discord, open `http://localhost:3001/?preview=1`. To preview the match layout directly, use `http://localhost:3001/?preview=1&screen=game`. These are clearly labelled offline demos, not real matchmaking; they never save or share moves. `npm run activity:preview` runs offline browser checks and exports lobby/match desktop/mobile screenshots under `dist/previews/` (requires Playwright and Edge).

To stop the app, press **Ctrl+C** in each terminal. Start exactly one bot process and one Activity server per data directory.

After updating the Activity code, run `npm run activity:build`, stop the existing Activity backend, then start it once with `npm run activity:start`. Reopen the Activity in Discord. A backend restart clears authentication sessions, presence and the search queue; saved rooms and match clocks remain on disk.

For hosted deployment, set `ACTIVITY_HOST=0.0.0.0` only when required by your host, terminate HTTPS at your reverse proxy, and route all requests to this backend. Forwarded client addresses are trusted only from loopback proxies, which covers the local cloudflared tunnel. Configure the exact trusted proxy addresses if your deployment uses a remote reverse proxy.

Back up `ACTIVITY_DATA_DIR` (defaults to `./data/activity`). Run **one backend process per data directory**. A lock file rejects a second backend; after an unclean crash, confirm no backend is running before removing `server.lock`. For multiple replicas, replace the local-file store and in-memory authentication sessions with a shared transactional store. Old table files are retained; archive them according to your retention policy.

## Troubleshooting

- **Voice invite unavailable:** check bot Create Invite permission and that Activities are enabled. The launcher still offers Open Activity and legacy play.
- **Blank iframe / failed fetch:** confirm `npm run activity:build` completed, `npm run activity:start` is running, the tunnel is open, and the saved `/` mapping matches the current HTTPS tunnel hostname.
- **Authorization failed:** check the application client ID, OAuth client secret and bot token all belong to the same app. Close/reopen to obtain a new authorization code.
- **Join this Activity before playing:** Discord has not confirmed membership in this instance. Rejoin through the same invite.
- **Board changed:** another action won the revision race. The latest board syncs automatically; retry the move.
- **Finding players keeps waiting:** another real user must search on this backend with the same time, increment and spectator setting. No synthetic opponents are added.
- **Friend not listed:** they must open this Activity and finish Discord authentication. The friend picker lists available people in your current Activity, not your entire Discord friends list.
- **No room settings edit button:** only a friend-room host can save settings, and only before the match starts. Both players must ready again after any settings change.
- **Old legacy game missing:** legacy games still belong to the bot process that created them. Activity persistence does not migrate old message games.

Live launch, OAuth and a real two-user Discord session must be smoke-tested after the Portal/hosting configuration. Automated tests cannot verify your Portal settings or Discord client permissions.
