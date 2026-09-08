import { FirstPersonScene } from './first-person.js';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const canvas=$('#game'),ctx=canvas.getContext('2d'),W=1000,H=620;
canvas.width=W;canvas.height=H;
const inkCanvas=document.createElement('canvas');inkCanvas.width=W;inkCanvas.height=H;const inkCtx=inkCanvas.getContext('2d');
const palette={purple:{hex:'#7952d6',name:'GRAPE EXPECTATIONS'},pink:{hex:'#ef779e',name:'PINK WITH ATTITUDE'},blue:{hex:'#53b3d0',name:'OUT OF THE BLUE'},orange:{hex:'#f39446',name:'ORANGE YOU READY'}};
let color='purple',weapon='shooter',state='ready',remaining=60,ink=100,last=0,shootClock=0,scoreClock=0,bots=[],particles=[],sound=false,audioCtx,best=null;
let view='first',pitch=-.20,firstPerson=null,moving=false,expectedUnlock=false,drag=null,inkDirty=true;
const touchDevice=matchMedia('(pointer:coarse)').matches;
const firstCanvas=$('#firstPersonCanvas');
let lookWarmupUntil=0,canvasWarmupUntil=0,menuTab='play';
document.body.classList.toggle('has-touch',touchDevice);
try{best=JSON.parse(localStorage.getItem('splatoon-doodle-best')||'null');if(!best||!Number.isFinite(best.score))best=null;}catch{}
let player={x:160,y:421,angle:-.25},pointer={x:600,y:300,down:false},keys=new Set(),touchShooting=false,shots=0;
const cell=5,cols=W/cell,rows=H/cell,ownership=new Uint8Array(cols*rows),valid=new Uint8Array(cols*rows);
const obstacles=[{x:118,y:138,w:145,h:65},{x:397,y:98,w:111,h:53},{x:691,y:118,w:145,h:63},{x:68,y:315,w:105,h:67},{x:334,y:276,w:113,h:91},{x:584,y:281,w:97,h:68},{x:810,y:333,w:110,h:74},{x:222,y:467,w:128,h:63},{x:570,y:482,w:161,h:58}];
let validCount=0;for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){const px=x*cell+2.5,py=y*cell+2.5;const ok=px>33&&px<W-33&&py>70&&py<H-32&&!obstacles.some(b=>px>=b.x&&px<=b.x+b.w&&py>=b.y-16&&py<=b.y+b.h);valid[y*cols+x]=ok?1:0;validCount+=ok?1:0;}
function rand(a,b){return a+Math.random()*(b-a)}
function path(points,fill,stroke='#48453d',width=2){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.closePath();if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke();}}
function line(x,y,x2,y2,color='#686359',width=1.5){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x2,y2);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke()}
function circle(x,y,r,fill,stroke){ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1.7;ctx.stroke();}}
function label(text,x,y,size=18,angle=0,color='#817c6f'){ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.fillStyle=color;ctx.font=`${size}px 'Patrick Hand', cursive`;ctx.fillText(text,0,0);ctx.restore();}
function paint(x,y,r,team,preview=false){if(x<32||y<70||x>W-32||y>H-32)return;inkDirty=true;const shade=team===1?palette[color].hex:'#bfd96c';inkCtx.fillStyle=shade;inkCtx.beginPath();inkCtx.arc(x,y,r,0,Math.PI*2);inkCtx.fill();for(let j=0;j<5;j++){let a=rand(0,Math.PI*2),d=rand(.65,1.15)*r;inkCtx.beginPath();inkCtx.arc(x+Math.cos(a)*d,y+Math.sin(a)*d,rand(3,r*.4),0,Math.PI*2);inkCtx.fill();}if(preview)return;for(let cy=Math.max(0,Math.floor((y-r)/cell));cy<Math.min(rows,Math.ceil((y+r)/cell));cy++)for(let cx=Math.max(0,Math.floor((x-r)/cell));cx<Math.min(cols,Math.ceil((x+r)/cell));cx++){let i=cy*cols+cx;if(valid[i]&&(cx*cell+2.5-x)**2+(cy*cell+2.5-y)**2<r*r)ownership[i]=team;}}
function previewInk(){inkCtx.clearRect(0,0,W,H);for(let i=0;i<32;i++){let t=i/31;paint(50+t*290,460-Math.sin(t*4)*92,rand(23,45),1,true);paint(680+t*270,205+Math.sin(t*5)*115,rand(25,47),2,true);}for(let i=0;i<15;i++){paint(rand(65,265),rand(320,515),rand(4,11),1,true);paint(rand(690,946),rand(144,337),rand(4,11),2,true);}}
function drawBox(b,index){const d=16;path([[b.x+7,b.y+5],[b.x+b.w+10,b.y+3],[b.x+b.w+12,b.y+b.h+8],[b.x+8,b.y+b.h+10]],'#48423720',null);path([[b.x,b.y],[b.x+b.w,b.y],[b.x+b.w,b.y+b.h],[b.x,b.y+b.h]],index%3===0?'#c8caba':'#cecbbc');path([[b.x,b.y-d],[b.x+b.w,b.y-d],[b.x+b.w,b.y+b.h-d],[b.x,b.y+b.h-d]],index%3===0?'#e5e5d6':'#e5dfd0');path([[b.x,b.y+b.h-d],[b.x+b.w,b.y+b.h-d],[b.x+b.w,b.y+b.h],[b.x,b.y+b.h]],'#b6b8a5');line(b.x+7,b.y-9,b.x+b.w-7,b.y-10,'#aaa797',1);line(b.x+8,b.y-7,b.x+8,b.y+b.h-23,'#aba99d',1);if(index%3===0){ctx.save();ctx.setLineDash([7,4]);ctx.strokeStyle='#a4a592';ctx.lineWidth=2;ctx.strokeRect(b.x+18,b.y-4,b.w-36,b.h-25);ctx.restore();label('↑ ↑',b.x+b.w/2-17,b.y+b.h/2+1,23,0,'#9a9d87');}else if(index%3===1){path([[b.x+22,b.y-16],[b.x+35,b.y-16],[b.x+35,b.y+b.h-16],[b.x+22,b.y+b.h-16]],'#c2baa580',null);label('INK / 03',b.x+46,b.y+b.h/2,13,-.03,'#a29b8b');}else{line(b.x+19,b.y+1,b.x+b.w-20,b.y+b.h-29,'#b7af9f');line(b.x+b.w-20,b.y+1,b.x+19,b.y+b.h-29,'#b7af9f');}}
function squid(x,y,shade,size=1,angle=0,swim=false){ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.scale(size,size);ctx.fillStyle='#302e3325';ctx.beginPath();ctx.ellipse(3,16,22,10,0,0,Math.PI*2);ctx.fill();if(swim){ctx.globalAlpha=.8;ctx.scale(1,.62);}path([[0,-30],[-13,-18],[-23,4],[-15,2],[-18,24],[-7,18],[-3,29],[4,18],[13,26],[15,8],[25,10],[16,-14]],shade,'#36323a',2.5);ctx.beginPath();ctx.ellipse(0,3,14,10,.12,0,Math.PI*2);ctx.fillStyle='#36323a';ctx.fill();ctx.fillStyle='#fffbed';ctx.beginPath();ctx.ellipse(-6,1,5,8,0,0,Math.PI*2);ctx.ellipse(6,1,5,8,0,0,Math.PI*2);ctx.fill();circle(-4,3,2,'#36323a');circle(5,3,2,'#36323a');line(-6,-16,-2,-21,'#f8f1e8',3);ctx.restore();}
function cone(x,y){path([[x-15,y+7],[x+15,y+7],[x+20,y+15],[x-18,y+15]],'#cac2ae');path([[x-10,y+8],[x-2,y-21],[x+5,y-21],[x+12,y+8]],'#e3b984');path([[x-7,y-2],[x-4,y-11],[x+7,y-11],[x+10,y-2]],'#f5edda',null)}
function topDownScene(){ctx.clearRect(0,0,W,H);ctx.fillStyle='#ecebdd';ctx.fillRect(0,0,W,H);ctx.lineWidth=.55;ctx.strokeStyle='#d4d5c4';for(let x=0;x<W;x+=36){line(x,0,x,H,'#d3d4c4',.55)}for(let y=0;y<H;y+=36){line(0,y,W,y,'#d3d4c4',.55)}ctx.save();ctx.setLineDash([10,6]);ctx.strokeStyle='#b5b5a3';ctx.lineWidth=2;ctx.strokeRect(32,69,W-64,H-101);ctx.restore();path([[430,70],[545,70],[590,220],[553,448],[484,588],[391,588],[456,440],[480,213]],'#f4f1e570',null);ctx.drawImage(inkCanvas,0,0);ctx.save();ctx.globalAlpha=.18;for(let n=0;n<110;n++){let x=(n*167+23)%W,y=(n*113+47)%H;line(x,y,x+3,y+1,'#736c50',1)}ctx.restore();ctx.save();ctx.setLineDash([12,11]);line(500,78,500,587,'#9b9a8770',1.8);ctx.restore();circle(147,492,35,'#f6f4e957','#665873');circle(147,492,29,'#7952d640','#665873');circle(856,192,35,'#f6f4e960','#717a4c');circle(856,192,28,'#bfda6740','#717a4c');label('HOME',126,498,17,-.07,'#574379');label('AWAY',837,198,17,.07,'#6b794a');obstacles.forEach(drawBox);cone(281,211);cone(778,450);label('KEEP IT FRESH',59,255,15,-Math.PI/2,'#97917f');label('no clean corners!',728,551,19,-.13);label('SPLAT ZONE',420,225,23,.06,'#9b9686');line(413,233,562,243,'#aaa591',1);label('↗',305,100,45,.15);label('✳',910,524,58,.15,'#969883');label('×',67,110,29,.1,'#a2a18d');label('×',896,90,29,.1,'#a2a18d');if(state==='ready'){squid(238,409,palette[color].hex,1.15,-.2);squid(771,232,'#bfd96c',1.05,.55);squid(876,306,'#bfd96c',.8,-.35);label('that’s you!',169,371,20,-.17,'#65499a');}else{bots.forEach(b=>squid(b.x,b.y,'#bfd96c',.78,b.angle+Math.PI/2));const swimming=keys.has('shift');squid(player.x,player.y,palette[color].hex,.93,player.angle+Math.PI/2,swimming);if(!swimming){ctx.save();ctx.translate(player.x,player.y);ctx.rotate(player.angle);if(weapon==='shooter'){path([[10,-7],[32,-7],[34,6],[10,6]],'#e0eeab','#373239',2);path([[22,-9],[30,-9],[30,8],[22,8]],'#f8f0dd','#373239',1.5)}else{line(10,0,31,0,'#302e33',5);path([[28,-22],[40,-22],[40,22],[28,22]],palette[color].hex,'#302e33',2);line(31,-18,31,18,'#cdb9ec',2)}ctx.restore();}ctx.save();ctx.strokeStyle=palette[color].hex;ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(pointer.x,pointer.y,8,0,Math.PI*2);ctx.stroke();line(pointer.x-13,pointer.y,pointer.x-5,pointer.y,palette[color].hex);line(pointer.x+5,pointer.y,pointer.x+13,pointer.y,palette[color].hex);line(pointer.x,pointer.y-13,pointer.x,pointer.y-5,palette[color].hex);line(pointer.x,pointer.y+5,pointer.x,pointer.y+13,palette[color].hex);ctx.restore();}particles.forEach(p=>circle(p.x,p.y,p.r,p.shade));}

