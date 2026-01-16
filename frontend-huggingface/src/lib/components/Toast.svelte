<script lang="ts">
	import { fly, fade } from "svelte/transition";
	import { backOut, cubicOut } from "svelte/easing";
	import { browser } from "$app/environment";
	import Portal from "./Portal.svelte";
	import IconDazzled from "$lib/components/icons/IconDazzled.svelte";

	interface Props {
		message?: string;
		type?: "info" | "success" | "warning" | "error";
	}

	let { message = "", type = "info" }: Props = $props();

	// Respect user's motion preferences
	const prefersReducedMotion =
		browser && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

	// Type-based styling
	const typeStyles = {
		info: {
			gradient: "from-blue-500/20 via-blue-500/0 to-blue-500/0",
			bg: "bg-white/90 dark:bg-gray-900/90",
			border: "border border-blue-200/50 dark:border-blue-800/30",
			text: "text-gray-800 dark:text-gray-200",
		},
		success: {
			gradient: "from-green-500/20 via-green-500/0 to-green-500/0",
			bg: "bg-green-50/90 dark:bg-green-900/30",
			border: "border border-green-200/50 dark:border-green-800/30",
			text: "text-green-800 dark:text-green-200",
		},
		warning: {
			gradient: "from-amber-500/20 via-amber-500/0 to-amber-500/0",
			bg: "bg-amber-50/90 dark:bg-amber-900/30",
			border: "border border-amber-200/50 dark:border-amber-800/30",
			text: "text-amber-800 dark:text-amber-200",
		},
		error: {
			gradient: "from-red-500/20 via-red-500/0 to-red-500/0",
			bg: "bg-red-50/90 dark:bg-red-900/30",
			border: "border border-red-200/50 dark:border-red-800/30",
			text: "text-red-800 dark:text-red-200",
		},
	};

	let style = $derived(typeStyles[type]);
</script>

<Portal>
	<div
		in:fly={{
			y: prefersReducedMotion ? 0 : -20,
			duration: prefersReducedMotion ? 0 : 400,
			easing: backOut,
		}}
		out:fade={{ duration: prefersReducedMotion ? 0 : 200, easing: cubicOut }}
		class="pointer-events-none fixed right-0 top-12 z-50 bg-gradient-to-bl {style.gradient} pb-36 pl-36 pr-2 pt-2 max-sm:text-sm md:top-0 md:pr-8 md:pt-5"
	>
		<div
			class="toast-content pointer-events-auto flex items-center rounded-full px-4 py-2 shadow-lg backdrop-blur-sm {style.bg} {style.border}"
		>
			<div class="toast-icon mr-3 flex-none">
				<IconDazzled classNames="text-2xl" />
			</div>
			<h2 class="toast-message line-clamp-2 max-w-2xl font-semibold {style.text}">
				{message}
			</h2>
		</div>
	</div>
</Portal>

<style>
	/* Toast entrance animation */
	.toast-content {
		animation: toastSlideIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
	}

	@keyframes toastSlideIn {
		from {
			opacity: 0;
			transform: translateX(20px) scale(0.95);
		}
		to {
			opacity: 1;
			transform: translateX(0) scale(1);
		}
	}

	/* Icon gentle bounce */
	.toast-icon {
		animation: iconBounce 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 0.1s both;
	}

	@keyframes iconBounce {
		0% {
			transform: scale(0.5);
			opacity: 0;
		}
		70% {
			transform: scale(1.15);
		}
		100% {
			transform: scale(1);
			opacity: 1;
		}
	}

	/* Message text fade in */
	.toast-message {
		animation: messageReveal 0.3s ease-out 0.15s both;
	}

	@keyframes messageReveal {
		from {
			opacity: 0;
			transform: translateX(8px);
		}
		to {
			opacity: 1;
			transform: translateX(0);
		}
	}

	/* RTL support - animations from opposite direction */
	:global([dir="rtl"]) .toast-content {
		animation-name: toastSlideInRTL;
	}

	@keyframes toastSlideInRTL {
		from {
			opacity: 0;
			transform: translateX(-20px) scale(0.95);
		}
		to {
			opacity: 1;
			transform: translateX(0) scale(1);
		}
	}

	:global([dir="rtl"]) .toast-message {
		animation-name: messageRevealRTL;
	}

	@keyframes messageRevealRTL {
		from {
			opacity: 0;
			transform: translateX(-8px);
		}
		to {
			opacity: 1;
			transform: translateX(0);
		}
	}

	/* Reduced motion support */
	@media (prefers-reduced-motion: reduce) {
		.toast-content,
		.toast-icon,
		.toast-message {
			animation: none !important;
		}
	}
</style>
