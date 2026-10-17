import test from 'node:test';
import assert from 'node:assert/strict';
import { UserFacingError } from '../src/errors/UserFacingError.js';
import { buildErrorPanel, handleInteractionError, errorMessage } from '../src/errors/interactionErrorHandler.js';
import { ChessGame } from '../src/chess/ChessGame.js';
import { buildChessPanel, buildInfoPanel } from '../src/ui/components.js';

function assertNoColor(value) {
  if (!value || typeof value !== 'object') return;
  assert.equal(Object.hasOwn(value, 'accent_color'), false);
  for (const item of Object.values(value)) assertNoColor(item);
}
const createGame = () => new ChessGame({ id: 'test', challenger: { id: 'w', username: 'white' }, invitedUser: null });

test('all three face thumbnails produce private, colorless Components v2 messages with explicit reasons', () => {
  const message = 'You cannot join your own game as an opponent.';
  for (const [choice, name] of [[0, 'check'], [1, 'checkmate'], [2, 'blunder']]) {
    const panel = buildErrorPanel(new UserFacingError(message), null, choice);
    assert.equal(panel.flags, 32768 | 64);
    assert.equal(panel.content, undefined);
    const container = panel.components[0].toJSON();
    assert.equal(container.components[0].components[1].content, message);
    assert.equal(container.components[0].accessory.media.url, `attachment://chesse_face_${name}.png`);
    assert.equal(panel.files[0].name, `chesse_face_${name}.png`);
    assert.match(panel.files[0].attachment, /[\\/]assets[\\/]expressions[\\/]/);
    assertNoColor(container);
  }
});

test('random selection always chooses one of the requested expressions', () => {
  for (let i = 0; i < 30; i++) {
    const container = buildErrorPanel(new UserFacingError('Invalid move.')).components[0].toJSON();
    assert.match(container.components[0].accessory.media.url, /^attachment:\/\/chesse_face_(check|checkmate|blunder)\.png$/);
  }
});

test('handler defers private errors before uploading HD images and follows up without editing acknowledged games', async () => {
  for (const state of [{}, { replied: true }, { deferred: true }]) {
    const calls = [];
    const interaction = { ...state, guildId: null, deferReply: async p => calls.push(['deferReply', p]), editReply: async p => calls.push(['editReply', p]), followUp: async p => calls.push(['followUp', p]) };
    assert.equal(await handleInteractionError(interaction, new UserFacingError('It is your opponent’s turn.')), true);
    if (state.replied || state.deferred) {
      assert.equal(calls.length, 1);
      assert.equal(calls[0][0], 'followUp');
      assert.equal(calls[0][1].flags & 64, 64);
    } else {
      assert.deepEqual(calls.map(c => c[0]), ['deferReply', 'editReply']);
      assert.equal(calls[0][1].flags, 64);
      assert.equal(calls[1][1].flags, 32768);
    }
  }
});

test('known technical errors are explained without exposing raw request data', () => {
  assert.match(errorMessage({ code: 50013 }), /permission/);
  assert.match(errorMessage({ code: 10008 }), /deleted/);
  assert.match(errorMessage({ code: 'ENOTFOUND' }), /DNS/);
  assert.match(errorMessage({ code: 50035, rawError: { errors: { components: { _errors: [{ code: 'COMPONENT_INVALID_EMOJI' }] } } } }), /emoji was deleted/);
  assert.ok(!errorMessage(new Error('authorization=secret')).includes('secret'));
});

test('invalid participation, turn and move errors retain precise reasons and do not change state', () => {
  const game = createGame();
  assert.throws(() => game.join({ id: 'w' }), error => error instanceof UserFacingError && /join your own game/.test(error.message));
  game.join({ id: 'b', username: 'black' });
  const fen = game.chess.fen();
  assert.throws(() => game.makeMove('b', 'e5'), /opponent’s turn/);
  assert.throws(() => game.makeMove('w', 'e2e5'), /Invalid move/);
  assert.equal(game.chess.fen(), fen);
});

test('all game states and info panel omit container color', () => {
  const game = createGame();
  assertNoColor(buildChessPanel(game).components[0].toJSON());
  game.join({ id: 'b', username: 'black' });
  assertNoColor(buildChessPanel(game).components[0].toJSON());
  game.resign('b');
  assertNoColor(buildChessPanel(game).components[0].toJSON());
  assertNoColor(buildInfoPanel().components[0].toJSON());
});
