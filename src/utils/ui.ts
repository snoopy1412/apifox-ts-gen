import chalk from "chalk";
import gradient from "gradient-string";

const PROMPT_COLOR = "#38bdf8";
const SECONDARY_ACCENT = "#60a5fa";
const POSITIVE_COLOR = "#22c55e";
const PATH_ACCENT = "#22d3ee";
const MODULE_GRADIENT = gradient(["#f59e0b", "#f97316"]);

const INFO_BADGE = chalk.hex("#38bdf8")("[i]");
const SUCCESS_BADGE = chalk.hex(POSITIVE_COLOR)("[✓]");
const WARN_BADGE = chalk.hex("#f97316")("[!]");

export const PROMPT_PREFIX = chalk.bold(chalk.hex(PROMPT_COLOR)("❯"));
export const PROMPT_SUFFIX = ` ${chalk.dim("›")}`;

export function stylePromptMessage(message: string) {
  return chalk.bold(chalk.hex(PROMPT_COLOR)(message));
}

export function styleAnswer(value: string) {
  return chalk.hex(PROMPT_COLOR)(value);
}

export function styleValidationError(message: string) {
  return chalk.hex("#fb7185")(message);
}

export function formatModuleChoice(name: string, englishName?: string) {
  const base = MODULE_GRADIENT(name);
  if (!englishName) {
    return base;
  }
  return `${base} ${chalk.gray("→")} ${chalk.hex(SECONDARY_ACCENT)(englishName)}`;
}

export function formatModuleLabel(name: string, englishName?: string) {
  const base = MODULE_GRADIENT(name);
  if (!englishName) {
    return base;
  }
  return `${base}${chalk.gray("/")}${chalk.hex(SECONDARY_ACCENT)(englishName)}`;
}

export function stylePathDisplay(path: string) {
  return chalk.hex(PATH_ACCENT)(path);
}

export function logInfo(message: string) {
  console.log(`${INFO_BADGE} ${chalk.hex(SECONDARY_ACCENT)(message)}`);
}

export function logSuccess(message: string) {
  console.log(`${SUCCESS_BADGE} ${chalk.hex(POSITIVE_COLOR)(message)}`);
}

export function logWarn(message: string) {
  console.warn(`${WARN_BADGE} ${chalk.hex("#f97316")(message)}`);
}