function isBlocked(x, y, radius = 13) {
  return x < 40 || x > W - 40 || y < 82 || y > H - 40 || obstacles.some(b =>
    x > b.x - radius && x < b.x + b.w + radius && y > b.y - 16 - radius && y < b.y + b.h + radius);
}

function move(entity, dx, dy) {
  if (!isBlocked(entity.x + dx, entity.y)) entity.x += dx;
  if (!isBlocked(entity.x, entity.y + dy)) entity.y += dy;
}

function fire(entity, team, isRoller = false) {
  const angle = entity.angle;
  // In first person, pitching down paints your feet; looking ahead casts a longer spray.
  const aimedRange = 35 / Math.tan(Math.max(.16, -pitch));
  const range = isRoller ? 33 : team === 1 && view === 'first' ? Math.min(175, Math.max(38, aimedRange)) : rand(65, 150);
  let x = entity.x, y = entity.y;
  for (let d = 12; d < range; d += 6) {
    const nx = entity.x + Math.cos(angle) * d, ny = entity.y + Math.sin(angle) * d;
    if (isBlocked(nx, ny, 1)) break;
    x = nx; y = ny;
  }
  paint(x, y, isRoller ? 37 : team === 1 ? 25 : 20, team);
  if (isRoller) paint(entity.x, entity.y, 23, team);
  for (let i = 0; i < 5; i++) particles.push({
    x: entity.x + Math.cos(angle) * 22, y: entity.y + Math.sin(angle) * 22,
    vx: (x - entity.x) * 5 + rand(-35, 35), vy: (y - entity.y) * 5 + rand(-35, 35),
    life: .17, r: rand(2, 6), shade: team === 1 ? palette[color].hex : '#bfd96c'
  });
  if (team === 1) {
    shots++;
    firstPerson?.kick();
    if (shots % 3 === 0) tone(150 + Math.random() * 110, .035, .014);
  }
}

