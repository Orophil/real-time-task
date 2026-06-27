import { isStatus, type Status } from "./types";

export const MAX_TITLE_LENGTH = 500;

export class ValidationError extends Error {}

// Title must be a non-empty string after trimming, within a sane length bound.
export function parseTitle(value: unknown): string {
  if (typeof value !== "string") {
    throw new ValidationError("title must be a string");
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new ValidationError("title must not be empty");
  }
  if (trimmed.length > MAX_TITLE_LENGTH) {
    throw new ValidationError(`title must be at most ${MAX_TITLE_LENGTH} characters`);
  }
  return trimmed;
}

export function parseStatus(value: unknown): Status {
  if (!isStatus(value)) {
    throw new ValidationError("status must be one of: todo, in_progress, done");
  }
  return value;
}

export function parsePosition(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ValidationError("position must be a finite number");
  }
  return value;
}

export function parseVersion(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new ValidationError("version must be a positive integer");
  }
  return value;
}
