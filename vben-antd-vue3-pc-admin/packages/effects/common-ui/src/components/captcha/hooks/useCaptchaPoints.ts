import type { CaptchaPoint } from '../types';

import { reactive } from 'vue';

export function useCaptchaPoints() {
  const points = reactive<CaptchaPoint[]>([]);
  function addPoint(point: CaptchaPoint) {
    points.push(point);
  }

  function removePoint(index: number) {
    points.splice(index, 1);
    points.forEach((point, pointIndex) => {
      point.i = pointIndex;
    });
  }

  function clearPoints() {
    points.splice(0);
  }
  return {
    addPoint,
    clearPoints,
    points,
    removePoint,
  };
}
