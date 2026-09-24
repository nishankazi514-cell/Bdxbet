/* ============================================================
   ======================  PROFILE / ACCOUNT  =================
   ============================================================ */
const STORAGE_KEY = 'ludoking_profile_v1';
const SETTINGS_KEY = 'ludoking_settings_v1';

const THEMES = [
  { id: 'classic',  name: 'ক্লাসিক ব্লু',    c1: '#142c52', c2: '#050a14', accent: '#ffcc00' },
  { id: 'royal',    name: 'রয়্যাল পার্পল',  c1: '#3b1d63', c2: '#0a0414', accent: '#c792ff' },
  { id: 'emerald',  name: 'এমারল্ড নাইট',   c1: '#0b3d2e', c2: '#02100a', accent: '#4ce0a8' },
  { id: 'crimson',  name: 'ক্রিমসন রেড',    c1: '#4a0f18', c2: '#100204', accent: '#ff6b6b' },
  { id: 'sunset',   name: 'সানসেট অরেঞ্জ',  c1: '#5a2a00', c2: '#140600', accent: '#ffab40' },
  { id: 'midnight', name: 'মিডনাইট ব্ল্যাক', c1: '#22222a', c2: '#000000', accent: '#e0e0e0' }
];

const AVATARS = [
  '👨‍💼', '👩‍💼', '🏎️', '👑', '🐯', '🦊', '🐼', '🦁',
  '🐸', '🤖', '👽', '🐲', '🦅', '🐺', '🎩', '😎'
];

let profile = null;
let gameSettings = { sound: true, vibration: true, speed: 'normal', highlight: true };

const SYSTEM_FEE_RATE = 0.10;
const MIN_BET = 5;
const ROOM_EXPIRE_MS = 600000;
const CANCEL_PENALTY_RATE = 0.30;

let pendingGameMode = null;
let pendingBetAmount = 0;
let currentBetInfo = null;
let currentRoom = null;
let gameActive = false;
let amQuitter = false;

function generateUID() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return 'LK-' + s;
}
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}
function formatCoins(n) { return Number(n || 0).toLocaleString('en-US'); }
function formatTimeLeft(ms) {
  const secs = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m + ':' + String(s).padStart(2, '0');
}
function formatMsgTime(ts) {
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  if (isToday) return hh + ':' + mm;
  const dd = String(d.getDate()).padStart(2, '0');
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  return dd + '/' + mo + ' ' + hh + ':' + mm;
}
function showToast(msg) {
  const el = document.getElementById('lk-toast');
  el.innerText = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 2400);
}
function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[c]);
}

function loadProfile() {
  let p = {
    uid: '', name: '', avatar: '👨‍💼', coins: 2500,
    theme: 'classic', matches: 0, wins: 0, loggedIn: false,
    friends: [], friendRequests: [], sentRequests: []
  };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) Object.assign(p, JSON.parse(raw));
  } catch (e) {}
  if (!p.uid) p.uid = generateUID();
  if (!p.name) p.name = 'Guest' + Math.floor(1000 + Math.random() * 9000);
  if (!THEMES.some(t => t.id === p.theme)) p.theme = 'classic';
  if (!Array.isArray(p.friends)) p.friends = [];
  if (!Array.isArray(p.friendRequests)) p.friendRequests = [];
  if (!Array.isArray(p.sentRequests)) p.sentRequests = [];
  profile = p;
  saveProfile();
  return profile;
}
function saveProfile() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(profile)); } catch (e) {}
}
function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) Object.assign(gameSettings, JSON.parse(raw));
  } catch (e) {}
  soundEnabled = gameSettings.sound;
}
function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(gameSettings)); } catch (e) {}
}
function applyTheme(themeId) {
  const t = THEMES.find(x => x.id === themeId) || THEMES[0];
  const root = document.documentElement;
  root.style.setProperty('--theme-c1', t.c1);
  root.style.setProperty('--theme-c2', t.c2);
  root.style.setProperty('--theme-accent', t.accent);
}

function renderProfileUI() {
  if (!profile) return;
  document.getElementById('mpp-avatar').innerText = profile.avatar;
  document.getElementById('mpp-name').innerText = profile.name;
  document.getElementById('mpp-coins').innerText = '🪙 ' + formatCoins(profile.coins);
  document.getElementById('pp-avatar').innerText = profile.avatar;
  document.getElementById('pp-name').innerText = profile.name;
  document.getElementById('pp-uid').innerText = profile.uid;
  document.getElementById('pp-balance').innerText = formatCoins(profile.coins);
  document.getElementById('pp-stats').innerText = profile.wins + ' / ' + profile.matches;

  const loginState = document.getElementById('pp-login-state');
  loginState.innerText = profile.loggedIn
    ? '✅ সার্ভার অ্যাকাউন্টে লগইন করা আছে'
    : 'গেস্ট মোডে খেলছেন (লোকাল প্রোফাইল)';

  const ag = document.getElementById('avatar-grid');
  ag.innerHTML = '';
  AVATARS.forEach(a => {
    const chip = document.createElement('div');
    chip.className = 'avatar-chip' + (a === profile.avatar ? ' selected' : '');
    chip.innerText = a;
    chip.onclick = () => selectAvatar(a);
    ag.appendChild(chip);
  });

  const tg = document.getElementById('theme-grid');
  tg.innerHTML = '';
  THEMES.forEach(t => {
    const sw = document.createElement('div');
    sw.className = 'theme-swatch' + (t.id === profile.theme ? ' selected' : '');
    sw.title = t.name;
    sw.style.background = `radial-gradient(circle at 35% 28%, ${t.c1}, ${t.c2})`;
    sw.onclick = () => selectTheme(t.id);
    tg.appendChild(sw);
  });

  applyProfileToGameCard();
  updateSettingsUI();
  updateProfileMenuCounts();
}

function updateProfileMenuCounts() {
  const friendsEl = document.getElementById('pp-friends-count');
  const inboxEl = document.getElementById('pp-inbox-count');
  if (friendsEl) {
    const c = (profile.friends || []).length;
    friendsEl.innerText = c + ' জন ›';
  }
  if (inboxEl) {
    const c = getTotalConversationCount();
    inboxEl.innerText = c + ' টি চ্যাট ›';
  }
}

function applyProfileToGameCard() {
  const av = document.getElementById('avatar-blue');
  const nm = document.getElementById('name-blue');
  const cn = document.getElementById('coins-blue');
  if (av) av.innerText = profile.avatar;
  if (nm) nm.innerText = profile.name;
  if (cn) cn.innerText = '🪙 ' + formatCoins(profile.coins);
}

function updateSettingsUI() {
  const tsSound = document.getElementById('ts-sound');
  const tsVib = document.getElementById('ts-vibration');
  const tsHi = document.getElementById('ts-highlight');
  if (tsSound) tsSound.classList.toggle('on', gameSettings.sound);
  if (tsVib) tsVib.classList.toggle('on', gameSettings.vibration);
  if (tsHi) tsHi.classList.toggle('on', gameSettings.highlight);
  document.querySelectorAll('#speed-options .speed-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.speed === gameSettings.speed);
  });
}

function openProfile() {
  getAudioCtx();
  renderProfileUI();
  document.getElementById('profile-overlay').classList.add('show');
}
function closeProfile() { document.getElementById('profile-overlay').classList.remove('show'); }
function profileOverlayClick(e) { if (e.target.id === 'profile-overlay') closeProfile(); }
function openProfileFromGame() { closeSettings(); setTimeout(openProfile, 260); }

function selectAvatar(a) {
  profile.avatar = a; saveProfile(); syncCurrentUserToDB(); renderProfileUI();
  showToast('অ্যাভাটার পরিবর্তন হয়েছে!');
}
function selectTheme(id) {
  profile.theme = id; saveProfile(); applyTheme(id); renderProfileUI();
  const t = THEMES.find(x => x.id === id);
  showToast('থিম: ' + (t ? t.name : id));
}

function copyUID() {
  const uid = profile.uid;
  const done = () => showToast('UID কপি হয়েছে: ' + uid);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(uid).then(done).catch(() => fallbackCopy(uid, done));
  } else fallbackCopy(uid, done);
}
function fallbackCopy(text, cb) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); document.body.removeChild(ta); cb();
  } catch (e) { showToast('কপি করা যায়নি'); }
}

function openEditName() {
  const inp = document.getElementById('name-input');
  inp.value = profile.name;
  document.getElementById('name-overlay').classList.add('show');
  setTimeout(() => inp.focus(), 120);
}
function closeNameEditor() { document.getElementById('name-overlay').classList.remove('show'); }
function nameOverlayClick(e) { if (e.target.id === 'name-overlay') closeNameEditor(); }
function saveName() {
  const inp = document.getElementById('name-input');
  let val = (inp.value || '').trim().replace(/[<>]/g, '');
  if (val.length < 2) { showToast('কমপক্ষে ২ অক্ষরের নাম দিন'); return; }
  if (val.length > 14) val = val.slice(0, 14);
  profile.name = val;
  if (LudoAuth.currentUser) LudoAuth.currentUser.name = val;
  saveProfile(); syncCurrentUserToDB(); renderProfileUI(); closeNameEditor();
  showToast('নাম সেভ হয়েছে: ' + val);
}
function resetProfile() {
  if (!confirm('প্রোফাইল রিসেট করলে নাম, UID, ব্যালেন্স সব নতুন হয়ে যাবে। আপনি নিশ্চিত?')) return;
  try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  LudoAuth.currentUser = null;
  loadProfile(); applyTheme(profile.theme); renderProfileUI(); closeProfile();
  showToast('প্রোফাইল রিসেট সম্পন্ন');
}

function openHowToPlay() { document.getElementById('howto-overlay').classList.add('show'); }
function closeHowToPlay() { document.getElementById('howto-overlay').classList.remove('show'); }
function howtoOverlayClick(e) { if (e.target.id === 'howto-overlay') closeHowToPlay(); }

/* ============================================================
   ============ "ক্লাসিক" NAV BUTTON FUNCTION  ================
   ============================================================ */
function openClassicMode() {
  getAudioCtx();
  const cards = document.querySelectorAll('.mode-card');
  cards.forEach(c => {
    c.classList.remove('highlight-pulse');
    void c.offsetWidth;
    c.classList.add('highlight-pulse');
    setTimeout(() => c.classList.remove('highlight-pulse'), 1800);
  });
  showToast('🎮 নিচের কার্ড থেকে মোড বেছে নিন');
  vibrate(15);
}

/* ============================================================
   ==================  VS ANIMATION SCREEN  ==================
   ============================================================ */
const VS_BOT_POOL = [
  { name: 'Rahim',  avatar: '🏎️' },
  { name: 'Karim',  avatar: '🐯' },
  { name: 'Jamal',  avatar: '👑' },
  { name: 'Nasir',  avatar: '🦊' },
  { name: 'Sabbir', avatar: '🐼' },
  { name: 'Mitu',   avatar: '👩‍💼' },
  { name: 'Rana',   avatar: '🦁' },
  { name: 'Tanvir', avatar: '🐸' },
  { name: 'Sohan',  avatar: '🤖' },
  { name: 'Fahim',  avatar: '👽' }
];

function buildVSPlayerList(mode, sourceRoom) {
  const colors = mode === '1v1' ? ['blue', 'green'] : ['blue', 'red', 'green', 'yellow'];
  const used = new Set();
  let botIdx = 0;
  return colors.map((color) => {
    if (color === 'blue') {
      return { color, name: profile.name, avatar: profile.avatar, isMe: true };
    }
    if (sourceRoom && sourceRoom.playerInfo && sourceRoom.playerInfo[color]) {
      const p = sourceRoom.playerInfo[color];
      return { color, name: p.name, avatar: p.avatar, isMe: !!p.isMe };
    }
    let bot = null;
    for (let tries = 0; tries < VS_BOT_POOL.length * 2; tries++) {
      const candidate = VS_BOT_POOL[botIdx % VS_BOT_POOL.length];
      botIdx++;
      if (!used.has(candidate.name)) { bot = candidate; break; }
    }
    if (!bot) bot = VS_BOT_POOL[0];
    used.add(bot.name);
    return { color, name: bot.name, avatar: bot.avatar, isMe: false };
  });
}

function playVSSound() {
  vibrate([30, 20, 60, 20, 100]);
  if (!soundEnabled) return;
  const ctx = getAudioCtx(); if (!ctx) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(120, now);
  osc.frequency.exponentialRampToValueAtTime(1200, now + 0.32);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.13, now + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
  osc.connect(gain); gain.connect(ctx.destination);
  osc.start(now); osc.stop(now + 0.5);
  const t2 = now + 0.35;
  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.type = 'triangle';
  osc2.frequency.setValueAtTime(200, t2);
  osc2.frequency.exponentialRampToValueAtTime(55, t2 + 0.32);
  gain2.gain.setValueAtTime(0.0001, t2);
  gain2.gain.exponentialRampToValueAtTime(0.28, t2 + 0.01);
  gain2.gain.exponentialRampToValueAtTime(0.0001, t2 + 0.35);
  osc2.connect(gain2); gain2.connect(ctx.destination);
  osc2.start(t2); osc2.stop(t2 + 0.36);
  const t3 = now + 0.55;
  [880, 1174, 1568].forEach((freq, i) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = freq;
    const st = t3 + i * 0.06;
    g.gain.setValueAtTime(0.0001, st);
    g.gain.exponentialRampToValueAtTime(0.12, st + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, st + 0.35);
    o.connect(g); g.connect(ctx.destination);
    o.start(st); o.stop(st + 0.36);
  });
}