function score() {
  let one = 0, two = 0;
  for (const team of ownership) { if (team === 1) one++; else if (team === 2) two++; }
  return { one: one / validCount * 100, two: two / validCount * 100 };
}

function updateScore() {
  const s = score();
  $('#yourScore').textContent = s.one.toFixed(1) + '%';
  $('#rivalScore').textContent = s.two.toFixed(1) + '%';
  return s;
}

function updateBest() {
  $('#bestValue').innerHTML = (best ? best.score.toFixed(1) : '—') + ' <small>% TURF</small>';
  if (best) $('#bestCaption').textContent = 'A LITTLE MORE INK NEXT TIME?';
}

function clearInput() {
  keys.clear(); pointer.down = false; touchShooting = false; drag = null; moving = false;
}

function unlockMouse() {
  if (document.pointerLockElement === firstCanvas) {
    expectedUnlock = true;
    document.exitPointerLock();
  }
}

async function captureMouse() {
  if (view !== 'first' || state !== 'playing' || touchDevice) return;
  if (document.pointerLockElement === firstCanvas) return;
  try {
    await firstCanvas.requestPointerLock();
  } catch {
    if (state !== 'playing' || view !== 'first') return;
    // Embedded previews may deny pointer lock. Drag-to-look and keyboard fire still work.
    $('#lookHint').textContent = 'DRAG TO LOOK · HOLD SPACE TO SPRAY · Q / E TO TURN';
    $('#lookHint').classList.remove('hidden');
  }
}

