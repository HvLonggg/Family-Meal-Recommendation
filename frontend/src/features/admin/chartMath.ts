/* Hàm hình học thuần cho biểu đồ quản trị (tách riêng để kiểm thử và giữ fast refresh). */

export type Point = { x: number; y: number };

/** Đường cong đơn điệu (Fritsch–Carlson): mượt nhưng không vọt dưới 0 hay vượt đỉnh thật. */
export function monotonePath(points: Point[]): string {
  const [first, ...rest] = points;
  if (!first) return '';
  const start = `M${first.x},${first.y}`;
  if (!rest.length) return start;
  // Độ dốc từng đoạn, rồi tiếp tuyến tại mỗi điểm (0 ở đỉnh/đáy để không vọt quá).
  const slopes = rest.map((point, i) => {
    const previous = points[i] ?? point;
    return (point.y - previous.y) / (point.x - previous.x || 1);
  });
  const tangents = points.map((_, i) => {
    const a = slopes[i - 1];
    const b = slopes[i];
    if (a === undefined) return b ?? 0;
    if (b === undefined) return a;
    return a * b <= 0 ? 0 : (2 * a * b) / (a + b);
  });
  return rest.reduce((path, p1, i) => {
    const p0 = points[i] ?? p1;
    const h = (p1.x - p0.x) / 3;
    const t0 = tangents[i] ?? 0;
    const t1 = tangents[i + 1] ?? 0;
    return `${path}C${p0.x + h},${p0.y + t0 * h} ${p1.x - h},${p1.y - t1 * h} ${p1.x},${p1.y}`;
  }, start);
}

/** Mốc trục tung "đẹp" (1, 2, 5 × 10ⁿ) để đường lưới dễ đọc. */
export function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? raw;
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let value = 0; value <= top + step / 2; value += step) ticks.push(Math.round(value));
  return ticks;
}

/** Phần trăm thay đổi so với kỳ trước; null khi kỳ trước bằng 0 (không chia được). */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 100);
}
