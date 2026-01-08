/**
 * OutcomeDetector - Heuristic outcome detection from conversation
 *
 * Analyzes conversation patterns to detect implicit outcomes when
 * explicit feedback is not provided.
 */

import { logger } from "$lib/server/logger";
import type { Outcome } from "../types";

/**
 * Conversation message for analysis
 */
export interface ConversationMessage {
	role: "user" | "assistant" | "system";
	content: string;
	timestamp?: Date;
}

/**
 * Outcome detection result
 */
export interface OutcomeDetectionResult {
	outcome: Outcome;
	confidence: number; // 0.0 to 1.0
	signals: string[]; // Which patterns triggered
	reasoning: string;
}

/**
 * Positive signals indicating "worked"
 */
const POSITIVE_SIGNALS = {
	english: [
		"thanks",
		"thank you",
		"perfect",
		"great",
		"exactly",
		"that's right",
		"that works",
		"helpful",
		"solved",
		"fixed",
		"got it",
		"understood",
		"makes sense",
		"appreciate",
		"awesome",
		"excellent",
		"good job",
		"nice",
		"correct",
		"yes",
		"yep",
		"yeah",
	],
	hebrew: [
		"תודה",
		"מעולה",
		"מושלם",
		"בדיוק",
		"נכון",
		"עזר",
		"עובד",
		"הבנתי",
		"מצוין",
		"יופי",
		"אחלה",
		"סבבה",
		"נהדר",
		"כל הכבוד",
		"יפה",
	],
};

/**
 * Negative signals indicating "failed"
 */
const NEGATIVE_SIGNALS = {
	english: [
		"wrong",
		"incorrect",
		"not what i",
		"doesn't work",
		"didn't work",
		"not helpful",
		"useless",
		"bad",
		"terrible",
		"no that's not",
		"that's not right",
		"try again",
		"still broken",
		"still not",
		"confused",
		"doesn't make sense",
		"not what i asked",
		"misunderstood",
	],
	hebrew: [
		"לא נכון",
		"טעות",
		"לא עובד",
		"לא עזר",
		"לא הבנת",
		"לא זה",
		"נסה שוב",
		"עדיין לא",
		"בלבול",
		"לא מה שביקשתי",
		"לא רלוונטי",
	],
};

/**
 * Partial success signals
 */
const PARTIAL_SIGNALS = {
	english: [
		"but also",
		"mostly",
		"almost",
		"close",
		"partially",
		"kind of",
		"sort of",
		"not quite",
		"one more thing",
		"what about",
		"however",
		"although",
	],
	hebrew: ["כמעט", "בערך", "חלקית", "אבל גם", "רק שעוד", "מה עם", "אם כי"],
};

/**
 * Question continuation signals (indicates incomplete)
 */
const CONTINUATION_SIGNALS = {
	english: [
		"what about",
		"how do i",
		"can you also",
		"another question",
		"one more",
		"wait",
		"actually",
		"follow up",
		"related to that",
	],
	hebrew: ["מה עם", "איך אני", "אפשר גם", "שאלה נוספת", "עוד משהו", "רגע", "בעצם", "בהמשך לזה"],
};

export class OutcomeDetector {
	/**
	 * Analyze conversation history to detect outcome
	 */
	analyze(messages: ConversationMessage[]): OutcomeDetectionResult {
		if (messages.length < 2) {
			return {
				outcome: "unknown",
				confidence: 0.0,
				signals: [],
				reasoning: "Insufficient conversation history",
			};
		}

		// Focus on recent messages (last 4)
		const recentMessages = messages.slice(-4);

		// Find the last user message after assistant response
		const lastUserMsg = this.getLastUserResponse(recentMessages);
		if (!lastUserMsg) {
			return {
				outcome: "unknown",
				confidence: 0.3,
				signals: [],
				reasoning: "No user response after assistant",
			};
		}

		const text = lastUserMsg.toLowerCase();
		const signals: string[] = [];

		// Check for positive signals
		const positiveScore = this.countSignals(text, POSITIVE_SIGNALS, signals, "positive");

		// Check for negative signals
		const negativeScore = this.countSignals(text, NEGATIVE_SIGNALS, signals, "negative");

		// Check for partial signals
		const partialScore = this.countSignals(text, PARTIAL_SIGNALS, signals, "partial");

		// Check for continuation (indicates incomplete)
		const continuationScore = this.countSignals(
			text,
			CONTINUATION_SIGNALS,
			signals,
			"continuation"
		);

		// Analyze message length and patterns
		const lengthSignal = this.analyzeLengthPattern(lastUserMsg, messages);
		if (lengthSignal) signals.push(lengthSignal);

		// Calculate outcome
		return this.calculateOutcome(
			positiveScore,
			negativeScore,
			partialScore,
			continuationScore,
			signals
		);
	}