function buildVSPlayerCard(p) {
  const card = document.createElement('div');
  card.className = 'vs-player' + (p.isMe ? ' me' : '');
  card.innerHTML = `
    <div class="vs-player-avatar">${p.avatar || '👤'}</div>
    <div class="vs-player-name">${escapeHtml(p.name || 'Player')}</div>
  `;
  return card;
}

function showVSScreen(vsPlayers, mode, callback) {
  const screen = document.getElementById('vs-screen');
  const leftEl = document.getElementById('vs-left');
  const rightEl = document.getElementById('vs-right');
  leftEl.innerHTML = '';
  rightEl.innerHTML = '';

  document.getElementById('mode-screen').classList.add('hidden');
  document.getElementById('global-room-screen').classList.add('hidden');
  document.getElementById('friends-screen').classList.add('hidden');
  document.getElementById('inbox-screen').classList.add('hidden');
  document.getElementById('chat-screen').classList.add('hidden');
  document.getElementById('game-wrapper').classList.remove('visible');

  let leftPlayers, rightPlayers;
  if (mode === '1v1' || vsPlayers.length === 2) {
    leftPlayers = [vsPlayers[0]];
    rightPlayers = [vsPlayers[1]];
  } else {
    leftPlayers = [vsPlayers[0], vsPlayers[3]];
    rightPlayers = [vsPlayers[1], vsPlayers[2]];
  }

  leftPlayers.forEach(p => leftEl.appendChild(buildVSPlayerCard(p)));
  rightPlayers.forEach(p => rightEl.appendChild(buildVSPlayerCard(p)));

  screen.classList.remove('show');
  void screen.offsetWidth;
  screen.classList.add('show');

  playVSSound();

  const duration = 2600;
  setTimeout(() => {
    screen.classList.remove('show');
    setTimeout(() => {
      if (typeof callback === 'function') callback();
    }, 380);
  }, duration);
}

/* ============================================================
   ============ MATCH TYPE / BET AMOUNT  LOGIC  ==============
   ============================================================ */
function selectMatchType(mode) {
  getAudioCtx();
  pendingGameMode = mode;
  pendingBetAmount = 0;
  document.getElementById('matchtype-overlay').classList.add('show');
}
function closeMatchType() {
  document.getElementById('matchtype-overlay').classList.remove('show');
  pendingGameMode = null;
}
function chooseNormalMatch() {
  document.getElementById('matchtype-overlay').classList.remove('show');
  const mode = pendingGameMode;
  pendingGameMode = null;
  currentBetInfo = null;
  currentRoom = null;
  document.getElementById('bet-badge').classList.remove('show');
  const vsPlayers = buildVSPlayerList(mode, null);
  showVSScreen(vsPlayers, mode, () => {
    startGame(mode, false);
  });
}
function chooseBetMatch() {
  document.getElementById('matchtype-overlay').classList.remove('show');
  const balEl = document.getElementById('bet-balance-val');
  if (balEl) balEl.innerText = formatCoins(profile.coins);
  pendingBetAmount = 0;
  document.querySelectorAll('#bet-options .bet-btn').forEach(b => b.classList.remove('selected'));
  const custInp = document.getElementById('bet-custom-input');
  if (custInp) custInp.value = '';
  updateBetPreview();
  document.getElementById('bet-overlay').classList.add('show');
}
function closeBetAmount() {
  document.getElementById('bet-overlay').classList.remove('show');
  pendingGameMode = null;
  pendingBetAmount = 0;
}
function selectBetAmount(amount, ev) {
  if (ev) ev.stopPropagation();
  pendingBetAmount = amount;
  document.querySelectorAll('#bet-options .bet-btn').forEach(b => {
    b.classList.toggle('selected', parseInt(b.dataset.amount, 10) === amount);
  });
  const custInp = document.getElementById('bet-custom-input');
  if (custInp) custInp.value = '';
  updateBetPreview();
  vibrate(12);
}
function onCustomBetInput(ev) {
  let val = parseInt(ev.target.value, 10);
  if (isNaN(val)) val = 0;
  pendingBetAmount = val;
  document.querySelectorAll('#bet-options .bet-btn').forEach(b => b.classList.remove('selected'));
  updateBetPreview();
}
function updateBetPreview() {
  const players = pendingGameMode === '1v1' ? 2 : 4;
  const amt = pendingBetAmount || 0;
  const elEntry = document.getElementById('bet-c-entry');
  const elPlayers = document.getElementById('bet-c-players');
  const elPool = document.getElementById('bet-c-pool');
  const elFee = document.getElementById('bet-c-fee');
  const elPrize = document.getElementById('bet-c-prize');
  const elNote = document.getElementById('bet-c-note');
  const elWarn = document.getElementById('bet-warn');
  const startBtn = document.getElementById('bet-start-btn');

  if (amt < 1) {
    elEntry.innerText = '—'; elPlayers.innerText = players + ' জন';
    elPool.innerText = '—'; elFee.innerText = '—'; elPrize.innerText = '—';
    elNote.innerText = 'আপনার এন্ট্রি ফি নির্বাচন করুন';
    elWarn.classList.add('hidden');
    startBtn.disabled = false;
    startBtn.style.opacity = '0.5';
    return;
  }
  const pool = amt * players;
  const fee = Math.round(pool * SYSTEM_FEE_RATE);
  const prize = pool - fee;
  elEntry.innerText = formatCoins(amt) + ' টাকা';
  elPlayers.innerText = players + ' জন';
  elPool.innerText = formatCoins(pool) + ' টাকা';
  elFee.innerText = formatCoins(fee) + ' টাকা';
  elPrize.innerText = formatCoins(prize) + ' টাকা';

  let noteText;
  if (players === 2) {
    noteText = `আপনি ও আপনার বন্ধু ${formatCoins(amt)} টাকা করে দিলে মোট পুল ${formatCoins(pool)} টাকা। যে জিতবে সে পাবে ${formatCoins(prize)} টাকা (${formatCoins(fee)} টাকা সিস্টেম ফি)।`;
  } else {
    noteText = `চারজন খেলোয়াড় ${formatCoins(amt)} টাকা করে দিলে মোট পুল ${formatCoins(pool)} টাকা। যে জিতবে সে পাবে ${formatCoins(prize)} টাকা (${formatCoins(fee)} টাকা সিস্টেম ফি)।`;
  }
  elNote.innerText = noteText;

  let warn = '';
  if (amt < MIN_BET) warn = `⚠️ সর্বনিম্ন এন্ট্রি ফি ${MIN_BET} টাকা।`;
  else if (amt > profile.coins) warn = `⚠️ আপনার ব্যালেন্স যথেষ্ট নয়। প্রয়োজন ${formatCoins(amt)} টাকা, আছে ${formatCoins(profile.coins)} টাকা।`;

  if (warn) {
    elWarn.innerText = warn;
    elWarn.classList.remove('hidden');
    startBtn.style.opacity = '0.45';
  } else {
    elWarn.classList.add('hidden');
    startBtn.style.opacity = '1';
  }
}

/* ============================================================
   ====================  ROOM SYSTEM (প্রাইভেট)  ==============
   ============================================================ */
function startBetMatch() {
  const amt = pendingBetAmount;
  const players = pendingGameMode === '1v1' ? 2 : 4;
  if (!amt || amt < MIN_BET) { showToast(`⚠️ সর্বনিম্ন ${MIN_BET} টাকা এন্ট্রি ফি দিন`); return; }
  if (amt > profile.coins) { showToast(`⚠️ আপনার ব্যালেন্স যথেষ্ট নয়`); return; }

  const pool = amt * players;
  const fee = Math.round(pool * SYSTEM_FEE_RATE);
  const prize = pool - fee;

  currentRoom = {
    code: generateRoomCode(),
    mode: pendingGameMode,
    amount: amt,
    players: players,
    pool: pool,
    fee: fee,
    prize: prize,
    joinedColors: ['blue'],
    readyColors: [],
    playerInfo: {
      blue: { name: profile.name + ' (আপনি)', avatar: profile.avatar, isMe: true }
    },
    userReady: false,
    started: false,
    timers: []
  };
  document.getElementById('bet-overlay').classList.remove('show');
  pendingGameMode = null;
  pendingBetAmount = 0;
  showRoomPanel();
}
function showRoomPanel() {
  document.getElementById('room-code-value').innerText = 'LK-' + currentRoom.code;
  renderRoomPlayers();
  updateRoomStatus();
  document.getElementById('room-ready-btn').disabled = true;
  document.getElementById('room-ready-btn').innerText = '✅ আমি প্রস্তুত';
  document.getElementById('room-overlay').classList.add('show');
}
function getOrderedRoomColors() {
  return currentRoom.mode === '1v1' ? ['blue', 'green'] : ['blue', 'red', 'green', 'yellow'];
}
function getPlayerMeta(color) {
  if (color === 'blue') {
    return { name: profile.name + ' (আপনি)', avatar: profile.avatar, isMe: true };
  }
  if (currentRoom && currentRoom.playerInfo && currentRoom.playerInfo[color]) {
    return currentRoom.playerInfo[color];
  }
  return { name: 'খেলোয়াড়ের অপেক্ষা...', avatar: '➕', isMe: false };
}
function renderRoomPlayers() {
  const container = document.getElementById('room-players');
  container.innerHTML = '';
  const colors = getOrderedRoomColors();
  colors.forEach(color => {
    const joined = currentRoom.joinedColors.includes(color);
    const ready  = currentRoom.readyColors.includes(color);
    const meta = getPlayerMeta(color);
    const slot = document.createElement('div');
    if (joined && ready)       slot.className = 'room-player-slot ready';
    else if (joined)           slot.className = 'room-player-slot filled';
    else                       slot.className = 'room-player-slot waiting';

    if (joined) {
      slot.innerHTML = `
        <div class="rps-avatar">${meta.avatar}</div>
        <div class="rps-info">
          <div class="rps-name">${escapeHtml(meta.name)}</div>
          <div class="rps-status">${ready ? '✔️ প্রস্তুত' : '⏳ প্রস্তুতি নিচ্ছে...'}</div>
        </div>
        ${ready ? '<div class="rps-badge">READY</div>' : ''}
      `;
    } else {
      slot.innerHTML = `
        <div class="rps-avatar">➕</div>
        <div class="rps-info">
          <div class="rps-name">খেলোয়াড়ের অপেক্ষা...</div>
          <div class="rps-status">রুম কোড শেয়ার করুন</div>
        </div>
      `;
    }
    container.appendChild(slot);
  });
}
function updateRoomStatus() {
  const el = document.getElementById('room-status');
  const total = currentRoom.players;
  const joined = currentRoom.joinedColors.length;
  const readyCount = currentRoom.readyColors.length;
  if (currentRoom.started) { el.innerHTML = '<span>🚀 ম্যাচ শুরু হচ্ছে...</span>'; return; }
  if (joined < total) {
    const remaining = total - joined;
    el.innerHTML = `<span><span class="rs-dot"></span>${remaining} জন খেলোয়াড়ের জন্য অপেক্ষা করা হচ্ছে...</span>`;
    return;
  }
  if (!currentRoom.userReady) {
    el.innerHTML = '<span>✅ সবাই যোগ দিয়েছে! এখন "আমি প্রস্তুত" চাপুন</span>';
    return;
  }
  if (readyCount < total) {
    el.innerHTML = '<span><span class="rs-dot"></span>বাকি খেলোয়াড়দের প্রস্তুতির অপেক্ষা...</span>';
    return;
  }
  el.innerHTML = '<span>🎯 সবাই প্রস্তুত! ম্যাচ শুরু হচ্ছে...</span>';
}
function playerReady() {
  if (!currentRoom || currentRoom.started) return;
  if (currentRoom.userReady) return;
  if (currentRoom.joinedColors.length < currentRoom.players) {
    showToast('⚠️ এখনও সব খেলোয়াড় যোগ দেয়নি');
    return;
  }
  currentRoom.userReady = true;
  if (!currentRoom.readyColors.includes('blue')) currentRoom.readyColors.push('blue');
  document.getElementById('room-ready-btn').disabled = true;
  document.getElementById('room-ready-btn').innerText = '✔️ প্রস্তুত';
  renderRoomPlayers();
  updateRoomStatus();
  vibrate([30, 15, 30]);
  checkRoomReady();
}
function checkRoomReady() {
  if (!currentRoom || currentRoom.started) return;
  const total = currentRoom.players;
  const readyCount = currentRoom.readyColors.length;
  if (readyCount >= total && currentRoom.userReady) {
    currentRoom.started = true;
    updateRoomStatus();
    setTimeout(() => { startRoomMatch(); }, 1400);
  }
}
function serverAddPlayerToRoom(color, name, avatar) {
  if (!currentRoom || currentRoom.started) return;
  if (currentRoom.joinedColors.includes(color)) return;
  currentRoom.joinedColors.push(color);
  currentRoom.playerInfo[color] = { name: name, avatar: avatar, isMe: false };
  renderRoomPlayers();
  updateRoomStatus();
  if (currentRoom.joinedColors.length >= currentRoom.players) {
    document.getElementById('room-ready-btn').disabled = false;
  }
}
function serverSetPlayerReady(color) {
  if (!currentRoom || currentRoom.started) return;
  if (!currentRoom.readyColors.includes(color)) {
    currentRoom.readyColors.push(color);
    renderRoomPlayers();
    updateRoomStatus();
    checkRoomReady();
  }
}
window.serverAddPlayerToRoom = serverAddPlayerToRoom;
window.serverSetPlayerReady = serverSetPlayerReady;

