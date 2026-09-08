import * as THREE from 'https://unpkg.com/three@0.185.1/build/three.module.js';

const PAPER = '#f6f3e6';
const PEN = '#474260';

// Screen-space pencil hatching keeps the marks fine even on nearby geometry.
const sketchVertex = `
  varying vec3 vNormal;
  void main() {
    vNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const sketchFragment = `
  uniform vec3 paper;
  uniform vec3 pen;
  uniform float solid;
  varying vec3 vNormal;
  void main() {
    vec3 n = normalize(vNormal);
    float shade = 1.0 - max(dot(n, normalize(vec3(-0.35, 0.9, 0.5))), 0.0);
    vec2 p = gl_FragCoord.xy;
    float wobble = sin(p.y * 0.075) * 0.65;
    float stripe = 1.0 - smoothstep(0.5, 1.3, abs(mod(p.x + p.y * 0.7 + wobble, 8.0) - 4.0));
    float cross = 1.0 - smoothstep(0.4, 1.15, abs(mod(p.x - p.y * 0.7, 10.0) - 5.0));
    float hatch = stripe * smoothstep(0.20, 0.75, shade) * 0.30;
    hatch += cross * smoothstep(0.78, 1.0, shade) * 0.14;
    float grain = fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
    vec3 base = mix(paper, pen, solid);
    gl_FragColor = vec4(mix(base, pen, hatch + shade * 0.025) - grain * 0.017, 1.0);
    #include <colorspace_fragment>
  }