function setMenuTab(tab) {
  menuTab = tab;
  for (const name of ['play', 'help', 'best']) {
    const selected = name === tab;
    $(`#${name}Panel`).classList.toggle('hidden', !selected);
    $(`#${name}Nav`).classList.toggle('active', selected);
    $(`#${name}Nav`).setAttribute('aria-selected', selected);
    $(`#${name}Nav`).tabIndex = selected ? 0 : -1;
  }
}

function refreshMenu() {
  const paused = state === 'paused';
  $('#startOverlay').classList.toggle('hidden', state !== 'ready' && !paused);
  $('#menuPanel').classList.toggle('is-paused', paused);
  $('#startButton').classList.toggle('hidden', paused);
  $('#resumeButton').classList.toggle('hidden', !paused);
  $('#loadoutSettings').classList.toggle('hidden', paused);
  $('#pausedLoadout').classList.toggle('hidden', !paused);
  $('#backToMenuButton').classList.toggle('hidden', !paused);
  $('#menuEyebrow').textContent = paused ? 'THE MESS CAN WAIT' : 'A SKETCHBOOK TURF WAR';
  $('#menuTitle').innerHTML = paused ? 'INK-TERMISSION.' : 'SPLATOON<span>doodle<span class="title-dot">.</span></span>';
  $('#menuSubtitle').textContent = paused ? 'Take a breath. Your turf is safe.' : 'Small squids. Big ink energy.';
  $('#playNav').textContent = paused ? 'PAUSED' : 'PLAY';
}

function returnToMenu() {
  state = 'ready'; clearInput(); unlockMouse(); setLocked(false);
  remaining = 60; ink = 100; particles = []; bots = []; ownership.fill(0);
  player = { x: 160, y: 421, angle: -.25 }; pitch = -.20;
  $('#resultOverlay').classList.add('hidden');
  document.body.classList.remove('match-active');
  $('#arena').classList.remove('swimming');
  setMenuTab('play'); previewInk(); updateScore(); refreshViewUI();
  $('#menuPanel').focus({ preventScroll: true });
  $('#startOverlay').scrollTop = 0;
}

function refreshViewUI() {
  const first = view === 'first';
  firstCanvas.classList.toggle('hidden', !first);
  canvas.classList.toggle('hidden', first);
  $('#arena').classList.toggle('first-person', first);
  $('#arena').classList.toggle('top-down', !first);
  $('#arena').dataset.view = view;
  $('#arena').dataset.state = state;
  $('#firstPersonButton').classList.toggle('selected', first);
  $('#firstPersonButton').setAttribute('aria-pressed', first);
  $('#topDownButton').classList.toggle('selected', !first);
  $('#topDownButton').setAttribute('aria-pressed', !first);
  $('#quickViewButton').innerHTML = `<span>V</span> ${first ? 'TOP DOWN' : 'FIRST PERSON'}`;
  $('#quickViewButton').setAttribute('aria-label', first ? 'Switch to top-down view' : 'Switch to first-person view');
  firstCanvas.tabIndex = first && state === 'playing' ? 0 : -1;
  canvas.tabIndex = !first && state === 'playing' ? 0 : -1;
  refreshMenu();
  $('#crosshair').classList.toggle('hidden', !first || state !== 'playing');
  $('#lookHint').classList.toggle('hidden', !first || state !== 'playing' || document.pointerLockElement === firstCanvas);
  $('#lookHint').textContent = touchDevice ? 'SWIPE TO LOOK · HOLD SPLAT TO PAINT' : 'CLICK TO AIM · HOLD TO SPRAY';
  $('#cameraHelp').textContent = touchDevice
    ? first ? 'Swipe the field to look. Hold SPLAT to paint.' : 'Tap the field to aim. Hold SPLAT to paint.'
    : first ? 'Mouse to look. Q / E to turn. Click the field to capture your cursor.' : 'Aim with the cursor. Click and hold to paint.';
  firstPerson?.resize();
}

