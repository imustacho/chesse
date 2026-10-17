# chesse assets

One current version per asset. Emoji names remain stable when the images are replaced.

| Folder | Contents |
| --- | --- |
| `branding/logos/` | Four high-resolution logo variations: Sunny, Midnight, Royal, and Cheese Knight |
| `branding/icons/` | High-resolution play, history, pawn, and crown masters |
| `expressions/` | Eight high-resolution transparent mascot expressions; game/error thumbnails use these files directly |
| `emojis/` | **Seven upload-ready PNGs only. Select all seven for Discord bulk upload.** |
| `chess/pieces/light/` | Six light pieces from the latest matching chess-piece reference |
| `chess/pieces/dark/` | Six dark pieces from the same reference |
| `previews/` | Current board, chess-piece, emoji, expression, and logo galleries |
| `references/` | Original authoring references, kept for provenance and rebuilding; not used as bot UI images |
| `metadata/` | Generation prompts, piece crop coordinates, emoji usage manifest, and validated asset catalog |
| `config/` | Optional emoji ID overrides; live Discord emojis are resolved by name |

## Uploading emojis

Upload every PNG in `emojis/` using its filename without `.png` as the emoji name:

| Name | Use |
| --- | --- |
| `chesse_play` | Header, Accept, Join game |
| `chesse_piece_pawn` | Make a move |
| `chesse_history` | Refresh |
| `chesse_face_angry` | Decline |
| `chesse_face_lose` | Resign |
| `chesse_face_check` | Check warning |
| `chesse_crown` | Winner footer |

The bot detects server emoji updates. If multiple emojis share a name, it chooses the newest available upload. A deleted emoji falls back to a standard symbol rather than breaking the message. Thumbnails use high-resolution PNG attachment URLs and do not require emoji uploads.

## Rebuilding and validation

```sh
npm run assets:build
npm run assets:validate
```

The build extracts both chess-piece sets, exports 128×128 emojis, regenerates the five previews, and validates dimensions, transparency, file sizes, and section counts. High-resolution generated masters are preserved. The original references are small images; extracting pieces cannot invent missing source detail. Runtime normalization gives the light/dark versions of each piece the same visible size and baseline.

The previous asset tree is recoverable from `.backups/assets-before-organization-20261017.zip`. Obsolete generated ZIP packages are stored in `.backups/exports/`.
