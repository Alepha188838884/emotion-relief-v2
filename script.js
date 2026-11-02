(() => {
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

  // World state and unlockables
  const worldCanvas = document.getElementById("worldCanvas");
  const worldCtx = worldCanvas.getContext("2d");
  const worldNote = document.querySelector(".world-note");
  const windRead = document.getElementById("windRead");
  const lightRead = document.getElementById("lightRead");
  const pulseRead = document.getElementById("pulseRead");

  const world = {
    width: 0,
    height: 0,
    intensity: 0.22,
    targetIntensity: 0.22,
    wind: 0.2,
    light: 0.65,
    drift: 0.2,
    lastInput: performance.now(),
    stability: 0,
    prevIntensity: 0.22,
    unlocks: { glider: false, bloom: false, aurora: false },
    unlockCooldown: 0,
    creatures: [],
    clouds: [],
    ripplePhase: 0,
  };

  const chaosState = {
    canvas: document.getElementById("chaosCanvas"),
    ctx: null,
    level: 0.1,
    target: 0.1,
    smear: [],
    glitchPhase: 0,
    lastAction: performance.now(),
  };

  const poolCanvas = document.getElementById("poolCanvas");
  const poolCtx = poolCanvas.getContext("2d");
  const pool = {
    width: 0,
    height: 0,
    particles: [],
    target: { x: 0, y: 0 },
    pointer: { x: 0, y: 0, active: false, lastMove: performance.now() },
    scatter: 0.2,
  };

  const repairField = document.getElementById("repairField");
  const fractures = [...repairField.querySelectorAll(".fracture")].map((el, i) => ({
    el,
    y: el.getBoundingClientRect().top,
    damage: Number(el.dataset.depth) || 0.6,
    target: Number(el.dataset.depth) || 0.6,
  }));
  let repairPointer = null;

  const heroVisual = document.querySelector(".hero-visual");
  let worldPointer = null;

  const unlockMessages = {
    glider: "New glider drifts in when pace stays steady.",
    bloom: "A hidden bloom wakes after chaos subsides.",
    aurora: "Sound layers paint the upper sky.",
  };

  function setNote(msg) {
    if (!msg) return;
    worldNote.textContent = msg;
    world.unlockCooldown = performance.now();
  }

  function resize() {
    const ratio = window.devicePixelRatio || 1;

    world.width = heroVisual.clientWidth;
    world.height = heroVisual.clientHeight;
    worldCanvas.width = world.width * ratio;
    worldCanvas.height = world.height * ratio;
    worldCanvas.style.width = `${world.width}px`;
    worldCanvas.style.height = `${world.height}px`;
    worldCtx.setTransform(ratio, 0, 0, ratio, 0, 0);

    pool.width = poolCanvas.clientWidth;
    pool.height = poolCanvas.clientHeight;
    poolCanvas.width = pool.width * ratio;
    poolCanvas.height = pool.height * ratio;
    poolCanvas.style.width = `${pool.width}px`;
    poolCanvas.style.height = `${pool.height}px`;
    poolCtx.setTransform(ratio, 0, 0, ratio, 0, 0);

    chaosState.canvas.width = chaosState.canvas.clientWidth * ratio;
    chaosState.canvas.height = chaosState.canvas.clientHeight * ratio;
    chaosState.canvas.style.width = `${chaosState.canvas.clientWidth}px`;
    chaosState.canvas.style.height = `${chaosState.canvas.clientHeight}px`;
    chaosState.ctx = chaosState.canvas.getContext("2d");
    chaosState.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    pool.target = { x: pool.width / 2, y: pool.height / 2 };
    pool.pointer = { ...pool.target, active: false, lastMove: performance.now() };
    initParticles();
    initClouds();
    initWorldCreatures();
  }

  function initParticles() {
    pool.particles = Array.from({ length: 120 }, () => ({
      x: pool.width / 2 + (Math.random() - 0.5) * 30,
      y: pool.height / 2 + (Math.random() - 0.5) * 30,
      vx: 0,
      vy: 0,
      life: Math.random(),
    }));
  }

  function initClouds() {
    world.clouds = Array.from({ length: 10 }, () => ({
      x: Math.random() * world.width,
      y: Math.random() * (world.height * 0.4),
      size: 60 + Math.random() * 120,
      speed: 0.1 + Math.random() * 0.2,
      offset: Math.random(),
    }));
  }

  function initWorldCreatures() {
    world.creatures = Array.from({ length: 10 }, () => ({
      x: Math.random() * world.width,
      y: world.height * (0.45 + Math.random() * 0.4),
      size: 6 + Math.random() * 10,
      pulse: Math.random(),
      hue: 170 + Math.random() * 80,
      drift: Math.random() * 0.5 + 0.5,
    }));
  }

  function registerWorldImpulse(amount) {
    world.targetIntensity = clamp(world.targetIntensity + amount, 0.08, 1.3);
    world.lastInput = performance.now();
  }

  function lerpColor(a, b, t) {
    return `rgb(${Math.round(lerp(a[0], b[0], t))},${Math.round(lerp(a[1], b[1], t))},${Math.round(
      lerp(a[2], b[2], t)
    )})`;
  }

  function drawWorld(dt) {
    world.targetIntensity = clamp(world.targetIntensity - dt * 0.00006, 0.08 + chaosState.level * 0.08, 1.2);
    world.intensity = lerp(world.intensity, world.targetIntensity, 0.02);
    world.wind = lerp(world.wind, 0.15 + world.intensity * 0.9 + chaosState.level * 0.25, 0.02);
    world.light = lerp(world.light, 0.8 - world.intensity * 0.4, 0.02);
    world.ripplePhase += dt * 0.0003;

    const stabilityDelta = Math.abs(world.intensity - world.prevIntensity);
    if (stabilityDelta < 0.002) {
      world.stability += dt;
    } else {
      world.stability = 0;
    }
    world.prevIntensity = world.intensity;

    const now = performance.now();
    const sinceUnlock = now - world.unlockCooldown;
    if (world.stability > 7000 && !world.unlocks.glider) {
      world.unlocks.glider = true;
      setNote(unlockMessages.glider);
    }
    if (chaosState.level < 0.22 && chaosState.lastAction && now - chaosState.lastAction > 6000 && !world.unlocks.bloom) {
      world.unlocks.bloom = true;
      setNote(unlockMessages.bloom);
    }

    const canvas = worldCanvas;
    const w = world.width;
    const h = world.height;
    const skyColor = lerpColor([12, 28, 43], [26, 127, 140], clamp(world.light, 0, 1));
    const horizonColor = lerpColor([30, 42, 57], [247, 194, 102], clamp(world.light + 0.2, 0, 1));

    const grd = worldCtx.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, skyColor);
    grd.addColorStop(1, horizonColor);
    worldCtx.fillStyle = grd;
    worldCtx.fillRect(0, 0, w, h);

    // Wind streaks
    worldCtx.globalAlpha = 0.4 + world.intensity * 0.25;
    worldCtx.strokeStyle = `rgba(255,255,255,${0.2 + world.wind * 0.1})`;
    worldCtx.lineWidth = 1 + world.wind * 1.2;
    const streakCount = 12 + Math.floor(world.wind * 12);
    for (let i = 0; i < streakCount; i++) {
      const y = ((i * 31 + world.ripplePhase * 120 * world.wind) % h);
      worldCtx.beginPath();
      worldCtx.moveTo(0, y);
      worldCtx.quadraticCurveTo(w * 0.4, y + 10 * Math.sin(world.ripplePhase + i), w, y + 6);
      worldCtx.stroke();
    }
    worldCtx.globalAlpha = 1;

    // Clouds
    world.clouds.forEach((c) => {
      c.x += (0.4 + world.wind * 1.3) * c.speed;
      if (c.x - c.size > w) c.x = -c.size;
      const cloudGrad = worldCtx.createRadialGradient(c.x, c.y, c.size * 0.2, c.x, c.y, c.size);
      cloudGrad.addColorStop(0, `rgba(255,255,255,${0.4 + world.light * 0.2})`);
      cloudGrad.addColorStop(1, "rgba(255,255,255,0)");
      worldCtx.fillStyle = cloudGrad;
      worldCtx.beginPath();
      worldCtx.ellipse(c.x, c.y, c.size, c.size * 0.6, 0, 0, Math.PI * 2);
      worldCtx.fill();
    });

    // Creatures orbit
    worldCtx.save();
    worldCtx.translate(0, h * 0.05);
    world.creatures.forEach((c, idx) => {
      c.pulse += dt * (0.0006 + world.intensity * 0.0008);
      c.x += Math.sin(c.pulse + idx) * c.drift * (0.6 + world.wind * 0.4);
      c.y += Math.cos(c.pulse * 0.8 + idx) * c.drift * 0.6;
      const size = c.size * (1 + Math.sin(c.pulse * 2) * 0.15);
      const color = `hsla(${c.hue}, 70%, ${60 + world.light * 20}%, 0.8)`;
      worldCtx.fillStyle = color;
      worldCtx.beginPath();
      worldCtx.arc(c.x, c.y, size, 0, Math.PI * 2);
      worldCtx.fill();
    });
    worldCtx.restore();

    // Hidden glider
    if (world.unlocks.glider) {
      const t = world.ripplePhase * 0.7;
      const gx = (Math.sin(t) * 0.4 + 0.5) * w;
      const gy = h * 0.3 + Math.sin(t * 2) * 10;
      worldCtx.strokeStyle = `rgba(159, 226, 214, 0.9)`;
      worldCtx.lineWidth = 2;
      worldCtx.beginPath();
      worldCtx.moveTo(gx - 16, gy + 8);
      worldCtx.quadraticCurveTo(gx, gy - 18, gx + 16, gy + 8);
      worldCtx.stroke();
    }

    // Hidden bloom
    if (world.unlocks.bloom) {
      const t = world.ripplePhase * 1.1;
      const bx = w * 0.78 + Math.sin(t) * 10;
      const by = h * 0.7 + Math.cos(t * 1.3) * 8;
      worldCtx.fillStyle = "rgba(247, 194, 102, 0.8)";
      for (let i = 0; i < 5; i++) {
        const angle = (Math.PI * 2 * i) / 5 + t;
        const px = bx + Math.cos(angle) * 14;
        const py = by + Math.sin(angle) * 14;
        worldCtx.beginPath();
        worldCtx.arc(px, py, 6 + Math.sin(t + i) * 1.5, 0, Math.PI * 2);
        worldCtx.fill();
      }
      worldCtx.beginPath();
      worldCtx.arc(bx, by, 7, 0, Math.PI * 2);
      worldCtx.fillStyle = "rgba(26, 127, 140, 0.8)";
      worldCtx.fill();
    }

    // Sound-driven aurora
    if (world.unlocks.aurora) {
      const t = world.ripplePhase * 2.4;
      worldCtx.save();
      worldCtx.globalAlpha = 0.18;
      const auroraGrad = worldCtx.createLinearGradient(0, h * 0.15, 0, h * 0.45);
      auroraGrad.addColorStop(0, "rgba(199, 242, 204, 1)");
      auroraGrad.addColorStop(1, "rgba(26, 127, 140, 0)");
      worldCtx.fillStyle = auroraGrad;
      worldCtx.beginPath();
      for (let x = 0; x <= w; x += 8) {
        const y = h * 0.2 + Math.sin(t + x * 0.01) * 20;
        if (x === 0) worldCtx.moveTo(x, y);
        else worldCtx.lineTo(x, y);
      }
      worldCtx.lineTo(w, h * 0.45);
      worldCtx.lineTo(0, h * 0.45);
      worldCtx.closePath();
      worldCtx.fill();
      worldCtx.restore();
    }

    // HUD
    windRead.textContent = `${Math.round(world.wind * 60)}%`;
    lightRead.textContent = `${Math.round(world.light * 100)}%`;
    pulseRead.textContent = `${Math.round(world.intensity * 100)} bpm`;

    if (sinceUnlock > 7000) {
      worldNote.textContent = "Press, drag, pause. World reacts with a delay.";
    }
  }

  function updatePool(dt) {
    const t = performance.now();
    if (!pool.pointer.active && t - pool.pointer.lastMove > 2000) {
      pool.target.x = lerp(pool.target.x, pool.width / 2, 0.01);
      pool.target.y = lerp(pool.target.y, pool.height / 2, 0.01);
    }

    const dx = pool.target.x - pool.pointer.x;
    const dy = pool.target.y - pool.pointer.y;
    const speed = Math.sqrt(dx * dx + dy * dy);
    pool.pointer.x = lerp(pool.pointer.x, pool.target.x, 0.12);
    pool.pointer.y = lerp(pool.pointer.y, pool.target.y, 0.12);
    pool.scatter = lerp(pool.scatter, clamp(speed / 500, 0.1, 0.9), 0.05);

    if (speed > 4) {
      registerWorldImpulse(0.002 * clamp(speed / 40, 0.3, 2));
    }

    pool.particles.forEach((p) => {
      const toTargetX = pool.pointer.x - p.x;
      const toTargetY = pool.pointer.y - p.y;
      p.vx += toTargetX * 0.0008;
      p.vy += toTargetY * 0.0008;
      p.vx += (Math.random() - 0.5) * pool.scatter * 0.1;
      p.vy += (Math.random() - 0.5) * pool.scatter * 0.1;
      p.vx *= 0.94;
      p.vy *= 0.94;
      p.x += p.vx * dt * 0.06;
      p.y += p.vy * dt * 0.06;
    });

    poolCtx.clearRect(0, 0, pool.width, pool.height);
    poolCtx.fillStyle = "rgba(13, 52, 61, 0.7)";
    poolCtx.fillRect(0, 0, pool.width, pool.height);

    poolCtx.fillStyle = "rgba(159, 226, 214, 0.5)";
    poolCtx.beginPath();
    poolCtx.arc(pool.pointer.x, pool.pointer.y, 12 + pool.scatter * 10, 0, Math.PI * 2);
    poolCtx.fill();

    poolCtx.fillStyle = "rgba(247, 194, 102, 0.9)";
    pool.particles.forEach((p) => {
      poolCtx.beginPath();
      poolCtx.arc(p.x, p.y, 2 + p.life * 2, 0, Math.PI * 2);
      poolCtx.fill();
      p.life += 0.01;
      if (p.life > 1) p.life = 0;
    });
  }

  function updateChaos(dt) {
    chaosState.target = clamp(chaosState.target, 0.02, 1.1);
    chaosState.level = lerp(chaosState.level, chaosState.target, 0.05);
    chaosState.target = clamp(chaosState.target - dt * 0.00012, 0.02, 1.2);
    chaosState.glitchPhase += dt * (0.001 + chaosState.level * 0.004);

    const ctx = chaosState.ctx;
    const w = chaosState.canvas.clientWidth;
    const h = chaosState.canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);

    // Background smear based on chaos level
    for (let i = 0; i < 10; i++) {
      const y = (i * 30 + chaosState.glitchPhase * 60) % h;
      ctx.fillStyle = `rgba(247, 194, 102, ${0.05 + chaosState.level * 0.08})`;
      ctx.fillRect(0, y, w, 14);
    }

    const bars = 16 + Math.floor(chaosState.level * 40);
    for (let i = 0; i < bars; i++) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      const width = 20 + Math.random() * 120 * chaosState.level;
      const height = 6 + Math.random() * 20 * (1 - chaosState.level * 0.5);
      ctx.fillStyle = `rgba(${200 + Math.random() * 30}, ${120 + Math.random() * 60}, ${
        80 + Math.random() * 80
      }, ${0.12 + chaosState.level * 0.15})`;
      ctx.fillRect(x, y, width, height);
    }

    // Safe floor overlay
    const floor = h * (0.8 + Math.sin(chaosState.glitchPhase) * 0.02);
    ctx.fillStyle = "rgba(12, 28, 43, 0.7)";
    ctx.fillRect(0, floor, w, h - floor);

    const gauge = document.getElementById("chaosBar");
    const label = document.getElementById("chaosLabel");
    gauge.style.width = `${clamp(chaosState.level * 100, 6, 100)}%`;
    if (chaosState.level < 0.2) label.textContent = "steady";
    else if (chaosState.level < 0.5) label.textContent = "charged";
    else if (chaosState.level < 0.8) label.textContent = "stormy";
    else label.textContent = "slow-motion";

    registerWorldImpulse(chaosState.level * 0.0005);
  }

  function addChaos(type) {
    const response = 1 - Math.min(chaosState.level, 0.9) * 0.55;
    const amount = type === "color" ? 0.25 : type === "space" ? 0.2 : 0.18;
    chaosState.target = clamp(chaosState.target + amount * response, 0.05, 1.2);
    chaosState.lastAction = performance.now();
    if (type === "sound") {
      triggerPadSound(330);
    }
    registerWorldImpulse(0.08 * response);
  }

  function handleChaosButtons() {
    document.querySelectorAll("[data-chaos]").forEach((btn) => {
      btn.addEventListener("click", () => addChaos(btn.dataset.chaos));
    });
  }

  function handleWorldButtons() {
    document.getElementById("softenWorld").addEventListener("click", () => {
      world.targetIntensity = lerp(world.targetIntensity, 0.12, 0.6);
      setNote("Air thins out; clouds float slower.");
    });
    document.getElementById("wakeWorld").addEventListener("click", () => {
      registerWorldImpulse(0.25);
      setNote("Sky stirs with your push.");
    });
    document.getElementById("resetWorld").addEventListener("click", () => {
      world.targetIntensity = 0.22;
      chaosState.target = 0.12;
      setNote("New weather seeded.");
    });
  }

  // Morph creatures: drag to shape pace
  function setupCreatures() {
    const zone = document.getElementById("creatureZone");
    const nodes = zone.querySelectorAll(".creature");
    const bounds = zone.getBoundingClientRect();

    nodes.forEach((node, idx) => {
      const creature = {
        el: node,
        x: bounds.width * (0.25 + idx * 0.25),
        y: bounds.height * 0.5,
        offsetX: 0,
        offsetY: 0,
        tempo: 0.6,
        dragging: false,
        lastDrag: performance.now(),
        pointerId: null,
      };
      node.style.left = `${creature.x}px`;
      node.style.top = `${creature.y}px`;

      const pointerMove = (event) => {
        if (!creature.dragging) return;
        const rect = zone.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        creature.offsetX = clamp(x - creature.x, -80, 80);
        creature.offsetY = clamp(y - creature.y, -80, 80);
        const speed = Math.hypot(creature.offsetX, creature.offsetY);
        creature.tempo = lerp(creature.tempo, clamp(speed / 120, 0.4, 1.5), 0.15);
        node.style.transform = `translate(${creature.offsetX}px, ${creature.offsetY}px) scale(${1 +
          creature.tempo * 0.08})`;
        registerWorldImpulse(0.01 * creature.tempo);
        creature.lastDrag = performance.now();
      };

      const pointerUp = (event) => {
        creature.dragging = false;
        if (creature.pointerId !== null && node.releasePointerCapture) {
          node.releasePointerCapture(creature.pointerId);
          creature.pointerId = null;
        }
        node.style.transition = "transform 0.4s ease";
        node.style.transform = "translate(0,0)";
      };

      node.addEventListener("pointerdown", (event) => {
        creature.dragging = true;
        creature.pointerId = event.pointerId;
        node.setPointerCapture && node.setPointerCapture(event.pointerId);
        node.style.transition = "none";
        pointerMove(event);
      });
      node.addEventListener("pointermove", pointerMove);
      node.addEventListener("pointerup", pointerUp);
      node.addEventListener("pointercancel", pointerUp);

      // Idle pulse animation
      setInterval(() => {
        if (creature.dragging) return;
        const now = performance.now();
        const since = now - creature.lastDrag;
        const ease = clamp(since / 2000, 0.3, 1);
        const wiggle = Math.sin(now * 0.002 * creature.tempo) * 4 * ease;
        node.style.transform = `translate(${wiggle}px, ${Math.cos(now * 0.0019) * 3 * ease}px) scale(${1 +
          creature.tempo * 0.05})`;
      }, 80);
    });
  }

  // Rhythm pool input
  function bindPool() {
    const updatePointer = (e) => {
      const rect = poolCanvas.getBoundingClientRect();
      const x = clamp(e.clientX - rect.left, 0, pool.width);
      const y = clamp(e.clientY - rect.top, 0, pool.height);
      pool.target = { x, y };
      pool.pointer.active = true;
      pool.pointer.lastMove = performance.now();
    };
    poolCanvas.addEventListener("pointermove", updatePointer);
    poolCanvas.addEventListener("pointerdown", updatePointer);
    poolCanvas.addEventListener("pointerenter", updatePointer);
    poolCanvas.addEventListener("pointerleave", () => {
      pool.pointer.active = false;
    });
  }

  // World canvas interactions
  function bindWorldSurface() {
    const update = (e) => {
      const rect = worldCanvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const dx = worldPointer ? px - worldPointer.x : 0;
      const dy = worldPointer ? py - worldPointer.y : 0;
      worldPointer = { x: px, y: py };
      const speed = Math.sqrt(dx * dx + dy * dy);
      const impulse = clamp(0.015 + speed * 0.02, 0.01, 0.35);
      registerWorldImpulse(impulse);
    };
    worldCanvas.addEventListener("pointerdown", update);
    worldCanvas.addEventListener("pointermove", (e) => {
      if (e.buttons) update(e);
    });
    worldCanvas.addEventListener("pointerleave", () => {
      worldPointer = null;
    });
  }

  // Repair field interactions
  function bindRepair() {
    repairField.addEventListener("pointermove", (e) => {
      const rect = repairField.getBoundingClientRect();
      repairPointer = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      registerWorldImpulse(0.002);
    });
    repairField.addEventListener("pointerleave", () => {
      repairPointer = null;
    });
  }

  function updateRepair(dt) {
    const rect = repairField.getBoundingClientRect();
    fractures.forEach((f, idx) => {
      const base = Number(f.el.dataset.depth) || 0.6;
      let target = base * 0.9;
      if (repairPointer) {
        const yPos = (rect.height * (0.2 + idx * 0.12));
        const distance = Math.abs(yPos - repairPointer.y);
        const influence = clamp(1 - distance / 160, 0, 1);
        target = clamp(target - influence * 0.5, 0.05, 1);
      }
      f.target = target;
      f.damage = lerp(f.damage, f.target, 0.1);
      const scale = clamp(f.damage, 0.05, 1);
      f.el.style.transform = `scaleX(${scale})`;
      f.el.style.opacity = `${0.4 + scale * 0.4}`;
    });

    if (repairPointer) {
      registerWorldImpulse(-0.001);
    }
  }

  // Sound world
  const audioState = {
    ctx: null,
    master: null,
    tempo: 84,
    rapid: 0,
    lastTap: 0,
    taps: 0,
  };

  function ensureAudio() {
    if (audioState.ctx) return;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
    audioState.ctx = ctx;
    audioState.master = master;
  }

  function triggerPadSound(note) {
    ensureAudio();
    const ctx = audioState.ctx;
    const now = ctx.currentTime;
    const beat = 60 / audioState.tempo;
    const start = Math.ceil(now / beat) * beat;
    const end = start + 0.7;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filt = ctx.createBiquadFilter();

    const since = now - audioState.lastTap;
    audioState.lastTap = now;
    audioState.rapid = clamp(audioState.rapid * 0.8 + (since < 0.25 ? 0.8 : 0.3), 0, 3);
    audioState.taps += 1;
    if (audioState.taps > 5 && !world.unlocks.aurora) {
      world.unlocks.aurora = true;
      setNote(unlockMessages.aurora);
    }

    const softFreq = clamp(1800 - audioState.rapid * 500, 500, 2200);
    filt.type = "lowpass";
    filt.frequency.setValueAtTime(softFreq, start);

    osc.type = "sine";
    osc.frequency.value = note - audioState.rapid * 30;

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(0.4, start + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);

    osc.connect(filt);
    filt.connect(gain);
    gain.connect(audioState.master);

    osc.start(start);
    osc.stop(end);

    registerWorldImpulse(0.02);
  }

  function bindSoundPads() {
    document.querySelectorAll(".pad").forEach((pad) => {
      pad.addEventListener("click", () => {
        const note = Number(pad.dataset.note);
        pad.classList.add("is-playing");
        setTimeout(() => pad.classList.remove("is-playing"), 240);
        triggerPadSound(note);
      });
    });
    const tempoRange = document.getElementById("tempoRange");
    tempoRange.addEventListener("input", (e) => {
      audioState.tempo = Number(e.target.value);
    });
  }

  // Animation loop
  let last = performance.now();
  function tick(now) {
    const dt = now - last;
    last = now;
    drawWorld(dt);
    updatePool(dt);
    updateChaos(dt);
    updateRepair(dt);
    requestAnimationFrame(tick);
  }

  function init() {
    resize();
    window.addEventListener("resize", resize);
    handleChaosButtons();
    handleWorldButtons();
    setupCreatures();
    bindPool();
    bindWorldSurface();
    bindRepair();
    bindSoundPads();
    requestAnimationFrame(tick);
  }

  init();
})();
