import { Slug } from "./data/types";
import { bodyFront, frontViewBox } from "./data/bodyFront";
import { bodyBack, backViewBox } from "./data/bodyBack";

export const SLUG_MAPPING: Record<string, Slug> = {
  "muscle_group_abs": "abs",
  "muscle_group_back": "upper-back",
  "muscle_group_biceps": "biceps",
  "muscle_group_calves": "calves",
  "muscle_group_chest": "chest",
  "muscle_group_forearm": "forearm",
  "muscle_group_gluteus": "gluteal",
  "muscle_group_hamstrings": "hamstring",
  "muscle_group_lat": "upper-back",
  "muscle_group_lower_back": "lower-back",
  "muscle_group_neck": "neck",
  "muscle_group_quads": "quadriceps",
  "muscle_group_shoulders": "deltoids",
  "muscle_group_traps": "trapezius",
  "muscle_group_triceps": "triceps",
};

export function getBodyPartSvgDataUrl(type: 'front' | 'back', colors: Partial<Record<Slug, string>> = {}): string {
  const bodyParts = type === 'front' ? bodyFront : bodyBack;
  const viewBox = type === 'front' ? frontViewBox : backViewBox;
  const paths = bodyParts.map(part => {
    const color = colors[part.slug as Slug] || part.color || '#ccc';
    const pathData = [part.path?.common, part.path?.left, part.path?.right].filter(Boolean).flat() as string[];
    return pathData.map(d => `<path d="${d}" fill="${color}" />`).join('');
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${paths}</svg>`;
  const base64 = Buffer.from(svg).toString('base64');
  return `data:image/svg+xml;base64,${base64}`;
}
