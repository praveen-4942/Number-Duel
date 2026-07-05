import type { GuessRecord } from "../types";

export function hasUniqueDigits(value: string) {
  return /^\d+$/.test(value) && new Set(value).size === value.length;
}

export function validateNumber(value: string, length: number) {
  if (!new RegExp(`^\\d{${length}}$`).test(value)) {
    return `Enter exactly ${length} digits.`;
  }
  if (!hasUniqueDigits(value)) {
    return "Digits cannot repeat.";
  }
  return "";
}

export function generateSecret(length: number) {
  const digits = "0123456789".split("");
  const secret: string[] = [];
  while (secret.length < length) {
    const index = Math.floor(Math.random() * digits.length);
    secret.push(digits.splice(index, 1)[0]);
  }
  return secret.join("");
}

export function orderedHistory(history?: Record<string, GuessRecord>) {
  return Object.values(history ?? {}).sort((a, b) => a.createdAt - b.createdAt);
}

export function clueLabel(record: GuessRecord) {
  if (record.bulls !== undefined) {
    return `${record.bulls} Bulls · ${record.cows ?? 0} Cows`;
  }
  if (record.correctDigits !== undefined) {
    return `${record.correctDigits} Correct Digits · ${record.correctPositions ?? 0} Correct Positions`;
  }
  return `${record.correctPositions ?? 0} Correct Positions`;
}
