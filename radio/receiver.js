const startFrequency = 902;
const turnRange = 134;
const lockDelay = 1080;

export function connectReceiver({ sound, station, radio, text, motion }) {
  const receiver = document.querySelector("#receiver");
  const power = document.querySelector("#radio-power");
  const tuner = document.querySelector("#tuner");
  const dial = document.querySelector("#knob");
  const readout = document.querySelector("#frequency");
  const state = document.querySelector("#radio-state");
  const indicators = [...document.querySelectorAll("#signal-meter i")];
  const stationNote = document.querySelector("#station-note");
  const stationHeading = stationNote.querySelector("h2");
  const replay = document.querySelector("#replay-voice");
  const steps = [...document.querySelectorAll("[data-step]")];
  const min = Number(tuner.min);
  const max = Number(tuner.max);
  const format = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  let frequency = startFrequency;
  let powered = false;
  let locked = false;
  let powerGeneration = 0;
  let timer = null;
  let drag = null;

  document.querySelector("#transmission").textContent = text;
  stationHeading.tabIndex = -1;
  replay.hidden = !radio.src;

  function distance() {
    return Math.abs(station - frequency);
  }

  function strength() {
    return Math.exp(-.5 * (distance() / 9.4) ** 2);
  }

  function update() {
    const reading = format.format(frequency / 10);
    const level = locked ? 1 : powered ? strength() : 0;
    const angle = turnRange * (2 * (frequency - min) / (max - min) - 1);
    const message = locked ? "Сигнал устойчивый" :
      !powered ? "Радио выключено" :
      distance() <= 1 ? "Удержи частоту…" :
      level > .62 ? "Совсем близко" :
      level > .18 ? "Появился сигнал" : "Шум эфира";

    receiver.dataset.power = locked ? "locked" : powered ? "on" : "off";
    tuner.value = String(frequency);
    tuner.setAttribute("aria-valuetext", `${reading} МГц`);
    readout.value = reading;
    dial.style.setProperty("--turn", `${angle}deg`);
    indicators.forEach((bar, i) => bar.classList.toggle("is-lit", i < Math.round(level * indicators.length)));
    if (state.textContent !== message) state.textContent = message;
    sound.tune(level, frequency);

    tuner.disabled = !powered || locked;
    steps.forEach(step => { step.disabled = tuner.disabled; });
    power.disabled = locked;
    power.setAttribute("aria-pressed", String(powered));
    power.lastChild.textContent = powered ? " Выключить" : " Включить";
  }

  function checkLock() {
    clearTimeout(timer);
    timer = null;
    if (powered && !locked && distance() <= 1) {
      timer = setTimeout(() => {
        if (!powered || locked || distance() > 1) return;
        locked = true;
        frequency = station;
        sound.stopTuner();
        update();
        stationNote.hidden = false;
        stationHeading.focus({ preventScroll: true });
        stationNote.scrollIntoView({ block: "nearest", behavior: motion.matches ? "auto" : "smooth" });
        if (radio.src) void sound.playVoice();
      }, lockDelay);
    }
  }

  function setFrequency(value) {
    if (!powered || locked) return;
    const next = Math.max(min, Math.min(max, Math.round(value)));
    if (frequency === next) return;
    frequency = next;
    update();
    checkLock();
  }

  power.addEventListener("click", async () => {
    const generation = ++powerGeneration;
    powered = !powered;
    update();
    checkLock();
    if (!powered) {
      sound.stopTuner();
      return;
    }
    if (await sound.unlock() && generation === powerGeneration && powered && !locked) {
      void sound.prepareMechanical();
      void sound.startTuner({ strength: strength(), frequency });
    }
  });

  tuner.addEventListener("input", () => setFrequency(Number(tuner.value)));
  for (const step of steps) {
    step.addEventListener("click", () => setFrequency(frequency + Number(step.dataset.step)));
  }

  function pointerAngle(event) {
    const rect = dial.getBoundingClientRect();
    const x = event.clientX - rect.left - rect.width / 2;
    const y = event.clientY - rect.top - rect.height / 2;
    return { angle: Math.atan2(y, x) * 180 / Math.PI, distance: Math.hypot(x, y) };
  }

  dial.addEventListener("pointerdown", event => {
    if (tuner.disabled || !event.isPrimary || event.button !== 0) return;
    const point = pointerAngle(event);
    drag = { id: event.pointerId, angle: point.angle, slide: point.distance < 12,
      x: event.clientX, y: event.clientY, start: frequency, value: frequency };
    dial.setPointerCapture(event.pointerId);
  });

  dial.addEventListener("pointermove", event => {
    if (drag?.id !== event.pointerId || tuner.disabled) return;
    if (drag.slide) {
      const travel = event.clientX - drag.x - (event.clientY - drag.y) * .81;
      setFrequency(drag.start + travel * .83);
      return;
    }
    const point = pointerAngle(event);
    if (point.distance < 9) return;
    const delta = ((point.angle - drag.angle + 540) % 360) - 180;
    drag.angle = point.angle;
    drag.value = Math.max(min, Math.min(max, drag.value + delta * (max - min) / (2 * turnRange)));
    setFrequency(drag.value);
  });

  dial.addEventListener("lostpointercapture", () => { drag = null; });
  replay.addEventListener("click", async () => {
    if (await sound.unlock() && locked) void sound.playVoice();
  });

  function leave() {
    powerGeneration += 1;
    clearTimeout(timer);
    sound.stopTuner();
    sound.stopVoice();
  }

  function reset() {
    leave();
    powered = false;
    locked = false;
    frequency = startFrequency;
    stationNote.hidden = true;
    update();
  }

  update();
  return { leave, reset, isLocked: () => locked };
}