function switchView(next) {
  if (next === view || (next === 'first' && !firstPerson)) return;
  const priorAngle = player.angle;
  clearInput();
  if (view === 'first') unlockMouse();
  view = next;
  canvasWarmupUntil = performance.now() + 90;
  player.angle = priorAngle;
  pointer.x = player.x + Math.cos(priorAngle) * 130;
  pointer.y = player.y + Math.sin(priorAngle) * 130;
  refreshViewUI();
  if (state === 'playing') (view === 'first' ? firstCanvas : canvas).focus({ preventScroll: true });
  // Switching is continuous; the new perspective never starts a new match.
  if (view === 'first' && state === 'playing') captureMouse();
}

function setLocked(locked) {
  $$('.color-choice,.weapon').forEach(button => button.disabled = locked);
}

function start() {
  setMenuTab('play');
  state = 'playing'; remaining = 60; ink = 100; shootClock = 0; scoreClock = 0; shots = 0;
  ownership.fill(0); inkCtx.clearRect(0, 0, W, H); inkDirty = true; particles = [];
  clearInput();
  player = { x: 160, y: 421, angle: -.25 }; pitch = -.20;
  pointer = { x: 160 + Math.cos(-.25) * 130, y: 421 + Math.sin(-.25) * 130, down: false };
  bots = [
    { x: 836, y: 255, angle: 2.5, clock: 0, turn: 0, target: { x: 725, y: 400 } },
    { x: 766, y: 388, angle: 3.2, clock: .15, turn: 0, target: { x: 720, y: 220 } }
  ];
  paint(player.x, player.y, 32, 1); bots.forEach(b => paint(b.x, b.y, 25, 2));
  ['#startOverlay', '#resultOverlay'].forEach(s => $(s).classList.add('hidden'));
  ['#inkHud', '#pauseButton'].forEach(s => $(s).classList.remove('hidden'));
  $('#pauseButton').innerHTML = '<span>ESC</span> PAUSE';
  $('#inkLevel').style.transform = 'scaleX(1)';
  if (touchDevice) $('#touchControls').classList.remove('hidden');
  document.body.classList.add('match-active'); setLocked(true);
  $('#timer').textContent = '1:00'; $('#timer').classList.remove('last-seconds');
  updateScore(); refreshViewUI();
  (view === 'first' ? firstCanvas : canvas).focus({ preventScroll: true });
  captureMouse(); tone(440, .1, .06);
}

function end() {
  state = 'ended'; clearInput(); unlockMouse();
  const s = updateScore(), won = s.one > s.two;
  $('#resultTitle').textContent = won ? 'FRESH WIN!' : s.one === s.two ? 'A PERFECT TIE!' : 'STILL A GOOD MESS.';
  $('#resultNote').textContent = won ? 'you really made your mark!' : 'every splat is a fresh start';
  $('#resultText').textContent = `Your turf: ${s.one.toFixed(1)}% · Rival turf: ${s.two.toFixed(1)}%`;
  $('#resultScore').textContent = s.one.toFixed(1) + '%';
  if (!best || s.one > best.score) {
    best = { score: s.one, date: new Date().toLocaleDateString('en-US'), weapon: weapon === 'shooter' ? 'Splattershot' : 'Splat Roller' };
    try { localStorage.setItem('splatoon-doodle-best', JSON.stringify(best)); } catch {}
    updateBest(); $('#resultNote').textContent = 'a new personal best!';
  }
  $('#resultOverlay').classList.remove('hidden');
  ['#inkHud', '#pauseButton', '#touchControls'].forEach(s => $(s).classList.add('hidden'));
  setLocked(false); refreshViewUI(); tone(won ? 660 : 260, .3, .06);
  $('#resultOverlay .menu-panel').focus({ preventScroll: true });
  $('#resultOverlay').scrollTop = 0;
}