function startRoomMatch() {
  if (!currentRoom) return;
  const amt = currentRoom.amount;
  if (amt > profile.coins) {
    showToast('⚠️ ব্যালেন্স যথেষ্ট নয়!');
    cancelRoom();
    return;
  }
  profile.coins -= amt;
  LudoAuth.setBalance(profile.coins);
  currentBetInfo = {
    amount: currentRoom.amount, players: currentRoom.players,
    pool: currentRoom.pool, fee: currentRoom.fee, prize: currentRoom.prize
  };
  const badge = document.getElementById('bet-badge');
  const bText = document.getElementById('bet-badge-text');
  bText.innerText = `এন্ট্রি: ${formatCoins(amt)} · প্রাইজ: ${formatCoins(currentRoom.prize)}`;
  badge.classList.add('show');
  document.getElementById('room-overlay').classList.remove('show');

  const mode = currentRoom.mode;
  const players = currentRoom.players;
  const vsPlayers = buildVSPlayerList(mode, currentRoom);
  if (currentRoom.timers) currentRoom.timers.forEach(t => clearTimeout(t));
  currentRoom = null;
  vibrate([40, 25, 40, 25, 80]);
  showToast(`💰 ${formatCoins(amt)} টাকা এন্ট্রি কাটা হয়েছে। শুভ কামনা!`);
  showVSScreen(vsPlayers, mode, () => {
    startGame(mode, true, players);
  });
}

function cancelRoom() {
  if (!currentRoom) return;
  const refundAmt = currentRoom.amount;
  if (refundAmt > 0) {
    profile.coins += refundAmt;
    LudoAuth.setBalance(profile.coins);
    showToast(`💰 রুম বাতিল — ${formatCoins(refundAmt)} টাকা সম্পূর্ণ ফেরত পেয়েছেন`);
  }
  if (currentRoom.timers) currentRoom.timers.forEach(t => clearTimeout(t));
  currentRoom = null;
  document.getElementById('room-overlay').classList.remove('show');
  document.getElementById('game-wrapper').classList.remove('visible');
  document.getElementById('mode-screen').classList.remove('hidden');
}
function copyRoomCode() {
  if (!currentRoom) return;
  const code = 'LK-' + currentRoom.code;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(code).then(() => showToast('রুম কোড কপি: ' + code))
      .catch(() => fallbackCopy(code, () => showToast('রুম কোড কপি: ' + code)));
  } else fallbackCopy(code, () => showToast('রুম কোড কপি: ' + code));
}
function buildRoomMessage() {
  if (!currentRoom) return '';
  const code = 'LK-' + currentRoom.code;
  return `🎲 Ludo King বাজি ম্যাচ!\n\n🔗 রুম কোড: ${code}\n💰 এন্ট্রি ফি: ${formatCoins(currentRoom.amount)} টাকা\n👥 খেলোয়াড়: ${currentRoom.players} জন\n🏆 প্রাইজ: ${formatCoins(currentRoom.prize)} টাকা\n\nখেলতে যোগ দিন!`;
}
function buildRoomLink() {
  const code = currentRoom ? ('LK-' + currentRoom.code) : '';
  const base = location.origin + location.pathname;
  return `${base}#room=${code}`;
}
function shareRoom(platform) {
  if (!currentRoom) return;
  const msg = buildRoomMessage();
  const link = buildRoomLink();
  const fullMsg = msg + '\n\n' + link;
  if (platform === 'whatsapp') {
    try { window.open('https://wa.me/?text=' + encodeURIComponent(fullMsg), '_blank'); }
    catch (e) { fallbackCopy(fullMsg, () => showToast('মেসেজ কপি হয়েছে — WhatsApp-এ পেস্ট করুন')); }
  } else if (platform === 'messenger') {
    if (navigator.share) {
      navigator.share({ title: 'Ludo King বাজি ম্যাচ', text: msg, url: link })
        .catch(() => fallbackCopy(fullMsg, () => showToast('মেসেজ কপি হয়েছে — Messenger-এ পেস্ট করুন')));
    } else fallbackCopy(fullMsg, () => showToast('মেসেজ কপি হয়েছে — Messenger-এ পেস্ট করুন'));
  } else fallbackCopy(fullMsg, () => showToast('রুম লিংক কপি হয়েছে!'));
}

/* ============================================================
   ============  GLOBAL ROOM SYSTEM  =========================
   ============================================================ */
let globalRooms = [];
let roomTickInterval = null;
let paCurrentUserId = null;

function generateRoomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return 'R-' + s;
}
function isUserInAnyRoom() {
  return globalRooms.some(r =>
    r.status === 'waiting' && r.players.some(p => p.id === profile.uid)
  );
}

function openGlobalRoom() {
  getAudioCtx();
  document.getElementById('mode-screen').classList.add('hidden');
  document.getElementById('global-room-screen').classList.remove('hidden');
  renderGlobalRooms();
  startRoomTick();
}
function closeGlobalRoom() {
  document.getElementById('global-room-screen').classList.add('hidden');
  document.getElementById('mode-screen').classList.remove('hidden');
}

function renderGlobalRooms() {
  const list = document.getElementById('gr-list');
  list.innerHTML = '';
  const active = globalRooms.filter(r => r.status === 'waiting');
  if (active.length === 0) {
    list.innerHTML = '<div class="gr-empty">🌐 এই মুহূর্তে কোনো খোলা রুম নেই।<br>➕ উপরের বাটনে চাপ দিয়ে নতুন রুম তৈরি করুন!</div>';
    return;
  }
  active.forEach(room => list.appendChild(buildRoomCard(room)));
}

function buildRoomCard(room) {
  const card = document.createElement('div');
  card.className = 'gr-room-card';
  if (room.creator_id === profile.uid) card.classList.add('mine');

  const header = document.createElement('div');
  header.className = 'gr-room-header';

  const av = document.createElement('div');
  av.className = 'gr-creator-avatar';
  av.innerText = room.creator_photo;
  av.onclick = () => openProfileAction(room.creator_id, room.creator_name, room.creator_photo);
  header.appendChild(av);

  const info = document.createElement('div');
  info.className = 'gr-creator-info';
  info.innerHTML = `
    <div class="gr-creator-name">${escapeHtml(room.creator_name)}</div>
    <div class="gr-coin-line">🪙 ${formatCoins(room.coin_amount)} Coins · ${room.mode === '1v1' ? '1 vs 1' : '4 Player'}</div>
  `;
  header.appendChild(info);

  const timeLeft = document.createElement('div');
  timeLeft.className = 'gr-time';
  timeLeft.dataset.roomId = room.room_id;
  timeLeft.innerText = formatTimeLeft(room.expiresAt - Date.now());
  header.appendChild(timeLeft);

  card.appendChild(header);

  const slots = document.createElement('div');
  slots.className = 'gr-slots';
  for (let i = 0; i < room.maxPlayers; i++) {
    const slot = document.createElement('div');
    const player = room.players[i];
    if (player) {
      slot.className = 'gr-slot filled';
      if (player.id === profile.uid) slot.classList.add('me');
      slot.innerHTML = `
        <div class="gr-slot-avatar">${player.photo}</div>
        <div class="gr-slot-name">${escapeHtml(player.name)}</div>
      `;
      slot.onclick = () => openProfileAction(player.id, player.name, player.photo);
    } else {
      slot.className = 'gr-slot empty';
      slot.innerHTML = `
        <div class="gr-slot-join">➕</div>
        <div class="gr-slot-join-label">JOIN</div>
      `;
      slot.onclick = () => attemptJoinRoom(room);
    }
    slots.appendChild(slot);
  }
  card.appendChild(slots);

  if (room.creator_id === profile.uid) {
    const row = document.createElement('div');
    row.className = 'gr-cancel-row';
    const btn = document.createElement('button');
    btn.className = 'gr-cancel-btn';
    btn.innerText = '✕ রুম বাতিল করুন (সম্পূর্ণ রিফান্ড)';
    btn.onclick = () => cancelGlobalRoom(room.room_id);
    row.appendChild(btn);
    card.appendChild(row);
  }
  return card;
}

function attemptJoinRoom(room) {
  if (room.status !== 'waiting') { showToast('এই রুম আর খোলা নেই'); return; }
  if (room.players.some(p => p.id === profile.uid)) { showToast('আপনি ইতিমধ্যেই এই রুমে আছেন'); return; }
  if (room.players.length >= room.maxPlayers) { showToast('রুম পূর্ণ!'); return; }
  if (isUserInAnyRoom()) { showToast('আপনি ইতিমধ্যে অন্য একটি রুমে আছেন'); return; }
  if (profile.coins < room.coin_amount) {
    showToast(`⚠️ পর্যাপ্ত কয়েন নেই! প্রয়োজন ${formatCoins(room.coin_amount)}, আছে ${formatCoins(profile.coins)}`);
    return;
  }

  profile.coins -= room.coin_amount;
  LudoAuth.setBalance(profile.coins);

  room.players.push({ id: profile.uid, name: profile.name, photo: profile.avatar, isCreator: false });
  vibrate(30);
  showToast(`✅ জয়েন সম্পন্ন! ${formatCoins(room.coin_amount)} কয়েন কাটা হয়েছে।`);

  if (room.players.length >= room.maxPlayers) {
    room.status = 'full';
    renderGlobalRooms();
    startCountdownAndStart(room);
  } else {
    renderGlobalRooms();
  }
}

function startCountdownAndStart(room) {
  if (room._starting) return;
  room._starting = true;
  let count = 3;
  showToast(`🎯 রুম পূর্ণ! ${count} সেকেন্ডে শুরু হচ্ছে...`);
  const int = setInterval(() => {
    count--;
    if (count > 0) showToast(`শুরু হচ্ছে ${count}...`);
    else {
      clearInterval(int);
      beginGlobalMatch(room);
    }
  }, 1000);
  room.timers.push(int);
}

function beginGlobalMatch(room) {
  if (room.status !== 'full') return;
  room.status = 'in-progress';
  const idx = globalRooms.indexOf(room);
  if (idx >= 0) globalRooms.splice(idx, 1);

  const players = room.maxPlayers;
  const pool = room.coin_amount * players;
  const fee = Math.round(pool * SYSTEM_FEE_RATE);
  const prize = pool - fee;

  currentBetInfo = { amount: room.coin_amount, players, pool, fee, prize };
  document.getElementById('bet-badge-text').innerText =
    `এন্ট্রি: ${formatCoins(room.coin_amount)} · প্রাইজ: ${formatCoins(prize)}`;
  document.getElementById('bet-badge').classList.add('show');

  const colors = room.mode === '1v1' ? ['blue', 'green'] : ['blue', 'red', 'green', 'yellow'];
  const vsPlayers = room.players.map((p, i) => ({
    color: colors[i],
    name: p.id === profile.uid ? profile.name : p.name,
    avatar: p.photo,
    isMe: p.id === profile.uid
  }));
  while (vsPlayers.length < colors.length) {
    const i = vsPlayers.length;
    const bot = VS_BOT_POOL[i % VS_BOT_POOL.length];
    vsPlayers.push({ color: colors[i], name: bot.name, avatar: bot.avatar, isMe: false });
  }

  document.getElementById('global-room-screen').classList.add('hidden');
  vibrate([40, 25, 40, 25, 80]);
  showVSScreen(vsPlayers, room.mode, () => {
    startGame(room.mode, true, players);
  });
}

function cancelGlobalRoom(roomId) {
  const idx = globalRooms.findIndex(r => r.room_id === roomId);
  if (idx < 0) return;
  const room = globalRooms[idx];
  refundRoom(room, 'রুম বাতিল');
  if (room.timers) room.timers.forEach(t => { clearInterval(t); clearTimeout(t); });
  room.status = 'cancelled';
  globalRooms.splice(idx, 1);
  renderGlobalRooms();
  showToast('রুম বাতিল — সম্পূর্ণ কয়েন ফেরত দেওয়া হয়েছে');
}

function refundRoom(room, reason) {
  room.players.forEach(player => {
    if (player.id === profile.uid) {
      profile.coins += room.coin_amount;
      LudoAuth.setBalance(profile.coins);
      showToast(`💰 ${formatCoins(room.coin_amount)} কয়েন সম্পূর্ণ ফেরত পেয়েছেন (${reason})`);
    }
  });
}

