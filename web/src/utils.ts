import type { DatePrecision, Person } from './types';

export function formatDate(date: string | null, precision: DatePrecision | null, circa?: boolean): string {
  if (!date) return '';
  const prefix = circa ? '约 ' : '';
  if (precision === 'year') return `${prefix}${date.slice(0, 4)}`;
  if (precision === 'month') return `${prefix}${date.slice(0, 7)}`;
  return `${prefix}${date.slice(0, 10)}`;
}

export function lifeSpan(person: Person): string {
  const birth = formatDate(person.birthDate, person.birthPrecision, person.birthCirca);
  const death = person.isAlive ? '' : formatDate(person.deathDate, person.deathPrecision, person.deathCirca);
  if (!birth && !death) return '';
  if (!death) return `${birth}`;
  return `${birth} – ${death}`;
}

export function age(person: Person): number | null {
  if (!person.birthDate) return null;
  const birth = new Date(person.birthDate);
  const end = !person.isAlive && person.deathDate ? new Date(person.deathDate) : new Date();
  let age = end.getFullYear() - birth.getFullYear();
  const m = end.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && end.getDate() < birth.getDate())) age -= 1;
  return age >= 0 ? age : null;
}

export function escapeXml(text: string): string {
  return text.replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`);
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function compressImage(file: File, maxSize = 512): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  return await new Promise<Blob>((resolve) => {
    canvas.toBlob((blob) => resolve(blob ?? file), 'image/jpeg', 0.86);
  });
}

export function absoluteUrl(path: string): string {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  return new URL(path, window.location.origin).href;
}
