import { CONFIG } from './config.js';
import { findPath, isWalkable } from './navigation.js';
import { encodeState, decodePeerState } from './protocol.js';

const $ = id => document.getElementById(id);
const boot = $('boot');
const bootText = $('boot-text');
const rooms = {
  hall: { name: 'Chính điện', kicker: 'CHÍNH ĐIỆN · BÌNH AN', title: 'Dành cho mình một khoảng lặng', desc: 'Ở đây, bạn không cần vội vã. Hãy bước đi, cúi chào hoặc chỉ ngồi yên.', sky: 0xcad9d1, fog: 0xb8cbbc, light: 0xffe9c0 },
  garden: { name: 'Vườn thiền', kicker: 'VƯỜN THIỀN · THONG DONG', title: 'Lắng nghe màu xanh của núi', desc: 'Một chút gió, một chút nắng và một khoảnh khắc bình yên.', sky: 0xcde3cc, fog: 0xb9d1b3, light: 0xfaf7cd },
  moon: { name: 'Sân trăng', kicker: 'SÂN TRĂNG · GẶP GỠ', title: 'Dưới ánh trăng, ta cùng nhẹ bước', desc: 'Đèn lồng, âm nhạc và nhịp chuyển động an lành.', sky: 0xcad9d1, fog: 0xb8cbbc, light: 0xffe9c0 }
};
const prefixes = ['Mây', 'Gió', 'Lá', 'Nắng', 'Trăng', 'Suối', 'Sương', 'Sen', 'Đồi', 'Thông'];
const suffixes = ['bình yên', 'dịu dàng', 'thong dong', 'tĩnh lặng', 'ban mai', 'an nhiên', 'nhẹ bước'];
const playerName = prefixes[Math.floor(Math.random() * prefixes.length)] + ' ' + suffixes[Math.floor(Math.random() * suffixes.length)];
$('player-name').textContent = playerName;
let selectedRoom = 'hall';
let entered = false;
let bowCount = 0;
let beadCount = 0;
let beadCycles = 0;
let bowLoop = false;
let dancingUntil = 0;
let autoMoktak = null;
let incense = [];
let incenseSmoke = [];
let moonLights = [];
let lanternLights = [];
let walkPlane, route = [];
let nextTick = 0;
let quality = 0; // 0 auto, 1 high, 2 low
let serverNowOffset = 0;
let visitToken = sessionStorage.getItem("metamong.visit") || crypto.randomUUID();
sessionStorage.setItem("metamong.visit", visitToken);
let sequence = 0;
let serverRoom = "maru-1";
let serverInstance = "0";
let serverRegion = "apac";
let chantAudio = null;
let localQueued = false;
let sitting = false;
let inAction = null;
let bowStarted = 0;
let greetUntil = 0;
let audio = null;
let audioOn = false;
let THREE, scene, camera, renderer, clock, player, hemi, sun, floorMaterial, groundMaterial, pedestal, altarLight;
let otherGuests = [];
let crowd = null;
let isLive = false;
let socket = null;
let reconnectTimer = 0;
let nextSend = 0;
let worldTime = 0;
const peerGuests = new Map();
const keys = new Set();
const joystick = { x: 0, y: 0 };
let yaw = 0, pitch = 0.27, distance = 15;
let pointer = null;
let toastTimer = 0;

