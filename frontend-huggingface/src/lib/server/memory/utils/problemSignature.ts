import { findEnglishTranslation, findHebrewTranslation, normalizeHebrew } from "../seed/bilingualEntities";

function stableHash32(input: string): string {
	let hash = 0;
	for (let i = 0; i < input.length; i++) {
		const char = input.charCodeAt(i);
		hash = (hash << 5) - hash + char;
		hash |= 0;
	}
	return Math.abs(hash).toString(36);
}

function normalizeToken(token: string): string {
	const trimmed = token.trim();
	if (!trimmed) return "";
	const noPunct = trimmed.replace(/[^\w\s\u0590-\u05FF]/g, "");
	if (!noPunct) return "";
	if (/[\u0590-\u05FF]/.test(noPunct)) {
		return normalizeHebrew(noPunct);
	}
	return noPunct.toLowerCase();
}

function expandTokensBilingual(tokens: string[]): string[] {
	const expanded = new Set<string>();
	for (const t of tokens) {
		const base = normalizeToken(t);
		if (!base) continue;
		expanded.add(base);

		const en = findEnglishTranslation(base);
		if (en) {
			const enNorm = normalizeToken(en);
			if (enNorm) expanded.add(enNorm);
		}

		const he = findHebrewTranslation(base);
		if (he) {
			const heNorm = normalizeToken(he);
			if (heNorm) expanded.add(heNorm);
		}
	}
	return Array.from(expanded);
}

export function buildProblemHash(query: string): string {
	const tokens = query
		.split(/\s+/)
		.map(normalizeToken)
		.filter((t) => t.length > 2);
	const expanded = expandTokensBilingual(tokens);
	const signature = expanded.sort().join("_");
	return `prob_${stableHash32(signature)}`;
}