function startRoomTick() {
  if (roomTickInterval) return;
  roomTickInterval = setInterval(() => {
    const now = Date.now();
    let changed = false;
    globalRooms.slice().forEach(room => {
      if (room.status === 'waiting' && room.expiresAt <= now) {
        refundRoom(room, 'সময় শেষ');
        if (room.timers) room.timers.forEach(t => { clearInterval(t); clearTimeout(t); });
        room.status = 'cancelled';
        changed = true;
      }
    });
    if (changed) {
      globalRooms = globalRooms.filter(r => r.status === 'waiting');
      renderGlobalRooms();
    }
    document.querySelectorAll('.gr-time').forEach(el => {
      const r = globalRooms.find(x => x.room_id === el.dataset.roomId);
      if (r) el.innerText = formatTimeLeft(r.expiresAt - now);
    });
  }, 1000);
}

/* ================= CREATE ROOM ================= */
let crMode = '1v1';
let crCoin = 100;

function openCreateRoom() {
  if (isUserInAnyRoom()) { showToast('আপনি ইতিমধ্যে একটি রুমে আছেন'); return; }
  crMode = '1v1';
  crCoin = 100;
  document.getElementById('cr-coin-input').value = '';
  updateCreateRoomUI();
  document.getElementById('create-room-overlay').classList.add('show');
}
function closeCreateRoom() { document.getElementById('create-room-overlay').classList.remove('show'); }
function selectCreateMode(mode) { crMode = mode; updateCreateRoomUI(); }
function selectCreateCoin(amt) {
  crCoin = amt;
  document.getElementById('cr-coin-input').value = '';
  updateCreateRoomUI();
}
function onCreateCoinInput(e) {
  const v = parseInt(e.target.value, 10);
  crCoin = isNaN(v) ? 0 : v;
  updateCreateRoomUI();
}
function updateCreateRoomUI() {
  const hasCustom = !!document.getElementById('cr-coin-input').value;
  document.querySelectorAll('.cr-mode-btn').forEach(b => {
    b.classList.toggle('selected', b.dataset.mode === crMode);
  });
  document.querySelectorAll('.cr-coin-btn').forEach(b => {
    b.classList.toggle('selected',
      !hasCustom && parseInt(b.dataset.coin, 10) === crCoin);
  });
  document.getElementById('cr-balance-val').innerText = formatCoins(profile.coins);
}

function confirmCreateRoom() {
  const amt = crCoin;
  if (!amt || amt < 10) { showToast('সর্বনিম্ন ১০ কয়েন এন্ট্রি দিন'); return; }
  if (amt > profile.coins) { showToast('⚠️ পর্যাপ্ত কয়েন নেই!'); return; }
  if (isUserInAnyRoom()) { showToast('আপনি ইতিমধ্যে একটি রুমে আছেন'); return; }

  profile.coins -= amt;
  LudoAuth.setBalance(profile.coins);

  const maxPlayers = crMode === '1v1' ? 2 : 4;
  const room = {
    room_id: generateRoomId(),
    creator_id: profile.uid,
    creator_name: profile.name,
    creator_photo: profile.avatar,
    mode: crMode,
    coin_amount: amt,
    maxPlayers,
    players: [{ id: profile.uid, name: profile.name, photo: profile.avatar, isCreator: true }],
    status: 'waiting',
    createdAt: Date.now(),
    expiresAt: Date.now() + ROOM_EXPIRE_MS,
    timers: []
  };
  globalRooms.push(room);
  closeCreateRoom();
  showToast(`✅ রুম তৈরি! ${formatCoins(amt)} কয়েন কাটা হয়েছে।`);
  renderGlobalRooms();
}

/* ================= PROFILE ACTION POPUP ================= */
function openProfileAction(userId, name, photo) {
  paCurrentUserId = userId;
  document.getElementById('pa-avatar').innerText = photo || '👤';
  document.getElementById('pa-name').innerText = name || 'User';
  document.getElementById('pa-uid').innerText = 'UID: ' + (userId || 'N/A');
  document.getElementById('profile-action-overlay').classList.add('show');
}
function closeProfileAction() {
  document.getElementById('profile-action-overlay').classList.remove('show');
  paCurrentUserId = null;
}
function paOverlayClick(e) {
  if (e.target.id === 'profile-action-overlay') closeProfileAction();
}
function onMessageClick() {
  if (!paCurrentUserId) { closeProfileAction(); return; }
  const uid = paCurrentUserId;
  const u = usersDB[uid];
  closeProfileAction();
  openChatWith(uid, u ? u.name : 'User', u ? u.avatar : '👤');
}
function onAddFriendClick() {
  if (!paCurrentUserId) { closeProfileAction(); return; }
  if (paCurrentUserId === profile.uid) {
    showToast('এটা আপনার নিজের আইডি');
    closeProfileAction();
    return;
  }
  sendFriendRequest(paCurrentUserId);
  closeProfileAction();
}

/* ============================================================
   ====================  SETTINGS  ============================
   ============================================================ */
function openSettings() {
  getAudioCtx();
  updateSettingsUI();
  document.getElementById('settings-overlay').classList.add('show');
}
function closeSettings() { document.getElementById('settings-overlay').classList.remove('show'); }
function settingsOverlayClick(e) { if (e.target.id === 'settings-overlay') closeSettings(); }
function toggleSoundFromSettings(ev) {
  if (ev) ev.stopPropagation();
  gameSettings.sound = !gameSettings.sound;
  soundEnabled = gameSettings.sound;
  saveSettings(); updateSettingsUI();
  if (gameSettings.sound) { getAudioCtx(); showToast('🔊 সাউন্ড চালু'); }
  else showToast('🔇 সাউন্ড বন্ধ');
}
function toggleVibrationFromSettings(ev) {
  if (ev) ev.stopPropagation();
  gameSettings.vibration = !gameSettings.vibration;
  saveSettings(); updateSettingsUI();
  if (gameSettings.vibration) { vibrate(30); showToast('📳 ভাইব্রেশন চালু'); }
  else showToast('ভাইব্রেশন বন্ধ');
}
function togglePawnHighlightFromSettings(ev) {
  if (ev) ev.stopPropagation();
  gameSettings.highlight = !gameSettings.highlight;
  saveSettings(); updateSettingsUI();
  showToast(gameSettings.highlight ? '✨ গুটি হাইলাইট চালু' : 'গুটি হাইলাইট বন্ধ');
}
function setSpeed(speed, ev) {
  if (ev) ev.stopPropagation();
  gameSettings.speed = speed;
  saveSettings(); updateSettingsUI();
  const names = { slow: 'ধীর', normal: 'সাধারণ', fast: 'দ্রুত' };
  showToast('অ্যানিমেশন স্পিড: ' + names[speed]);
}
function vibrate(pattern) {
  if (!gameSettings.vibration) return;
  if (navigator.vibrate) { try { navigator.vibrate(pattern); } catch (e) {} }
}

/* ============================================================
   ============ EXIT / CANCEL LOGIC  =========================
   ============================================================ */
function goHome() { openExitConfirm(); }

function openExitConfirm() {
  const t = document.getElementById('exit-text');
  if (currentRoom) {
    t.innerText = `⚠️ আপনি একটি রুমে আছেন (কোড: LK-${currentRoom.code})।\n\nবের হলে রুম বাতিল হবে — ${formatCoins(currentRoom.amount)} টাকা সম্পূর্ণ ফেরত পাবেন।\n\nনিশ্চিত?`;
  } else if (gameActive && currentBetInfo) {
    const entry = currentBetInfo.amount;
    const penalty = Math.round(entry * CANCEL_PENALTY_RATE);
    const refund = entry - penalty;
    t.innerText = `⚠️ গেম চলছে!\n\nবের হলে আপনার এন্ট্রি ফি ${formatCoins(entry)} টাকা থেকে:\n• ${formatCoins(penalty)} টাকা কাটা হবে (৩০%)\n• ${formatCoins(refund)} টাকা ফেরত পাবেন (৭০%)\n\nপ্রতিপক্ষের টাকা অক্ষত থাকবে।\n\nনিশ্চিত?`;
  } else {
    t.innerText = 'বর্তমান খেলাটি হারিয়ে যাবে। আপনি কি নিশ্চিত?';
  }
  document.getElementById('exit-overlay').classList.add('show');
}
function closeExitConfirm() { document.getElementById('exit-overlay').classList.remove('show'); }
function exitOverlayClick(e) { if (e.target.id === 'exit-overlay') closeExitConfirm(); }
function confirmExitGame() { closeSettings(); setTimeout(openExitConfirm, 260); }

function handleInGameQuit() {
  if (!currentBetInfo || !gameActive || amQuitter) return;
  amQuitter = true;
  const entry = currentBetInfo.amount;
  const penalty = Math.round(entry * CANCEL_PENALTY_RATE);
  const refund = entry - penalty;
  profile.coins += refund;
  LudoAuth.setBalance(profile.coins);
  showToast(`❌ আপনি গেম ছেড়েছেন। ${formatCoins(penalty)} টাকা কাটা (৩০%), ${formatCoins(refund)} টাকা ফেরত (৭০%)।`);
  gameActive = false;
  currentBetInfo = null;
  document.getElementById('bet-badge').classList.remove('show');
}

function handleOpponentQuit(quitterColor) {
  if (!currentBetInfo || !gameActive) return;
  const myEntry = currentBetInfo.amount;
  profile.coins += myEntry;
  LudoAuth.setBalance(profile.coins);
  showToast(`🏆 প্রতিপক্ষ (${quitterColor}) গেম ছেড়েছে! আপনার ${formatCoins(myEntry)} টাকা সম্পূর্ণ ফেরত পেয়েছেন।`);
  gameActive = false;
  currentBetInfo = null;
  document.getElementById('bet-badge').classList.remove('show');
}

window.serverOpponentQuit = function(quitterColor) {
  handleOpponentQuit(quitterColor);
  document.getElementById('game-wrapper').classList.remove('visible');
  setTimeout(() => {
    document.getElementById('mode-screen').classList.remove('hidden');
  }, 1500);
};

function doExitGame() {
  closeExitConfirm();
  if (gameActive && currentBetInfo) handleInGameQuit();
  if (currentRoom) cancelRoom();
  document.getElementById('game-wrapper').classList.remove('visible');
  document.getElementById('bet-badge').classList.remove('show');
  document.getElementById('global-room-screen').classList.add('hidden');
  document.getElementById('friends-screen').classList.add('hidden');
  document.getElementById('inbox-screen').classList.add('hidden');
  document.getElementById('chat-screen').classList.add('hidden');
  document.getElementById('vs-screen').classList.remove('show');
  currentBetInfo = null;
  setTimeout(() => {
    document.getElementById('mode-screen').classList.remove('hidden');
  }, 250);
  pawns.forEach(p => {
    p.step = -1;
    p.element.classList.remove('highlight', 'jumping');
    renderPawn(p);
  });
  turnIndex = 0;
  canRoll = true;
  consecutiveSixes = 0;
  activePawnsToMove = [];
  activePlayers = ALL_PLAYERS.slice();
  gameActive = false;
  amQuitter = false;
  const t = document.getElementById('tb-title');
  if (t) t.innerText = 'LUDO KING';
}

/* ============================================================
   ==================  LudoAuth (সার্ভার হুক)  ===============
   ============================================================ */
const LudoAuth = {
  currentUser: null,
  isLoggedIn() { return !!this.currentUser; },
  setUser(user) {
    if (!user) return;
    this.currentUser = user;
    if (user.name) profile.name = String(user.name).slice(0, 14);
    if (user.avatar && AVATARS.includes(user.avatar)) profile.avatar = user.avatar;
    if (typeof user.coins === 'number') profile.coins = user.coins;
    profile.uid = user.uid || (user.id ? 'LK-' + String(user.id).slice(-8).toUpperCase() : profile.uid);
    profile.loggedIn = true;
    saveProfile();
    syncCurrentUserToDB();
    renderProfileUI();
    showToast('স্বাগতম, ' + profile.name + '!');
  },
  setBalance(coins) {
    profile.coins = Number(coins) || 0;
    saveProfile();
    syncCurrentUserToDB();
    renderProfileUI();
    const balEl = document.getElementById('bet-balance-val');
    if (balEl) balEl.innerText = formatCoins(profile.coins);
    const crBalEl = document.getElementById('cr-balance-val');
    if (crBalEl) crBalEl.innerText = formatCoins(profile.coins);
  },
  recordMatch(won) {
    profile.matches++;
    if (won) profile.wins++;
    saveProfile();
    renderProfileUI();
  },
  logout() {
    this.currentUser = null;
    profile.loggedIn = false;
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
    loadProfile();
    applyTheme(profile.theme);
    renderProfileUI();
    closeProfile();
    showToast('লগআউট সম্পন্ন');
  }
};
window.LudoAuth = LudoAuth;

/* ============================================================
   =======================  GAME LOGIC  =======================
   ============================================================ */
const ALL_PLAYERS = ['blue', 'red', 'green', 'yellow'];
let activePlayers = ['blue', 'red', 'green', 'yellow'];
let turnIndex = 0;
let diceValue = 0;
let consecutiveSixes = 0;
let canRoll = true;
let activePawnsToMove = [];
const gridCells = {};