`;

function textureCanvas(width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class FirstPersonScene {
  constructor(canvas, obstacles, inkCanvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    this.renderer.setClearColor(PAPER);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(80, 1.6, 0.06, 2600);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);
    this.materials = new Map();
    this.recoil = 0;
    this.clock = 0;
    this.currentColor = '';
    this.inkTexture = new THREE.CanvasTexture(inkCanvas);
    this.inkTexture.colorSpace = THREE.SRGBColorSpace;
    this.inkTexture.generateMipmaps = false;
    this.inkTexture.minFilter = THREE.LinearFilter;
    this.buildFloor();
    this.buildYard(obstacles);
    this.buildSkyline();
    this.buildWeapon();
    this.botSprites = [];
    const squidTexture = this.makeSquidTexture();
    for (let i = 0; i < 3; i++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: squidTexture, transparent: true }));
      sprite.scale.set(40, 46, 1);
      this.scene.add(sprite);
      this.botSprites.push(sprite);
    }
    const dotTexture = textureCanvas(32, 32, (c) => {
      c.fillStyle = '#ffffff'; c.beginPath(); c.arc(16, 16, 13, 0, Math.PI * 2); c.fill();
    });
    this.drops = Array.from({ length: 70 }, () => {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTexture, color: '#7952d6' }));
      sprite.visible = false; this.scene.add(sprite); return sprite;
    });
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement);
    this.resize();
  }

  material(fill = PAPER, ink = PEN, solid = 0) {
    const key = `${fill}-${ink}-${solid}`;
    if (!this.materials.has(key)) {
      this.materials.set(key, new THREE.ShaderMaterial({
        vertexShader: sketchVertex, fragmentShader: sketchFragment,
        uniforms: { paper: { value: new THREE.Color(fill) }, pen: { value: new THREE.Color(ink) }, solid: { value: solid } }
      }));
    }
    return this.materials.get(key);
  }

  mesh(geometry, x, y, z, fill = PAPER, parent = this.scene, edges = true) {
    const mesh = new THREE.Mesh(geometry, this.material(fill));
    mesh.position.set(x, y, z);
    if (edges) {
      const outline = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 26), new THREE.LineBasicMaterial({ color: PEN }));
      mesh.add(outline);
    }
    parent.add(mesh);
    return mesh;
  }

  box(x, y, z, w, h, d, fill = PAPER, parent = this.scene) {
    return this.mesh(new THREE.BoxGeometry(w, h, d), x, y, z, fill, parent);
  }

  stroke(points, color = PEN, parent = this.scene) {
    const geometry = new THREE.BufferGeometry().setFromPoints(points.map(p => new THREE.Vector3(...p)));
    const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color }));
    parent.add(line);
    return line;
  }

  sign(text, x, y, z, w = 90, h = 30, angle = 0, fill = PAPER, color = PEN) {
    const map = textureCanvas(512, 160, (c, cw, ch) => {
      c.fillStyle = fill; c.fillRect(0, 0, cw, ch);
      c.strokeStyle = color; c.lineWidth = 5;
      c.strokeRect(5, 6, cw - 12, ch - 12);
      c.font = "bold 59px 'Patrick Hand', 'Comic Sans MS', cursive";
      c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = color;
      c.fillText(text, cw / 2, ch / 2 + 4, cw - 25);
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map, side: THREE.DoubleSide }));
    mesh.position.set(x, y, z); mesh.rotation.y = angle;
    this.scene.add(mesh); return mesh;
  }

  buildFloor() {
    const floorTexture = textureCanvas(1000, 620, (c, w, h) => {
      c.fillStyle = PAPER; c.fillRect(0, 0, w, h);
      c.lineWidth = .55; c.strokeStyle = '#c6c5d2';
      for (let x = 0; x < w; x += 36) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x + 1, h); c.stroke(); }
      for (let y = 0; y < h; y += 36) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y + .5); c.stroke(); }
      c.strokeStyle = '#686076'; c.lineWidth = 2; c.setLineDash([10, 7]); c.strokeRect(32, 69, w - 64, h - 101);
      c.setLineDash([]);
      c.font = "23px 'Patrick Hand', cursive"; c.fillStyle = '#686076';
      c.fillText('THIS WAY TO THE MESS  \u2192', 363, 434);
      c.save(); c.translate(150, 491); c.rotate(-.15); c.strokeStyle = '#7952d6';
      c.beginPath(); c.arc(0, 0, 32, 0, Math.PI * 2); c.stroke();
      c.fillStyle = '#7952d6'; c.textAlign = 'center'; c.fillText('HOME', 0, 7); c.restore();
      for (let i = 0; i < 2400; i++) {
        c.fillStyle = `rgba(66,55,90,${(i % 4) * .012})`;
        c.fillRect((i * 139.17) % w, (i * 83.79) % h, 1, 1);
      }
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(1000, 620), new THREE.MeshBasicMaterial({ map: floorTexture }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(500, 0, 310); this.scene.add(floor);
    const ink = new THREE.Mesh(new THREE.PlaneGeometry(1000, 620), new THREE.MeshBasicMaterial({ map: this.inkTexture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }));
    ink.rotation.x = -Math.PI / 2; ink.position.set(500, .05, 310); this.scene.add(ink);
    this.box(500, -4, 310, 1500, 6, 1100, '#eeebdf');
  }

  buildYard(obstacles) {
    obstacles.forEach((b, i) => {
      const h = [45, 33, 55, 50, 58, 39, 55, 44, 48][i];
      const z = b.y - 16 + (b.h + 16) / 2;
      this.box(b.x + b.w / 2, h / 2, z, b.w, h, b.h + 16);
      this.box(b.x + b.w / 2, h + 1, z, b.w + 3, 2, b.h + 19, '#e4e0d4');
      const front = b.y + b.h + .4;
      if (i % 3 === 0) {
        this.stroke([[b.x + 8, 5, front], [b.x + b.w - 8, h - 7, front]]);
        this.stroke([[b.x + b.w - 8, 5, front], [b.x + 8, h - 7, front]]);
        this.sign('\u2191  \u2191', b.x + b.w / 2, h / 2, front + .2, 31, 19);
      } else {
        for (let k = 0; k < 4; k++) {
          this.stroke([[b.x + 5, 6 + k * 10, front], [b.x + b.w - 5, 5 + k * 10, front]], '#8e859c');
        }
        this.sign(i === 4 ? 'FRESH INK' : 'INK / 03', b.x + b.w / 2, h * .53, front + .3, Math.min(b.w - 12, 75), 18);
      }
      // A second, imperfect stroke makes each crate feel drawn rather than machined.
      this.stroke([[b.x + .2, h + 2, b.y - 17], [b.x + b.w + 1, h + 2.5, b.y - 16], [b.x + b.w + 2, h + 1.7, front]], '#8a829c');
    });
    [[500, 69, 936, 7], [500, 588, 936, 7], [32, 328, 7, 518], [968, 328, 7, 518]].forEach(([x, z, w, d]) => {
      this.box(x, 20, z, w, 40, d, '#ede9dc');
      this.box(x, 40, z, w + 2, 2, d + 2);
    });
    for (let x = 40; x <= 960; x += 74) {
      this.stroke([[x, 41, 69], [x + 1, 99, 69]], PEN);
      this.stroke([[x, 41, 588], [x - 1, 99, 588]], PEN);
    }
    for (let h = 50; h < 100; h += 14) {
      this.stroke([[33, h, 69], [500, h - 2, 69], [968, h, 69]], '#aaa2b5');
      this.stroke([[33, h, 588], [500, h - 1, 588], [968, h, 588]], '#aaa2b5');
    }
    for (let z = 85; z < 580; z += 75) {
      this.stroke([[968, 40, z], [968, 95, z]], PEN);
      this.stroke([[32, 40, z], [32, 95, z]], PEN);
    }
    for (let h = 50; h < 100; h += 14) {
      this.stroke([[968, h, 69], [968, h - 1, 588]], '#aaa2b5');
      this.stroke([[32, h, 69], [32, h - 1, 588]], '#aaa2b5');
    }
    this.sign('THE DOODLE YARD', 960, 90, 306, 160, 36, -Math.PI / 2);
    this.sign('STAY FRESH.', 500, 90, 72, 146, 40);
    this.sign('MAKE A MESS', 500, 72, 585, 123, 35, Math.PI);
    [[281, 211], [778, 450], [440, 511]].forEach(([x, z]) => {
      this.box(x, 1.5, z, 18, 3, 18, '#e5d6ba');
      this.mesh(new THREE.ConeGeometry(7, 23, 4), x, 14, z, '#ead0a6');
    });
    // Hand-strung pennants over the courtyard.
    this.stroke([[84, 135, 84], [300, 118, 105], [640, 114, 124], [916, 143, 147]]);
    for (let i = 0; i < 16; i++) {
      const x = 110 + i * 49, z = 86 + i * 3.8, y = 131 - Math.sin(i / 15 * Math.PI) * 17;
      const triangle = new THREE.Shape(); triangle.moveTo(0, 0); triangle.lineTo(20, 0); triangle.lineTo(11, -24); triangle.closePath();
      const flag = this.mesh(new THREE.ShapeGeometry(triangle), x, y, z, i % 3 === 0 ? '#c9da8f' : i % 3 === 1 ? '#bda5dd' : PAPER);
      flag.material = flag.material.clone(); flag.material.side = THREE.DoubleSide;
    }
  }

  buildSkyline() {
    const buildings = [
      [25, -80, 130, 235, 150], [205, -90, 150, 155, 155], [400, -95, 180, 270, 140],
      [610, -100, 160, 190, 150], [840, -110, 185, 240, 150], [1080, -10, 190, 215, 160],
      [1090, 205, 150, 175, 155], [1110, 410, 190, 265, 155], [1070, 654, 145, 200, 170],
      [160, 755, 185, 180, 150], [410, 765, 175, 260, 160], [670, 746, 190, 210, 150],
      [-110, 270, 160, 240, 175], [-100, 550, 150, 190, 155]
    ];
    buildings.forEach(([x, z, w, h, d], index) => {
      this.box(x, h / 2 - 8, z, w, h, d, '#f3efe2');
      this.box(x, h - 6, z, w + 7, 7, d + 7, '#e8e2d3');
      for (const side of [1, -1]) {
        const front = z + side * (d / 2 + .4);
        for (let floor = 0; floor < Math.floor(h / 46) - 1; floor++) {
          for (let col = 0; col < 3; col++) {
            const wx = x - w * .31 + col * w * .31, wy = 44 + floor * 44;
            this.stroke([[wx - 11, wy - 14, front], [wx + 11, wy - 14, front], [wx + 12, wy + 13, front], [wx - 11, wy + 14, front], [wx - 11, wy - 14, front]], '#78718b');
            this.stroke([[wx, wy - 13, front], [wx + 1, wy + 13, front]], '#aaa1b4');
            this.stroke([[wx - 10, wy, front], [wx + 10, wy + 1, front]], '#aaa1b4');
          }
        }
      }
      // Side-facing windows keep the east/west view equally detailed.
      for (let floor = 0; floor < Math.floor(h / 48) - 1; floor++) {
        for (let col = 0; col < 3; col++) {
          const xx = x - w / 2 - .4, zz = z - d * .31 + col * d * .31, yy = 44 + floor * 44;
          this.stroke([[xx, yy - 13, zz - 10], [xx, yy + 13, zz - 10], [xx, yy + 13, zz + 10], [xx, yy - 13, zz + 10], [xx, yy - 13, zz - 10]], '#78718b');
          this.stroke([[xx, yy, zz - 10], [xx, yy, zz + 10]], '#aaa1b4');
        }
      }
      if (index % 3 === 0) {
        this.mesh(new THREE.CylinderGeometry(22, 23, 35, 9), x + 23, h + 29, z, '#eeeadc');
        this.mesh(new THREE.ConeGeometry(26, 14, 9), x + 23, h + 53, z);
        for (const a of [-1, 1]) this.stroke([[x + 23 + a * 17, h + 12, z], [x + 23 + a * 22, h, z]], PEN);
      }
      if (index % 4 === 1) {
        this.stroke([[x, h, z], [x, h + 39, z], [x - 23, h + 29, z], [x + 23, h + 29, z]]);
        this.stroke([[x - 16, h + 39, z], [x + 15, h + 39, z]]);
      }
    });
    this.sign('SQUID SUPPLY CO.', 1109, 135, 415, 138, 32, -Math.PI / 2);
    this.sign('INK \u2022 PRINT \u2022 PLAY', 400, 127, -23, 138, 29);
    // Flat ink clouds float above the skyline, with irregular pencil outlines.
    [[170, 305, -180, 1], [780, 335, -210, 1.2], [1240, 310, 380, 1]].forEach(([x, y, z, scale]) => {
      const cloud = textureCanvas(300, 110, c => {
        c.fillStyle = PAPER; c.strokeStyle = '#b0a8b7'; c.lineWidth = 3;
        c.beginPath(); c.moveTo(17, 80); c.bezierCurveTo(2, 45, 42, 35, 65, 47);
        c.bezierCurveTo(65, 0, 127, 1, 148, 37); c.bezierCurveTo(175, 12, 220, 30, 224, 53);
        c.bezierCurveTo(276, 26, 301, 73, 278, 83); c.lineTo(17, 80); c.fill(); c.stroke();
      });
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloud, transparent: true }));
      sprite.position.set(x, y, z); sprite.scale.set(180 * scale, 66 * scale, 1); this.scene.add(sprite);
    });
  }

  makeSquidTexture() {
    return textureCanvas(160, 190, c => {
      c.fillStyle = '#bfd96c'; c.strokeStyle = PEN; c.lineWidth = 5; c.lineJoin = 'round';
      c.beginPath(); [[80, 10], [36, 45], [9, 111], [36, 101], [27, 160], [58, 146], [69, 183], [92, 150], [118, 173], [125, 130], [150, 139], [128, 70]].forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = PEN; c.beginPath(); c.ellipse(81, 99, 45, 32, .07, 0, Math.PI * 2); c.fill();
      c.fillStyle = PAPER; for (const x of [62, 100]) { c.beginPath(); c.ellipse(x, 97, 16, 25, 0, 0, Math.PI * 2); c.fill(); }
      c.fillStyle = PEN; for (const x of [67, 95]) { c.beginPath(); c.ellipse(x, 99, 6, 13, 0, 0, Math.PI * 2); c.fill(); }
      c.strokeStyle = PAPER; c.lineWidth = 7; c.beginPath(); c.moveTo(59, 49); c.lineTo(74, 36); c.stroke();
    });
  }

  buildWeapon() {
    this.gun = new THREE.Group(); this.camera.add(this.gun);
    this.gun.position.set(.29, -.25, -.77);
    this.gun.scale.setScalar(.76);
    this.gun.rotation.set(.05, -.07, -.12);
    this.shooter = new THREE.Group(); this.gun.add(this.shooter);
    this.box(0, 0, 0, .27, .22, .43, '#dceba2', this.shooter);
    this.box(.02, -.19, .07, .13, .25, .15, PAPER, this.shooter);
    const barrel = this.mesh(new THREE.CylinderGeometry(.087, .087, .32, 10), 0, .025, -.34, PAPER, this.shooter);
    barrel.rotation.x = Math.PI / 2;
    const muzzle = this.mesh(new THREE.CylinderGeometry(.105, .105, .05, 10), 0, .025, -.505, '#9c7bd0', this.shooter);
    muzzle.rotation.x = Math.PI / 2;
    const nozzle = this.mesh(new THREE.CylinderGeometry(.055, .055, .006, 10), 0, .025, -.535, '#51445e', this.shooter);
    nozzle.rotation.x = Math.PI / 2;
    this.tank = this.mesh(new THREE.CylinderGeometry(.106, .115, .30, 10), .01, .23, .04, '#7952d6', this.shooter);
    this.mesh(new THREE.CylinderGeometry(.11, .11, .035, 10), .01, .397, .04, PAPER, this.shooter);
    this.box(0, .16, -.23, .025, .065, .055, PAPER, this.shooter);
    for (let i = 0; i < 3; i++) this.box(.139, -.02, -.10 + i * .073, .008, .073, .022, '#51445e', this.shooter);
    // Paper glove and cuff: a deliberately chunky doodled view model.
    this.mesh(new THREE.SphereGeometry(.115, 9, 7), .035, -.19, .11, '#f3eedf', this.shooter);
    this.box(.06, -.30, .17, .18, .15, .18, '#9980c2', this.shooter);
    this.roller = new THREE.Group(); this.gun.add(this.roller);
    const handle = this.mesh(new THREE.CylinderGeometry(.035, .045, .78, 7), -.06, -.12, -.12, PAPER, this.roller);
    handle.rotation.x = -.7;
    this.stroke([[-.06, .18, -.43], [.14, .18, -.48], [.14, .27, -.48]], PEN, this.roller);
    this.roll = this.mesh(new THREE.CylinderGeometry(.13, .13, .68, 12), -.09, .27, -.51, '#7952d6', this.roller);
    this.roll.rotation.z = Math.PI / 2;
    [-.44, .26].forEach(x => { const cap = this.mesh(new THREE.CylinderGeometry(.14, .14, .025, 12), x, .27, -.51, PAPER, this.roller); cap.rotation.z = Math.PI / 2; });
    this.mesh(new THREE.SphereGeometry(.10, 8, 6), -.04, -.29, .08, PAPER, this.roller);
    this.roller.visible = false;
  }

  resize() {
    const r = this.canvas.parentElement.getBoundingClientRect();
    if (!r.width || !r.height) return;
    this.renderer.setSize(r.width, r.height, false);
    this.camera.aspect = r.width / r.height;
    this.camera.fov = r.width < 500 ? 94 : 80;
    this.camera.updateProjectionMatrix();
  }

  markInkDirty() { this.inkTexture.needsUpdate = true; }
  kick() { this.recoil = 1; }

  render({ player, bots, particles, color, weapon, pitch, swim, moving, state, dt }) {
    this.clock += state === 'playing' ? dt : 0;
    this.recoil = Math.max(0, this.recoil - dt * 7);
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const bob = moving && !reducedMotion ? Math.sin(this.clock * 11) : 0;
    const eye = swim ? 13 : 35;
    this.camera.position.set(player.x, eye + bob * .5, player.y);
    this.camera.rotation.y = -player.angle - Math.PI / 2;
    this.camera.rotation.x = pitch;
    this.gun.visible = !swim;
    this.gun.position.set(.29 + bob * .009, -.25 + Math.abs(bob) * .01, -.77 + this.recoil * .05);
    this.gun.rotation.x = .05 + this.recoil * .08;
    this.shooter.visible = weapon === 'shooter'; this.roller.visible = weapon === 'roller';
    if (color !== this.currentColor) {
      this.currentColor = color;
      this.tank.material = this.material(color);
      this.roll.material = this.material(color);
    }
    this.botSprites.forEach((sprite, i) => {
      const b = bots[i]; sprite.visible = !!b;
      if (b) sprite.position.set(b.x, 21 + Math.sin(this.clock * 5 + i) * 1.4, b.y);
    });
    this.drops.forEach((sprite, i) => {
      const p = particles[i]; sprite.visible = !!p;
      if (p) {
        sprite.position.set(p.x, Math.max(2, 18 * p.life / .17), p.y);
        sprite.scale.setScalar(p.r * 1.7); sprite.material.color.set(p.shade);
      }
    });
    this.renderer.render(this.scene, this.camera);
  }
}
