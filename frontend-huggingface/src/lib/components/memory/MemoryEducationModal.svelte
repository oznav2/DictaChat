<!-- Added: memory education onboarding modal (RoamPal parity P2). -->
<script lang="ts">
	import Modal from "$lib/components/Modal.svelte";
	import { memoryUi } from "$lib/stores/memoryUi";

	type Section = {
		title: string;
		body: string[];
	};

	const sections: Section[] = [
		{
			title: "מה זה “זיכרון” כאן?",
			body: [
				"הזיכרון הוא שכבת הקשר שעוזרת לעוזר להישאר עקבי לאורך זמן.",
				"זה לא “זיכרון מוחלט” של הכל — זה סט של מקורות מידע שמדורגים לפי רלוונטיות ואיכות.",
			],
		},
		{
			title: "סוגי זיכרון עיקריים",
			body: [
				"זיכרון עבודה: מהשיחה הנוכחית (קצר טווח).",
				"היסטוריה: תיעוד שיחות קודמות (טווח בינוני).",
				"דפוסים: מה שהמערכת לומדת לאורך זמן (מה עובד/לא עובד).",
				"ספרים: תוכן ממסמכים שהעלית דרך Docling.",
				"בנק זיכרון: דברים שאתה “נועל” ידנית כדי שישארו זמינים.",
			],
		},
		{
			title: "איך מתבצע חיפוש בזיכרון",
			body: [
				"המערכת מבצעת חיפוש היברידי (סמנטי + מילות מפתח) וממזגת תוצאות.",
				"לא כל שאילתה תחזיר הקשר — אם הביטחון נמוך, נראה פחות תוצאות כדי לא להטעות.",
			],
		},
		{
			title: "ציון איכות (Wilson Score)",
			body: [
				"כל פריט מקבל ציון שמייצג אמינות/יעילות מצטברת.",
				"הפסים הצבעוניים עוזרים לסרוק מהר: ירוק טוב, כתום בינוני, אדום חלש.",
			],
		},
		{
			title: "ציטוטים (Citations) ומה הם אומרים",
			body: [
				"כאשר העוזר משתמש בזיכרון, יוצגו ציטוטים שמצביעים על המקורות.",
				"אם משהו נראה לא נכון — ציון/פידבק עוזר למערכת להשתפר.",
			],
		},
		{
			title: "איך לתת פידבק שעוזר",
			body: [
				"אם תשובה עזרה: דרג אותה כחיובית כדי לחזק את הזיכרונות ששימשו.",
				"אם תשובה לא עזרה: דרג כשלילית כדי להחליש זיכרונות לא-מדויקים.",
				"פידבק עובד הכי טוב כשאתה עקבי לאורך זמן.",
			],
		},
		{
			title: "בנק זיכרון: מה להצמיד ידנית",
			body: [
				"הצמד דברים יציבים: עובדות על הפרויקט שלך, העדפות, פורמטים רצויים.",
				"הימנע מפרטים זמניים: סטטוסים רגעיים, מספרים שמתעדכנים תדיר.",
			],
		},
		{
			title: "טיפ אחרון",
			body: [
				"כדי לקבל תשובות עקביות: כתוב מה חשוב לך (מטרה, סגנון, מגבלות).",
				"אם תרצה — אפשר לעדכן את האישיות/סגנון בתפריט ההתאמות.",
			],
		},
	];

	let stepIndex = $state(0);

	function close(markSeen = true) {
		memoryUi.closeMemoryEducation({ markSeen });
	}

	function next() {
		if (stepIndex >= sections.length - 1) {
			close(true);
			return;
		}
		stepIndex += 1;
	}

	function prev() {
		stepIndex = Math.max(0, stepIndex - 1);
	}
</script>

<Modal width="max-w-3xl" closeButton={true} dir="rtl" onclose={() => close(true)}>
	<div class="p-6" dir="rtl">
		<div class="mb-4 flex items-start justify-between gap-4">
			<div>
				<h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100">
					היכרות עם מערכת הזיכרון
				</h2>
				<p class="mt-1 text-sm text-gray-600 dark:text-gray-300">
					{stepIndex + 1} מתוך {sections.length}
				</p>
			</div>
			<button
				type="button"
				onclick={() => close(true)}
				class="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
			>
				סגור
			</button>
		</div>

		<div
			class="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/60"
		>
			<h3 class="text-base font-semibold text-gray-900 dark:text-gray-100">
				{sections[stepIndex].title}
			</h3>
			<div class="mt-3 space-y-2">
				{#each sections[stepIndex].body as line}
					<p class="text-sm leading-6 text-gray-700 dark:text-gray-200">{line}</p>
				{/each}
			</div>
		</div>

		<div class="mt-5 flex items-center justify-between gap-3">
			<button
				type="button"
				onclick={prev}
				disabled={stepIndex === 0}
				class="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
			>
				הקודם
			</button>

			<div class="flex items-center gap-1.5">
				{#each sections as _, i}
					<div
						class={[
							"size-2 rounded-full transition-colors",
							i === stepIndex ? "bg-blue-600" : "bg-gray-300 dark:bg-gray-600",
						]}
					></div>
				{/each}
			</div>

			<button
				type="button"
				onclick={next}
				class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
			>
				{stepIndex >= sections.length - 1 ? "סיום" : "הבא"}
			</button>
		</div>
	</div>
</Modal>
