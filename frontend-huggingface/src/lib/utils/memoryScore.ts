// Added shared score helpers for UI score bars and consistent thresholds.

export function clamp01(value: number): number {
	if (!Number.isFinite(value)) return 0;
	return Math.max(0, Math.min(1, value));
}

export function scoreToBgColor(score: number): string {
	if (!Number.isFinite(score)) return "bg-gray-400";
	if (score < 0.4) return "bg-red-500";
	if (score < 0.7) return "bg-amber-500";
	return "bg-green-500";
}

