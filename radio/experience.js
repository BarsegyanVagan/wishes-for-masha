import { story } from "./story.js?v=2";
import { SoundDesk } from "./sound.js";
import { connectReceiver } from "./receiver.js";
import { PhotoPrinter } from "./printer.js";
import { Typewriter } from "./typewriter.js?v=2";

const motion = matchMedia("(prefers-reduced-motion: reduce)");
const sound = new SoundDesk(story.radio);
const receiver = connectReceiver({
  sound,
  station: story.station,
  radio: story.radio,
  text: story.radio.text || (story.radio.src
    ? `Запись от ${story.senderGenitive}.`
    : `Это пробный эфир. Здесь будет запись от ${story.senderGenitive}. А пока можно открыть киноленту.`),
  motion
});

for (const label of document.querySelectorAll("[data-name]")) {
  label.textContent = story[label.dataset.name];
}
document.title = `Эфир для ${story.recipientGenitive}`;

const scenes = Object.fromEntries(
  [...document.querySelectorAll("[data-scene]")].map(scene => [scene.dataset.scene, scene])
);
const paperScenes = new Set(["wishes", "karina", "karina-letter"]);
const theme = document.querySelector('meta[name="theme-color"]');
const soundButton = document.querySelector("#sound-toggle");
let scene = "radio";

function showScene(target) {
  scenes[scene].classList.remove("arrive");
  scenes[scene].hidden = true;
  scene = target;
  const current = scenes[target];
  const paper = paperScenes.has(target);
  document.body.classList.toggle("is-paper", paper);
  theme.content = paper ? "#fff3ef" : "#191419";
  current.hidden = false;
  current.classList.add("arrive");
  window.scrollTo(0, 0);
  current.querySelector("h1").focus({ preventScroll: true });
}

soundButton.addEventListener("click", () => {
  const enabled = soundButton.getAttribute("aria-pressed") !== "true";
  soundButton.setAttribute("aria-pressed", String(enabled));
  sound.setEnabled(enabled);
  if (enabled) void sound.unlock();
});

const frameCount = 11;
const photoPrinter = new PhotoPrinter(document.querySelector("#printer-canvas"), sound, motion);
const filmCounter = document.querySelector("#film-counter");
const printerCaption = document.querySelector("#printer-caption");
const printed = document.querySelector("#little-print");
const photoFrame = document.querySelector("#little-image");
const photograph = document.querySelector("#printed-photo");
const photoPlaceholder = document.querySelector("#photo-placeholder");
const photoCaption = document.querySelector("#photo-caption");
const nextPhoto = document.querySelector("#next-photo");
const previousPhoto = document.querySelector("#previous-photo");
const markers = Array.from({ length: frameCount }, () => document.createElement("span"));
document.querySelector("#frame-marks").append(...markers);
let frameIndex = 0;
let printingPhoto = false;

async function printFrame(index) {
  if (printingPhoto) return;
  printingPhoto = true;
  frameIndex = index;
  const last = index === frameCount - 1;
  const photo = last ? null : story.photos[index];
  const number = index + 1;

  printed.hidden = true;
  printed.classList.remove("arrive-print");
  nextPhoto.disabled = true;
  previousPhoto.disabled = true;
  previousPhoto.hidden = index === 0;
  filmCounter.textContent = `Кадр ${number} из ${frameCount}`;
  printerCaption.textContent = last ? "Фотопринтер подаёт чистый кадр" : "Фотопринтер печатает";
  markers.forEach((marker, step) => {
    marker.classList.toggle("past", step < index);
    marker.classList.toggle("current", step === index);
  });

  const result = await photoPrinter.print(photo, number, last);
  photograph.hidden = !result.src;
  if (result.src) {
    photograph.src = result.src;
    photograph.alt = photo.alt || `Снимок ${number}`;
  } else {
    photograph.removeAttribute("src");
    photograph.alt = "";
  }

  photoFrame.classList.toggle("is-blank", last);
  photoPlaceholder.hidden = Boolean(result.src) || last;
  photoPlaceholder.textContent = result.error ? "Фото не загрузилось" : "Место для фотографии";
  photoCaption.textContent = last ? "Сюда ты сегодня сфоткаешься." : photo?.caption || `Кадр ${number}`;
  printed.hidden = false;
  printed.classList.add("arrive-print");
  printerCaption.textContent = last ? "Последний кадр пока пустой" :
    result.demo ? "Пробный отпечаток готов" : result.error ? "Печать завершена с пустым кадром" : "Снимок готов";

  nextPhoto.textContent = last ? "К телеграмме" : "Следующий кадр";
  nextPhoto.disabled = false;
  previousPhoto.disabled = false;
  printingPhoto = false;
}