let audioCtx = null;
let soundEnabled = true;

function getAudioCtx() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch (e) { return null; }
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function playHopSound() {
  vibrate(12);
  if (!soundEnabled) return;
  const ctx = getAudioCtx(); if (!ctx) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(620, now);
  osc.frequency.exponentialRampToValueAtTime(980, now + 0.06);
  osc.frequency.exponentialRampToValueAtTime(520, now + 0.14);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.18, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
  osc.connect(gain); gain.connect(ctx.destination);
  osc.start(now); osc.stop(now + 0.16);
}
function playDiceRollSound() {
  vibrate(25);
  if (!soundEnabled) return;
  const ctx = getAudioCtx(); if (!ctx) return;
  const now = ctx.currentTime;
  const clicks = [
    { t: 0.000, vol: 0.16, freq: 1500, q: 6 },
    { t: 0.055, vol: 0.14, freq: 1350, q: 7 },
    { t: 0.105, vol: 0.12, freq: 1200, q: 8 },
    { t: 0.150, vol: 0.10, freq: 1050, q: 9 },
    { t: 0.190, vol: 0.09, freq: 900,  q: 10 }
  ];
  clicks.forEach((c) => {
    const t = now + c.t;
    const bufSize = Math.max(1, Math.floor(ctx.sampleRate * 0.025));
    const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufSize, 4);
    const noise = ctx.createBufferSource(); noise.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = c.freq; bp.Q.value = c.q;
    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(c.vol, t);
    nGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    noise.connect(bp); bp.connect(nGain); nGain.connect(ctx.destination);
    noise.start(t); noise.stop(t + 0.05);
    const osc = ctx.createOscillator();
    const oGain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(80, t + 0.035);
    oGain.gain.setValueAtTime(c.vol * 0.85, t);
    oGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
    osc.connect(oGain); oGain.connect(ctx.destination);
    osc.start(t); osc.stop(t + 0.05);
  });
}
function playSixSound() {
  vibrate([40, 30, 40]);
  if (!soundEnabled) return;
  const ctx = getAudioCtx(); if (!ctx) return;
  const now = ctx.currentTime;
  [523.25, 659.25, 783.99].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle'; osc.frequency.value = freq;
    const start = now + i * 0.07;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.22, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(start); osc.stop(start + 0.36);
  });
}
function playCaptureSound() {
  vibrate([60, 40, 80]);
  if (!soundEnabled) return;
  const ctx = getAudioCtx(); if (!ctx) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(440, now);
  osc.frequency.exponentialRampToValueAtTime(70, now + 0.28);
  gain.gain.setValueAtTime(0.28, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
  osc.connect(gain); gain.connect(ctx.destination);
  osc.start(now); osc.stop(now + 0.33);
  const bufferSize = ctx.sampleRate * 0.12;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 3);
  const noise = ctx.createBufferSource(); noise.buffer = buffer;
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.15, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = 'lowpass'; noiseFilter.frequency.value = 800;
  noise.connect(noiseFilter); noiseFilter.connect(noiseGain); noiseGain.connect(ctx.destination);
  noise.start(now);
}
function playSafeZoneSound() {
  vibrate([20, 20, 20]);
  if (!soundEnabled) return;
  const ctx = getAudioCtx(); if (!ctx) return;
  const now = ctx.currentTime;
  [659.25, 783.99, 987.77, 1318.51].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine'; osc.frequency.value = freq;
    const start = now + i * 0.055;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.17, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.28);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(start); osc.stop(start + 0.30);
  });
}
function playWinSound() {
  vibrate([100, 50, 100, 50, 200]);
  if (!soundEnabled) return;
  const ctx = getAudioCtx(); if (!ctx) return;
  const now = ctx.currentTime;
  [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    const start = now + i * 0.09;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.24, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.5);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(start); osc.stop(start + 0.52);
  });
}
function toggleSound() { toggleSoundFromSettings(); }

const mainPathCoords = [
  {r:6,c:1}, {r:6,c:2}, {r:6,c:3}, {r:6,c:4}, {r:6,c:5},
  {r:5,c:6}, {r:4,c:6}, {r:3,c:6}, {r:2,c:6}, {r:1,c:6},
  {r:0,c:6}, {r:0,c:7}, {r:0,c:8}, {r:1,c:8}, {r:2,c:8},
  {r:3,c:8}, {r:4,c:8}, {r:5,c:8}, {r:6,c:9}, {r:6,c:10},
  {r:6,c:11}, {r:6,c:12}, {r:6,c:13}, {r:6,c:14}, {r:7,c:14},
  {r:8,c:14}, {r:8,c:13}, {r:8,c:12}, {r:8,c:11}, {r:8,c:10},
  {r:8,c:9}, {r:9,c:8}, {r:10,c:8}, {r:11,c:8}, {r:12,c:8},
  {r:13,c:8}, {r:14,c:8}, {r:14,c:7}, {r:14,c:6}, {r:13,c:6},
  {r:12,c:6}, {r:11,c:6}, {r:10,c:6}, {r:9,c:6}, {r:8,c:5},
  {r:8,c:4}, {r:8,c:3}, {r:8,c:2}, {r:8,c:1}, {r:8,c:0},
  {r:7,c:0}, {r:6,c:0}
];
const safeIndices = [0, 8, 13, 21, 26, 34, 39, 47];
const starIndices = [8, 21, 34, 47];

const playerConfigs = {
  blue: {
    startIndex: 0,
    yardCoords: [ {r:2,c:2}, {r:2,c:3}, {r:3,c:2}, {r:3,c:3} ],
    homeLane: [ {r:7,c:1}, {r:7,c:2}, {r:7,c:3}, {r:7,c:4}, {r:7,c:5}, {r:7,c:6} ]
  },
  red: {
    startIndex: 13,
    yardCoords: [ {r:2,c:11}, {r:2,c:12}, {r:3,c:11}, {r:3,c:12} ],
    homeLane: [ {r:1,c:7}, {r:2,c:7}, {r:3,c:7}, {r:4,c:7}, {r:5,c:7}, {r:6,c:7} ]
  },
  green: {
    startIndex: 26,
    yardCoords: [ {r:11,c:11}, {r:11,c:12}, {r:12,c:11}, {r:12,c:12} ],
    homeLane: [ {r:7,c:13}, {r:7,c:12}, {r:7,c:11}, {r:7,c:10}, {r:7,c:9}, {r:7,c:8} ]
  },
  yellow: {
    startIndex: 39,
    yardCoords: [ {r:11,c:2}, {r:11,c:3}, {r:12,c:2}, {r:12,c:3} ],
    homeLane: [ {r:13,c:7}, {r:12,c:7}, {r:11,c:7}, {r:10,c:7}, {r:9,c:7}, {r:8,c:7} ]
  }
};

const pawns = [];

const PIN_COLORS = {
  blue:   { grad: 'pin-blue',   base: '#0d47a1', dark: '#051e3e', shine: 0.45 },
  red:    { grad: 'pin-red',    base: '#b71c1c', dark: '#7f0000', shine: 0.40 },
  green:  { grad: 'pin-green',  base: '#1b5e20', dark: '#0d3b12', shine: 0.40 },
  yellow: { grad: 'pin-yellow', base: '#e65100', dark: '#bf360c', shine: 0.50 }
};

function pawnSVG(color) {
  const c = PIN_COLORS[color];
  return `
    <svg class="ludo-pin" viewBox="0 0 60 78" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="30" cy="68" rx="15" ry="6.5" fill="${c.base}"/>
      <ellipse cx="30" cy="66.5" rx="10.5" ry="3.8" fill="${c.dark}"/>
      <path d="M30 4 C17 4 9 15 9 27 C9 44 30 64 30 64 C30 64 51 44 51 27 C51 15 43 4 30 4 Z" fill="url(#pin-white)"/>
      <circle cx="30" cy="26" r="12.5" fill="url(#${c.grad})"/>
      <circle cx="30" cy="26" r="12.5" fill="url(#pin-shine)" opacity="${c.shine}"/>
    </svg>
  `;
}

function initBoard() {
  const board = document.getElementById('board');
  for (let r = 0; r < 15; r++) {
    for (let c = 0; c < 15; c++) {
      if ((r < 6 && c < 6) || (r < 6 && c > 8) || (r > 8 && c < 6) || (r > 8 && c > 8) || (r >= 6 && r <= 8 && c >= 6 && c <= 8)) continue;
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.style.gridRowStart = r + 1;
      cell.style.gridColumnStart = c + 1;
      if (r === 7 && c >= 1 && c <= 5) cell.classList.add('bg-blue');
      if (c === 7 && r >= 1 && r <= 5) cell.classList.add('bg-red');
      if (r === 7 && c >= 9 && c <= 13) cell.classList.add('bg-green');
      if (c === 7 && r >= 9 && r <= 13) cell.classList.add('bg-yellow');
      if (r === 6 && c === 1) cell.classList.add('bg-blue');
      if (r === 1 && c === 8) cell.classList.add('bg-red');
      if (r === 8 && c === 13) cell.classList.add('bg-green');
      if (r === 13 && c === 6) cell.classList.add('bg-yellow');
      if (r === 7 && c === 0)  cell.classList.add('arrow', 'arrow-right');
      if (r === 0 && c === 7)  cell.classList.add('arrow', 'arrow-down');
      if (r === 7 && c === 14) cell.classList.add('arrow', 'arrow-left');
      if (r === 14 && c === 7) cell.classList.add('arrow', 'arrow-up');
      board.appendChild(cell);
      gridCells[`${r},${c}`] = cell;
    }
  }
  ALL_PLAYERS.forEach(color => {
    const yard = document.createElement('div');
    yard.className = `yard yard-${color}`;
    const inner = document.createElement('div');
    inner.className = 'yard-inner';
    for (let i = 0; i < 4; i++) {
      const spot = document.createElement('div');
      spot.className = 'yard-spot';
      const coord = playerConfigs[color].yardCoords[i];
      gridCells[`${coord.r},${coord.c}`] = spot;
      inner.appendChild(spot);
    }
    yard.appendChild(inner);
    board.appendChild(yard);
  });
  starIndices.forEach(idx => {
    const coord = mainPathCoords[idx];
    if (gridCells[`${coord.r},${coord.c}`]) gridCells[`${coord.r},${coord.c}`].classList.add('star');
  });
  ALL_PLAYERS.forEach(color => {
    for (let i = 0; i < 4; i++) {
      const pawnElem = document.createElement('div');
      pawnElem.className = `pawn pawn-${color}`;
      pawnElem.innerHTML = pawnSVG(color);
      const pawnObj = { id: `${color}-${i}`, color: color, index: i, step: -1, element: pawnElem };
      pawnElem.onclick = () => onPawnClick(pawnObj);
      pawns.push(pawnObj);
      renderPawn(pawnObj);
    }
  });
}

function renderPawn(pawn) {
  let coord;
  if (pawn.step === -1) coord = playerConfigs[pawn.color].yardCoords[pawn.index];
  else if (pawn.step < 51) {
    const pathIdx = (playerConfigs[pawn.color].startIndex + pawn.step) % 52;
    coord = mainPathCoords[pathIdx];
  } else if (pawn.step >= 51 && pawn.step < 57) {
    const laneIdx = pawn.step - 51;
    coord = playerConfigs[pawn.color].homeLane[laneIdx];
  }
  if (!coord) return;
  const targetCell = gridCells[`${coord.r},${coord.c}`];
  if (targetCell) targetCell.appendChild(pawn.element);
}

