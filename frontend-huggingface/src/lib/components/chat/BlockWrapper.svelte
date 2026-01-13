<script lang="ts">
	import type { Snippet } from "svelte";
	import { browser } from "$app/environment";

	interface Props {
		icon: Snippet;
		iconBg?: string;
		iconRing?: string;
		hasNext?: boolean;
		loading?: boolean;
		children: Snippet;
	}

	let {
		icon,
		iconBg = "bg-gray-50 dark:bg-gray-800",
		iconRing = "ring-gray-100 dark:ring-gray-700",
		hasNext = false,
		loading = false,
		children,
	}: Props = $props();
	
	// Respect user's motion preferences
	const prefersReducedMotion = browser && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
</script>

<div class="block-wrapper group flex gap-2 has-[+.prose]:mb-1.5 [.prose+&]:mt-3">
	<!-- Left column: icon + connector line -->
	<div class="flex w-[22px] flex-shrink-0 flex-col items-center">
		<div
			class="icon-container relative z-0 flex h-[22px] w-[22px] items-center justify-center rounded-md ring-1 transition-all duration-200 {iconBg} {iconRing} {loading ? 'loading-active' : ''}"
		>
			{@render icon()}
			{#if loading}
				<svg
					class="loading-ring pointer-events-none absolute inset-0 h-[22px] w-[22px]"
					viewBox="0 0 22 22"
					fill="none"
					xmlns="http://www.w3.org/2000/svg"
				>
					<rect
						x="0.5"
						y="0.5"
						width="21"
						height="21"
						rx="5.5"
						class="loading-path stroke-current text-purple-500/40"
						stroke-width="1"
						fill="none"
					/>
				</svg>
				<!-- Inner glow effect -->
				<div class="loading-glow absolute inset-0 rounded-md"></div>
			{/if}
		</div>
		{#if hasNext}
			<div class="connector-line my-1 w-px flex-1 bg-gray-200 transition-colors duration-200 dark:bg-gray-700"></div>
		{/if}
	</div>

	<!-- Right column: content -->
	<div class="block-content min-w-0 flex-1 pb-2 pt-px">
		{@render children()}
	</div>
</div>

<style>
	/* Block entrance animation */
	.block-wrapper {
		animation: blockEnter 0.3s cubic-bezier(0.16, 1, 0.3, 1);
	}

	@keyframes blockEnter {
		from {
			opacity: 0;
			transform: translateY(-4px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	/* Loading ring animation */
	@keyframes loadingRing {
		to {
			stroke-dashoffset: -100;
		}
	}

	.loading-path {
		stroke-dasharray: 60 40;
		animation: loadingRing 2s cubic-bezier(0.4, 0, 0.2, 1) infinite;
	}

	/* Icon container glow when loading */
	.loading-active {
		box-shadow: 0 0 0 2px rgba(168, 85, 247, 0.1);
	}

	/* Inner glow pulse */
	.loading-glow {
		background: radial-gradient(circle, rgba(168, 85, 247, 0.15) 0%, transparent 70%);
		animation: glowPulse 1.5s ease-in-out infinite;
	}

	@keyframes glowPulse {
		0%, 100% {
			opacity: 0.3;
			transform: scale(0.8);
		}
		50% {
			opacity: 0.7;
			transform: scale(1.1);
		}
	}

	/* Connector line animation */
	.connector-line {
		animation: lineGrow 0.3s ease-out 0.1s both;
	}

	@keyframes lineGrow {
		from {
			opacity: 0;
			transform: scaleY(0);
			transform-origin: top;
		}
		to {
			opacity: 1;
			transform: scaleY(1);
		}
	}

	/* Icon hover effect */
	.icon-container {
		transition: transform 0.2s ease, box-shadow 0.2s ease;
	}

	.block-wrapper:hover .icon-container:not(.loading-active) {
		transform: scale(1.05);
	}

	/* Reduced motion support */
	@media (prefers-reduced-motion: reduce) {
		.block-wrapper,
		.loading-path,
		.loading-glow,
		.connector-line,
		.icon-container {
			animation: none !important;
			transition-duration: 0.01ms !important;
		}
	}
</style>