function pause() {
  if (state === 'playing') {
    state = 'paused'; clearInput(); unlockMouse(); setMenuTab('play');
    refreshViewUI();
    $('#menuPanel').focus({ preventScroll: true });
    $('#startOverlay').scrollTop = 0;
  } else if (state === 'paused') {
    state = 'playing'; setMenuTab('play'); refreshViewUI();
    (view === 'first' ? firstCanvas : canvas).focus({ preventScroll: true });
    captureMouse();
  }
}

function update(dt) {
  if (state !== 'playing') return;
  remaining = Math.max(0, remaining - dt);
  const seconds = Math.ceil(remaining);
  $('#timer').textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  $('#timer').classList.toggle('last-seconds', remaining <= 10);
  if (remaining <= 0) { end(); return; }
  const swim = keys.has('shift');
  const right = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
  const forward = (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0);
  let dx = right, dy = -forward;
  if (view === 'first') {
    player.angle += ((keys.has('e') ? 1 : 0) - (keys.has('q') ? 1 : 0)) * dt * 1.8;
    dx = Math.cos(player.angle) * forward - Math.sin(player.angle) * right;
    dy = Math.sin(player.angle) * forward + Math.cos(player.angle) * right;
  } else {
    player.angle = Math.atan2(pointer.y - player.y, pointer.x - player.x);
  }
  const under = ownership[Math.floor(player.y / cell) * cols + Math.floor(player.x / cell)];
  const speed = swim ? under === 1 ? 235 : 100 : 155;
  moving = !!(dx || dy);
  if (moving) {
    const length = Math.hypot(dx, dy);
    move(player, dx / length * speed * dt, dy / length * speed * dt);
    if (touchDevice && view === 'top' && !drag) {
      player.angle = Math.atan2(dy, dx);
      pointer.x = player.x + dx / length * 120; pointer.y = player.y + dy / length * 120;
    }
  }
  ink = Math.min(100, ink + dt * (swim ? under === 1 ? 48 : 28 : 4));
  shootClock -= dt;
  if ((pointer.down || touchShooting || keys.has(' ')) && !swim && shootClock <= 0 && ink > (weapon === 'roller' ? 4 : 2)) {
    fire(player, 1, weapon === 'roller');
    ink -= weapon === 'roller' ? 4 : 2; shootClock = weapon === 'roller' ? .11 : .075;
  }
  $('#inkLevel').style.transform = `scaleX(${ink / 100})`;
  $('#inkStatus').textContent = swim ? 'REFILLING…' : ink < 15 ? 'LOW INK! HOLD SHIFT' : 'HOLD SHIFT TO REFILL';
  $('#arena').classList.toggle('swimming', swim);
  bots.forEach(b => {
    b.turn -= dt;
    if (b.turn <= 0 || Math.hypot(b.x - b.target.x, b.y - b.target.y) < 25) {
      let target;
      do { target = { x: rand(80, 920), y: rand(105, 560) }; } while (isBlocked(target.x, target.y));
      b.target = target; b.turn = rand(1.5, 3.5);
    }
    b.angle = Math.atan2(b.target.y - b.y, b.target.x - b.x);
    const ox = b.x, oy = b.y;
    move(b, Math.cos(b.angle) * 84 * dt, Math.sin(b.angle) * 84 * dt);
    if (Math.hypot(b.x - ox, b.y - oy) < .1) b.turn = 0;
    b.clock -= dt;
    if (b.clock <= 0) { b.angle += rand(-.7, .7); fire(b, 2); b.clock = .25; }
  });
  particles.forEach(p => { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; p.r *= .98; });
  particles = particles.filter(p => p.life > 0);
  scoreClock += dt;
  if (scoreClock > .2) { updateScore(); scoreClock = 0; }
}

function renderScene(dt) {
  if (inkDirty && firstPerson) { firstPerson.markInkDirty(); inkDirty = false; }
  if (view === 'first' && firstPerson) {
    const previewBots = [{ x: 755, y: 236 }, { x: 854, y: 389 }];
    firstPerson.render({ player, bots: state === 'ready' ? previewBots : bots, particles,
      color: palette[color].hex, weapon, pitch, swim: keys.has('shift'), moving, state, dt });
  } else topDownScene();
}

function frame(t) {
  const dt = Math.min((t - last) / 1000, .05); last = t;
  update(dt); renderScene(dt); requestAnimationFrame(frame);
}

