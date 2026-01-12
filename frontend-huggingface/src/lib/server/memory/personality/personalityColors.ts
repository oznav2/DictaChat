/**
 * Personality Colors - Default color assignments for personality badges
 *
 * Provides consistent color coding for personality badges in the UI.
 */

export const PERSONALITY_COLORS: Record<string, string> = {
	default: "bg-gray-500",
	friendly: "bg-blue-500",
	technical: "bg-green-500",
	creative: "bg-purple-500",
	teacher: "bg-orange-500",
	researcher: "bg-cyan-500",
	professional: "bg-indigo-500",
	casual: "bg-pink-500",
};

/**
 * Color rotation for user-defined personalities
 */
const COLOR_ROTATION = [
	"bg-blue-500",
	"bg-green-500",
	"bg-purple-500",
	"bg-orange-500",
	"bg-cyan-500",
	"bg-indigo-500",
	"bg-pink-500",
	"bg-red-500",
	"bg-yellow-500",
	"bg-teal-500",
];

/**
 * Get the next available color for a new personality
 */
export function getNextPersonalityColor(existingColors: string[]): string {
	const available = COLOR_ROTATION.find((c) => !existingColors.includes(c));
	return available || "bg-gray-500";
}

/**
 * Get color for a personality by name or ID
 */
export function getPersonalityColor(personalityName: string): string {
	const normalized = personalityName.toLowerCase();
	return PERSONALITY_COLORS[normalized] || "bg-gray-500";
}

/**
 * Get text color class that contrasts with background
 */
export function getContrastTextColor(_bgColor: string): string {
	// All our colors are dark enough to use white text
	return "text-white";
}
