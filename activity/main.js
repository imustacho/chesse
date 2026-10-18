import { DiscordSDK } from '@discord/embedded-app-sdk';
import { drawBoard, enablePieceDragging, loadPieces } from './board.js';
import { demoSnapshot, demoAct } from './preview.js';
import './style.css';

const $ = s => document.querySelector(s);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const params = new URLSearchParams(location.search);
const preview = params.get('preview') === '1' && ['localhost', '127.0.0.1', ''].includes(location.hostname);
let sdk, session, snapshot, room, selected, flipped = false, orientation, pending = false, stopped = false, pollTimer, setupMode, receivedAt = performance.now(), leaveAfterResign = false, mutationEpoch = 0;
const button = (action, label, extra = '', quiet = false) => `<button class="button${quiet ? ' quiet' : ''}" data-action="${action}" ${extra} ${pending ? 'disabled' : ''}>${label}</button>`;
const timeControl = s => s.minutes ? `${s.minutes}+${s.increment}` : 'Untimed';
const color = () => ['w', 'b'].find(c => room?.players[c]?.id === snapshot?.me.id);
const active = () => room?.status === 'active';
function error(message) { $('#toast span').textContent = message; $('#toast').hidden = false; }
$('#toast button').onclick = () => { $('#toast').hidden = true; };
async function api(path, body) {
  const res = await fetch(`./api/${path}`, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(session ? { Authorization: `Bearer ${session}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(12_000) });
  const data = await res.json(); if (!res.ok) { if (res.status === 401) stopped = true; throw new Error(data.error || 'The server could not complete your request.'); } return data;
}
function apply(next) {
  // Do not let a slow poll overwrite a newer local action response.
  if (room && next.room?.id === room.id && next.room.version < room.version) return;
  if (room?.id !== next.room?.id || room?.version !== next.room?.version) { cancelDrag(); selected = null; $('#promotion').close(); }
  snapshot = next; room = next.room; receivedAt = performance.now();
  const own = color(), key = `${room?.id}:${own}`;
  if (orientation !== key) { orientation = key; flipped = own === 'b'; }
  render();
}
async function act(action, fields = {}) {
  if (pending) return;
  pending = true; mutationEpoch++;
  try { apply(preview ? demoAct(snapshot, action, fields) : await api('room', { action, version: room?.version, ...fields })); }
  catch (e) { error(e.message); }
  finally { pending = false; if (snapshot) render(); }
}
function render() {
  $('#lobby').hidden = snapshot.screen !== 'lobby'; $('#game').hidden = snapshot.screen !== 'room';
  $('#scene').classList.toggle('in-menu', snapshot.screen === 'lobby');
  $('#settings').hidden = !room;
  if (!room) return renderLobby();
  renderMatch();
}
function renderLobby() {
  $('#identity').textContent = `${snapshot.me.name} · ${preview ? 'Offline preview' : '@' + snapshot.me.username}`;
  $('#invitations').innerHTML = snapshot.invites.map(i => `<div class="invitation"><div><strong>${esc(i.host?.name)} invited you</strong><p>${esc(i.name)} · ${timeControl(i.settings)}</p></div><div class="actions">${button('accept-invite', 'Accept', `data-room="${i.id}"`)}${button('decline-invite', 'Decline', `data-room="${i.id}"`, true)}</div></div>`).join('');
  $('#search').hidden = !snapshot.search; $('#main-menu-actions').hidden = !!snapshot.search;
  $('#create').disabled = $('#find').disabled = $('#play-local').disabled = !!snapshot.search || pending;
  $('#menu-face').src = `./assets/expressions/chesse_face_${snapshot.search ? 'think' : 'happy'}.png`;
  if (snapshot.search) {
    const local = snapshot.search.scope === 'local';
    $('#search-title').textContent = local ? 'Waiting for a room player…' : 'Finding players…';
    $('#search-description').textContent = local ? 'Ask someone here to press Play in this room. You will be paired together.' : `${timeControl(snapshot.search.settings)} · ${snapshot.search.queueSize} in queue · matching across chesse Activities`;
  }
  $('#people-count').textContent = `(${snapshot.participants.length})`;
  $('#people').innerHTML = snapshot.participants.map(p => `<div class="person"><span class="initial">${esc(p.name.slice(0, 1))}</span><span><strong>${esc(p.name)}</strong><small>@${esc(p.username)}${p.id === snapshot.me.id ? ' · You' : ''}</small></span><span class="presence">${p.busy ? 'In a room' : p.searching ? 'Searching' : 'Available'}</span></div>`).join('') || '<p class="muted">Invite a friend to this Activity to see them here.</p>';
  $('#rooms').innerHTML = snapshot.rooms.map(r => `<div class="table-row"><div><strong>${esc(r.name)}</strong><p>${esc(r.players.w?.name || 'Open seat')} vs ${esc(r.players.b?.name || 'Open seat')} · ${timeControl(r.settings)} · ${esc(r.status)} · ${r.spectators} watching</p></div><div class="actions">${r.mode !== 'multiplayer' && r.status === 'waiting' && !r.reserved ? button('join-room', 'Join', `data-room="${r.id}"`) : ''}${r.settings.allowSpectators ? button('watch-room', 'Watch', `data-room="${r.id}"`, true) : '<span class="muted small">Spectators off</span>'}</div></div>`).join('') || '<p class="empty">No tables yet. Be the first to open one.</p>';
  drawBoard($('#board-controls'), { status: 'lobby', fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', players: {}, turn: 'w', legal: [] }, false, null, []);
}
function player(c) {
  const p = room.players[c], own = p?.id === snapshot.me.id, online = p && room.online.includes(p.id);
  return `<img src="./assets/pieces/${c}p.png" alt="${c === 'w' ? 'Gold' : 'Charcoal'} pieces"><div class="player-name"><strong>${esc(p?.name || 'Waiting for a friend')}</strong><small>${p ? `@${esc(p.username)}${own ? ' · You' : ''}${!online ? ' · Reconnecting' : ''}` : room.invitedUserId ? 'Invitation sent' : 'Open seat'}</small></div><span class="clock${active() && room.turn === c ? ' ticking' : ''}" data-clock="${c}"></span>`;
}
function renderMatch() {
  const top = flipped ? 'w' : 'b', bottom = flipped ? 'b' : 'w';
  $('#player-black').innerHTML = player(top); $('#player-white').innerHTML = player(bottom);
  $('#player-white').classList.toggle('your-side', color() === bottom); $('#player-black').classList.toggle('your-side', color() === top);
  $('#time-control').textContent = timeControl(room.settings); $('#room-mode').textContent = `${room.mode === 'local' ? 'Same room' : room.mode === 'friends' ? 'Friends' : 'Multiplayer'} · Round ${room.round}`;
  let title = 'Waiting for a friend.', detail = 'Share your room code or send an invitation.', expression = 'happy';
  if (room.mode === 'multiplayer' && room.status === 'waiting') { title = 'Your opponent left.'; detail = 'Return to the lobby to find another player.'; expression = 'lose'; }
  if (room.status === 'ready') { title = 'Your table is ready.'; detail = 'Both players must press Ready to start.'; expression = 'think'; }
  if (active()) {
    title = color() ? (color() === room.turn ? 'Your move, chef.' : 'Their move, chef.') : `${room.players[room.turn].name} to move.`;
    detail = color() ? 'Grab a piece and keep the cheese rolling.' : 'You are watching this match.'; expression = color() === room.turn ? 'think' : 'happy';
    if (room.check) { title = 'Check!'; detail = `${room.players[room.turn].name}'s king needs some help.`; expression = 'check'; }
  }
  if (room.result) { const winner = Object.values(room.players).find(p => p?.id === room.result.winner); title = winner ? `${winner.name} wins!` : 'A shared crown.'; detail = room.result.reason; expression = winner ? (!color() || winner.id === snapshot.me.id ? 'win' : room.result.reason === 'Checkmate' ? 'checkmate' : 'lose') : 'happy'; }
  $('#expression').src = `./assets/expressions/chesse_face_${expression}.png`; $('#status-text').textContent = title; $('#status-detail').textContent = detail;
  let actions = room.mode === 'multiplayer' && room.status === 'waiting' ? button('return-lobby', 'Back to matchmaking') : '';
  if (color() && room.status === 'ready') actions = button('ready', room.ready.includes(snapshot.me.id) ? 'Ready ✓ · Unready' : 'Ready to play') + `<span class="muted small">${room.ready.length}/2 ready</span>`;
  if (color() && active()) {
    actions = button('offer-draw', 'Offer draw', '', true) + button('resign', 'Resign', '', true);
    if (room.drawOffer) actions = room.drawOffer === snapshot.me.id ? '<p>Draw offered. Waiting for your opponent.</p>' + button('resign', 'Resign', '', true) : '<p>Your opponent offered a draw.</p>' + button('accept-draw', 'Accept draw') + button('decline-draw', 'Keep playing', '', true) + button('resign', 'Resign', '', true);
  }
  if (color() && room.result) actions = room.rematch.includes(snapshot.me.id) ? '<p>Waiting for your opponent to accept the rematch…</p>' : button('rematch', room.rematch.length ? 'Accept rematch' : 'Play again');
  $('#match-actions').innerHTML = actions;
  $('#room-sharing').hidden = !room.code; $('#share-code').value = room.code || '';
  $('#last-move').textContent = room.lastMove ? `Last move: ${room.lastMove.san}` : 'No moves yet.';
  $('#spectator-count').textContent = room.settings.allowSpectators ? `${room.spectators.length} watching${!color() ? ' · You are spectating' : ''}` : 'Spectators disabled';
  $('#spectators').innerHTML = room.spectators.map(p => `<span title="@${esc(p.username)}">${esc(p.name)}</span>`).join('');
  renderBoard(); updateClocks();
}
function updateClocks() {
  if (!room) return;
  for (const c of ['w', 'b']) {
    let ms = room.clocks[c]; if (active() && room.turn === c && room.settings.minutes) ms = Math.max(0, ms - (performance.now() - receivedAt));
    const seconds = Math.ceil(ms / 1000); const node = $(`[data-clock="${c}"]`);
    if (node) node.textContent = room.settings.minutes ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : '∞';
  }
}
setInterval(updateClocks, 250);
function renderBoard() { if (room && !cancelDrag.isDragging()) drawBoard($('#board-controls'), room, flipped, selected, selected ? room.legal.filter(m => m.from === selected).map(m => m.to) : []); }
function moveTo(from, to) {
  if (!active() || color() !== room.turn || pending) return;
  const choices = room.legal.filter(m => m.from === from && m.to === to);
  if (!choices.length) { selected = null; return renderBoard(); }
  if (choices.some(m => m.promotion)) {
    $('.promotion-options').innerHTML = choices.map(m => `<button data-piece="${m.promotion}" aria-label="Promote to ${{ q: 'queen', r: 'rook', b: 'bishop', n: 'knight' }[m.promotion]}"><img src="./assets/pieces/${color()}${m.promotion}.png" alt=""></button>`).join('');
    $('.promotion-options').onclick = e => { const piece = e.target.closest('[data-piece]'); if (piece) { $('#promotion').close(); act('move', { from, to, promotion: piece.dataset.piece }); } }; $('#promotion').showModal();
  } else act('move', { from, to });
}
const cancelDrag = enablePieceDragging($('#board-controls'), {
  canMove: square => !pending && active() && color() === room.turn && room.legal.some(m => m.from === square),
  select: square => { selected = square; renderBoard(); },
  drop: (from, to) => { if (to) moveTo(from, to); else { selected = null; renderBoard(); } },
  tap: square => { if (!active() || color() !== room.turn || pending) return; if (selected && room.legal.some(m => m.from === selected && m.to === square)) return moveTo(selected, square); selected = selected === square ? null : room.legal.some(m => m.from === square) ? square : null; renderBoard(); },
});
function friendOptions() { return snapshot.participants.filter(p => p.id !== snapshot.me.id && !p.busy && !p.searching).map(p => `<option value="${esc(p.id)}">${esc(p.name)} (@${esc(p.username)})</option>`).join(''); }
function setup(mode) {
  setupMode = mode; const editable = mode !== 'settings' || room.hostId === snapshot.me.id && room.mode !== 'multiplayer' && ['waiting', 'ready'].includes(room.status);
  $('#room-sharing').hidden = mode !== 'settings' || !room?.code;
  $('#spectator-area').hidden = mode !== 'settings';
  $('#setup-title').textContent = mode === 'find' ? 'Match settings' : mode === 'settings' ? 'Room settings' : 'Play with a friend';
  $('#setup-description').textContent = mode === 'find' ? 'We match real players across chesse Activities. Both players confirm before the clock starts.' : 'Changing settings clears both ready confirmations.';
  $('#friend-fields').hidden = mode !== 'create'; $('#visibility-field').hidden = mode === 'find';
  $('#friend').innerHTML = '<option value="">Anyone with my code</option>' + friendOptions();
  const s = mode === 'settings' ? room.settings : { minutes: 10, increment: 0, allowSpectators: true, visibility: 'private' };
  $('#minutes').value = s.minutes; $('#increment').value = s.increment; $('#allow-spectators').checked = s.allowSpectators; $('#public-room').checked = s.visibility === 'public';
  for (const id of ['minutes', 'increment', 'allow-spectators', 'public-room']) $('#' + id).disabled = !editable;
  $('#save-setup').hidden = !editable; $('#save-setup').textContent = mode === 'find' ? 'Find players' : mode === 'settings' ? 'Save settings' : 'Create room';
  $('#settings-note').textContent = editable ? 'Spectators can watch, but cannot move pieces or change settings.' : 'Only the host can change settings before the match starts.';
  $('#room-friend').innerHTML = '<option value="">Open seat · cancel invitation</option>' + friendOptions(); $('#invite-form').hidden = !(mode === 'settings' && editable && room.mode === 'friends' && room.status === 'waiting');
  $('#setup').showModal();
}
function settingsValue() { return { minutes: Number($('#minutes').value), increment: Number($('#increment').value), allowSpectators: $('#allow-spectators').checked, visibility: $('#public-room').checked ? 'public' : 'private' }; }
$('#create').onclick = () => setup('create'); $('#find').onclick = () => setup('find'); $('#settings').onclick = () => setup('settings');
$('#play-local').onclick = () => act('find-local');
$('#setup-form').onsubmit = e => { e.preventDefault(); const action = setupMode === 'find' ? 'find-players' : setupMode === 'settings' ? 'settings' : 'create-room'; $('#setup').close(); act(action, { settings: settingsValue(), friendId: $('#friend').value, name: $('#room-name').value }); };
$('#invite-form').onsubmit = e => { e.preventDefault(); $('#setup').close(); act('invite', { invitedUserId: $('#room-friend').value || null }); };
$('#cancel-setup').onclick = () => $('#setup').close();
$('#minutes').onchange = () => { $('#increment').disabled = $('#minutes').value === '0'; if ($('#minutes').value === '0') $('#increment').value = '0'; };
$('#join-code').onsubmit = e => { e.preventDefault(); $('#join-dialog').close(); act(e.submitter?.value || 'join-room', { code: $('#room-code').value }); };
$('#browse').onclick = () => $('#tables-dialog').showModal();
$('#players-menu').onclick = () => $('#players-dialog').showModal();
$('#join-menu').onclick = () => $('#join-dialog').showModal();
$('#flip').onclick = () => { cancelDrag(); flipped = !flipped; renderMatch(); };
$('#invite').onclick = async () => { try { if (!sdk) throw new Error('Discord invitations are available inside Discord.'); await sdk.commands.openInviteDialog(); } catch (e) { error(e.message); } };
$('#copy-code').onclick = async () => { try { await navigator.clipboard.writeText(room.code); $('#copy-code').textContent = 'Copied'; } catch { $('#share-code').select(); error('Select and copy the room code to share it.'); } };
document.addEventListener('click', e => {
  const close = e.target.closest('[data-close]'); if (close) return $('#' + close.dataset.close).close();
  const node = e.target.closest('[data-action]'); if (!node) return;
  for (const id of ['tables-dialog', 'players-dialog']) $('#' + id).close();
  const action = node.dataset.action;
  if (action === 'resign' || action === 'return-lobby' && color() && active()) { leaveAfterResign = action === 'return-lobby'; return $('#confirm').showModal(); }
  act(action, node.dataset.room ? { roomId: node.dataset.room } : {});
});
$('#cancel-promotion').onclick = () => $('#promotion').close(); $('#cancel-resign').onclick = () => $('#confirm').close();
$('#confirm-resign').onclick = async () => { $('#confirm').close(); await act('resign'); if (leaveAfterResign && room?.result) await act('return-lobby'); };
async function poll() {
  if (stopped) return;
  try { const epoch = mutationEpoch; const next = await api('room'); if (epoch === mutationEpoch && !pending) apply(next); $('#connection').hidden = true; } catch (e) { $('#connection').hidden = false; $('#connection').textContent = stopped ? e.message : 'Reconnecting…'; }
  finally { if (!stopped) pollTimer = setTimeout(poll, document.hidden ? 4000 : 1000); }
}
window.addEventListener('pagehide', () => { stopped = true; clearTimeout(pollTimer); });
async function init() {
  await loadPieces();
  if (preview) return apply(demoSnapshot(params.get('screen')));
  if (!params.has('frame_id')) throw new Error('Launch chesse from /chess in Discord to find a table.');
  const { clientId } = await api('config'); sdk = new DiscordSDK(clientId);
  await Promise.race([sdk.ready(), new Promise((_, reject) => setTimeout(() => reject(new Error('Reopen the Activity to reconnect to Discord.')), 15_000))]);
  const { code } = await sdk.commands.authorize({ client_id: clientId, response_type: 'code', state: crypto.randomUUID(), prompt: 'none', scope: ['identify'] });
  const auth = await api('session', { code, instanceId: sdk.instanceId }); await sdk.commands.authenticate({ access_token: auth.access_token }); session = auth.session;
  await poll();
}
init().catch(e => error(e.message));
