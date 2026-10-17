import { Chess } from 'chess.js';
import { UserFacingError } from '../errors/UserFacingError.js';

const PIECES = {
  w: { p: '♙', n: '♘', b: '♗', r: '♖', q: '♕', k: '♔' },
  b: { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚' },
};

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

export class ChessGame {
  constructor({ id, guildId, channelId, challenger, invitedUser }) {
    this.id = id;
    this.guildId = guildId;
    this.channelId = channelId;
    this.messageId = null;
    this.chess = new Chess();
    this.createdAt = Date.now();
    this.lastMove = null;
    this.finishedReason = null;
    this.winnerId = null;
    this.players = {
      white: challenger,
      black: invitedUser ?? null,
    };
    this.invitedUserId = invitedUser?.id ?? null;
    this.status = invitedUser ? 'pending' : 'open';
  }

  getPlayerColor(userId) {
    if (this.players.white?.id === userId) return 'w';
    if (this.players.black?.id === userId) return 'b';
    return null;
  }

  getUserForColor(color) {
    return color === 'w' ? this.players.white : this.players.black;
  }

  join(user) {
    if (this.status !== 'open') {
      throw new UserFacingError('This game is no longer open. Start a new game with `/chess`.');
    }
    if (this.players.white.id === user.id) {
      throw new UserFacingError('You cannot join your own game as an opponent. Wait for another player to join.');
    }
    this.players.black = user;
    this.status = 'active';
  }

  acceptInvite(user) {
    if (this.status !== 'pending') throw new UserFacingError('This invitation is no longer valid. It may have already been accepted or declined.');
    if (user.id !== this.invitedUserId) throw new UserFacingError('This invitation is not for you. Only the invited player can accept it.');
    this.players.black = user;
    this.status = 'active';
  }

  declineInvite(user) {
    if (this.status !== 'pending') throw new UserFacingError('This invitation is no longer valid. It may have already been accepted or declined.');
    if (user.id !== this.invitedUserId) throw new UserFacingError('This invitation is not for you. Only the invited player can decline it.');
    this.status = 'finished';
    this.finishedReason = 'Invitation declined.';
  }

  resign(userId) {
    const color = this.getPlayerColor(userId);
    if (!color) throw new UserFacingError('You are not a player in this game. You cannot resign for another player.');
    if (this.status !== 'active') throw new UserFacingError('This game is not active. You can only resign after the game has started.');
    this.status = 'finished';
    this.winnerId = this.getUserForColor(color === 'w' ? 'b' : 'w').id;
    this.finishedReason = `<@${userId}> resigned.`;
  }

  makeMove(userId, input) {
    if (this.status !== 'active') throw new UserFacingError('This game is not active. Start a new game or wait for your opponent to join.');
    const color = this.getPlayerColor(userId);
    if (!color) throw new UserFacingError('You are not a player in this game. Only the two players can make moves.');
    if (this.chess.turn() !== color) throw new UserFacingError('It is your opponent’s turn. Wait for their move before playing.');

    const move = parseMove(this.chess, input);
    if (!move) throw new UserFacingError('Invalid move. The piece cannot move there, the path is blocked, or the move leaves your king in check. Use `e4`, `Nf3`, `e2e4`, or `e7e8q` for promotion.');

    this.lastMove = move.san;
    if (this.chess.isGameOver()) {
      this.status = 'finished';
      if (this.chess.isCheckmate()) {
        this.winnerId = this.getUserForColor(this.chess.turn() === 'w' ? 'b' : 'w').id;
        this.finishedReason = 'Checkmate!';
      } else if (this.chess.isStalemate()) {
        this.finishedReason = 'Stalemate — draw.';
      } else if (this.chess.isDraw()) {
        this.finishedReason = 'Draw.';
      } else {
        this.finishedReason = 'Game over.';
      }
    }
    return move;
  }

  getStatusText() {
    if (this.status === 'open') return 'Waiting for an opponent';
    if (this.status === 'pending') return `<@${this.invitedUserId}> has been invited`;
    if (this.status === 'finished') return this.finishedReason ?? 'Game over.';
    const side = this.chess.turn() === 'w' ? 'White' : 'Black';
    const player = this.getUserForColor(this.chess.turn());
    return `${side} to move — <@${player.id}>`;
  }

  getBoardText() {
    const board = this.chess.board();
    const lines = ['```', '    a  b  c  d  e  f  g  h'];
    for (let row = 0; row < 8; row += 1) {
      const rank = 8 - row;
      const cells = board[row].map((piece) => {
        if (!piece) return '·';
        return PIECES[piece.color][piece.type];
      });
      lines.push(`${rank}  ${cells.join(' ')}`);
    }
    lines.push('```');
    return lines.join('\n');
  }
}

function parseMove(chess, rawInput) {
  const input = rawInput.trim();
  if (!input) return null;

  try {
    if (/^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(input)) {
      const from = input.slice(0, 2).toLowerCase();
      const to = input.slice(2, 4).toLowerCase();
      const promotion = input[4]?.toLowerCase();
      return chess.move({ from, to, ...(promotion ? { promotion } : {}) });
    }
    return chess.move(input, { strict: true });
  } catch {
    return null;
  }
}

export function createGameId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