function updateTurnUI() {
  ALL_PLAYERS.forEach(color => {
    document.getElementById(`card-${color}`).classList.remove('card-active');
  });
  const activeColor = activePlayers[turnIndex];
  document.getElementById(`card-${activeColor}`).classList.add('card-active');
  document.getElementById('status-text').innerText =
    `${activeColor.toUpperCase()}-এর চাল! আপনার ডায়াইসে চাপ দিন।`;
}
function nextTurn() {
  consecutiveSixes = 0;
  turnIndex = (turnIndex + 1) % activePlayers.length;
  canRoll = true;
  updateTurnUI();
}
function rollDice() {
  if (!canRoll) return;
  getAudioCtx();
  playDiceRollSound();
  const activeColor = activePlayers[turnIndex];
  const diceElem = document.getElementById(`dice-${activeColor}`);
  diceElem.classList.add('rolling');
  canRoll = false;
  setTimeout(() => {
    diceElem.classList.remove('rolling');
    diceValue = Math.floor(Math.random() * 6) + 1;
    const diceFaces = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
    diceElem.innerText = diceFaces[diceValue - 1];
    if (diceValue === 6) {
      playSixSound();
      consecutiveSixes++;
      if (consecutiveSixes === 3) {
        document.getElementById('status-text').innerText = `পরপর ৩ বার ৬! চাল বাতিল হলো।`;
        setTimeout(nextTurn, 1200);
        return;
      }
    } else consecutiveSixes = 0;
    evaluateMoves();
  }, 400);
}
function evaluateMoves() {
  const currentColor = activePlayers[turnIndex];
  const playerPawns = pawns.filter(p => p.color === currentColor);
  activePawnsToMove = [];
  playerPawns.forEach(pawn => {
    if (pawn.step === -1 && diceValue === 6) activePawnsToMove.push(pawn);
    else if (pawn.step >= 0 && pawn.step + diceValue <= 56) activePawnsToMove.push(pawn);
  });
  if (activePawnsToMove.length === 0) {
    document.getElementById('status-text').innerText = `কোন চাল সম্ভব নয়! চাল পাস হচ্ছে...`;
    setTimeout(nextTurn, 1200);
  } else if (activePawnsToMove.length === 1) {
    highlightPawns(true);
    setTimeout(() => { onPawnClick(activePawnsToMove[0]); }, 400);
  } else {
    highlightPawns(true);
    document.getElementById('status-text').innerText = diceValue === 6
      ? `ছক্কা! একটি গুটি বেছে নিন।` : `চাল দেওয়ার জন্য গুটি বেছে নিন।`;
  }
}
function highlightPawns(enable) {
  if (!gameSettings.highlight && enable) return;
  activePawnsToMove.forEach(p => {
    if (enable) p.element.classList.add('highlight');
    else p.element.classList.remove('highlight');
  });
}
function getStepMs() {
  switch (gameSettings.speed) {
    case 'fast': return 140;
    case 'slow': return 400;
    default:     return 260;
  }
}
function animatePawnMove(pawn, fromStep, toStep, done) {
  let current = fromStep;
  const stepMs = getStepMs();
  const hop = () => {
    pawn.step = current;
    renderPawn(pawn);
    playHopSound();
    pawn.element.classList.remove('jumping');
    void pawn.element.offsetWidth;
    pawn.element.classList.add('jumping');
    const cleanup = () => {
      pawn.element.classList.remove('jumping');
      pawn.element.removeEventListener('animationend', cleanup);
    };
    pawn.element.addEventListener('animationend', cleanup);
    if (current >= toStep) { setTimeout(done, stepMs * 0.9); return; }
    current++;
    setTimeout(hop, stepMs);
  };
  hop();
}
function onPawnClick(pawn) {
  if (!activePawnsToMove.includes(pawn)) return;
  highlightPawns(false);
  activePawnsToMove = [];
  const fromStep = pawn.step;
  const toStep = pawn.step === -1 ? 0 : pawn.step + diceValue;
  if (fromStep === -1) {
    document.getElementById('status-text').innerText =
      `ছক্কা! ${pawn.color.toUpperCase()}-এর গুটি বোর্ডে উঠছে...`;
  } else {
    document.getElementById('status-text').innerText =
      `${pawn.color.toUpperCase()}-এর গুটি ${diceValue} ঘর লাফ দিচ্ছে...`;
  }
  animatePawnMove(pawn, fromStep, toStep, () => finishMove(pawn));
}
function finishMove(pawn) {
  let captured = false;
  let landedOnSafe = false;
  if (pawn.step >= 0 && pawn.step < 51) {
    const currentPathIdx = (playerConfigs[pawn.color].startIndex + pawn.step) % 52;
    if (safeIndices.includes(currentPathIdx)) {
      landedOnSafe = true;
      playSafeZoneSound();
    }
    if (!safeIndices.includes(currentPathIdx)) {
      const opponentPawns = pawns.filter(p =>
        p.color !== pawn.color &&
        p.step >= 0 && p.step < 51 &&
        ((playerConfigs[p.color].startIndex + p.step) % 52) === currentPathIdx
      );
      if (opponentPawns.length === 1) {
        const victim = opponentPawns[0];
        victim.step = -1;
        renderPawn(victim);
        captured = true;
        playCaptureSound();
        document.getElementById('status-text').innerText =
          `${victim.color.toUpperCase()}-এর গুটি কাটা পড়লো!`;
      }
    }
  }
  if (checkWin(pawn.color)) { handleMatchWin(pawn.color); return; }
  if (landedOnSafe && !captured) {
    document.getElementById('status-text').innerText =
      `⭐ ${pawn.color.toUpperCase()}-এর গুটি সেফ জোনে পৌঁছেছে!`;
  }
  if (diceValue === 6 || captured) {
    canRoll = true;
    document.getElementById('status-text').innerText =
      `${pawn.color.toUpperCase()} আবার ডাইস চালবেন!`;
  } else if (landedOnSafe) {
    setTimeout(() => nextTurn(), 400);
  } else nextTurn();
}
function handleMatchWin(winnerColor) {
  const isPlayerWin = (winnerColor === 'blue');
  document.getElementById('status-text').innerText =
    `🎉 ${winnerColor.toUpperCase()} বিজয়ী হয়েছে! 🎉`;
  canRoll = false;
  playWinSound();
  gameActive = false;
  if (currentBetInfo) {
    const prize = currentBetInfo.prize;
    const entry = currentBetInfo.amount;
    if (isPlayerWin) {
      profile.coins += prize;
      LudoAuth.setBalance(profile.coins);
      showToast(`🏆 আপনি ${formatCoins(prize)} টাকা প্রাইজ জিতেছেন! (এন্ট্রি ${formatCoins(entry)})`);
    } else {
      showToast(`😢 আপনি হেরেছেন। এন্ট্রি ${formatCoins(entry)} টাকা কেটে নেওয়া হয়েছে।`);
    }
    setTimeout(() => {
      document.getElementById('bet-badge').classList.remove('show');
    }, 2500);
    currentBetInfo = null;
  } else if (isPlayerWin) {
    showToast('🏆 অভিনন্দন! আপনি জিতেছেন!');
  }
  LudoAuth.recordMatch(isPlayerWin);
}
function checkWin(color) {
  return pawns.filter(p => p.color === color && p.step === 56).length === 4;
}

function startGame(mode, isBetMatch, roomPlayers) {
  if (mode === '1v1') activePlayers = ['blue', 'green'];
  else activePlayers = ['blue', 'red', 'green', 'yellow'];
  ALL_PLAYERS.forEach(color => {
    const card = document.getElementById(`card-${color}`);
    card.style.display = activePlayers.includes(color) ? '' : 'none';
  });
  applyProfileToGameCard();
  const t = document.getElementById('tb-title');
  if (t) {
    const modeLabel = mode === '1v1' ? '1 vs 1' : '4 PLAYER';
    t.innerText = isBetMatch ? `${modeLabel} · 💰 বাজি` : `${modeLabel} MATCH`;
  }
  document.getElementById('mode-screen').classList.add('hidden');
  document.getElementById('global-room-screen').classList.add('hidden');
  document.getElementById('game-wrapper').classList.add('visible');
  turnIndex = 0;
  canRoll = true;
  consecutiveSixes = 0;
  gameActive = true;
  amQuitter = false;
  updateTurnUI();
}

/* ============================================================
   ==================  FRIENDS SYSTEM  ========================
   ============================================================ */
const USERS_DB_KEY = 'ludoking_users_db_v1';
const DEMO_FRIEND_REQ_KEY = 'ludoking_demo_friend_req_v1';

const MOCK_USERS = [
  { uid: 'LK-RAHIM001', name: 'Rahim',   avatar: '🏎️' },
  { uid: 'LK-KARIM002', name: 'Karim',   avatar: '🐯' },
  { uid: 'LK-JAMAL003', name: 'Jamal',   avatar: '👑' },
  { uid: 'LK-NASIR004', name: 'Nasir',   avatar: '🦊' },
  { uid: 'LK-SABBI005', name: 'Sabbir',  avatar: '🐼' },
  { uid: 'LK-MITU0006', name: 'Mitu',    avatar: '👩‍💼' },
  { uid: 'LK-RANA0007', name: 'Rana',    avatar: '🦁' },
  { uid: 'LK-TANVI008', name: 'Tanvir',  avatar: '🐸' },
  { uid: 'LK-SOHAN009', name: 'Sohan',   avatar: '🤖' },
  { uid: 'LK-FAHIM010', name: 'Fahim',   avatar: '👽' }
];

let usersDB = {};
let friendsActiveTab = 'list';
let frSearchResult = null;

function loadUsersDB() {
  try {
    const raw = localStorage.getItem(USERS_DB_KEY);
    if (raw) usersDB = JSON.parse(raw) || {};
  } catch (e) { usersDB = {}; }
  if (typeof usersDB !== 'object' || usersDB === null) usersDB = {};
}
function saveUsersDB() {
  try { localStorage.setItem(USERS_DB_KEY, JSON.stringify(usersDB)); } catch (e) {}
}

function syncCurrentUserToDB() {
  if (!profile || !profile.uid) return;
  if (!usersDB[profile.uid]) {
    usersDB[profile.uid] = {
      uid: profile.uid,
      name: profile.name,
      avatar: profile.avatar,
      coins: profile.coins,
      friends: [],
      friendRequests: [],
      sentRequests: []
    };
  } else {
    usersDB[profile.uid].name = profile.name;
    usersDB[profile.uid].avatar = profile.avatar;
    usersDB[profile.uid].coins = profile.coins;
    if (!Array.isArray(usersDB[profile.uid].friends)) usersDB[profile.uid].friends = [];
    if (!Array.isArray(usersDB[profile.uid].friendRequests)) usersDB[profile.uid].friendRequests = [];
    if (!Array.isArray(usersDB[profile.uid].sentRequests)) usersDB[profile.uid].sentRequests = [];
  }
  profile.friends = usersDB[profile.uid].friends.slice();
  profile.friendRequests = usersDB[profile.uid].friendRequests.slice();
  profile.sentRequests = usersDB[profile.uid].sentRequests.slice();
  saveProfile();
  saveUsersDB();
}

function seedMockUsers() {
  let changed = false;
  MOCK_USERS.forEach(u => {
    if (!usersDB[u.uid]) {
      usersDB[u.uid] = {
        uid: u.uid, name: u.name, avatar: u.avatar, coins: 5000,
        friends: [], friendRequests: [], sentRequests: [],
        isMock: true
      };
      changed = true;
    }
  });
  if (changed) saveUsersDB();
}

function updateFriendsBadge() {
  if (!profile || !profile.uid) return;
  const count = (profile.friendRequests || []).length;
  const badge = document.getElementById('fr-req-badge');
  const mfpBadge = document.getElementById('mfp-badge');
  if (badge) {
    badge.style.display = count > 0 ? 'inline-block' : 'none';
    badge.innerText = count;
  }
  if (mfpBadge) {
    mfpBadge.style.display = count > 0 ? 'inline-block' : 'none';
    mfpBadge.innerText = count;
  }
}

function openFriendsScreen() {
  getAudioCtx();
  syncCurrentUserToDB();
  document.getElementById('mode-screen').classList.add('hidden');
  document.getElementById('friends-screen').classList.remove('hidden');
  friendsActiveTab = 'list';
  frSearchResult = null;
  const inp = document.getElementById('fr-search-input');
  if (inp) inp.value = '';
  updateFriendsTabsUI();
  renderFriendsScreen();
}
function closeFriendsScreen() {
  document.getElementById('friends-screen').classList.add('hidden');
  document.getElementById('mode-screen').classList.remove('hidden');
  updateFriendsBadge();
}
function refreshFriendsScreen() {
  syncCurrentUserToDB();
  renderFriendsScreen();
  showToast('🔄 রিফ্রেশ হয়েছে');
}
function switchFriendsTab(tab) {
  friendsActiveTab = tab;
  updateFriendsTabsUI();
  renderFriendsScreen();
  vibrate(10);
}
function updateFriendsTabsUI() {
  const t1 = document.getElementById('fr-tab-list');
  const t2 = document.getElementById('fr-tab-requests');
  if (t1) t1.classList.toggle('active', friendsActiveTab === 'list');
  if (t2) t2.classList.toggle('active', friendsActiveTab === 'requests');
}

function renderFriendsScreen() {
  const resultSlot = document.getElementById('fr-search-result-slot');
  if (resultSlot) {
    resultSlot.innerHTML = '';
    if (frSearchResult) {
      resultSlot.appendChild(buildSearchResultCard(frSearchResult));
    }
  }
  const contentSlot = document.getElementById('fr-content-slot');
  if (contentSlot) {
    contentSlot.innerHTML = '';
    if (friendsActiveTab === 'list') {
      renderFriendList(contentSlot);
    } else {
      renderRequestsList(contentSlot);
    }
  }
  updateFriendsBadge();
}
function doFriendSearch() {
  const input = document.getElementById('fr-search-input');
  if (!input) return;
  const q = (input.value || '').trim();
  if (!q) { showToast('⚠️ ইউজার আইডি লিখুন'); return; }

  fetch('/api/friend/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid: q })
  })
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      frSearchResult = { found: true, user: data.user };
    } else {
      frSearchResult = { found: false, query: q };
    }
    renderFriendsScreen();
    vibrate(15);
  })
  .catch(err => {
    showToast('সার্ভার কানেকশনে সমস্যা হয়েছে');
  });
}