function tone(hz, duration, volume) {
  if (!sound) return;
  try {
    audioCtx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const oscillator = audioCtx.createOscillator(), gain = audioCtx.createGain();
    oscillator.type = 'triangle'; oscillator.frequency.setValueAtTime(hz, audioCtx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(hz * .45, audioCtx.currentTime + duration);
    gain.gain.setValueAtTime(volume, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, audioCtx.currentTime + duration);
    oscillator.connect(gain); gain.connect(audioCtx.destination);
    oscillator.start(); oscillator.stop(audioCtx.currentTime + duration);
  } catch {}
}

function point(e, force = false) {
  if (!force && performance.now() < canvasWarmupUntil) return;
  const r = canvas.getBoundingClientRect();
  const scale = Math.min(r.width / W, r.height / H);
  const left = r.left + (r.width - W * scale) / 2;
  const top = r.top + (r.height - H * scale) / 2;
  pointer.x = Math.max(0, Math.min(W, (e.clientX - left) / scale));
  pointer.y = Math.max(0, Math.min(H, (e.clientY - top) / scale));
}

canvas.addEventListener('pointermove', point);
canvas.addEventListener('pointerdown', e => {
  if (state !== 'playing') return;
  e.preventDefault(); point(e, true); pointer.down = !touchDevice;
  drag = { x: e.clientX, y: e.clientY, id: e.pointerId };
  canvas.setPointerCapture(e.pointerId); canvas.focus({ preventScroll: true });
});
for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(event, () => { pointer.down = false; drag = null; });
canvas.addEventListener('contextmenu', e => e.preventDefault());

firstCanvas.addEventListener('pointerdown', e => {
  if (state !== 'playing' || view !== 'first' || e.button > 0) return;
  e.preventDefault();
  drag = { x: e.clientX, y: e.clientY, id: e.pointerId };
  if (touchDevice) firstCanvas.setPointerCapture(e.pointerId);
  else { pointer.down = true; captureMouse(); }
  firstCanvas.focus({ preventScroll: true });
});
firstCanvas.addEventListener('pointermove', e => {
  if (state !== 'playing' || view !== 'first' || document.pointerLockElement === firstCanvas || !drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  player.angle += dx * .006; pitch = Math.max(-1.15, Math.min(.65, pitch - dy * .004));
  drag.x = e.clientX; drag.y = e.clientY;
});
for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) firstCanvas.addEventListener(event, () => { pointer.down = false; drag = null; });
firstCanvas.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('mousemove', e => {
  if (document.pointerLockElement !== firstCanvas || state !== 'playing' || view !== 'first' || performance.now() < lookWarmupUntil) return;
  player.angle += e.movementX * .0024;
  pitch = Math.max(-1.15, Math.min(.65, pitch - e.movementY * .0022));
});
document.addEventListener('mouseup', () => pointer.down = false);
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === firstCanvas) { expectedUnlock = false; lookWarmupUntil = performance.now() + 90; }
  else if (expectedUnlock) expectedUnlock = false;
  else if (state === 'playing' && view === 'first') pause();
  refreshViewUI();
});
document.addEventListener('pointerlockerror', () => {
  if (state !== 'playing' || view !== 'first') return;
  $('#lookHint').textContent = 'DRAG TO LOOK · HOLD SPACE TO SPRAY · Q / E TO TURN';
  $('#lookHint').classList.remove('hidden');
});

window.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (k === 'tab' && state !== 'playing') {
    const panel = state === 'ended' ? $('#resultOverlay .menu-panel') : $('#menuPanel');
    const focusable = [...panel.querySelectorAll('button:not(:disabled), [tabindex="0"]')].filter(el => el.offsetParent !== null && el.tabIndex >= 0);
    const first = focusable[0], last = focusable.at(-1);
    if (e.shiftKey && (document.activeElement === first || document.activeElement === panel)) { e.preventDefault(); last?.focus(); }
    else if (!e.shiftKey && (document.activeElement === last || document.activeElement === panel)) { e.preventDefault(); first?.focus(); }
    return;
  }
  if (k === 'm' && !e.repeat) { e.preventDefault(); $('#soundButton').click(); return; }
  if (k === 'v' && !e.repeat) { e.preventDefault(); switchView(view === 'first' ? 'top' : 'first'); return; }
  if (k === 'escape') {
    if ((state === 'ready' || state === 'paused') && menuTab !== 'play') { e.preventDefault(); setMenuTab('play'); $('#playNav').focus(); return; }
    if (state === 'playing' || state === 'paused') { e.preventDefault(); pause(); }
    return;
  }
  if (state === 'playing' && ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift', 'q', 'e', ' '].includes(k)) {
    e.preventDefault(); keys.add(k);
  }
});
window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => { clearInput(); if (state === 'playing') pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'playing') pause(); });

