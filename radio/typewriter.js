const restingOffset = 11.7;
const glyphWidth = .978;
const lineHeight = 2.76;
const lineWidth = 26;
const keyRows = [
  "№1234567890—",
  "ЙЦУКЕНГШЩЗХЪ",
  "ФЫВАПРОЛДЖЭ",
  "ЯЧСМИТЬБЮ.,",
  " "
];
const latinRows = ["", "QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function wrapLine(paragraph, width) {
  const lines = [];
  let line = "";
  for (const word of paragraph.trim().split(/\s+/u)) {
    if (!word) continue;
    const letters = [...word];
    if (letters.length > width) {
      if (line) lines.push(line);
      line = "";
      for (let i = 0; i < letters.length; i += width) {
        const part = letters.slice(i, i + width).join("");
        if (i + width < letters.length) lines.push(part);
        else line = part;
      }
    } else if (line && [...line].length + letters.length + 1 > width) {
      lines.push(line);
      line = word;
    } else {
      line += line ? ` ${word}` : word;
    }
  }
  lines.push(line);
  return lines;
}

export class Typewriter {
  constructor({ machine, keybed, paper, indicator, sound, motion }) {
    this.machine = machine;
    this.paper = paper;
    this.indicator = indicator;
    this.sound = sound;
    this.motion = motion;
    this.typebar = machine.querySelector(".typebar");
    this.speed = 1;
    this.keys = new Map();

    for (const [rowIndex, row] of keyRows.entries()) {
      const group = document.createElement("div");
      group.className = "keyrow";
      for (const [column, character] of [...row].entries()) {
        const key = document.createElement("span");
        key.className = character === " " ? "key space" : "key";
        key.textContent = character === " " ? "" : character;
        group.append(key);
        this.keys.set(character, key);
        const latin = latinRows[rowIndex]?.[column];
        if (latin) this.keys.set(latin, key);
      }
      keybed.append(group);
    }
    this.keys.set("Ё", this.keys.get("Е"));
    this.keys.set("(", this.keys.get("9"));
    this.keys.set(")", this.keys.get("0"));
    this.reset();
  }

  setState(value) {
    this.state = value;
    this.machine.dataset.state = value;
  }

  reset() {
    this.machine.classList.remove("is-returning", "is-releasing", "is-ejecting", "is-released", "is-taken");
    this.indicator.classList.remove("is-done", "is-pulsing");
    this.paper.replaceChildren();
    this.machine.style.setProperty("--travel", `${restingOffset}cqw`);
    this.machine.style.setProperty("--feed", "0cqw");
    this.machine.style.setProperty("--paper-tail", "0cqw");
    this.speed = 1;
    this.setState("ready");
  }

  duration(ms) {
    return Math.max(12, ms / this.speed / (this.motion.matches ? 2.45 : 1));
  }

  async receive() {
    for (const long of [false, true, false, false, true, false, true]) {
      this.indicator.classList.add("is-pulsing");
      this.sound.telegraph(long);
      await wait(this.duration(long ? 177 : 85));
      this.indicator.classList.remove("is-pulsing");
      await wait(this.duration(83));
    }
    this.indicator.classList.add("is-done");
  }

  async press(char, serial, column, segment) {
    const space = char === " ";
    const upper = char.toLocaleUpperCase("ru-RU");
    const key = this.keys.get(upper) ?? this.keys.get(/[?!:;,]/.test(char) ? "." : "—");
    key.classList.add("is-pressed");
    if (!space) {
      this.typebar.classList.remove("is-striking");
      void this.typebar.offsetWidth;
      this.typebar.classList.add("is-striking");
    }
    await wait(this.duration(23));
    segment.append(char);
    this.sound.strike(serial, space);
    this.machine.style.setProperty("--travel", `${restingOffset - (column + 1) * glyphWidth}cqw`);
    await wait(this.duration(39));
    key.classList.remove("is-pressed");
    await wait(this.duration(space ? 35 : 37 + (serial * 17 % 36)));
  }

  async returnCarriage(index) {
    const time = this.duration(370);
    this.machine.style.setProperty("--return-time", `${time}ms`);
    this.machine.classList.add("is-returning");
    this.sound.feed();
    await wait(this.duration(66));
    this.machine.style.setProperty("--travel", `${restingOffset}cqw`);
    this.machine.style.setProperty("--feed", `${(index + 1) * lineHeight}cqw`);
    await wait(time);
    this.machine.classList.remove("is-returning");
    await wait(this.duration(83));
  }

  async print(paragraphs, onTyping) {
    if (this.state !== "ready") return false;
    this.setState("receiving");
    const lines = paragraphs.flatMap(paragraph => paragraph.split(/\r?\n/u))
      .flatMap(paragraph => wrapLine(paragraph, lineWidth));
    this.machine.style.setProperty("--paper-tail", `${Math.max(0, lines.length - 1) * lineHeight}cqw`);
    const fragments = lines.map(() => {
      const segment = document.createElement("div");
      this.paper.append(segment);
      return segment;
    });

    await this.receive();
    this.setState("typing");
    onTyping();
    let serial = 0;
    for (const [index, line] of lines.entries()) {
      const characters = [...line];
      for (const [column, char] of characters.entries()) {
        if (column === lineWidth - 5) this.sound.bell();
        await this.press(char, serial, column, fragments[index]);
        serial += 1;
      }
      if (index < lines.length - 1) await this.returnCarriage(index);
    }
    await wait(this.duration(170));
    this.setState("printed");
    return true;
  }

  async release() {
    if (this.state !== "printed") return false;
    this.setState("release");
    this.machine.classList.add("is-releasing");
    this.sound.release();
    await wait(this.motion.matches ? 90 : 330);
    this.setState("ejecting");
    this.machine.classList.add("is-ejecting");
    this.sound.paper();
    await wait(this.motion.matches ? 130 : 720);
    this.machine.classList.add("is-released");
    this.machine.classList.remove("is-ejecting", "is-releasing");
    this.setState("released");
    return true;
  }

  async take() {
    if (this.state !== "released") return false;
    this.setState("taken");
    this.machine.classList.add("is-taken");
    await wait(this.motion.matches ? 80 : 320);
    return true;
  }
}