function buildSearchResultCard(res) {
  const card = document.createElement('div');
  if (!res.found) {
    card.className = 'fr-result-card not-found';
    card.innerHTML = `❌ ইউজার পাওয়া যায়নি<br><b style="color:#ffde00;font-family:'Courier New',monospace;letter-spacing:1px;">${escapeHtml(res.query)}</b><br><span style="font-size:10.5px;opacity:0.8;">আইডি সঠিকভাবে লিখুন বা বানান চেক করুন</span>`;
    return card;
  }
  const u = res.user;
  card.className = 'fr-result-card';

  const av = document.createElement('div');
  av.className = 'fr-result-avatar';
  av.innerText = u.avatar;
  av.onclick = () => openProfileAction(u.uid, u.name, u.avatar);
  card.appendChild(av);

  const info = document.createElement('div');
  info.className = 'fr-result-info';

  let statusHtml = '';
  const myData = usersDB[profile.uid];
  const isSelf = u.uid === profile.uid;
  const isFriend = myData.friends.includes(u.uid);
  const isSent = myData.sentRequests.includes(u.uid);
  const isReceived = myData.friendRequests.includes(u.uid);

  if (isSelf) {
    statusHtml = '<div class="fr-result-status me">✨ এটা আপনার নিজের আইডি</div>';
  } else if (isFriend) {
    statusHtml = '<div class="fr-result-status friend">✅ ইতিমধ্যে বন্ধু</div>';
  } else if (isSent) {
    statusHtml = '<div class="fr-result-status sent">⏳ রিকোয়েস্ট পাঠানো হয়েছে</div>';
  } else if (isReceived) {
    statusHtml = '<div class="fr-result-status received">📬 উনি আপনাকে রিকোয়েস্ট পাঠিয়েছেন</div>';
  }

  info.innerHTML = `
    <div class="fr-result-name">${escapeHtml(u.name)}</div>
    <div class="fr-result-uid">${escapeHtml(u.uid)}</div>
    ${statusHtml}
  `;
  card.appendChild(info);

  const actions = document.createElement('div');
  actions.style.display = 'flex';
  actions.style.flexDirection = 'column';
  actions.style.gap = '6px';

  if (isSelf) {
    const b = document.createElement('button');
    b.className = 'fr-add-btn disabled';
    b.disabled = true;
    b.innerText = 'আপনি';
    actions.appendChild(b);
  } else if (isFriend) {
    const b = document.createElement('button');
    b.className = 'fr-add-btn';
    b.innerText = '💬 Message';
    b.style.background = 'linear-gradient(180deg, #0084ff, #0062cc)';
    b.style.color = '#fff';
    b.style.borderColor = '#0084ff';
    b.onclick = () => openChatWith(u.uid, u.name, u.avatar);
    actions.appendChild(b);
  } else if (isSent) {
    const b = document.createElement('button');
    b.className = 'fr-add-btn disabled';
    b.disabled = true;
    b.innerText = '⏳ অপেক্ষমাণ';
    actions.appendChild(b);
  } else if (isReceived) {
    const b = document.createElement('button');
    b.className = 'fr-add-btn';
    b.innerText = '✓ গ্রহণ';
    b.onclick = () => acceptFriendRequest(u.uid);
    actions.appendChild(b);
  } else {
    const b = document.createElement('button');
    b.className = 'fr-add-btn';
    b.innerText = '➕ Add Friend';
    b.onclick = () => sendFriendRequest(u.uid);
    actions.appendChild(b);
  }
  card.appendChild(actions);
  return card;
}

function renderFriendList(container) {
  syncCurrentUserToDB();
  const me = usersDB[profile.uid];
  const friendIds = me.friends || [];
  if (friendIds.length === 0) {
    container.innerHTML = `
      <div class="fr-empty">
        <span class="fr-empty-ico">👥</span>
        এখনও কোনো বন্ধু যোগ করা হয়নি।<br>
        উপরে <b style="color:#ffde00;">UID</b> দিয়ে সার্চ করে বন্ধু যোগ করুন!
      </div>
    `;
    return;
  }
  friendIds.forEach(uid => {
    const u = usersDB[uid];
    if (!u) return;
    container.appendChild(buildUserCard(u, 'friend'));
  });
}

function renderRequestsList(container) {
  syncCurrentUserToDB();
  const me = usersDB[profile.uid];
  const reqIds = me.friendRequests || [];
  const sentIds = me.sentRequests || [];
  let hasAny = false;

  if (reqIds.length > 0) {
    hasAny = true;
    const title = document.createElement('div');
    title.style.cssText = 'font-size:10px;color:#8bb4f0;font-weight:900;letter-spacing:2px;margin:4px 0;text-transform:uppercase;font-family:Arial,sans-serif;';
    title.innerText = `📬 আগত রিকোয়েস্ট (${reqIds.length})`;
    container.appendChild(title);
    reqIds.forEach(uid => {
      const u = usersDB[uid];
      if (!u) return;
      container.appendChild(buildUserCard(u, 'request'));
    });
  }
  if (sentIds.length > 0) {
    hasAny = true;
    const title = document.createElement('div');
    title.style.cssText = 'font-size:10px;color:#8bb4f0;font-weight:900;letter-spacing:2px;margin:14px 0 4px;text-transform:uppercase;font-family:Arial,sans-serif;';
    title.innerText = `⏳ পাঠানো রিকোয়েস্ট (${sentIds.length})`;
    container.appendChild(title);
    sentIds.forEach(uid => {
      const u = usersDB[uid];
      if (!u) return;
      container.appendChild(buildUserCard(u, 'sent'));
    });
  }
  if (!hasAny) {
    container.innerHTML = `
      <div class="fr-empty">
        <span class="fr-empty-ico">📬</span>
        কোনো পেন্ডিং রিকোয়েস্ট নেই।<br>
        নতুন বন্ধু খুঁজতে উপরে সার্চ করুন!
      </div>
    `;
  }
}

function buildUserCard(u, type) {
  const card = document.createElement('div');
  card.className = 'fr-user-card' + (type === 'request' ? ' request-card' : '');

  const av = document.createElement('div');
  av.className = 'fr-user-avatar';
  av.innerText = u.avatar;
  av.onclick = () => openProfileAction(u.uid, u.name, u.avatar);
  card.appendChild(av);

  const info = document.createElement('div');
  info.className = 'fr-user-info';
  info.innerHTML = `
    <div class="fr-user-name">${escapeHtml(u.name)}</div>
    <div class="fr-user-uid">${escapeHtml(u.uid)}</div>
  `;
  card.appendChild(info);

  const actions = document.createElement('div');
  actions.className = 'fr-user-actions';

  if (type === 'friend') {
    const msgBtn = document.createElement('button');
    msgBtn.className = 'fr-action-btn message';
    msgBtn.innerHTML = '💬 Message';
    msgBtn.onclick = () => openChatWith(u.uid, u.name, u.avatar);
    actions.appendChild(msgBtn);
  } else if (type === 'request') {
    const acc = document.createElement('button');
    acc.className = 'fr-action-btn accept';
    acc.innerHTML = '✓ গ্রহণ';
    acc.onclick = () => acceptFriendRequest(u.uid);
    actions.appendChild(acc);
    const rej = document.createElement('button');
    rej.className = 'fr-action-btn reject';
    rej.innerHTML = '✕ বাতিল';
    rej.onclick = () => rejectFriendRequest(u.uid);
    actions.appendChild(rej);
  } else if (type === 'sent') {
    const pending = document.createElement('div');
    pending.style.cssText = 'font-size:10px;color:#ffde00;font-weight:900;letter-spacing:0.5px;padding:8px 10px;border-radius:9px;background:rgba(255,222,0,0.12);border:1px solid rgba(255,222,0,0.35);';
    pending.innerText = '⏳ অপেক্ষমাণ';
    actions.appendChild(pending);
  }
  card.appendChild(actions);
  return card;
}

function sendFriendRequest(targetUid) {
  syncCurrentUserToDB();
  if (!targetUid || targetUid === profile.uid) return;
  if (!usersDB[targetUid]) { showToast('❌ ইউজার পাওয়া যায়নি'); return; }

  const me = usersDB[profile.uid];
  const other = usersDB[targetUid];

  if (me.friends.includes(targetUid)) { showToast('আপনি ইতিমধ্যে বন্ধু'); return; }
  if (me.sentRequests.includes(targetUid)) { showToast('⏳ রিকোয়েস্ট আগেই পাঠানো হয়েছে'); return; }

  if (me.friendRequests.includes(targetUid)) {
    acceptFriendRequest(targetUid);
    return;
  }

  me.sentRequests.push(targetUid);
  if (!other.friendRequests.includes(profile.uid)) {
    other.friendRequests.push(profile.uid);
  }
  saveUsersDB();
  syncCurrentUserToDB();
  vibrate([30, 15, 30]);
  showToast(`✅ ${other.name}-কে ফ্রেন্ড রিকোয়েস্ট পাঠানো হয়েছে`);

  if (other.isMock) {
    setTimeout(() => {
      simulateMockAccept(profile.uid, targetUid);
    }, 5000 + Math.random() * 4000);
  }

  if (frSearchResult && frSearchResult.found && frSearchResult.user && frSearchResult.user.uid === targetUid) {
    frSearchResult.user = usersDB[targetUid];
  }
  renderFriendsScreen();
}

function acceptFriendRequest(fromUid) {
  syncCurrentUserToDB();
  if (!usersDB[fromUid] || !usersDB[profile.uid]) return;
  const me = usersDB[profile.uid];
  const other = usersDB[fromUid];

  me.friendRequests = me.friendRequests.filter(id => id !== fromUid);
  other.sentRequests = other.sentRequests.filter(id => id !== profile.uid);
  if (!me.friends.includes(fromUid)) me.friends.push(fromUid);
  if (!other.friends.includes(profile.uid)) other.friends.push(profile.uid);

  saveUsersDB();
  syncCurrentUserToDB();
  vibrate([40, 25, 40]);
  showToast(`🎉 ${other.name} এখন আপনার বন্ধু!`);
  renderFriendsScreen();
}

function rejectFriendRequest(fromUid) {
  syncCurrentUserToDB();
  if (!usersDB[fromUid] || !usersDB[profile.uid]) return;
  const me = usersDB[profile.uid];
  const other = usersDB[fromUid];
  me.friendRequests = me.friendRequests.filter(id => id !== fromUid);
  other.sentRequests = other.sentRequests.filter(id => id !== profile.uid);
  saveUsersDB();
  syncCurrentUserToDB();
  vibrate(15);
  showToast('❌ রিকোয়েস্ট বাতিল করা হয়েছে');
  renderFriendsScreen();
}

function simulateMockAccept(myUid, mockUid) {
  if (!usersDB[mockUid] || !usersDB[myUid]) return;
  const me = usersDB[myUid];
  const other = usersDB[mockUid];
  if (!me.sentRequests.includes(mockUid)) return;
  me.sentRequests = me.sentRequests.filter(id => id !== mockUid);
  if (!me.friends.includes(mockUid)) me.friends.push(mockUid);
  other.friendRequests = other.friendRequests.filter(id => id !== myUid);
  if (!other.friends.includes(myUid)) other.friends.push(myUid);
  saveUsersDB();
  syncCurrentUserToDB();
  showToast(`🎉 ${other.name} আপনার রিকোয়েস্ট গ্রহণ করেছেন!`);
  vibrate([40, 25, 40]);
  renderFriendsScreen();
}

function maybeSendDemoRequests() {
  try {
    if (localStorage.getItem(DEMO_FRIEND_REQ_KEY) === '1') return;
  } catch (e) {}
  if (!profile || !profile.uid) return;
  syncCurrentUserToDB();
  const me = usersDB[profile.uid];
  const senders = ['LK-RAHIM001', 'LK-KARIM002', 'LK-MITU0006'];
  senders.forEach(uid => {
    const other = usersDB[uid];
    if (!other) return;
    if (!me.friendRequests.includes(uid)) me.friendRequests.push(uid);
    if (!other.sentRequests.includes(profile.uid)) other.sentRequests.push(profile.uid);
  });
  saveUsersDB();
  syncCurrentUserToDB();
  try { localStorage.setItem(DEMO_FRIEND_REQ_KEY, '1'); } catch (e) {}
  setTimeout(() => {
    const c = (profile.friendRequests || []).length;
    if (c > 0) showToast(`📬 ${c}টি নতুন ফ্রেন্ড রিকোয়েস্ট এসেছে!`);
    updateFriendsBadge();
  }, 2000);
}

/* ============================================================
   ==================  INBOX / CHAT SYSTEM  ==================
   ============================================================ */
const CONVERSATIONS_DB_KEY = 'ludoking_conversations_v1';
let conversationsDB = {};
let currentChatUserId = null;

function loadConversationsDB() {
  try {
    const raw = localStorage.getItem(CONVERSATIONS_DB_KEY);
    if (raw) conversationsDB = JSON.parse(raw) || {};
  } catch (e) { conversationsDB = {}; }
  if (typeof conversationsDB !== 'object' || conversationsDB === null) conversationsDB = {};
}
function saveConversationsDB() {
  try { localStorage.setItem(CONVERSATIONS_DB_KEY, JSON.stringify(conversationsDB)); } catch (e) {}
}