previousPhoto.addEventListener("click", () => {
  if (frameIndex > 0) void printFrame(frameIndex - 1);
});

nextPhoto.addEventListener("click", () => {
  if (printingPhoto) return;
  if (frameIndex === frameCount - 1) showScene("telegraph");
  else void printFrame(frameIndex + 1);
});

function paragraphs(container, values) {
  const content = values.map(text => {
    const paragraph = document.createElement("p");
    paragraph.textContent = text;
    return paragraph;
  });
  container.replaceChildren(...content);
}

paragraphs(document.querySelector("#wishes-body"), story.wishes);
paragraphs(document.querySelector("#karina-body"), story.karinaLetter);

const writer = new Typewriter({
  machine: document.querySelector("#typewriter"),
  keybed: document.querySelector("#keybed"),
  paper: document.querySelector("#paper-lines"),
  indicator: document.querySelector("#telegraph-indicator"),
  sound,
  motion
});

const writerState = document.querySelector("#writer-state");
const start = document.querySelector("#start-telegram");
const speed = document.querySelector("#speed");
const release = document.querySelector("#release-paper");
const lever = document.querySelector("#paper-lever");
const take = document.querySelector("#take-paper");

start.addEventListener("click", async () => {
  if (writer.state !== "ready") return;
  start.hidden = true;
  speed.hidden = false;
  writerState.textContent = "Принимаю сигнал телеграфа…";
  void sound.unlock().then(unlocked => {
    if (unlocked) return sound.prepareMechanical();
  });
  await writer.print(story.wishes, () => {
    writerState.textContent = "Машинка печатает пожелания.";
  });
  speed.hidden = true;
  release.hidden = false;
  lever.hidden = false;
  release.focus({ preventScroll: true });
  writerState.textContent = "Печать закончилась. Освободи лист рычагом.";
});

speed.addEventListener("click", () => {
  const faster = speed.getAttribute("aria-pressed") !== "true";
  speed.setAttribute("aria-pressed", String(faster));
  speed.textContent = faster ? "Обычный темп" : "Ускорить печать";
  writer.speed = faster ? 3.1 : 1;
});

async function releaseSheet() {
  if (writer.state !== "printed") return;
  release.disabled = true;
  lever.hidden = true;
  writerState.textContent = "Рычаг освобождает бумагу…";
  if (await writer.release()) {
    release.hidden = true;
    take.hidden = false;
    take.focus({ preventScroll: true });
    writerState.textContent = "Теперь лист можно забрать.";
  }
}

release.addEventListener("click", releaseSheet);
lever.addEventListener("click", releaseSheet);

take.addEventListener("click", async () => {
  take.disabled = true;
  if (await writer.take()) showScene("wishes");
});

const envelope = document.querySelector(".envelope");
for (const button of document.querySelectorAll("[data-go]")) {
  button.addEventListener("click", async () => {
    const target = button.dataset.go;
    if (target === "film") {
      if (!receiver.isLocked() || scene !== "radio") return;
      receiver.leave();
      showScene("film");
      void printFrame(0);
    } else if (target === "karina-letter") {
      button.disabled = true;
      button.classList.add("is-opening");
      if (!motion.matches) await new Promise(resolve => setTimeout(resolve, 330));
      showScene(target);
    } else {
      showScene(target);
    }
  });
}

document.querySelector("#restart").addEventListener("click", () => {
  receiver.reset();
  writer.reset();
  start.hidden = false;
  speed.hidden = true;
  speed.setAttribute("aria-pressed", "false");
  speed.textContent = "Ускорить печать";
  release.hidden = true;
  release.disabled = false;
  lever.hidden = true;
  take.hidden = true;
  take.disabled = false;
  writerState.textContent = "На связи. Машинка ждёт сигнал.";
  envelope.disabled = false;
  envelope.classList.remove("is-opening");
  showScene("radio");
});