function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2300);
}
function setRoom(room) {
  if (!rooms[room]) return;
  selectedRoom = room;
  const r = rooms[room];
  $('scene-title').textContent = r.title;
  $('scene-desc').textContent = r.desc;
  $('room-kicker').textContent = r.kicker;
  if (scene) {
    scene.background.setHex(r.sky);
    scene.fog.color.setHex(r.fog);
    sun.color.setHex(r.light);
    sun.intensity = 2.45;
    if (groundMaterial) groundMaterial.color.setHex(0x92b392);
    if (floorMaterial) floorMaterial.color.setHex(0xd0cdb8);
  }
  if (entered) {
    resetPosition();
    route = [];
    // Navigation zones are in one world; they share the same multiplayer room.
  }
}
document.querySelectorAll('[data-room]').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('[data-room]').forEach(b => { b.classList.toggle('selected', b === button); b.setAttribute('aria-pressed', String(b === button)); });
  setRoom(button.dataset.room);
}));
function showOverlay(id, show) {
  $(id).hidden = !show;
  $(id).setAttribute('aria-hidden', String(!show));
  if (show) $(id).querySelector('button')?.focus();
  else $('temple')?.focus({ preventScroll: true });
}
for (let i = 2; i <= 100; i++) $('server-number').add(new Option(`maru-${i}`, String(i)));
for (let i = 1; i <= 15; i++) $('server-instance').add(new Option(String(i), String(i)));
const params = new URLSearchParams(location.search);
const rawRoom = /^maru-(?:[1-9]|[1-9][0-9]|100)$/.test(params.get('room') || '') ? params.get('room') : 'maru-1';
$('server-number').value = rawRoom.split('-')[1];
if (/^(?:[0-9]|1[0-5])$/.test(params.get('instance') || '')) $('server-instance').value = params.get('instance');
if (['apac','eur','nam','sam','oce','afr'].includes(params.get('region'))) $('server-region').value = params.get('region');
$('enter-button').addEventListener('click', () => {
  serverRoom = `maru-${$('server-number').value}`;
  serverInstance = $('server-instance').value;
  serverRegion = $('server-region').value;
  const u = new URL(location.href);
  u.searchParams.set('room', serverRoom); u.searchParams.set('instance', serverInstance); u.searchParams.set('region', serverRegion);
  history.replaceState(null, '', u);
  entered = true;
  resetPosition();
  showOverlay('welcome', false);
  $('focus-note').style.opacity = '1';
  setTimeout(() => { $('focus-note').style.opacity = '0'; }, 6500);
  connectPresence();
  $('temple').focus({ preventScroll: true });
});
$('room-button').addEventListener('click', () => showOverlay('welcome', true));
$('reset-button').addEventListener('click', () => { resetPosition(); toast('Bạn đã về cổng chùa'); });
$('help-button').addEventListener('click', () => showOverlay('help-modal', true));
$('help-close').addEventListener('click', () => showOverlay('help-modal', false));
$('help-done').addEventListener('click', () => showOverlay('help-modal', false));
$('beads-button').addEventListener('click', () => showOverlay('beads-modal', true));
$('beads-close').addEventListener('click', () => showOverlay('beads-modal', false));
for (const id of ['chant', 'donation']) {
  $(id + '-close').addEventListener('click', () => showOverlay(id + '-modal', false));
  $(id + '-modal').addEventListener('click', e => { if (e.target === $(id + '-modal')) showOverlay(id + '-modal', false); });
}
$('donation-button').addEventListener('click', () => showOverlay('donation-modal', true));
$('donation-done').addEventListener('click', () => showOverlay('donation-modal', false));
$('chant-button').addEventListener('click', () => showOverlay('chant-modal', true));
$('queue-close').addEventListener('click', () => showOverlay('queue-modal', false));
$('queue-beads').addEventListener('click', () => { showOverlay('queue-modal', false); showOverlay('beads-modal', true); });
$('quality-button').addEventListener('click', () => { quality = (quality + 1) % 3; $('quality-button').innerHTML = `<span aria-hidden="true">◈</span> Đồ họa: ${['tự động','cao','tiết kiệm'][quality]}`; applyQuality(); });
['beads-modal', 'help-modal'].forEach(id => $(id).addEventListener('click', e => { if (e.target === $(id)) showOverlay(id, false); }));
function updateProgress() {
  $('bow-count').textContent = `${bowCount} / 108`;
  $('bow-progress').style.width = `${bowCount / 108 * 100}%`;
  $('beads-number').textContent = beadCount;
  $('beads-round').textContent = `Vòng ${beadCycles} · ${beadCount % 27 || (beadCount ? 27 : 0)} / 27 hạt`;
  document.querySelectorAll('.bead').forEach((el, index) => el.classList.toggle('done', index < ((beadCount - 1 + 27) % 27 + 1) && beadCount > 0));
}
const beadsRing = $('beads-ring');
for (let i = 0; i < 27; i++) {
  const bead = document.createElement('span');
  bead.className = 'bead';
  const a = 2 * Math.PI * i / 27 - Math.PI / 2;
  bead.style.left = `${50 + 42.3 * Math.cos(a)}%`;
  bead.style.top = `${50 + 42.3 * Math.sin(a)}%`;
  beadsRing.appendChild(bead);
}
function nextBead() {
  if (beadCount === 108) { beadCount = 0; beadCycles++; }
  beadCount++;
  updateProgress();
  woodblock(590);
  if (beadCount === 108) toast('108 hạt · Một vòng viên mãn');
  sendState('beads');
}
$('beads-next').addEventListener('click', nextBead);
let beadPointerX = 0;
beadsRing.addEventListener('pointerdown', e => { beadPointerX = e.clientX; });
beadsRing.addEventListener('pointerup', e => { if (Math.abs(e.clientX - beadPointerX) > 15) nextBead(); });
function gesture() {
  if (!entered || !player) return;
  if (sitting) toggleSit();
  greetUntil = worldTime + 1.5;
  toast('Chắp tay · Xin chào trong yên lặng');
  sendState('greet');
}
function bow() {
  if (!entered || !player) return;
  if (bowCount >= 108) { bowCount = 0; updateProgress(); }
  bowLoop = !bowLoop;
  $('bow-label').textContent = bowLoop ? 'Dừng lạy' : 'Lạy Phật';
  if (bowLoop && !inAction) {
    sitting = false;
    inAction = 'bow';
    bowStarted = worldTime;
    sendState('bow');
  }
  if (!bowLoop) toast('Đã dừng lạy · Có thể tiếp tục khi sẵn sàng');
}
function toggleSit() {
  if (!entered || !player || inAction) return;
  sitting = !sitting;
  player.userData.body.position.y = sitting ? -0.27 : 0;
  player.userData.body.scale.y = sitting ? 0.78 : 1;
  toast(sitting ? 'Ngồi yên và thở thật chậm' : 'Chúc bạn một ngày dịu dàng');
  sendState(sitting ? 'sit' : 'idle');
}
function dance() {
  if (!entered) return;
  if (selectedRoom !== 'moon') { toast('Nhảy múa chỉ có tại Sân trăng'); return; }
  dancingUntil = worldTime + 8;
  toast('Nhịp chân dịu dàng dưới ánh trăng');
  sendState('dance');
}
function offer() {
  if (!entered) return;
  if (socket?.readyState === WebSocket.OPEN && isLive) {
    socket.send(JSON.stringify({ type: 'offer_request' }));
    toast('Đã gửi yêu cầu dâng hương đến hàng đợi');
  } else {
    addIncense('local-' + Date.now(), Date.now() + 120000);
    toast('Dâng hương mô phỏng · Nhang cháy 2 phút');
  }
  woodblock(450);
}
function toggleMoktak() {
  if (autoMoktak) { clearInterval(autoMoktak); autoMoktak = null; $('woodblock-label').textContent = 'Gõ mõ'; toast('Đã dừng gõ mõ'); return; }
  ensureAudio().then(() => {
    woodblock(430);
    autoMoktak = setInterval(() => { if (!document.hidden && entered) woodblock(430); }, 950);
    $('woodblock-label').textContent = 'Dừng mõ';
    toast('Gõ mõ nhịp chậm · Chọn lại để dừng');
    sendState('moktak');
  });
}
$('greet-button').addEventListener('click', gesture);
$('bow-button').addEventListener('click', bow);
$('dance-button').addEventListener('click', dance);
$('woodblock-button').addEventListener('click', toggleMoktak);
$('offer-button').addEventListener('click', offer);

