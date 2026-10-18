import { Chess } from 'chess.js';

const names = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };

export async function loadPieces() {
  await Promise.all(['w', 'b'].flatMap(color => Object.keys(names).map(async type => {
    const image = new Image(); image.src = `./assets/pieces/${color}${type}.png`; await image.decode();
  })));
}

// Native DOM pieces: no Canvas. Stable buttons preserve keyboard focus across updates.
export function drawBoard(board, room, flipped, selected, targets) {
  const chess = new Chess(room.fen), last = room.lastMove;
  if (board.children.length !== 64) {
    for (let i = 0; i < 64; i++) {
      const button = document.createElement('button');
      button.className = 'square'; button.type = 'button';
      board.append(button);
    }
  }
  for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
    const square = `${'abcdefgh'[flipped ? 7 - col : col]}${flipped ? row + 1 : 8 - row}`;
    const node = board.children[row * 8 + col], piece = chess.get(square);
    node.dataset.square = square;
    node.disabled = room.status === 'lobby';
    node.className = `square ${(row + col) % 2 ? 'dark-square' : 'light-square'}`;
    node.classList.toggle('last-square', !!last && [last.from, last.to].includes(square));
    node.classList.toggle('selected-square', selected === square);
    node.classList.toggle('legal-square', targets.includes(square));
    node.classList.toggle('occupied', !!piece);
    node.classList.toggle('check-square', !!room.check && piece?.type === 'k' && piece.color === room.turn);
    node.setAttribute('aria-label', `${square}${piece ? `, ${piece.color === 'w' ? 'gold' : 'charcoal'} ${names[piece.type]}` : ', empty'}${targets.includes(square) ? ', legal move' : ''}`);
    node.setAttribute('aria-pressed', String(selected === square));
    const key = piece ? piece.color + piece.type : '';
    if (node.dataset.piece !== key) {
      node.replaceChildren();
      if (piece) {
        const image = new Image(); image.className = 'piece'; image.src = `./assets/pieces/${key}.png`;
        image.alt = ''; image.draggable = false; node.append(image);
      }
      node.dataset.piece = key;
    }
    node.classList.toggle('movable', room.players[room.turn]?.id === room.me && !room.result && room.legal.some(move => move.from === square));
  }
  document.querySelector('.rank-labels').replaceChildren(...Array.from({ length: 8 }, (_, i) => {
    const span = document.createElement('span'); span.textContent = String(flipped ? i + 1 : 8 - i); return span;
  }));
  document.querySelector('.file-labels').replaceChildren(...Array.from({ length: 8 }, (_, i) => {
    const span = document.createElement('span'); span.textContent = 'abcdefgh'[flipped ? 7 - i : i]; return span;
  }));
}

// Pointer Events cover mouse, pen and touch. Pointer capture keeps off-board releases safe.
export function enablePieceDragging(board, { canMove, select, drop, tap }) {
  let drag = null, suppressClick = false;
  function clear() {
    if (!drag) return;
    const { source, ghost, pointerId } = drag;
    ghost?.remove(); source.classList.remove('drag-origin');
    board.querySelector('.drop-target')?.classList.remove('drop-target');
    drag = null;
    if (board.hasPointerCapture(pointerId)) board.releasePointerCapture(pointerId);
  }
  board.addEventListener('pointerdown', event => {
    if (drag || !event.isPrimary || event.button !== 0) return;
    const source = event.target.closest('.square');
    if (!source || !canMove(source.dataset.square)) return;
    drag = { source, square: source.dataset.square, pointerId: event.pointerId, x: event.clientX, y: event.clientY, ghost: null };
    board.setPointerCapture(event.pointerId);
  });
  board.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (!drag.ghost && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 5) return;
    if (!drag.ghost) {
      select(drag.square);
      const piece = drag.source.querySelector('.piece');
      if (!piece) return clear();
      drag.ghost = piece.cloneNode(); drag.ghost.className = 'drag-piece';
      drag.ghost.style.width = `${drag.source.getBoundingClientRect().width}px`;
      document.body.append(drag.ghost); drag.source.classList.add('drag-origin');
    }
    event.preventDefault();
    drag.ghost.style.left = `${event.clientX}px`; drag.ghost.style.top = `${event.clientY}px`;
    board.querySelector('.drop-target')?.classList.remove('drop-target');
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('.square');
    if (target && board.contains(target)) target.classList.add('drop-target');
  });
  board.addEventListener('pointerup', event => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const { square, ghost } = drag;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('.square');
    clear();
    suppressClick = true; setTimeout(() => { suppressClick = false; }, 0);
    if (ghost) {
      drop(square, target && board.contains(target) ? target.dataset.square : null);
    } else tap(square);
  });
  board.addEventListener('pointercancel', clear);
  board.addEventListener('lostpointercapture', clear);
  board.addEventListener('click', event => {
    if (suppressClick) return;
    const square = event.target.closest('.square')?.dataset.square;
    if (square) tap(square);
  });
  window.addEventListener('blur', clear);
  clear.isDragging = () => !!drag?.ghost;
  return clear;
}
