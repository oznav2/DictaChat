<!--
  Documents Settings Page

  Provides a unified view of all ingested documents (books, web articles, API imports)
  Uses the DocumentLibrary component for filtering and browsing
-->
<script lang="ts">
	import DocumentLibrary from "$lib/components/documents/DocumentLibrary.svelte";
</script>

<svelte:head>
	<title>Documents - Settings</title>
</svelte:head>

<div class="flex h-full flex-col overflow-hidden">
	<div class="flex-none px-4 pt-4">
		<h1 class="text-2xl font-bold text-gray-800 dark:text-gray-100">ספריית מסמכים</h1>
		<p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
			עיין ונהל את כל המסמכים שנקלטו למערכת הזיכרון
		</p>
	</div>

	<div class="flex-1 overflow-auto p-4">
		<DocumentLibrary />
	</div>
</div>