// Ambient tones are synthesized in the browser; there is no borrowed chanting audio.
function makeAudio() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) { toast('Trình duyệt chưa hỗ trợ phát âm thanh'); return null; }
  const context = new Ctx();
  const master = context.createGain();
  master.gain.value = 0.0;
  master.connect(context.destination);
  const effects = context.createGain(); effects.gain.value = .55; effects.connect(context.destination);
  const noise = context.createBuffer(1, context.sampleRate * 3, context.sampleRate);
  const data = noise.getChannelData(0);
  let brown = 0;
  for (let i = 0; i < data.length; i++) { brown = (brown + .017 * (Math.random() * 2 - 1)) / 1.001; data[i] = brown * 0.34; }
  const src = context.createBufferSource(); src.buffer = noise; src.loop = true;
  const filter = context.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 800;
  src.connect(filter); filter.connect(master); src.start();
  const tones = [174.61, 261.63, 349.23];
  tones.forEach((freq, i) => {
    const osc = context.createOscillator(), gain = context.createGain();
    osc.type = 'sine'; osc.frequency.value = freq;
    gain.gain.value = .008 / (i + 1);
    osc.connect(gain); gain.connect(master); osc.start();
  });
  return { context, master, effects };
}
function woodblock(freq = 500) {
  if (!audio) return;
  const ctx = audio.context;
  const osc = ctx.createOscillator(), gain = ctx.createGain();
  osc.type = 'sine'; osc.frequency.setValueAtTime(freq, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(freq * .62, ctx.currentTime + .16);
  gain.gain.setValueAtTime(.06, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + .25);
  osc.connect(gain); gain.connect(audio.effects); osc.start(); osc.stop(ctx.currentTime + .26);
}
async function ensureAudio() { audio ||= makeAudio(); if (audio) await audio.context.resume(); }
$('sound-button').addEventListener('click', async () => {
  try {
    audio ||= makeAudio();
    if (!audio) return;
    await audio.context.resume();
    audioOn = !audioOn;
    audio.master.gain.setTargetAtTime(audioOn ? 0.35 : 0, audio.context.currentTime, .35);
    $('sound-button').textContent = audioOn ? '♪' : '♫';
    $('sound-button').setAttribute('aria-label', audioOn ? 'Tắt âm thanh' : 'Bật âm thanh thiên nhiên');
    toast(audioOn ? 'Đã bật âm thanh tĩnh tâm tổng hợp' : 'Đã tắt âm thanh');
  } catch (err) { console.warn(err); toast('Không thể phát âm thanh trên thiết bị này'); }
});

$('chant-source').textContent = CONFIG.chant?.url ? `${CONFIG.chant.title} · ${CONFIG.chant.creator} · ${CONFIG.chant.license}` : 'Chưa có bản ghi âm được cấp phép. Vui lòng cấu hình nguồn và ghi công trong src/config.js.';
$('chant-toggle').addEventListener('click', async () => {
  if (!CONFIG.chant?.url) { toast('Chưa có tệp tụng kinh được cấp phép'); return; }
  chantAudio ||= new Audio(CONFIG.chant.url);
  if (!chantAudio.paused) { chantAudio.pause(); $('chant-toggle').textContent = 'Bật tụng kinh'; return; }
  try {
    const korea = koreanMinutes();
    const start = [300,1080].find(x => korea >= x && korea < x + 10);
    if (start !== undefined && Number.isFinite(chantAudio.duration) && chantAudio.duration > 0) chantAudio.currentTime = ((korea - start) * 60 + (new Date(Date.now()+serverNowOffset)).getUTCSeconds()) % chantAudio.duration;
    await chantAudio.play(); $('chant-toggle').textContent = 'Tắt tụng kinh'; toast(start !== undefined ? 'Đang nghe giờ tụng chung' : 'Đang nghe riêng');
  } catch { toast('Không phát được tệp âm thanh'); }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (audio) audio.master.gain.setTargetAtTime(0, audio.context.currentTime, .1);
    if (chantAudio) chantAudio.pause();
  } else if (audio && audioOn) audio.master.gain.setTargetAtTime(.35, audio.context.currentTime, .2);
});

