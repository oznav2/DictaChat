<script lang="ts">
	/**
	 * ChatTitle - Displays conversation title with optional personality badge
	 *
	 * Shows the conversation title and a colored badge indicating
	 * which personality was used for the conversation.
	 */

	interface PersonalityBadge {
		name: string;
		color: string;
	}

	interface Props {
		title: string;
		personalityBadge?: PersonalityBadge;
		truncate?: boolean;
	}

	let { title, personalityBadge, truncate = true }: Props = $props();
</script>

<div class="flex min-w-0 items-center gap-2">
	<span class={truncate ? "truncate" : ""}>{title}</span>
	{#if personalityBadge}
		<span
			class="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium text-white {personalityBadge.color}"
		>
			{personalityBadge.name}
		</span>
	{/if}
</div>
