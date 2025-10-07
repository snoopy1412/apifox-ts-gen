import chalk from "chalk";
import gradient from "gradient-string";

const ERROR_FRAME_GRADIENT = gradient(["#f87171", "#ef4444"]);
const ERROR_TITLE_GRADIENT = gradient(["#f97316", "#ef4444"]);
const BANNER_GRADIENT = gradient(["#38bdf8", "#6366f1", "#a855f7", "#ec4899"]);

export function createErrorBox(title: string, content: string) {
  const boxWidth = 80;
  const rawLine = "─".repeat(boxWidth);
  const line = ERROR_FRAME_GRADIENT(rawLine);
  const padding = " ".repeat(2);
  const titleLine = chalk.bold(ERROR_TITLE_GRADIENT(title));

  return `
${line}
${padding}${chalk.black.bgHex("#fee2e2").bold(" ERROR ")} ${titleLine}
${line}

${content}

${line}`;
}

export function renderBanner(message: string) {
  const text = message.trim();
  if (!text) return "";

  const label = ` ${text} `;
  const width = Math.max(label.length, 24);
  const line = "=".repeat(width);
  const padding = width - label.length;
  const leftPadding = Math.floor(padding / 2);
  const rightPadding = padding - leftPadding;
  const paddedLabel = `${" ".repeat(leftPadding)}${label}${" ".repeat(rightPadding)}`;
  const block = `${line}\n${paddedLabel}\n${line}`;
  const banner = BANNER_GRADIENT.multiline(block);
  return chalk.bold(banner);
}