function material(color, options = {}) { return new THREE.MeshStandardMaterial({ color, roughness: .9, ...options }); }
function mesh(geometry, mat, parent, x = 0, y = 0, z = 0, shadow = true) {
  const obj = new THREE.Mesh(geometry, mat);
  obj.position.set(x, y, z);
  obj.castShadow = shadow; obj.receiveShadow = true;
  parent.add(obj);
  return obj;
}
function box(parent, w, h, d, color, x, y, z, options = {}) {
  return mesh(new THREE.BoxGeometry(w, h, d), typeof color === 'number' ? material(color) : color, parent, x, y, z, options.shadow !== false);
}
function cylinder(parent, rt, rb, height, color, x, y, z, segments = 12) {
  return mesh(new THREE.CylinderGeometry(rt, rb, height, segments), typeof color === 'number' ? material(color) : color, parent, x, y, z);
}
function sphere(parent, radius, color, x, y, z, segments = 12) {
  return mesh(new THREE.SphereGeometry(radius, segments, 9), typeof color === 'number' ? material(color) : color, parent, x, y, z);
}
function makeTree(x, z, scale = 1, variant = 0) {
  const group = new THREE.Group(); group.position.set(x, 0, z); group.scale.setScalar(scale); scene.add(group);
  cylinder(group, .17, .24, 2.2, 0x7c6650, 0, 1.1, 0);
  const tone = [0x597c5b, 0x72916b, 0x658a6a, 0x829d72][variant % 4];
  if (variant % 3 === 0) {
    for (let i = 0; i < 3; i++) mesh(new THREE.ConeGeometry(1.25 - i * .22, 2.5, 7), material(tone, { flatShading: true }), group, 0, 2.6 + i * .8, 0);
  } else {
    sphere(group, 1.25, tone, -.45, 2.45, 0);
    sphere(group, 1.15, tone, .53, 2.7, -.2);
    sphere(group, 1.16, tone, 0, 3.4, .08);
  }
}
function makeMonk(x, z, robe = 0xa77b55, scale = 1) {
  const root = new THREE.Group();
  root.position.set(x, .22, z);
  root.scale.setScalar(scale);
  const body = new THREE.Group(); root.add(body);
  const robeMat = material(robe, { roughness: 1 });
  const skin = material(0xe7b99b, { roughness: 1 });
  const collar = material(0xd4a680);
  const torso = mesh(new THREE.SphereGeometry(.51, 16, 12), robeMat, body, 0, .67, 0);
  torso.scale.set(1.08, 1.12, .82);
  cylinder(body, .36, .48, .55, robeMat, 0, .34, 0, 14);
  sphere(body, .45, skin, 0, 1.37, .04, 18);
  // Hairline/cap of a chubby novice; all geometry is original and procedural.
  sphere(body, .37, material(0x6c5144), 0, 1.71, -.09, 14).scale.set(1, .28, 1);
  // Smiling eyes and mouth face forward (local +Z).
  sphere(body, .042, 0x4d4136, -.17, 1.41, .432, 8).scale.set(1.1, .5, .5);
  sphere(body, .042, 0x4d4136, .17, 1.41, .432, 8).scale.set(1.1, .5, .5);
  const smile = mesh(new THREE.TorusGeometry(.096, .013, 5, 16, Math.PI), material(0x9b6e62), body, 0, 1.28, .47);
  smile.rotation.z = Math.PI;
  sphere(body, .12, 0xf4cfac, -.23, 1.22, .31, 9).scale.set(1, .7, .4);
  sphere(body, .12, 0xf4cfac, .23, 1.22, .31, 9).scale.set(1, .7, .4);
  sphere(body, .18, skin, -.47, .78, .28, 10);
  sphere(body, .18, skin, .47, .78, .28, 10);
  sphere(body, .14, collar, -.26, .18, .16, 10);
  sphere(body, .14, collar, .26, .18, .16, 10);
  const palms = sphere(body, .125, skin, 0, .9, .49, 10);
  palms.scale.set(.8, 1.45, .55);
  root.userData = { body, baseY: root.position.y, phase: Math.random() * Math.PI * 2 };
  return root;
}
function makeRoof(parent, x, y, z, width, depth, roofColor = 0x525c51) {
  const roof = new THREE.Group(); roof.position.set(x, y, z); parent.add(roof);
  const left = box(roof, width * .59, .29, depth + 2, roofColor, -width * .23, .12, 0);
  const right = box(roof, width * .59, .29, depth + 2, roofColor, width * .23, .12, 0);
  left.rotation.z = .31; right.rotation.z = -.31;
  cylinder(roof, .22, .22, depth + 2.3, 0x797d64, 0, 1.02, 0, 8).rotation.x = Math.PI / 2;
  box(roof, width + 1.4, .13, depth + 2.3, 0x6c6555, 0, -.74, 0);
  return roof;
}
function makeSign(parent, caption, x, y, z, width = 5) {
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 256;
  const c = canvas.getContext('2d');
  c.fillStyle = '#5d3a29'; c.fillRect(0, 0, canvas.width, canvas.height);
  c.strokeStyle = '#c7a977'; c.lineWidth = 14; c.strokeRect(15, 15, 994, 226);
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.font = 'bold 105px serif'; c.fillStyle = '#f5ddb0'; c.fillText(caption, 512, 135);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  return mesh(new THREE.PlaneGeometry(width, width / 4), new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }), parent, x, y, z, false);
}
function buildMoonCourt() {
  // This is a second, reachable outdoor zone, not a sky-color-only selection.
  const root = new THREE.Group(); root.position.set(29, 0, 20); scene.add(root);
  cylinder(root, 8.4, 8.6, .22, 0xc7bca5, 0, .11, 0, 36);
  for (let i=0;i<12;i++) {
    const a = i * Math.PI / 6;
    const x = Math.cos(a) * 7.5, z = Math.sin(a) * 7.5;
    cylinder(root, .12, .13, 3.7, 0x775747, x, 2, z, 8);
    const glass = sphere(root, .36, material(0xffdf9c, { emissive: 0xffc76a, emissiveIntensity: .4 }), x, 3.6, z, 10);
    glass.scale.y = 1.15;
    const lamp = new THREE.PointLight(0xffbd74, .0, 8, 2); lamp.position.set(x, 3.5, z); root.add(lamp); moonLights.push(lamp);
  }
  box(root, 4.2, 1.0, 1.7, 0x655b55, 0, .65, 2.7);
  for (let i=0;i<4;i++) {
    const dial = cylinder(root, .31, .31, .07, 0xabb2ae, -1.2 + i*.8, 1.2, 2.7);
    dial.rotation.x = Math.PI/2;
  }
  const canopy = mesh(new THREE.ConeGeometry(6.3, 2.4, 8), material(0xe0cab0, {side:THREE.DoubleSide}), root, 0, 5.7, 0);
  canopy.scale.z = 1.0;
  const floor = mesh(new THREE.CircleGeometry(6.9, 48), material(0xab9f91), root, 0, .23, 0, false);
  floor.rotation.x = -Math.PI / 2;
  makeSign(root, 'SÂN TRĂNG', 0, 4.0, -5.5, 4.2);
}
function addIncense(id, until) {
  if (!scene || incense.some(i => i.id === id)) return;
  if (incense.length >= 5) { incense.sort((a,b) => a.until - b.until); const old = incense.shift(); scene.remove(old.group); }
  const group = new THREE.Group();
  const offset = incense.length - 2;
  group.position.set(offset*.26, .95, -10.7);
  const ash = material(0x8c6652), ember = material(0xc85030,{emissive:0xc85030,emissiveIntensity:.6});
  cylinder(group, .023, .024, 1.2, ash, 0, .62, 0, 7);
  sphere(group, .05, ember, 0, 1.24, 0, 9);
  const smoke = sphere(group, .13, material(0xddd8cc,{transparent:true,opacity:.38,depthWrite:false}),0,1.55,0,8);
  smoke.scale.set(.8,2.4,.8);
  scene.add(group);
  incense.push({ id, until, group, smoke });
}
function koreanMinutes() {
  const parts = new Intl.DateTimeFormat('en-GB', {timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hourCycle:'h23'})
    .formatToParts(new Date(Date.now() + serverNowOffset));
  return Number(parts.find(p => p.type === 'hour')?.value || 0) * 60 + Number(parts.find(p => p.type === 'minute')?.value || 0);
}
function applySeoulTime() {
  if (!scene) return;
  const minutes = koreanMinutes(), day = minutes >= 360 && minutes < 1080;
  const h = String(Math.floor(minutes / 60)).padStart(2,'0'), m = String(minutes % 60).padStart(2,'0');
  $('korea-clock').textContent = `Seoul ${h}:${m} · ${day?'Ban ngày':'Ban đêm'}`;
  scene.background.setHex(day ? 0xcad9d1 : 0x1d2d3b);
  scene.fog.color.setHex(day ? 0xb8cbbc : 0x243342);
  hemi.intensity = day ? 2.5 : .5;
  sun.intensity = day ? 2.45 : .12;
  altarLight.intensity = day ? 1.6 : 3;
  moonLights.forEach(light => { light.intensity = day ? 0 : 2.2; });
  lanternLights.forEach(light => { light.intensity = day ? 0 : 1.7; });
  // Night-time emission handled separately from sunlight for lightweight devices.
}
function applyQuality() {
  if (!renderer) return;
  const low = quality === 2 || (quality === 0 && (innerWidth < 700 || peerGuests.size >= 45));
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, low ? 1 : 1.6));
  renderer.shadowMap.enabled = !low;
  renderer.shadowMap.needsUpdate = !low;
}
function buildTemple() {
  groundMaterial = material(0x92b392, { flatShading: true });
  walkPlane = mesh(new THREE.PlaneGeometry(250, 250), groundMaterial, scene, 0, -.03, 0, false); walkPlane.rotation.x = -Math.PI / 2;
  floorMaterial = material(0xd0cdb8);
  box(scene, 28, .54, 24, floorMaterial, 0, 0, -3);
  box(scene, 29, .2, 25, 0xb8b5a0, 0, -.27, -3);
  // Front steps and tiled path.
  for (let i = 0; i < 3; i++) box(scene, 8.7, .13, 1.2, 0xc3c3ab, 0, -.22 - i * .06, 9.5 + i * .91);
  box(scene, 4, .04, 37, 0xc4bfa6, 0, .005, 24, { shadow: false });
  // Subtle terracotta floor joints.
  for (let x = -13; x <= 13; x += 2) box(scene, .022, .012, 23.7, 0xbebda8, x, .277, -3, { shadow: false });
  for (let z = -14; z <= 8; z += 2) box(scene, 27.7, .012, .022, 0xbebda8, 0, .278, z, { shadow: false });
  // Rear worship hall and columns.
  box(scene, 19, .5, 7.4, 0xbdad90, 0, .59, -11.1);
  box(scene, 17.5, 4.6, .25, 0xe9e5d5, 0, 3.0, -14.65);
  for (let x = -9; x <= 9; x += 4.5) {
    cylinder(scene, .26, .31, 4.6, 0x795f4b, x, 2.92, -7.5);
    cylinder(scene, .35, .35, .17, 0xc7b88d, x, 5.16, -7.5);
    cylinder(scene, .36, .42, .18, 0xc0b18d, x, .61, -7.5);
  }
  box(scene, 20, .34, .42, 0x775d47, 0, 5.13, -7.5);
  makeRoof(scene, 0, 6.05, -11, 21.4, 8.1, 0x545c4e);
  makeSign(scene, '淸緣堂', 0, 4.75, -7.14, 4.7);
  box(scene, 16.5, .13, .45, 0x8d624a, 0, 4.63, -14.3);
  // Open doors and partition details.
  for (let x of [-8.2, -5.9, 5.9, 8.2]) box(scene, .12, 3.6, .16, 0xa28c71, x, 2.3, -14.45);
  // Altar and quiet centerpiece.
  pedestal = new THREE.Group(); pedestal.position.set(0, .85, -12.1); scene.add(pedestal);
  box(pedestal, 6.0, .48, 2.7, 0x816852, 0, .15, 0);
  box(pedestal, 5.5, .17, 2.4, 0xceb28a, 0, .47, 0);
  cylinder(pedestal, 1.1, 1.35, .35, 0x938265, 0, .74, -.3, 16);
  cylinder(pedestal, .7, 1.03, .75, 0xba9b62, 0, 1.31, -.3, 18);
  sphere(pedestal, .62, 0xc3aa72, 0, 1.79, -.3, 16);
  sphere(pedestal, .4, 0xd1b782, 0, 2.64, -.3, 16);
  sphere(pedestal, .29, 0xd2b883, 0, 3.04, -.35, 12).scale.set(1, .6, 1);
  cylinder(pedestal, 1.1, 1.1, .08, 0xe4cc8a, 0, .54, -.3, 18);
  // Procedural stand-ins for bodhisattvas, not unlicensed museum GLB assets.
  for (const x of [-1.9, 1.9]) {
    cylinder(pedestal, .54, .63, .19, 0xd1bb8d, x, .66, -.35, 14);
    sphere(pedestal, .37, 0xc7b07b, x, 1.3, -.35, 14).scale.set(.85,1.5,.7);
    sphere(pedestal, .22, 0xdccaa5, x, 1.9, -.34, 12);
    mesh(new THREE.TorusGeometry(.33,.05,6,16), material(0xe4d1a2),pedestal,x,2.0,-.38).rotation.x=Math.PI/2;
  }
  for (const x of [-2.2, 2.2]) {
    cylinder(pedestal, .095, .16, .4, 0xc5a267, x, .73, .48);
    sphere(pedestal, .13, 0xffb86b, x, .97, .48);
  }
  altarLight = new THREE.PointLight(0xffdfab, 1.6, 10, 2); altarLight.position.set(0, 3.8, -10); scene.add(altarLight);
  // 100 pads in 10 × 10, two InstancedMesh calls instead of 200 independent meshes.
  const cushionBase = new THREE.InstancedMesh(new THREE.CylinderGeometry(.54, .56, .18, 10), material(0x916b5b), 100);
  const cushionTop = new THREE.InstancedMesh(new THREE.CylinderGeometry(.44, .45, .035, 10), material(0xb78c77), 100);
  const helper = new THREE.Object3D();
  for (let row = 0; row < 10; row++) for (let col = 0; col < 10; col++) {
    const n = row*10+col, x = (col - 4.5)*2.48, z = (row - 4.5)*1.47 + .1;
    helper.position.set(x,.39,z); helper.scale.set(1,1,.86); helper.updateMatrix(); cushionBase.setMatrixAt(n,helper.matrix);
    helper.position.y=.49; helper.updateMatrix(); cushionTop.setMatrixAt(n,helper.matrix);
  }
  cushionBase.castShadow = cushionTop.castShadow = true;
  cushionBase.receiveShadow = cushionTop.receiveShadow = true;
  scene.add(cushionBase,cushionTop);
  // Stone lanterns flank the entrance.
  for (const x of [-11.6, 11.6]) {
    cylinder(scene, .27, .4, 1.1, 0xc4c2ad, x, .8, 7.6);
    box(scene, .9, .62, .9, 0xc7c9b0, x, 1.58, 7.6);
    makeRoof(scene, x, 2.28, 7.6, 1.22, .9, 0x838b79);
    const lamp = new THREE.PointLight(0xffc273, 0, 9, 2); lamp.position.set(x,2.05,7.6); scene.add(lamp); lanternLights.push(lamp);
  }
  // Distant mountains, forest and low-poly shrubs.
  for (let i = 0; i < 17; i++) {
    const a = i * 2.399;
    const radius = 45 + (i % 4) * 7;
    const x = Math.sin(a) * radius, z = Math.cos(a) * radius;
    mesh(new THREE.ConeGeometry(13 + (i % 3) * 4, 16 + (i % 4) * 6, 6), material(i % 2 ? 0x8aa994 : 0x9db6a2, { flatShading: true }), scene, x, 4.2, z, false);
  }
  for (let i = 0; i < 90; i++) {
    const angle = i * 2.39996;
    const r = 18 + (i % 8) * 4.1;
    const x = Math.cos(angle) * r, z = Math.sin(angle) * r;
    if (Math.abs(x) < 8 && z > 8 && z < 25) continue;
    makeTree(x, z, .56 + (i % 5) * .16, i);
  }
  // Ponds and small stones to make the site feel lived in.
  for (const x of [-18, 18]) {
    const pond = mesh(new THREE.CircleGeometry(4.2, 28), material(0x86ada4, { metalness: .05, roughness: .28 }), scene, x, .018, 3, false);
    pond.rotation.x = -Math.PI / 2;
    for (let i = 0; i < 10; i++) {
      const a = i * 2 * Math.PI / 10;
      const stone = sphere(scene, .35 + i % 3 * .09, 0xd3d1bd, x + Math.cos(a) * 4.3, .16, 3 + Math.sin(a) * 3.7, 7);
      stone.scale.set(1.3, .6, .9);
    }
    // Lotus lanterns and leaves above the pond.
    for(let i=0;i<7;i++) {
      const a = i*2.4, px = x + Math.cos(a)*2.6, pz = 3 + Math.sin(a)*2.4;
      sphere(scene,.43,0x5c9b68,px,.06,pz,8).scale.set(1,.12,.85);
      sphere(scene,.23,material(0xffdba7,{emissive:0xffb674,emissiveIntensity:.15}),px,.33,pz,10).scale.y=1.2;
    }
  }
  // Main gate and the 3D outdoor moon court.
  for(const x of [-3.5,3.5]) cylinder(scene,.32,.36,4.4,0x765840,x,2.2,40);
  box(scene,8.3,.55,.8,0x604c3a,0,4.5,40);
  makeRoof(scene,0,5.3,40,9.2,1.6,0x555f56);
  makeSign(scene,'SƠN TỰ',0,4.5,39.49,4.1);
  buildMoonCourt();
}
function resetPosition() {
  if (!player) return;
  if (selectedRoom === 'garden') player.position.set(-19, .22, 12);
  else if (selectedRoom === 'moon') player.position.set(27, .22, 15);
  else player.position.set(0, .22, 8);
  player.rotation.y = Math.PI;
  if (sitting) toggleSit();
  yaw = 0; pitch = .28; distance = 15;
  route = [];
}
function addGuests() {
  for (const p of otherGuests) scene.remove(p);
  otherGuests = [];
  for (let i = 0; i < 13; i++) {
    const x = [-10.5,-7.5,-4.5,4.5,7.5,10.5][i % 6];
    const z = [-4,-1,2,5][Math.floor(i / 6) % 4];
    const monk = makeMonk(x, z, [0x9d7a60,0xb18b63,0x938268,0x9b795d][i%4], .76 + i % 3 * .07);
    monk.rotation.y = Math.PI;
    monk.userData.npc = true;
    monk.userData.index = i;
    scene.add(monk); otherGuests.push(monk);
  }
}
function updateOthers(t) {
  otherGuests.forEach(monk => {
    const u = monk.userData;
    const phase = t * .75 + u.phase;
    u.body.rotation.x = ((u.index % 4 === 0) ? Math.pow(Math.max(0, Math.sin(phase)), 4) : 0) * .65;
    u.body.position.y = (u.index % 3 === 1 ? -.22 : 0) + Math.sin(t * 1.8 + u.phase) * .01;
  });
  for (const monk of peerGuests.values()) monk.userData.body.rotation.x *= .9;
}
function initScene() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xcad9d1);
  scene.fog = new THREE.FogExp2(0xb8cbbc, .011);
  camera = new THREE.PerspectiveCamera(49, innerWidth / innerHeight, .1, 180);
  renderer = new THREE.WebGLRenderer({ canvas: $('temple'), antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.7));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.45;
  hemi = new THREE.HemisphereLight(0xf0f7f0, 0x8d9274, 2.5); scene.add(hemi);
  sun = new THREE.DirectionalLight(0xffe9c0, 2.45);
  sun.position.set(-18, 31, 18); sun.castShadow = true;
  sun.shadow.mapSize.set(1024,1024);
  sun.shadow.camera.left = -35; sun.shadow.camera.right = 35;
  sun.shadow.camera.top = 35; sun.shadow.camera.bottom = -35;
  sun.shadow.normalBias = .04;
  scene.add(sun);
  buildTemple();
  player = makeMonk(0, 8, 0xb47e59, 1.12);
  player.rotation.y = Math.PI;
  scene.add(player);
  addGuests();
  createCrowd();
  clock = new THREE.Clock();
  setRoom(selectedRoom);
  applyQuality();
  applySeoulTime();
  setInterval(applySeoulTime, 60000);
  setInterval(() => { if (isLive && socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({type:'sync'})); }, 20000);
  window.addEventListener('resize', resize, { passive: true });
  startInput();
  animate();
}
function resize() {
  if (!camera || !renderer) return;
  camera.aspect = innerWidth / innerHeight;
  camera.fov = innerWidth < 700 ? 62 : 49;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  applyQuality();
}
function startInput() {
  document.addEventListener('keydown', e => {
    if (!entered) return;
    if ($('beads-modal').hidden === false) {
      if (e.key === 'Escape') showOverlay('beads-modal', false);
      else if (e.key === ' ') { e.preventDefault(); nextBead(); }
      return;
    }
    if (!$('help-modal').hidden || !$('welcome').hidden) { if (e.key === 'Escape') showOverlay('help-modal', false); return; }
    const key = e.key.toLowerCase();
    if (['arrowup','arrowdown','arrowleft','arrowright',' '].includes(key)) e.preventDefault();
    keys.add(key);
    if (e.repeat) return;
    if (['1','e',' '].includes(key)) bow();
    if (key === '2') showOverlay('beads-modal', true);
    if (key === '3') gesture();
    if (key === '4') dance();
    if (key === '5') toggleMoktak();
    if (key === '6') offer();
  });
  document.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => keys.clear());
  const canvas = $('temple'), pointers = new Map(); let pinchDistance = 0;
  canvas.addEventListener('pointerdown', e => {
    if (!entered) return;
    pointers.set(e.pointerId, { x:e.clientX,y:e.clientY,fromX:e.clientX,fromY:e.clientY,moved:0 });
    canvas.setPointerCapture(e.pointerId);
    if (pointers.size === 2) {
      const pp = [...pointers.values()]; pinchDistance = Math.hypot(pp[0].x-pp[1].x,pp[0].y-pp[1].y);
    }
  });
  canvas.addEventListener('pointermove', e => {
    const p = pointers.get(e.pointerId); if (!p) return;
    p.moved += Math.hypot(e.clientX-p.x,e.clientY-p.y);
    if (pointers.size === 2) {
      p.x=e.clientX; p.y=e.clientY;
      const pp=[...pointers.values()], d=Math.hypot(pp[0].x-pp[1].x,pp[0].y-pp[1].y);
      distance=Math.max(6,Math.min(38,distance-(d-pinchDistance)*.03)); pinchDistance=d; return;
    }
    if(p.moved>6) { yaw -= (e.clientX-p.x)*.0045; pitch=Math.max(.08,Math.min(.85,pitch+(e.clientY-p.y)*.003)); }
    p.x=e.clientX; p.y=e.clientY;
  });
  canvas.addEventListener('pointerup', e => {
    const p = pointers.get(e.pointerId);
    if(p && p.moved < 8 && pointers.size === 1 && !inAction) {
      const rect = canvas.getBoundingClientRect();
      const mouse = new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1, -(e.clientY-rect.top)/rect.height*2+1);
      const raycaster = new THREE.Raycaster(); raycaster.setFromCamera(mouse,camera);
      const hit = raycaster.intersectObject(walkPlane,false)[0];
      if(hit) {
        const dest = {x:hit.point.x,z:hit.point.z};
        route=findPath(player.position,dest);
        if(!route.length) toast('Chưa tìm được đường đi đến vị trí đó');
      }
    }
    pointers.delete(e.pointerId); pinchDistance=0;
  });
  canvas.addEventListener('pointercancel', e => { pointers.delete(e.pointerId); pinchDistance=0; });
  $('temple').addEventListener('wheel', e => { distance = Math.max(7.5, Math.min(26, distance + e.deltaY * .018)); }, { passive: true });
  const j = $('joystick'), knob = $('joystick-knob');
  let activePointer = null;
  const updateJoy = e => {
    const rect = j.getBoundingClientRect();
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx, dy = e.clientY - cy;
    const max = rect.width * .32;
    const factor = Math.min(1, max / (Math.hypot(dx, dy) || 1));
    joystick.x = dx * factor / max;
    joystick.y = dy * factor / max;
    knob.style.transform = `translate(${joystick.x * max}px,${joystick.y * max}px)`;
  };
  j.addEventListener('pointerdown', e => { activePointer = e.pointerId; j.setPointerCapture(e.pointerId); updateJoy(e); });
  j.addEventListener('pointermove', e => { if (activePointer === e.pointerId) updateJoy(e); });
  const release = () => { activePointer = null; joystick.x = joystick.y = 0; knob.style.transform = ''; };
  j.addEventListener('pointerup', release); j.addEventListener('pointercancel', release);
}
function createCrowd() {
  const count = CONFIG.maxPeersRendered || 100;
  const torso = new THREE.InstancedMesh(new THREE.SphereGeometry(.47,10,8),material(0x947a5c),count);
  const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(.39,10,9),material(0xe1b697),count);
  const caps = new THREE.InstancedMesh(new THREE.SphereGeometry(.31,9,6),material(0x604e3e),count);
  torso.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  heads.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  caps.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  [torso,heads,caps].forEach(m=>{m.count=0; m.frustumCulled=false; scene.add(m);});
  crowd={torso,heads,caps};
}
function renderCrowd(time) {
  if (!crowd) return;
  const dummy=new THREE.Object3D();
  let i=0;
  for(const peer of peerGuests.values()) {
    if(i >= (CONFIG.maxPeersRendered||100)) break;
    const dt=Math.max(0,(performance.now()-peer.updated)/1000),
      px=peer.x+Math.min(dt,.3)*peer.vx, pz=peer.z+Math.min(dt,.3)*peer.vz;
    const danceBob = peer.action==='dance' ? Math.abs(Math.sin(time*8))*.18 : 0;
    const bow = peer.action==='bow' ? .65 : 0;
    dummy.position.set(px,.65+danceBob,pz);
    dummy.rotation.set(bow,peer.yaw,0); dummy.scale.set(.85,.85,.75); dummy.updateMatrix(); crowd.torso.setMatrixAt(i,dummy.matrix);
    dummy.position.set(px,1.42+danceBob-bow*.3,pz); dummy.rotation.set(0,0,0); dummy.scale.set(.9,.9,.9); dummy.updateMatrix(); crowd.heads.setMatrixAt(i,dummy.matrix);
    dummy.position.y+=.26; dummy.scale.set(1,.25,1); dummy.updateMatrix(); crowd.caps.setMatrixAt(i,dummy.matrix);
    i++;
  }
  [crowd.torso,crowd.heads,crowd.caps].forEach(m=>{m.count=i;m.instanceMatrix.needsUpdate=true;});
}
function animate(timestamp=0) {
  requestAnimationFrame(animate);
  const dense=peerGuests.size>=45;
  const fps=(quality===2 || (quality===0 && dense)) ? 15 : (quality===0 && innerWidth<700 ? 30 : 60);
  if(timestamp && timestamp < nextTick) return;
  nextTick = timestamp + 1000/fps;
  const dt=Math.min(.07,clock.getDelta()); worldTime+=dt;
  const interactive=entered && $('welcome').hidden && $('beads-modal').hidden && $('help-modal').hidden && $('chant-modal').hidden && $('queue-modal').hidden;
  if(interactive && !inAction && !sitting) {
    let mx=(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0)+joystick.x;
    let mz=(keys.has('s')||keys.has('arrowdown')?1:0)-(keys.has('w')||keys.has('arrowup')?1:0)+joystick.y;
    let dx=0,dz=0;
    if(Math.hypot(mx,mz)>.08) {
      route=[]; const len=Math.max(1,Math.hypot(mx,mz));mx/=len;mz/=len;
      dx=mx*Math.cos(yaw)+mz*Math.sin(yaw);dz=-mx*Math.sin(yaw)+mz*Math.cos(yaw);
    } else if(route.length) {
      const first=route[0];dx=first.x-player.position.x;dz=first.z-player.position.z;
      const d=Math.hypot(dx,dz);
      if(d<.23) route.shift(); else {dx/=d;dz/=d;}
    }
    if(Math.hypot(dx,dz)>.1) {
      const speed=(keys.has('shift')?5.8:3.25)*dt;
      const nx=player.position.x+dx*speed,nz=player.position.z+dz*speed;
      if(isWalkable(nx,nz)) player.position.set(nx,player.position.y,nz);
      else route=[];
      const desired=Math.atan2(dx,dz), delta=(desired-player.rotation.y+Math.PI*3)%(Math.PI*2)-Math.PI;
      player.rotation.y+=delta*Math.min(1,dt*13);
      player.userData.body.position.y=Math.sin(worldTime*11)*.04;
    } else player.userData.body.position.y*=.85;
  }
  if(inAction==='bow') {
    const t=Math.min(1,(worldTime-bowStarted)/1.35);
    player.userData.body.rotation.x=Math.sin(t*Math.PI)*.95;
    if(t>=1) {
      player.userData.body.rotation.x=0;bowCount++;updateProgress();woodblock(420);
      if(bowCount===108) {bowLoop=false;toast('Hoàn thành 108 lạy · Bình an');}
      else if(bowCount%10===0) toast(`${bowCount} lạy · Từng bước thật nhẹ nhàng`);
      inAction=bowLoop?'bow':null;
      $('bow-label').textContent=bowLoop?'Dừng lạy':'Lạy Phật';
      if(bowLoop){bowStarted=worldTime;sendState('bow');} else sendState('idle');
    }
  }
  if(greetUntil>worldTime) player.userData.body.rotation.z=Math.sin(worldTime*7)*.035;
  else player.userData.body.rotation.z*=.8;
  if(dancingUntil>worldTime && !inAction) player.userData.body.rotation.z=Math.sin(worldTime*9)*.25;
  const now=Date.now()+serverNowOffset;
  incense=incense.filter(i=>{if(i.until>now){i.smoke.position.y=1.55+Math.sin(worldTime*1.4)*.18;i.smoke.material.opacity=.22+Math.sin(worldTime*2)*.09;return true;}scene.remove(i.group);return false;});
  updateOthers(worldTime);
  renderCrowd(worldTime);
  const target=player ? player.position.clone().add(new THREE.Vector3(0,1,-1.6)) : new THREE.Vector3();
  const az=new THREE.Vector3(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch)+.3,Math.cos(yaw)*Math.cos(pitch));
  camera.position.lerp(target.clone().addScaledVector(az,distance),1-Math.exp(-dt*3.9));camera.lookAt(target);
  renderer.render(scene,camera);
  if(socket?.readyState===WebSocket.OPEN && isLive && worldTime>nextSend){
    nextSend=worldTime+.15;
    sendState(inAction||(dancingUntil>worldTime?'dance':sitting?'sit':'idle'));
  }
}
function sendState(action) {
  if(socket?.readyState!==WebSocket.OPEN || !player || !isLive) return;
  sequence=(sequence+1)&65535;
  const p=player.position;
  socket.send(encodeState({x:p.x,z:p.z,yaw:player.rotation.y,action},sequence));
}
function addPeer(id,state={}) {
  if(!id || id===visitToken) return;
  if(!peerGuests.has(id) && peerGuests.size>=(CONFIG.maxPeersRendered||100)) return;
  const old=peerGuests.get(id);
  const x=Math.max(-43,Math.min(43,Number(state.x)||0)),z=Math.max(-31,Math.min(47,Number(state.z)||0));
  const n=performance.now(), dt=old?Math.max(.08,(n-old.updated)/1000):1;
  peerGuests.set(id,{x,z, yaw:Number(state.yaw)||0,action:state.action||'idle',name:String(state.name||old?.name||'Khách an nhiên').slice(0,30),updated:n,vx:old?(x-old.x)/dt:0,vz:old?(z-old.z)/dt:0});
}
function removePeers(){peerGuests.clear();if(crowd)[crowd.torso,crowd.heads,crowd.caps].forEach(m=>m.count=0);}
function presenceStatus(text){$('presence-chip').textContent=text;}
function showQueue(position){
  localQueued=true;
  $('queue-message').textContent=`Bạn đang ở vị trí ${position} trong phòng chờ. Vẫn có thể lần tràng hạt trong lúc đợi.`;
  if($('queue-modal').hidden) showOverlay('queue-modal',true);
  presenceStatus(`Đang chờ vào ${serverRoom} · vị trí ${position}`);
}
function connectPresence(){
  clearTimeout(reconnectTimer);
  if(socket){socket.onclose=null;socket.close();socket=null;}
  removePeers();isLive=false;localQueued=false;
  presenceStatus('Khách tham quan mô phỏng');addGuests();
  const base=(CONFIG.apiBase||'').trim().replace(/\/$/,'');
  if(!base || !/^https:\/\//.test(base) || !entered) return;
  try {
    const url=new URL(base.replace(/^https:/,'wss:')+'/ws');
    url.searchParams.set('room',serverRoom);
    url.searchParams.set('instance',serverInstance);
    url.searchParams.set('region',serverRegion);
    url.searchParams.set('name',playerName);
    url.searchParams.set('visit',visitToken);
    socket=new WebSocket(url);socket.binaryType='arraybuffer';
    socket.onmessage=e=>{
      if(e.data instanceof ArrayBuffer){
        const state=decodePeerState(e.data);
        if(state && isLive) {addPeer(state.id,state);renderCrowd(worldTime);}
        return;
      }
      let message;try{message=JSON.parse(e.data);}catch{return;}
      if(message.type==='welcome') {
        isLive=message.status==='active';
        serverNowOffset=Number(message.now)?Number(message.now)-Date.now():0;
        if(message.status==='waiting'){showQueue(message.position||1);return;}
        localQueued=false;showOverlay('queue-modal',false);
        otherGuests.forEach(n=>scene.remove(n));otherGuests=[];
        (message.peers||[]).forEach(p=>addPeer(p.id,p));
        (message.incense||[]).forEach(o=>addIncense(o.id,o.until));
        presenceStatus(`Trực tuyến · ${peerGuests.size+1} người · ${serverRoom}`);
        applyQuality();
      } else if(message.type==='queue'){showQueue(message.position||1);}
      else if(message.type==='promoted') {
        localQueued=false;showOverlay('queue-modal',false);isLive=true;
        otherGuests.forEach(n=>scene.remove(n));otherGuests=[];
        (message.peers||[]).forEach(p=>addPeer(p.id,p));
        presenceStatus(`Trực tuyến · ${peerGuests.size+1} người`);
      }
      else if(message.type==='join' && message.peer){addPeer(message.peer.id,message.peer);}
      else if(message.type==='sync') {removePeers();(message.peers||[]).forEach(p=>addPeer(p.id,p));(message.incense||[]).forEach(o=>addIncense(o.id,o.until));}
      else if(message.type==='leave'){peerGuests.delete(message.id);}
      else if(message.type==='ack') { /* sequence acknowledgement, no UI needed */ }
      else if(message.type==='incense_start') {addIncense(message.id,message.until);toast('Đã đến lượt dâng hương');}
      else if(message.type==='offer_queue'){toast(`Đang đợi dâng hương · vị trí ${message.position}`);}
      if(isLive)presenceStatus(`Trực tuyến · ${peerGuests.size+1} người · ${serverRoom}`);
    };
    socket.onopen=()=>{ socket.send(JSON.stringify({type: 'sync'})); };
    socket.onclose=()=>{
      if(!entered)return;
      isLive=false;removePeers();addGuests();
      presenceStatus('Mất kết nối · đang hiển thị khách mô phỏng');
      reconnectTimer=setTimeout(()=>{if(entered&&$('welcome').hidden)connectPresence();},7000);
    };
    socket.onerror=()=>{};
  } catch(err){console.warn('Không thể kết nối phòng trực tuyến:',err);}
}
async function start() {
  try {
    bootText.textContent = 'Đang chuẩn bị khuôn viên và cây cối…';
    try { THREE = await import('https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js'); }
    catch { THREE = await import('https://cdnjs.cloudflare.com/ajax/libs/three.js/0.180.0/three.module.js'); }
    initScene();
    boot.hidden = true;
    $('experience').hidden = false;
    resize();
  } catch (err) {
    console.error('Khởi tạo Sơn Tự thất bại:', err);
    bootText.textContent = 'Không tải được không gian 3D. Hãy kiểm tra Internet và WebGL, sau đó thử lại.';
    $('boot-retry').hidden = false;
  }
}
start();