$('#startButton').onclick = start; $('#againButton').onclick = start;
$('#pauseButton').onclick = pause; $('#resumeButton').onclick = pause;
$('#firstPersonButton').onclick = () => switchView('first');
$('#topDownButton').onclick = () => switchView('top');
$('#quickViewButton').onclick = () => switchView(view === 'first' ? 'top' : 'first');
$('#backToMenuButton').onclick = returnToMenu;
$('#resultMenuButton').onclick = returnToMenu;
$('#playNav').onclick = () => setMenuTab('play');
$$('.menu-back').forEach(button => button.onclick = () => { setMenuTab('play'); $('#playNav').focus(); });
$$('.menu-tabs [role="tab"]').forEach((tab, index, tabs) => {
  tab.addEventListener('keydown', e => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? 2 : (index + (e.key === 'ArrowRight' ? 1 : 2)) % 3;
    tabs[next].click(); tabs[next].focus();
  });
});
$$('.color-choice').forEach(button => button.onclick = () => {
  if (state === 'playing' || state === 'paused') return;
  color = button.dataset.color; document.documentElement.style.setProperty('--purple', palette[color].hex);
  $('#colorName').textContent = palette[color].name;
  $$('.color-choice').forEach(other => {
    const on = other === button; other.classList.toggle('selected', on);
    other.setAttribute('aria-pressed', on); other.textContent = on ? '✓' : '';
  });
  if (state === 'ready') previewInk();
});
$$('.weapon').forEach(button => button.onclick = () => {
  if (state === 'playing' || state === 'paused') return;
  weapon = button.dataset.weapon;
  $$('.weapon').forEach(other => {
    const on = other === button; other.classList.toggle('selected', on); other.setAttribute('aria-pressed', on);
  });
});
$('#soundButton').onclick = () => {
  sound = !sound;
  $('#soundButton span').textContent = sound ? 'SOUND ON' : 'SOUND OFF';
  $('#soundButton').setAttribute('aria-label', sound ? 'Disable sound' : 'Enable sound');
  $('#soundButton').setAttribute('aria-pressed', sound);
  $('#soundWaves').setAttribute('d', sound ? 'M17 8q5 4 0 8M19 5q8 7 0 14' : 'm17 9 5 6m0-6-5 6');
  tone(520, .08, .04);
};
$('#helpNav').onclick = () => setMenuTab('help');
$('#bestNav').onclick = () => {
  if (state === 'playing') pause();
  const el = $('#bestDetail'); el.replaceChildren();
  if (best) {
    el.textContent = `${best.date} · ${best.weapon}. One more round, one more record.`;
  } else el.textContent = 'Your ink legend starts here. Finish a match to set your first personal best.';
  setMenuTab('best');
};
function holdButton(button, down, up) {
  button.addEventListener('pointerdown', e => {
    e.preventDefault(); if (state !== 'playing') return;
    down(); button.setPointerCapture(e.pointerId);
  });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(event => button.addEventListener(event, up));
}
$$('[data-dir]').forEach(button => holdButton(button, () => keys.add(button.dataset.dir), () => keys.delete(button.dataset.dir)));
holdButton($('#touchInk'), () => keys.add('shift'), () => keys.delete('shift'));
holdButton($('#touchFire'), () => touchShooting = true, () => touchShooting = false);

// Fonts are optional; all geometry and engine assets are served locally.
try { firstPerson = new FirstPersonScene(firstCanvas, obstacles, inkCanvas); }
catch (error) {
  view = 'top'; $('#firstPersonButton').disabled = true;
  $('#firstPersonButton').title = 'First person needs WebGL. Try a browser with hardware acceleration enabled.';
  $('#cameraHelp').textContent = '3D is unavailable in this browser. Top-down play is ready.';
  console.warn('First-person renderer unavailable:', error.message);
}
if (touchDevice) $('#controlsOverview').innerHTML = '<div><kbd>D-PAD</kbd><span>Move</span></div><div><kbd>SWIPE</kbd><span>Look around</span></div><div><kbd>SPLAT</kbd><span>Spray ink</span></div><div><kbd>REFILL</kbd><span>Recover ink</span></div>';
updateBest(); previewInk(); refreshViewUI(); requestAnimationFrame(frame);