	/**
	 * Get the last user message after an assistant response
	 */
	private getLastUserResponse(messages: ConversationMessage[]): string | null {
		// Look for pattern: assistant -> user
		for (let i = messages.length - 1; i >= 1; i--) {
			if (messages[i].role === "user" && messages[i - 1].role === "assistant") {
				return messages[i].content;
			}
		}
		return null;
	}

	/**
	 * Count matching signals in text
	 */
	private countSignals(
		text: string,
		signalSet: { english: string[]; hebrew: string[] },
		signals: string[],
		category: string
	): number {
		let score = 0;

		for (const signal of signalSet.english) {
			if (text.includes(signal)) {
				score++;
				signals.push(`${category}:${signal}`);
			}
		}

		for (const signal of signalSet.hebrew) {
			if (text.includes(signal)) {
				score++;
				signals.push(`${category}:${signal}`);
			}
		}

		return score;
	}

	/**
	 * Analyze message length patterns
	 */
	private analyzeLengthPattern(
		lastUserMsg: string,
		messages: ConversationMessage[]
	): string | null {
		// Very short positive response (< 20 chars) is often affirmation
		if (lastUserMsg.length < 20) {
			const hasQuestion = lastUserMsg.includes("?");
			if (!hasQuestion) {
				return "length:short_affirmation";
			}
		}

		// Long follow-up question might indicate partial success
		if (lastUserMsg.length > 100 && lastUserMsg.includes("?")) {
			return "length:detailed_followup";
		}

		return null;
	}

	/**
	 * Calculate final outcome from scores
	 */
	private calculateOutcome(
		positive: number,
		negative: number,
		partial: number,
		continuation: number,
		signals: string[]
	): OutcomeDetectionResult {
		// Strong negative
		if (negative >= 2 || (negative >= 1 && positive === 0)) {
			return {
				outcome: "failed",
				confidence: Math.min(0.9, 0.5 + negative * 0.2),
				signals,
				reasoning: `Detected ${negative} negative signal(s)`,
			};
		}

		// Strong positive
		if (positive >= 2 && negative === 0) {
			const confidence = Math.min(0.9, 0.5 + positive * 0.15);
			// Reduce confidence if there's continuation
			const adjustedConfidence = continuation > 0 ? confidence * 0.8 : confidence;

			return {
				outcome: "worked",
				confidence: adjustedConfidence,
				signals,
				reasoning: `Detected ${positive} positive signal(s)`,
			};
		}

		// Partial signals or mixed
		if (partial > 0 || (positive > 0 && (continuation > 0 || negative > 0))) {
			return {
				outcome: "partial",
				confidence: 0.6,
				signals,
				reasoning: "Mixed or partial signals detected",
			};
		}

		// Single positive with short message
		if (positive === 1 && signals.includes("length:short_affirmation")) {
			return {
				outcome: "worked",
				confidence: 0.7,
				signals,
				reasoning: "Short affirmative response",
			};
		}

		// Weak positive
		if (positive === 1) {
			return {
				outcome: "worked",
				confidence: 0.55,
				signals,
				reasoning: "Single positive signal",
			};
		}

		// Default unknown
		return {
			outcome: "unknown",
			confidence: 0.3,
			signals,
			reasoning: "No clear outcome signals",
		};
	}

	/**
	 * Detect if conversation ended positively (for auto-scoring)
	 */
	detectConversationEnd(messages: ConversationMessage[]): boolean {
		if (messages.length < 2) return false;

		const lastMsg = messages[messages.length - 1];
		if (lastMsg.role !== "user") return false;

		const content = lastMsg.content.toLowerCase();

		// Check for conversation-ending patterns
		const endPatterns = [
			"bye",
			"goodbye",
			"thanks, bye",
			"that's all",
			"nothing else",
			"i'm done",
			"להתראות",
			"תודה, זהו",
			"סיימתי",
			"זה הכל",
		];

		return endPatterns.some((p) => content.includes(p));
	}
}

/**
 * Factory function
 */
export function createOutcomeDetector(): OutcomeDetector {
	return new OutcomeDetector();
}