function getConversationId(uid1, uid2) {
  return [uid1, uid2].sort().join('__');
}

function getOrCreateConversation(uid1, uid2) {
  const convId = getConversationId(uid1, uid2);
  if (!conversationsDB[convId]) {
    conversationsDB[convId] = {
      conv_id: convId,
      participants: [uid1, uid2].sort(),
      messages: [],
      last_updated: Date.now()
    };
    saveConversationsDB();
  }
  return conversationsDB[convId];
}

function getConversation(uid1, uid2) {
  const convId = getConversationId(uid1, uid2);
  return conversationsDB[convId] || null;
}

function getTotalConversationCount() {
  if (!profile || !profile.uid) return 0;
  return Object.values(conversationsDB).filter(c =>
    c.participants.includes(profile.uid) && c.messages.length > 0
  ).length;
}

function getTotalUnreadCount() {
  if (!profile || !profile.uid) return 0;
  let total = 0;
  Object.values(conversationsDB).forEach(c => {
    if (!c.participants.includes(profile.uid)) return;
    c.messages.forEach(m => {
      if (m.sender_id !== profile.uid && !m.read) total++;
    });
  });
  return total;
}

function updateInboxBadge() {
  const count = getTotalUnreadCount();
  const badge = document.getElementById('mip-badge');
  if (badge) {
    badge.style.display = count > 0 ? 'inline-block' : 'none';
    badge.innerText = count;
  }
  updateProfileMenuCounts();
}

function markConversationRead(uid1, uid2) {
  const conv = getConversation(uid1, uid2);
  if (!conv) return;
  let changed = false;
  conv.messages.forEach(m => {
    if (m.sender_id !== profile.uid && !m.read) {
      m.read = true;
      changed = true;
    }
  });
  if (changed) {
    saveConversationsDB();
    updateInboxBadge();
  }
}

function openInboxScreen() {
  getAudioCtx();
  syncCurrentUserToDB();
  document.getElementById('mode-screen').classList.add('hidden');
  document.getElementById('inbox-screen').classList.remove('hidden');
  document.getElementById('friends-screen').classList.add('hidden');
  renderInboxList();
  updateInboxBadge();
}
function closeInboxScreen() {
  document.getElementById('inbox-screen').classList.add('hidden');
  document.getElementById('mode-screen').classList.remove('hidden');
  updateInboxBadge();
}
function refreshInboxScreen() {
  renderInboxList();
  updateInboxBadge();
  showToast('🔄 রিফ্রেশ হয়েছে');
}

function renderInboxList() {
  const list = document.getElementById('inbox-list');
  list.innerHTML = '';
  if (!profile || !profile.uid) return;

  const myConvs = Object.values(conversationsDB).filter(c =>
    c.participants.includes(profile.uid) && c.messages.length > 0
  );
  myConvs.sort((a, b) => b.last_updated - a.last_updated);

  if (myConvs.length === 0) {
    list.innerHTML = `
      <div class="fr-empty" style="margin-top:40px;">
        <span class="fr-empty-ico">💬</span>
        এখনও কোনো চ্যাট নেই।<br>
        বন্ধু তালিকা বা গ্লোবাল রুম থেকে<br>
        <b style="color:#ffde00;">💬 Message</b> বাটনে ক্লিক করুন!
      </div>
    `;
    return;
  }

  myConvs.forEach(conv => {
    const otherUid = conv.participants.find(u => u !== profile.uid);
    if (!otherUid) return;
    const other = usersDB[otherUid] || { name: 'Unknown', avatar: '👤', uid: otherUid };
    const lastMsg = conv.messages[conv.messages.length - 1];
    if (!lastMsg) return;

    const unreadCount = conv.messages.filter(m => m.sender_id !== profile.uid && !m.read).length;

    const item = document.createElement('div');
    item.className = 'conv-item' + (unreadCount > 0 ? ' unread' : '');
    item.onclick = () => openChatWith(otherUid, other.name, other.avatar);

    const previewText = lastMsg.sender_id === profile.uid
      ? 'আপনি: ' + lastMsg.text
      : lastMsg.text;

    item.innerHTML = `
      <div class="conv-avatar">${other.avatar}</div>
      <div class="conv-info">
        <div class="conv-name-row">
          <div class="conv-name">${escapeHtml(other.name)}</div>
          <div class="conv-time">${formatMsgTime(lastMsg.timestamp)}</div>
        </div>
        <div class="conv-preview">${escapeHtml(previewText)}</div>
      </div>
      ${unreadCount > 0 ? '<div class="conv-unread-dot"></div>' : ''}
    `;
    list.appendChild(item);
  });
}

function openChatWith(uid, name, avatar) {
  if (!uid || uid === profile.uid) {
    if (uid === profile.uid) showToast('নিজের সাথে চ্যাট করা যায় না');
    return;
  }
  getAudioCtx();
  syncCurrentUserToDB();
  ensureOtherUserExists(uid, name, avatar);
  getOrCreateConversation(profile.uid, uid);
  currentChatUserId = uid;

  document.getElementById('mode-screen').classList.add('hidden');
  document.getElementById('friends-screen').classList.add('hidden');
  document.getElementById('inbox-screen').classList.add('hidden');
  document.getElementById('global-room-screen').classList.add('hidden');
  document.getElementById('chat-screen').classList.remove('hidden');

  document.getElementById('chat-header-avatar').innerText = avatar || '👤';
  document.getElementById('chat-header-name').innerText = name || 'User';

  markConversationRead(profile.uid, uid);

  renderChatMessages();
  updateInboxBadge();

  setTimeout(() => {
    const inp = document.getElementById('chat-input');
    if (inp) inp.focus();
  }, 300);
}

function ensureOtherUserExists(uid, name, avatar) {
  if (!usersDB[uid]) {
    usersDB[uid] = {
      uid: uid, name: name || 'Unknown', avatar: avatar || '👤',
      coins: 0, friends: [], friendRequests: [], sentRequests: []
    };
    saveUsersDB();
  }
}

function closeChatScreen() {
  document.getElementById('chat-screen').classList.add('hidden');
  currentChatUserId = null;
  document.getElementById('inbox-screen').classList.remove('hidden');
  renderInboxList();
  updateInboxBadge();
}

function onChatHeaderClick() {
  if (!currentChatUserId) return;
  const u = usersDB[currentChatUserId];
  if (u) openProfileAction(u.uid, u.name, u.avatar);
}

function renderChatMessages() {
  if (!currentChatUserId) return;
  const body = document.getElementById('chat-body');
  const conv = getConversation(profile.uid, currentChatUserId);
  body.innerHTML = '';
  if (!conv || conv.messages.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'text-align:center;padding:40px 20px;color:#8bb4f0;font-family:Arial,sans-serif;font-size:12px;font-weight:bold;line-height:1.7;letter-spacing:0.3px;';
    empty.innerHTML = `💬<br>এখনও কোনো মেসেজ নেই।<br>প্রথম মেসেজটি পাঠান!`;
    body.appendChild(empty);
    return;
  }

  let lastDay = '';
  conv.messages.forEach(msg => {
    const d = new Date(msg.timestamp);
    const dayKey = d.toDateString();
    if (dayKey !== lastDay) {
      lastDay = dayKey;
      const sep = document.createElement('div');
      sep.className = 'chat-day-sep';
      const today = new Date().toDateString();
      const yest = new Date(Date.now() - 86400000).toDateString();
      if (dayKey === today) sep.innerText = 'আজ';
      else if (dayKey === yest) sep.innerText = 'গতকাল';
      else sep.innerText = d.getDate() + '/' + (d.getMonth() + 1) + '/' + d.getFullYear();
      body.appendChild(sep);
    }

    const row = document.createElement('div');
    row.className = 'chat-msg-row ' + (msg.sender_id === profile.uid ? 'me' : 'other');
    row.innerHTML = `
      <div class="chat-msg-bubble">
        <div>${escapeHtml(msg.text)}</div>
        <div class="chat-msg-time">${formatMsgTime(msg.timestamp)}</div>
      </div>
    `;
    body.appendChild(row);
  });

  setTimeout(() => {
    body.scrollTop = body.scrollHeight;
  }, 60);
}

function sendChatMessage() {
  if (!currentChatUserId) return;
  const inp = document.getElementById('chat-input');
  const text = (inp.value || '').trim();
  if (!text) return;
  if (text.length > 500) { showToast('⚠️ মেসেজ অনেক বড়'); return; }

  const conv = getOrCreateConversation(profile.uid, currentChatUserId);
  const msgObj = {
    id: 'msg_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
    sender_id: profile.uid,
    text: text,
    timestamp: Date.now(),
    read: false
  };
  conv.messages.push(msgObj);
  conv.last_updated = Date.now();
  saveConversationsDB();

  inp.value = '';
  vibrate(15);
  renderChatMessages();
  updateInboxBadge();

  const other = usersDB[currentChatUserId];
  if (other && other.isMock) {
    simulateMockReply(profile.uid, currentChatUserId);
  }
}

function simulateMockReply(myUid, mockUid) {
  const other = usersDB[mockUid];
  if (!other) return;

  const delay = 1500 + Math.random() * 2000;

  setTimeout(() => {
    const body = document.getElementById('chat-body');
    if (!body || currentChatUserId !== mockUid) return;
    let typingEl = document.getElementById('chat-typing-indicator');
    if (!typingEl) {
      typingEl = document.createElement('div');
      typingEl.id = 'chat-typing-indicator';
      typingEl.className = 'chat-typing';
      typingEl.innerHTML = '<span></span><span></span><span></span>';
      body.appendChild(typingEl);
      body.scrollTop = body.scrollHeight;
    }
  }, Math.max(400, delay - 900));

  setTimeout(() => {
    const typingEl = document.getElementById('chat-typing-indicator');
    if (typingEl) typingEl.remove();

    const replies = [
      'হ্যালো! কেমন আছো?',
      'চলো একটা ম্যাচ খেলি!',
      'দারুণ খেলছো তুমি!',
      'আজ কেমন আছেন?',
      'আমি এখন ব্যস্ত, পরে কথা বলি।',
      'কয়েন কত হলো তোমার?',
      'একটা ম্যাচ খেলবি?',
      'ঠিক আছে, দেখা হবে!',
      '😀😀😀',
      'Ludo King-এ ইনবক্স চ্যাট দারুণ কাজ করছে!',
      'হ্যাঁ, আমি এখানেই আছি!',
      'তোমার প্রোফাইলটা সুন্দর!'
    ];
    const text = replies[Math.floor(Math.random() * replies.length)];

    const conv = getConversation(myUid, mockUid);
    if (!conv) return;

    const msgObj = {
      id: 'msg_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      sender_id: mockUid,
      text: text,
      timestamp: Date.now(),
      read: (currentChatUserId === mockUid)
    };
    conv.messages.push(msgObj);
    conv.last_updated = Date.now();
    saveConversationsDB();

    if (soundEnabled) {
      try {
        const ctx = getAudioCtx();
        if (ctx) {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(880, ctx.currentTime);
          osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.15);
          gain.gain.setValueAtTime(0.0001, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.01);
          gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.22);
          osc.connect(gain); gain.connect(ctx.destination);
          osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.23);
        }
      } catch (e) {}
    }

    if (currentChatUserId === mockUid) {
      markConversationRead(myUid, mockUid);
      renderChatMessages();
    } else {
      showToast(`💬 ${other.name}: ${text.slice(0, 40)}${text.length > 40 ? '...' : ''}`);
    }
    updateInboxBadge();
  }, delay);
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && document.activeElement && document.activeElement.id === 'chat-input') {
    e.preventDefault();
    sendChatMessage();
  }
});

window.openInboxScreen = openInboxScreen;
window.openChatWith = openChatWith;

/* ================= LOAD ================= */
window.addEventListener('load', () => {
  loadSettings();
  loadProfile();
  loadUsersDB();
  seedMockUsers();
  syncCurrentUserToDB();
  loadConversationsDB();
  applyTheme(profile.theme);
  renderProfileUI();
  updateSettingsUI();
  updateFriendsBadge();
  updateInboxBadge();
  initBoard();

  setTimeout(() => {
    document.getElementById('splash').classList.add('hidden');
    document.getElementById('mode-screen').classList.remove('hidden');
  }, 2300);

  setTimeout(maybeSendDemoRequests, 5000);

  setTimeout(() => {
    if (usersDB['LK-RAHIM001']) {
      const conv = getConversation(profile.uid, 'LK-RAHIM001');
      if (!conv || conv.messages.length === 0) {
        const c = getOrCreateConversation(profile.uid, 'LK-RAHIM001');
        c.messages.push({
          id: 'msg_demo_' + Date.now(),
          sender_id: 'LK-RAHIM001',
          text: 'হ্যালো! কেমন আছো? একটা ম্যাচ খেলবি?',
          timestamp: Date.now(),
          read: false
        });
        c.last_updated = Date.now();
        saveConversationsDB();
        updateInboxBadge();
        showToast('💬 Rahim আপনাকে একটা মেসেজ পাঠিয়েছে!');
      }
    }
  }, 9000);

  if (LudoAuth.currentUser) LudoAuth.setUser(LudoAuth.currentUser);
});
