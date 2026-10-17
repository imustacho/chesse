import test from 'node:test';
import assert from 'node:assert/strict';
import { Collection } from 'discord.js';
import { configureBrand, brandEmoji } from '../src/ui/brand.js';
import { buildChessPanel } from '../src/ui/components.js';
import { ChessGame } from '../src/chess/ChessGame.js';

test('deleted persisted emoji IDs are not sent to Discord and reuploaded emojis resolve by current name', () => {
  const emojis = new Collection();
  const client = { application: { emojis: { cache: new Collection() } }, guilds: { cache: new Collection([['g', { emojis: { cache: emojis } }]]) } };
  configureBrand(client);
  try {
    assert.equal(brandEmoji('chesse_face_angry', '✖️', 'g'), '✖️');
    const game = new ChessGame({ id: 'invite', guildId: 'g', challenger: { id: 'w' }, invitedUser: { id: 'b' } });
    const buttons = buildChessPanel(game).components[0].toJSON().components.find(c => c.type === 1).components;
    assert.equal(buttons[1].emoji.name, '✖️');
    assert.equal(buttons[1].emoji.id, undefined);
    emojis.set('new-id', { id: 'new-id', name: 'chesse_face_angry', available: true });
    assert.equal(brandEmoji('chesse_face_angry', '✖️', 'g').id, 'new-id');
    emojis.get('new-id').available = false;
    assert.equal(brandEmoji('chesse_face_angry', '✖️', 'g'), '✖️');
    emojis.delete('new-id');
    assert.equal(brandEmoji('chesse_face_angry', '✖️', 'g'), '✖️');
    emojis.set('crown-id', { id: 'crown-id', name: 'chesse_crown', available: true });
    assert.equal(brandEmoji('chesse_crown', '👑', 'g').id, 'crown-id');
    emojis.set('100', { id: '100', name: 'chesse_play', available: true });
    emojis.set('200', { id: '200', name: 'chesse_play', available: true });
    assert.equal(brandEmoji('chesse_play', '▶️', 'g').id, '200');
  } finally { configureBrand(undefined); }
});
