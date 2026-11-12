/* ONE Navigation Web - v1.0. Compatible with the user's tested ONE Web Config V0.8 packets.
   No OTA/firmware writing. All Bluetooth writes target the FF01 image characteristic. */
(() => {
'use strict';
const N = window.NavCore;
const $ = id => document.getElementById(id);
const SERVICE = '0000ff00-0000-1000-8000-00805f9b34fb';
const IMAGE_CHAR = '0000ff01-0000-1000-8000-00805f9b34fb';
const ble = { device: null, characteristic: null, busy: false, lastSent: 0, lastKey: '' };
const nav = { map: null, gpsCircle: null, destinationCircle: null, routePolylines: [],
  loaded: false, loading: null, route: null, steps: [], userLocation: null,
  destination: null, watchId: null, active: false, wakeLock: null,
  cue: { kind: 'right', distance: '150 m', road: 'Nguyễn Văn Linh', footer: 'Chế độ thử' } };

function logger(text) {
  const node = $('log');
  node.textContent = `[${new Date().toLocaleTimeString('vi-VN')}] ${text}\n` + node.textContent;
  node.textContent = node.textContent.slice(0, 10000);
}
function status(id, value, severity = '') {
  const el = $(id); el.textContent = value; el.className = `state ${severity}`.trim();
}
function connected() { return !!(ble.device?.gatt?.connected && ble.characteristic); }
function syncButtons() {
  $('disconnect').disabled = !connected();
  $('sendDemo').disabled = !connected();
  $('calculate').disabled = !nav.loaded || !nav.userLocation;
  $('start').disabled = !nav.route || nav.active;
  $('stop').disabled = !nav.active;
  $('recalculate').disabled = !nav.loaded || !nav.userLocation || !nav.destination;
}
function drawArrow(ctx, dir) {
  ctx.strokeStyle = '#000'; ctx.fillStyle = '#000';
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = 9;
  if (dir === 'left' || dir === 'right') {
    ctx.save();
    if (dir === 'left') { ctx.translate(72, 0); ctx.scale(-1, 1); }
    ctx.beginPath(); ctx.moveTo(22, 76); ctx.lineTo(22, 47); ctx.quadraticCurveTo(22, 31, 38, 31);
    ctx.lineTo(55, 31); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(41, 17); ctx.lineTo(56, 31); ctx.lineTo(41, 45); ctx.stroke();
    ctx.restore();
  } else if (dir === 'straight') {
    ctx.beginPath(); ctx.moveTo(36, 75); ctx.lineTo(36, 20); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(21, 36); ctx.lineTo(36, 20); ctx.lineTo(51, 36); ctx.stroke();
  } else if (dir === 'uturn') {
    ctx.beginPath(); ctx.moveTo(20, 77); ctx.lineTo(20, 43);
    ctx.quadraticCurveTo(20, 22, 38, 22); ctx.quadraticCurveTo(55, 22, 55, 41);
    ctx.lineTo(55, 59); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(43, 46); ctx.lineTo(55, 60); ctx.lineTo(67, 46); ctx.stroke();
  } else if (dir === 'roundabout') {
    ctx.beginPath(); ctx.arc(36, 47, 21, 0.36 * Math.PI, 1.88 * Math.PI); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(24, 17); ctx.lineTo(49, 11); ctx.lineTo(46, 37); ctx.stroke();
  } else if (dir === 'arrived') {
    ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(20, 79); ctx.lineTo(20, 14); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(23, 14); ctx.lineTo(65, 14); ctx.lineTo(51, 32); ctx.lineTo(65, 50);
    ctx.lineTo(23, 50); ctx.closePath(); ctx.fill();
  } else {
    ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(35, 38, 22, 0, 2 * Math.PI); ctx.stroke();
    ctx.font = 'bold 37px Arial'; ctx.fillText('!', 27, 51);
  }
}
function redraw(cue = nav.cue) {
  nav.cue = { ...cue };
  const size = $('size').value.split('x').map(Number); const canvas = $('screen');
  canvas.width = size[0]; canvas.height = size[1];
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.save(); ctx.scale(canvas.width / 212, canvas.height / 104);
  drawArrow(ctx, cue.kind);
  ctx.fillStyle = '#000';
  ctx.font = 'bold 12px Arial'; ctx.fillText(cue.title || N.directionTitle(cue.kind), 76, 20, 131);
  ctx.font = 'bold 28px Arial'; ctx.fillText(cue.distance || ' ', 76, 52, 130);
  ctx.font = '12px Arial'; ctx.fillText(cue.road || ' ', 76, 72, 131);
  ctx.fillRect(5, 83, 202, 1);
  if (cue.source === 'google') {
    // Display attribution on the secondary E-Ink screen, outside the Google map UI.
    ctx.font = '12px Arial';
    ctx.fillText(cue.footer || '', 7, 99, 115);
    ctx.fillText('Google Maps', 135, 99, 71);
  } else {
    ctx.font = '10px Arial'; ctx.fillText(cue.footer || 'ONE Navigation', 8, 97, 196);
  }
  ctx.restore();
}
// Identical packing orientation to the earlier Web_BLE_Test that the user verified on hardware.
function packBW270(canvas) {
  const w = canvas.width, h = canvas.height;
  const src = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  const out = new Uint8Array(Math.ceil(h / 8) * w);
  let p = 0;
  for (let y = 0; y < w; y++) for (let block = 0; block < Math.ceil(h / 8); block++) {
    let value = 0;
    for (let bit = 0; bit < 8; bit++) {
      const x = block * 8 + bit;
      if (x >= h) continue;
      const sourceIdx = (x * w + (w - 1 - y)) * 4;
      const white = src[sourceIdx] > 0 && src[sourceIdx + 1] > 0 && src[sourceIdx + 2] > 0;
      if (white) value |= 1 << (7 - bit);
    }
    out[p++] = value;
  }
  return out;
}
async function writePacket(buf) {
  if (ble.characteristic.writeValueWithResponse) return ble.characteristic.writeValueWithResponse(buf);
  return ble.characteristic.writeValue(buf);
}
async function sendImage(cue, force = false) {
  if (!connected() || ble.busy || document.hidden) return;
  const now = Date.now();
  const key = [cue.kind, cue.title, cue.distance, cue.road, cue.footer].join('|');
  if (!force && (key === ble.lastKey || now - ble.lastSent < Number($('interval').value) * 1000)) return;
  ble.busy = true;
  try {
    redraw(cue);
    const data = packBW270($('screen'));
    const begin = new Uint8Array(136).fill(0xff);
    const bview = new DataView(begin.buffer);
    begin[0] = 0x80; bview.setUint32(2, data.length, true);
    await writePacket(begin);
    for (let offset = 0; offset < data.length; offset += 128) {
      const frame = new Uint8Array(136).fill(0xff);
      const view = new DataView(frame.buffer);
      frame[0] = 0x81; view.setUint16(1, offset, false);
      const chunk = data.slice(offset, offset + 128);
      frame[3] = chunk.length; frame.set(chunk, 8);
      await writePacket(frame);
    }
    const finish = new Uint8Array(136); finish[0] = 0x82; finish[1] = 0; // Refresh only, no Flash write.
    await writePacket(finish);
    ble.lastSent = Date.now(); ble.lastKey = key;
    logger(`Gửi ảnh OK (${data.length} bytes): ${cue.title || N.directionTitle(cue.kind)} ${cue.distance}`);
  } catch (err) {
    logger(`LỖI truyền ảnh: ${err.message}`);
    status('bleStatus', 'Lỗi truyền Bluetooth: ' + err.message, 'bad');
  } finally { ble.busy = false; syncButtons(); }
}
async function connect() {
  if (!navigator.bluetooth || !window.isSecureContext) {
    status('bleStatus', 'Cần Chrome Android và trang HTTPS. Không kết nối được nếu mở file trực tiếp hoặc qua HTTP khác localhost.', 'bad'); return;
  }
  try {
    if (!ble.device) {
      ble.device = await navigator.bluetooth.requestDevice({
        filters: [{ namePrefix: 'ONE-' }], optionalServices: [SERVICE]
      });
      ble.device.addEventListener('gattserverdisconnected', () => {
        ble.characteristic = null; ble.lastKey = ''; syncButtons();
        status('bleStatus', 'E-Ink đã ngắt kết nối. Nhấn Kết nối Bluetooth để thử lại.', 'warn');
      });
    }
    const server = await ble.device.gatt.connect();
    const svc = await server.getPrimaryService(SERVICE);
    ble.characteristic = await svc.getCharacteristic(IMAGE_CHAR);
    ble.lastKey = '';
    status('bleStatus', `Đã kết nối: ${ble.device.name} · FF00 / FF01`);
    logger('BLE kết nối ' + ble.device.name);
  } catch (err) {
    logger('Lỗi BLE: ' + err.message);
    status('bleStatus', 'Không kết nối được: ' + err.message, 'bad');
  }
  syncButtons();
}
function demoCue() {
  return { kind: $('demoDir').value, distance: $('demoDistance').value.trim() || '150 m',
    road: $('demoRoad').value.trim() || 'Đường tiếp theo', footer: 'Chế độ thử ONE-2.13L' };
}
function showGPS(p, accuracy) {
  nav.userLocation = p;
  $('originText').value = `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`;
  if (nav.map) {
    if (!nav.gpsCircle) {
      nav.gpsCircle = new google.maps.Circle({map: nav.map, center: p,
        radius: 9, fillColor: '#1d4ed8', fillOpacity: 1, strokeColor: '#ffffff', strokeWeight: 2 });
      nav.map.setCenter(p);
    } else nav.gpsCircle.setCenter(p);
  }
  syncButtons();
  logger(`GPS ${p.lat.toFixed(5)}, ${p.lng.toFixed(5)} · ±${Math.round(accuracy)} m`);
}
async function locate() {
  if (!navigator.geolocation || !window.isSecureContext) {
    status('mapStatus', 'GPS trình duyệt yêu cầu HTTPS và quyền Vị trí.', 'bad'); return;
  }
  status('mapStatus', 'Đang xin quyền vị trí từ điện thoại…');
  return new Promise(resolve => {
    navigator.geolocation.getCurrentPosition(position => {
      const p = { lat: position.coords.latitude, lng: position.coords.longitude };
      showGPS(p, position.coords.accuracy);
      status('mapStatus', `Đã có GPS ±${Math.round(position.coords.accuracy)} m. Nhập điểm đến, nhấn Tính tuyến Google.`);
      resolve(p);
    }, e => {
      status('mapStatus', 'Không lấy được GPS: ' + e.message + '. Cho phép vị trí chính xác của Chrome trên Samsung.', 'bad');
      resolve(null);
    }, { enableHighAccuracy: true, maximumAge: 3000, timeout: 18000 });
  });
}
async function loadGoogle() {
  if (nav.loaded) { status('mapStatus', 'Google Maps đã tải. Chọn điểm đến rồi tính tuyến.'); return; }
  if (nav.loading) return nav.loading;
  const key = $('apiKey').value.trim();
  if (!/^AIza[A-Za-z0-9_-]{25,}$/.test(key)) {
    status('mapStatus', 'Hãy nhập Google Maps Platform API key hợp lệ (thường bắt đầu bằng AIza).', 'warn'); return;
  }
  nav.loading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    let finished = false;
    const timer = setTimeout(() => done(new Error('Hết thời gian tải Google Maps. Kiểm tra Internet/API key.')), 30000);
    function done(error) {
      if (finished) return; finished = true; clearTimeout(timer);
      delete window.oneNavGoogleLoaded;
      error ? reject(error) : resolve();
    }
    window.oneNavGoogleLoaded = () => done();
    script.async = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&language=vi&region=VN&loading=async&callback=oneNavGoogleLoaded`;
    script.onerror = () => done(new Error('Không tải được script Google Maps.'));
    document.head.appendChild(script);
  });
  try {
    await nav.loading;
    nav.map = new google.maps.Map($('map'), {
      center: nav.userLocation || { lat: 16.0544, lng: 108.2022 }, zoom: 14,
      fullscreenControl: false, streetViewControl: false, mapTypeControl: false
    });
    nav.map.addListener('click', e => {
      nav.destination = { lat: e.latLng.lat(), lng: e.latLng.lng() };
      $('destination').value = `${nav.destination.lat.toFixed(6)}, ${nav.destination.lng.toFixed(6)}`;
      drawDestinationCircle();
      status('mapStatus', 'Đã chọn điểm đến trên bản đồ. Nhấn Tính tuyến Google.');
      syncButtons();
    });
    nav.loaded = true;
    status('mapStatus', 'Đã tải Google Maps. Lấy GPS và nhập điểm đến (hoặc chạm bản đồ).');
    logger('Google Maps Platform tải thành công.');
  } catch (err) {
    logger('Google Maps: ' + err.message);
    status('mapStatus', 'Lỗi Google Maps: ' + err.message + ' — kiểm tra API key, billing và tên miền cho phép.', 'bad');
  } finally { nav.loading = null; syncButtons(); }
}
function drawDestinationCircle() {
  if (!nav.map || !nav.destination) return;
  if (nav.destinationCircle) nav.destinationCircle.setMap(null);
  nav.destinationCircle = new google.maps.Circle({map: nav.map, center: nav.destination, radius: 18,
    fillColor: '#ef4444', fillOpacity: .72, strokeColor: '#ffffff', strokeWeight: 2});
}
function readDestination() {
  const value = $('destination').value.trim();
  if (!value) return null;
  const match = /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/.exec(value);
  if (match) {
    const lat = +match[1], lng = +match[2];
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return { lat, lng };
  }
  return value;
}
function drawRoute(route) {
  for (const shape of nav.routePolylines) shape.setMap(null);
  nav.routePolylines.length = 0;
  const path = (route.path || []).map(N.point).filter(Boolean);
  if (path.length) {
    nav.routePolylines.push(new google.maps.Polyline({ map: nav.map, path,
      strokeColor: '#246bd3', strokeWeight: 5, strokeOpacity: .9 }));
    const bounds = new google.maps.LatLngBounds();
    path.forEach(p => bounds.extend(p));
    nav.map.fitBounds(bounds, 28);
  }
  if (typeof nav.destination === 'object' && nav.destination) drawDestinationCircle();
}
async function calculate() {
  if (!nav.loaded || !nav.userLocation) { status('mapStatus', 'Cần tải bản đồ và lấy GPS trước.', 'warn'); return; }
  const target = readDestination();
  if (!target) { status('mapStatus', 'Hãy nhập địa chỉ hoặc chọn điểm đến trên bản đồ.', 'warn'); return; }
  $('calculate').disabled = true;
  status('mapStatus', 'Đang tính tuyến từ GPS hiện tại bằng Google Routes API…');
  try {
    const { Route } = await google.maps.importLibrary('routes');
    const result = await Route.computeRoutes({
      origin: nav.userLocation, destination: target, travelMode: $('travelMode').value,
      fields: ['path', 'distanceMeters', 'durationMillis', 'legs.steps.path',
        'legs.steps.maneuver', 'legs.steps.instructions', 'legs.steps.distanceMeters',
        'legs.steps.startLocation', 'legs.steps.endLocation']
    });
    const route = result.routes?.[0];
    if (!route) throw new Error('Google không tìm được tuyến đường.');
    const steps = N.routeSteps(route);
    if (!steps.length) throw new Error('Không có bước chỉ dẫn; kiểm tra Google Routes API.');
    nav.route = route; nav.steps = steps;
    nav.destination = typeof target === 'object' ? target : N.point(steps[steps.length - 1].end);
    drawRoute(route); syncButtons();
    const km = N.distanceLabel(route.distanceMeters || steps.reduce((s,v)=>s+v.distanceMeters,0));
    const warning = route.warnings?.length ? '\nCảnh báo Google: ' + route.warnings.join('; ') : '';
    status('mapStatus', `Có tuyến đường ${km}, ${steps.length} chặng. Nhấn Bắt đầu dẫn đường.${warning}`);
    logger(`Tuyến Google: ${km}, ${steps.length} bước.`);
    if (nav.active && nav.userLocation) processPosition(nav.userLocation, 20);
  } catch (e) {
    logger('Lỗi tính tuyến: ' + e.message);
    status('mapStatus', 'Không tính được tuyến: ' + e.message + '. Hãy kiểm tra Routes API/billing và thử chế độ Ô tô.', 'bad');
  } finally { syncButtons(); }
}
function gpsError(e) {
  status('navStatus', 'Mất GPS hoặc không có quyền Vị trí: ' + e.message + '. Không tin vào mũi tên cũ.', 'bad');
  logger('GPS error: ' + e.message);
}
async function tryWakeLock() {
  if (!('wakeLock' in navigator) || document.hidden || !nav.active) return;
  try { nav.wakeLock = await navigator.wakeLock.request('screen'); }
  catch (e) { logger('Không giữ sáng màn hình: ' + e.message); }
}
function processPosition(p, accuracy) {
  if (!nav.route || !nav.steps.length) return;
  const match = N.matchRoute(p, nav.steps);
  if (!match) { status('navStatus', 'Không xác định được vị trí trên tuyến đường.', 'warn'); return; }
  // Avoid updating with unreliable GPS or route match.
  if (accuracy > 80) {
    status('navStatus', `GPS chưa chính xác (±${Math.round(accuracy)} m). Chờ tín hiệu tốt hơn.`, 'warn'); return;
  }
  if (match.crossTrack > Math.max(65, 1.5 * accuracy)) {
    const warning = { kind: 'unknown', title: 'LỆCH TUYẾN', distance: '',
      road: 'Xem điện thoại', footer: 'Tính lại tuyến', source: 'google' };
    redraw(warning);
    status('navStatus', `Cách tuyến đã tính khoảng ${Math.round(match.crossTrack)} m. Dừng/chọn tính lại tuyến; không đi theo mũi tên cũ.`, 'warn');
    if (nav.active && connected()) void sendImage(warning);
    return;
  }
  let cue;
  const atEnd = match.stepIndex === nav.steps.length - 1 && match.metersToTurn < 30;
  if (atEnd) {
    cue = { kind: 'arrived', distance: '', road: 'Đến gần điểm đích', footer: 'Kiểm tra GPS', source: 'google' };
  } else if (match.stepIndex === nav.steps.length - 1) {
    // The last segment ends at destination; do NOT show the previous turn again.
    cue = { kind: 'straight', title: 'TỚI ĐÍCH', distance: N.distanceLabel(match.metersRemaining),
      road: 'Tiếp tục theo đường', footer: 'Gần đích', source: 'google' };
  } else {
    const next = nav.steps[match.nextIndex];
    const kind = N.maneuverKind(next?.maneuver, next?.instructions);
    cue = { kind, distance: N.distanceLabel(match.metersToTurn),
      road: N.shortInstruction(next?.instructions), footer: N.remainingLabel(match.metersRemaining), source: 'google' };
  }
  redraw(cue);
  const title = cue.title || N.directionTitle(cue.kind);
  status('navStatus', `${title} • ${cue.distance} • ${cue.road}. ${cue.footer}\nGPS ±${Math.round(accuracy)} m · lệch tuyến ${Math.round(match.crossTrack)} m.`);
  if (nav.active && connected()) void sendImage(cue);
}
async function startNavigation() {
  if (!nav.route || nav.active) return;
  if (!nav.userLocation) { status('navStatus', 'Chưa có GPS.', 'warn'); return; }
  nav.active = true;
  // The first real instruction should override the previous manual BLE demo immediately.
  ble.lastSent = 0; ble.lastKey = '';
  syncButtons();
  if (!connected()) status('navStatus', 'Đang theo dõi GPS nhưng chưa kết nối E-Ink. Hãy nhấn Kết nối Bluetooth.', 'warn');
  try {
    nav.watchId = navigator.geolocation.watchPosition(position => {
      const p = { lat: position.coords.latitude, lng: position.coords.longitude };
      showGPS(p, position.coords.accuracy);
      if (!document.hidden) processPosition(p, position.coords.accuracy);
    }, gpsError, { enableHighAccuracy: true, maximumAge: 1500, timeout: 16000 });
    processPosition(nav.userLocation, 20);
    await tryWakeLock();
    logger('Đã bắt đầu theo dõi tuyến bằng GPS.');
  } catch (err) {
    nav.active = false; syncButtons();
    status('navStatus', 'Không thể theo dõi GPS: ' + err.message, 'bad');
  }
}
async function stopNavigation() {
  nav.active = false;
  if (nav.watchId !== null) navigator.geolocation.clearWatch(nav.watchId);
  nav.watchId = null;
  if (nav.wakeLock) { try { await nav.wakeLock.release(); } catch (_) {} nav.wakeLock = null; }
  status('navStatus', 'Đã dừng dẫn đường. Màn hình E-Ink giữ hình ảnh cuối cùng.');
  logger('Đã dừng theo dõi GPS.'); syncButtons();
}
// Page visibility is essential: neither BLE nor geolocation background updates are guaranteed in Chrome.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && nav.active) {
    logger('Chrome chạy nền: tạm dừng gửi chỉ dẫn; có thể mất kết nối BLE.');
    status('navStatus', 'Chrome đang chạy nền. Chỉ dẫn có thể bị treo. Mở lại trang.', 'warn');
  } else if (!document.hidden && nav.active) { void tryWakeLock(); }
});
$('connect').addEventListener('click', () => void connect());
$('disconnect').addEventListener('click', () => ble.device?.gatt?.disconnect());
$('preview').addEventListener('click', () => redraw(demoCue()));
$('sendDemo').addEventListener('click', () => void sendImage(demoCue(), true));
$('size').addEventListener('change', () => redraw());
['demoDir','demoDistance','demoRoad'].forEach(id => $(id).addEventListener('input', () => {
  if (!nav.active) redraw(demoCue());
}));
$('loadMap').addEventListener('click', () => void loadGoogle());
$('locate').addEventListener('click', () => void locate());
$('destination').addEventListener('input', () => { nav.destination = null; syncButtons(); });
$('calculate').addEventListener('click', () => void calculate());
$('recalculate').addEventListener('click', () => void calculate());
$('start').addEventListener('click', () => void startNavigation());
$('stop').addEventListener('click', () => void stopNavigation());
redraw(); syncButtons();
})();
