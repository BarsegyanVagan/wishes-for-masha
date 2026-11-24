const tray = [[464, 438], [891, 479], [769, 789], [270, 724]];
const screen = [[759, 160], [1056, 190], [1005, 285], [702, 251]];

const interpolate = (start, end, amount) => [
  start[0] + (end[0] - start[0]) * amount,
  start[1] + (end[1] - start[1]) * amount
];

function project(context, tile, corners, progress = 1) {
  const [topLeft, topRight, bottomRight, bottomLeft] = corners;
  const visible = Math.round(tile.height * progress);
  context.save();
  for (let at = 0; at < visible; at += 5) {
    const step = Math.min(5, visible - at);
    const upper = at / tile.height;
    const lower = (at + step) / tile.height;
    const left = interpolate(topLeft, bottomLeft, upper);
    const right = interpolate(topRight, bottomRight, upper);
    const next = interpolate(topLeft, bottomLeft, lower);
    context.setTransform(
      (right[0] - left[0]) / tile.width,
      (right[1] - left[1]) / tile.width,
      (next[0] - left[0]) / step,
      (next[1] - left[1]) / step,
      left[0], left[1]
    );
    const overlap = Math.min(2.4, visible - at - step);
    context.drawImage(tile, 0, tile.height - visible + at, tile.width, step + overlap, 0, 0, tile.width, step + overlap);
  }
  context.restore();
}

function surface(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function loadImage(path) {
  return new Promise(resolve => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image), { once: true });
    image.addEventListener("error", () => resolve(null), { once: true });
    image.src = path;
  });
}

function centeredPhoto(ctx, image, x, y, width, height) {
  const ratio = Math.min(width / image.naturalWidth, height / image.naturalHeight);
  const w = image.naturalWidth * ratio;
  const h = image.naturalHeight * ratio;
  ctx.drawImage(image, x + (width - w) / 2, y + (height - h) / 2, w, h);
}

export class PhotoPrinter {
  constructor(canvas, sound, motion) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d");
    if (this.context) this.context.imageSmoothingQuality = "high";
    this.paper = surface(560, 390);
    this.display = surface(360, 132);
    this.sound = sound;
    this.motion = motion;
  }

  draw(progress) {
    if (!this.context) return;
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    project(this.context, this.display, screen);
    if (progress > 0) project(this.context, this.paper, tray, progress);
  }

  async print(photo, number, last) {
    const path = photo?.src ? new URL(photo.src, import.meta.url).href : "";
    const image = path ? await loadImage(path) : null;
    const demo = !path && !last;
    const sheet = this.paper.getContext("2d");
    const lcd = this.display.getContext("2d");

    if (sheet && lcd) {
      sheet.fillStyle = "#fff7e9";
      sheet.fillRect(0, 0, this.paper.width, this.paper.height);
      sheet.fillStyle = "#eddfd1";
      sheet.fillRect(20, 19, 520, 335);
      if (image) {
        centeredPhoto(sheet, image, 20, 19, 520, 335);
      } else if (!last) {
        sheet.fillStyle = "#7e5660";
        sheet.font = "600 31px sans-serif";
        sheet.textAlign = "center";
        sheet.fillText(demo ? `Кадр ${number}` : "Кадр не загрузился", 280, 205);
      }

      lcd.fillStyle = "#233e40";
      lcd.fillRect(0, 0, this.display.width, this.display.height);
      if (image) centeredPhoto(lcd, image, 175, 10, 170, 113);
      lcd.fillStyle = "#e1eacc";
      lcd.font = "bold 29px monospace";
      lcd.fillText(String(number).padStart(2, "0") + " / 11", 22, 72);
    }

    if (this.motion.matches || !this.context) {
      this.draw(1);
    } else {
      this.sound.motor(1.1);
      const start = performance.now();
      await new Promise(resolve => {
        const advance = now => {
          const time = Math.min(1, (now - start) / 1220);
          this.draw(1 - (1 - time) ** 1.29);
          if (time < 1) requestAnimationFrame(advance);
          else resolve();
        };
        requestAnimationFrame(advance);
      });
    }
    return { src: image ? path : "", error: Boolean(path && !image), demo };
  }
}
