<script lang="ts">
	/**
	 * PersonalitySelector - UI component for selecting active personality
	 *
	 * Displays available personalities as colored badges and allows selection.
	 */

	interface Personality {
		id: string;
		name: string;
		color: string;
		isActive: boolean;
	}

	interface Props {
		personalities: Personality[];
		onselect?: (id: string) => void;
	}

	let { personalities = [], onselect }: Props = $props();

	function selectPersonality(id: string) {
		onselect?.(id);
	}
</script>

<div class="flex flex-wrap gap-2" dir="rtl">
	{#each personalities as p (p.id)}
		<button
			type="button"
			class="rounded-full px-3 py-1.5 text-sm font-medium transition-all
				{p.isActive
				? 'ring-2 ring-white ring-offset-2 ring-offset-gray-900'
				: 'opacity-70 hover:opacity-100'}
				{p.color} text-white"
			onclick={() => selectPersonality(p.id)}
		>
			{p.name}
		</button>
	{/each}
</div>
