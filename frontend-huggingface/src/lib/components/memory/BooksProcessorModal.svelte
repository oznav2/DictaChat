<script lang="ts">
	import { onDestroy } from "svelte";
	import { browser } from "$app/environment";
	import { base } from "$app/paths";
	import { memoryUi } from "$lib/stores/memoryUi";
	import { dispatchMemoryEvent } from "$lib/stores/memoryEvents";

	interface ProcessingFile {
		id: string;
		file: File;
		status: "pending" | "uploading" | "processing" | "completed" | "error";
		progress: number;
		message?: string;
		error?: string;
		taskId?: string;
		bookId?: string;
		totalChunks?: number;
		processingStage?: string;
		doclingStatus?: string;
		customTitle: string;
		customAuthor: string;
	}

	interface ExistingBook {
		book_id: string;
		title: string;
		author?: string;
		upload_timestamp?: string;
		processing_stats?: {
			total_chunks?: number;
			chunks_processed?: number;
		};
		status?: string;
	}

	let isOpen = $derived($memoryUi.modals.booksProcessorOpen);
	let files = $state<ProcessingFile[]>([]);
	let isDragging = $state(false);
	let isProcessing = $state(false);
	let existingBooks = $state<ExistingBook[]>([]);
	let showExisting = $state(false);
	let loadingBooks = $state(false);
	let deleteConfirm = $state<{ bookId: string; bookTitle: string } | null>(null);
	let deleteError = $state<string | null>(null);
	let isDeleting = $state(false);
	let fileInputEl: HTMLInputElement | undefined = $state();
	const progressStreams = new Map<string, EventSource>();
	const watchdogTimers = new Map<string, ReturnType<typeof setTimeout>>();

	const MAX_FILE_SIZE = 10 * 1024 * 1024;
	const ALLOWED_EXTENSIONS = [
		".txt",
		".md",
		".pdf",
		".docx",
		".xlsx",
		".xls",
		".csv",
		".tsv",
		".html",
		".htm",
		".rtf",
	];

	function handleClose() {
		memoryUi.closeBooksProcessor();
	}

	onDestroy(() => {
		for (const es of progressStreams.values()) {
			es.close();
		}
		progressStreams.clear();
		for (const t of watchdogTimers.values()) {
			clearTimeout(t);
		}
		watchdogTimers.clear();
	});

	async function loadExistingBooks() {
		loadingBooks = true;
		try {
			const response = await fetch(`${base}/api/memory/books`);
			if (response.ok) {
				const data = await response.json();
				existingBooks = data.books || [];
			}
		} catch (err) {
			console.error("Failed to load books:", err);
		} finally {
			loadingBooks = false;
		}
	}

	$effect(() => {
		if (isOpen && showExisting) {
			loadExistingBooks();
		}
	});

	function handleFileSelect(selectedFiles: FileList | null) {
		if (!selectedFiles || selectedFiles.length === 0) return;

		const newFiles: ProcessingFile[] = Array.from(selectedFiles).map((file) => {
			const extension = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();

			if (file.size > MAX_FILE_SIZE) {
				return {
					id: Math.random().toString(36).slice(2, 11),
					file,
					status: "error" as const,
					progress: 0,
					message: "הקובץ גדול מדי",
					error: `הקובץ חורג ממגבלת 10MB (${(file.size / (1024 * 1024)).toFixed(1)}MB)`,
					customTitle: file.name.replace(/\.[^/.]+$/, ""),
					customAuthor: "",
				};
			}

			if (!ALLOWED_EXTENSIONS.includes(extension)) {
				return {
					id: Math.random().toString(36).slice(2, 11),
					file,
					status: "error" as const,
					progress: 0,
					message: "סוג קובץ לא נתמך",
					error: `סוגים נתמכים: ${ALLOWED_EXTENSIONS.join(", ")}`,
					customTitle: file.name.replace(/\.[^/.]+$/, ""),
					customAuthor: "",
				};
			}

			return {
				id: Math.random().toString(36).slice(2, 11),
				file,
				status: "pending" as const,
				progress: 0,
				message: "מוכן להעלאה",
				customTitle: file.name.replace(/\.[^/.]+$/, ""),
				customAuthor: "",
			};
		});

		files = [...files, ...newFiles];
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		e.stopPropagation();
		isDragging = false;
		handleFileSelect(e.dataTransfer?.files ?? null);
	}

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		e.stopPropagation();
		isDragging = true;
	}

	function handleDragLeave(e: DragEvent) {
		e.preventDefault();
		e.stopPropagation();
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		if (
			e.clientX < rect.left ||
			e.clientX >= rect.right ||
			e.clientY < rect.top ||
			e.clientY >= rect.bottom
		) {
			isDragging = false;
		}
	}

	async function processFile(file: ProcessingFile) {
		files = files.map((f) =>
			f.id === file.id
				? { ...f, status: "uploading" as const, message: "מעלה קובץ...", progress: 5 }
				: f
		);

		try {
			const title = file.customTitle?.trim() || file.file.name.replace(/\.[^/.]+$/, "");
			if (!title) {
				files = files.map((f) =>
					f.id === file.id
						? { ...f, status: "error" as const, error: "נדרש כותרת", message: "אנא הזן כותרת" }
						: f
				);
				return;
			}

			const formData = new FormData();
			formData.append("file", file.file);
			formData.append("title", title);
			formData.append("author", file.customAuthor?.trim() || "Unknown");

			const response = await fetch(`${base}/api/memory/books`, {
				method: "POST",
				body: formData,
			});

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({ error: "העלאה נכשלה" }));
				throw new Error(errorData.error || errorData.message || "העלאה נכשלה");
			}

			const data = await response.json();

			if (!data.success && data.processing_status === "duplicate") {
				files = files.map((f) =>
					f.id === file.id
						? {
								...f,
								status: "error" as const,
								error: data.message || "הספר כבר קיים בספריה",
								message: "נמצא כפילות",
								progress: 0,
							}
						: f
				);
				return;
			}

			if (data.task_id) {
				files = files.map((f) =>
					f.id === file.id
						? {
								...f,
								status: "processing" as const,
								taskId: data.task_id,
								bookId: data.book_id,
								message: "מעבד ספר...",
								progress: 10,
							}
						: f
				);

				startProgressStream(file.id, data.task_id, data.book_id);
			}
		} catch (err) {
			console.error("Error processing file:", err);
			files = files.map((f) =>
				f.id === file.id
					? {
							...f,
							status: "error" as const,
							progress: 0,
							error: err instanceof Error ? err.message : "שגיאה לא ידועה",
							message: "העלאה נכשלה",
						}
					: f
			);
		}
	}

	function startProgressStream(fileId: string, taskId: string, bookId: string) {
		if (!browser) {
			pollProgress(fileId, taskId, bookId);
			return;
		}

		const existing = progressStreams.get(fileId);
		if (existing) existing.close();

		const url = `${base}/api/book-upload/ws/progress/${taskId}`;
		const es = new EventSource(url);
		progressStreams.set(fileId, es);

		const resetWatchdog = () => {
			const existingTimer = watchdogTimers.get(fileId);
			if (existingTimer) clearTimeout(existingTimer);
			const timer = setTimeout(
				() => {
					es.close();
					progressStreams.delete(fileId);
					watchdogTimers.delete(fileId);
					files = files.map((f) =>
						f.id === fileId
							? {
									...f,
									status: "error" as const,
									error: "Processing timeout (5 minutes)",
									message: "העיבוד נכשל (Timeout)",
								}
							: f
					);
				},
				5 * 60 * 1000
			);
			watchdogTimers.set(fileId, timer);
		};

		let receivedAny = false;
		const fallbackTimer = setTimeout(() => {
			if (receivedAny) return;
			es.close();
			progressStreams.delete(fileId);
			const wd = watchdogTimers.get(fileId);
			if (wd) clearTimeout(wd);
			watchdogTimers.delete(fileId);
			pollProgress(fileId, taskId, bookId);
		}, 4000);

		const applyProgress = (payload: Record<string, unknown>) => {
			receivedAny = true;
			resetWatchdog();
			const status = typeof payload.status === "string" ? payload.status : undefined;
			const stage =
				typeof payload.processingStage === "string" ? payload.processingStage : undefined;
			const stageMessage =
				typeof payload.processingMessage === "string" ? payload.processingMessage : undefined;
			const doclingStatus =
				typeof payload.doclingStatus === "string" ? payload.doclingStatus : undefined;
			const stats =
				payload.processing_stats && typeof payload.processing_stats === "object"
					? (payload.processing_stats as { total_chunks?: number; chunks_processed?: number })
					: undefined;
			const total = stats?.total_chunks ?? 0;
			const done = stats?.chunks_processed ?? 0;

			if (status === "completed") {
				clearTimeout(fallbackTimer);
				es.close();
				progressStreams.delete(fileId);
				const wd = watchdogTimers.get(fileId);
				if (wd) clearTimeout(wd);
				watchdogTimers.delete(fileId);

				files = files.map((f) =>
					f.id === fileId
						? {
								...f,
								status: "completed" as const,
								progress: 100,
								totalChunks: total || f.totalChunks,
								message: "העיבוד הושלם! הידע נוסף לגרף הידע",
							}
						: f
				);

				dispatchMemoryEvent({
					type: "book_ingested",
					detail: { bookId },
				});
				dispatchMemoryEvent({
					type: "kg_updated",
					detail: { source: "book_ingested", bookId },
				});

				setTimeout(() => {
					files = files.filter((f) => f.id !== fileId);
					showExisting = true;
					loadExistingBooks();
				}, 2000);
				return;
			}

			if (status === "failed") {
				clearTimeout(fallbackTimer);
				es.close();
				progressStreams.delete(fileId);
				const wd = watchdogTimers.get(fileId);
				if (wd) clearTimeout(wd);
				watchdogTimers.delete(fileId);

				files = files.map((f) =>
					f.id === fileId
						? {
								...f,
								status: "error" as const,
								error: typeof payload.error === "string" ? payload.error : "העיבוד נכשל",
								message: "העיבוד נכשל",
							}
						: f
				);
				return;
			}

			let progress = 10;
			if (stage === "reading") progress = 12;
			if (stage === "docling") progress = 15;
			if (stage === "chunking") progress = 25;
			if (stage === "ingesting" && total > 0) {
				progress = Math.min(99, Math.round((done / total) * 70) + 25);
			}

			let message = stageMessage || "מעבד...";
			if (stage === "reading") {
				message = "קורא קובץ...";
			} else if (stage === "chunking") {
				message = "מחלק למקטעים...";
			}
			if (stage === "docling" && doclingStatus) {
				message = `Docling: ${doclingStatus}`;
			} else if (stage === "ingesting" && total > 0) {
				message = `מעבד... ${done}/${total}`;
			}

			files = files.map((f) =>
				f.id === fileId
					? {
							...f,
							progress,
							message,
							processingStage: stage,
							doclingStatus,
							totalChunks: total || f.totalChunks,
						}
					: f
			);
		};

		es.addEventListener("progress", (evt) => {
			clearTimeout(fallbackTimer);
			try {
				const payload = JSON.parse((evt as MessageEvent).data);
				const data = payload as { type?: unknown };
				console.debug({ event: data.type ?? "progress" }, "[sse] Memory event received");
				applyProgress(payload);
			} catch {
				es.close();
				progressStreams.delete(fileId);
				const wd = watchdogTimers.get(fileId);
				if (wd) clearTimeout(wd);
				watchdogTimers.delete(fileId);
				pollProgress(fileId, taskId, bookId);
			}
		});

		es.addEventListener("error", () => {
			clearTimeout(fallbackTimer);
			es.close();
			progressStreams.delete(fileId);
			const wd = watchdogTimers.get(fileId);
			if (wd) clearTimeout(wd);
			watchdogTimers.delete(fileId);
			pollProgress(fileId, taskId, bookId);
		});

		resetWatchdog();
	}

	async function pollProgress(fileId: string, taskId: string, bookId: string) {
		const maxAttempts = 300; // 5 minutes max
		let attempts = 0;

		const poll = async () => {
			if (attempts >= maxAttempts) {
				files = files.map((f) =>
					f.id === fileId
						? { ...f, status: "error" as const, error: "Timeout - העיבוד לקח יותר מדי זמן" }
						: f
				);
				return;
			}

			try {
				const response = await fetch(`${base}/api/memory/books/${bookId}`);
				if (response.ok) {
					const data = await response.json();
					const book = data.book;

					if (book.status === "completed") {
						files = files.map((f) =>
							f.id === fileId
								? {
										...f,
										status: "completed" as const,
										progress: 100,
										message: "העיבוד הושלם!",
										totalChunks: book.processing_stats?.total_chunks,
									}
								: f
						);

						// Auto-clear and switch to library
						setTimeout(() => {
							files = files.filter((f) => f.id !== fileId);
							showExisting = true;
							loadExistingBooks();
						}, 2000);

						dispatchMemoryEvent({
							type: "book_ingested",
							detail: { bookId },
						});
						dispatchMemoryEvent({
							type: "kg_updated",
							detail: { source: "book_ingested", bookId },
						});
						return;
					} else if (book.status === "failed") {
						files = files.map((f) =>
							f.id === fileId
								? { ...f, status: "error" as const, error: book.error || "העיבוד נכשל" }
								: f
						);
						return;
					} else {
						// Still processing
						const progress = book.processing_stats?.total_chunks
							? Math.round(
									(book.processing_stats.chunks_processed / book.processing_stats.total_chunks) * 90
								) + 10
							: 10;
						const stage = book.processingStage as string | undefined;
						const doclingStatus = book.doclingStatus as string | undefined;
						let message = `מעבד... ${book.processing_stats?.chunks_processed || 0}/${book.processing_stats?.total_chunks || "?"}`;
						if (stage === "docling" && doclingStatus) {
							message = `Docling: ${doclingStatus}`;
						} else if (typeof book.processingMessage === "string" && book.processingMessage) {
							message = book.processingMessage;
						}
						files = files.map((f) =>
							f.id === fileId
								? {
										...f,
										progress,
										message,
										processingStage: stage,
										doclingStatus,
										totalChunks: book.processing_stats?.total_chunks,
									}
								: f
						);
					}
				}
			} catch (err) {
				console.error("Poll error:", err);
			}

			attempts++;
			setTimeout(poll, 1000);
		};

		poll();
	}

	async function startProcessing() {
		isProcessing = true;
		const pendingFiles = files.filter((f) => f.status === "pending");

		for (const file of pendingFiles) {
			await processFile(file);
			await new Promise((resolve) => setTimeout(resolve, 500));
		}

		isProcessing = false;
	}

	function removeFile(fileId: string) {
		files = files.filter((f) => f.id !== fileId);
	}

	async function deleteBook() {
		if (!deleteConfirm || isDeleting) return;

		const bookId = deleteConfirm.bookId;
		isDeleting = true;
		deleteError = null;

		try {
			const response = await fetch(`${base}/api/memory/books/${bookId}`, {
				method: "DELETE",
			});

			if (response.ok) {
				existingBooks = existingBooks.filter((b) => b.book_id !== bookId);
				deleteConfirm = null;
				dispatchMemoryEvent({ type: "book_deleted", detail: { bookId } });
				dispatchMemoryEvent({ type: "kg_updated", detail: { source: "book_deleted", bookId } });
			} else {
				const errorData = await response.json().catch(() => ({ error: "מחיקה נכשלה" }));
				deleteError = errorData.error || "מחיקה נכשלה";
			}
		} catch (err) {
			deleteError = err instanceof Error ? err.message : "שגיאת רשת";
		} finally {
			isDeleting = false;
		}
	}

	function formatFileSize(bytes: number): string {
		if (bytes < 1024) return bytes + " B";
		if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
		return (bytes / (1024 * 1024)).toFixed(1) + " MB";
	}

	function getStatusIcon(status: ProcessingFile["status"]): string {
		switch (status) {
			case "pending":
				return "📄";
			case "uploading":
			case "processing":
				return "⏳";
			case "completed":
				return "✅";
			case "error":
				return "❌";
		}
	}
</script>

{#if isOpen}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" dir="rtl">
		<div
			class="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-gray-700 bg-gray-900 shadow-2xl"
		>
			<!-- Header -->
			<div class="flex items-center justify-between border-b border-gray-700 p-6">
				<div class="flex items-center gap-3">
					<svg class="size-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
						/>
					</svg>
					<div>
						<h2 class="text-xl font-semibold text-gray-100">מעבד מסמכים</h2>
						<p class="mt-1 text-xs text-gray-500">עיבוד עם המודל הנוכחי</p>
					</div>
				</div>
				<button
					onclick={handleClose}
					class="rounded-lg p-2 transition-colors hover:bg-gray-800"
					aria-label="סגור"
				>
					<svg class="size-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M6 18L18 6M6 6l12 12"
						/>
					</svg>
				</button>
			</div>

			<!-- Tab Navigation -->
			<div class="border-b border-gray-700 px-6">
				<div class="flex gap-4">
					<button
						onclick={() => (showExisting = false)}
						class={[
							"border-b-2 px-1 py-3 transition-colors",
							!showExisting
								? "border-blue-400 text-gray-100"
								: "border-transparent text-gray-400 hover:text-gray-200",
						]}
					>
						העלאה חדשה
					</button>
					<button
						onclick={() => (showExisting = true)}
						class={[
							"border-b-2 px-1 py-3 transition-colors",
							showExisting
								? "border-blue-400 text-gray-100"
								: "border-transparent text-gray-400 hover:text-gray-200",
						]}
					>
						ניהול ספריה
					</button>
				</div>
			</div>

			<!-- Content -->
			<div class="flex-1 overflow-y-auto p-6">
				{#if !showExisting}
					<!-- Drop Zone -->
					<div
						role="region"
						aria-label="אזור גרירה ושחרור קבצים"
						ondrop={handleDrop}
						ondragover={handleDragOver}
						ondragleave={handleDragLeave}
						class={[
							"rounded-lg border-2 border-dashed p-8 text-center transition-all",
							isDragging
								? "border-blue-400 bg-blue-400/10"
								: "border-gray-600 bg-gray-800/50 hover:border-gray-500",
						]}
					>
						<svg
							class="mx-auto mb-4 size-12 text-gray-500"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
							/>
						</svg>
						<p class="mb-2 text-gray-300">
							גרור ושחרר את המסמכים שלך כאן, או
							<button
								onclick={() => fileInputEl?.click()}
								class="text-blue-400 underline hover:text-blue-300"
							>
								עיין בקבצים
							</button>
						</p>
						<p class="text-sm text-gray-500">
							פורמטים נתמכים: TXT, MD, PDF, DOCX, Excel, HTML, RTF
						</p>
						<input
							bind:this={fileInputEl}
							type="file"
							multiple
							accept={ALLOWED_EXTENSIONS.join(",")}
							onchange={(e) => handleFileSelect((e.target as HTMLInputElement).files)}
							class="hidden"
						/>
					</div>

					<!-- File List -->
					{#if files.length > 0}
						<div class="mt-6 space-y-2">
							<div class="mb-3 flex items-center justify-between">
								<h3 class="text-sm font-medium text-gray-400">קבצים ({files.length})</h3>
								{#if files.some((f) => f.status === "error")}
									<button
										onclick={() => (files = files.filter((f) => f.status !== "error"))}
										class="text-xs text-gray-500 hover:text-gray-300"
									>
										נקה שגיאות
									</button>
								{/if}
							</div>

							{#each files as file (file.id)}
								<div class="rounded-lg border border-gray-700 bg-gray-800 p-4">
									<div class="flex items-start justify-between">
										<div class="flex flex-1 items-start gap-3">
											<span class="text-xl">{getStatusIcon(file.status)}</span>
											<div class="flex-1">
												<div class="flex items-center gap-2">
													<p class="text-sm font-medium text-gray-200">{file.file.name}</p>
													<span class="text-xs text-gray-500">{formatFileSize(file.file.size)}</span
													>
												</div>

												{#if file.status === "pending"}
													<div class="mt-3 space-y-2">
														<div>
															<label class="mb-1 block text-xs text-gray-500">
																כותרת
																<input
																	type="text"
																	bind:value={file.customTitle}
																	placeholder="נחלץ אוטומטית משם הקובץ"
																	class="mt-1 w-full rounded border border-gray-600 bg-gray-700 px-2 py-1.5 text-sm text-gray-200 placeholder-gray-500 transition-colors focus:border-blue-500 focus:outline-none"
																	maxlength={200}
																/>
															</label>
														</div>
														<div>
															<label class="mb-1 block text-xs text-gray-500">
																מחבר (אופציונלי)
																<input
																	type="text"
																	bind:value={file.customAuthor}
																	placeholder="לא ידוע"
																	class="mt-1 w-full rounded border border-gray-600 bg-gray-700 px-2 py-1.5 text-sm text-gray-200 placeholder-gray-500 transition-colors focus:border-blue-500 focus:outline-none"
																	maxlength={100}
																/>
															</label>
														</div>
													</div>
												{/if}

												<p class="mt-1 text-xs text-gray-500">
													{#if file.status === "error" && file.error?.includes("כפילות")}
														<span class="text-yellow-500">⚠️ {file.error}</span>
													{:else}
														{file.error || file.message}
													{/if}
													{#if file.status === "processing" && file.totalChunks}
														<span class="mr-2 text-blue-400"
															>({Math.round(file.progress)}% - {file.totalChunks} חלקים)</span
														>
													{/if}
												</p>

												{#if file.status === "uploading" || file.status === "processing"}
													<div class="mt-2">
														<div class="h-1 overflow-hidden rounded-full bg-gray-700">
															<div
																class="h-full bg-blue-500 transition-all duration-300"
																style="width: {file.progress}%"
															></div>
														</div>
													</div>
												{/if}

												{#if file.status === "completed"}
													<div class="mt-2 flex gap-4">
														<span class="text-xs text-green-400"
															>✓ עובד בהצלחה - עובר לספריה...</span
														>
													</div>
												{/if}
											</div>
										</div>

										{#if file.status === "pending" || file.status === "error"}
											<button
												onclick={() => removeFile(file.id)}
												class="rounded p-1 transition-colors hover:bg-gray-700"
												title="הסר"
												aria-label="הסר קובץ"
											>
												<svg
													class="size-4 text-gray-500 transition-colors hover:text-red-400"
													fill="none"
													stroke="currentColor"
													viewBox="0 0 24 24"
												>
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														stroke-width="2"
														d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
													/>
												</svg>
											</button>
										{/if}
									</div>
								</div>
							{/each}
						</div>
					{/if}
				{:else}
					<!-- Existing Books Library View -->
					<div>
						{#if loadingBooks}
							<div class="flex items-center justify-center py-12">
								<div
									class="size-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent"
								></div>
							</div>
						{:else if existingBooks.length === 0}
							<div class="py-12 text-center">
								<svg
									class="mx-auto mb-4 size-12 text-gray-500"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
									/>
								</svg>
								<p class="text-gray-400">אין ספרים בספריה שלך</p>
								<p class="mt-2 text-sm text-gray-500">העלה מסמכים כדי להתחיל</p>
							</div>
						{:else}
							<div class="space-y-2">
								<h3 class="mb-3 text-sm font-medium text-gray-400">
									ספריה ({existingBooks.length} ספרים)
								</h3>
								{#each existingBooks as book (book.book_id)}
									<div class="rounded-lg border border-gray-700 bg-gray-800 p-4">
										<div class="flex items-start justify-between">
											<div class="flex-1">
												<div class="mb-1 flex items-center gap-2">
													<svg
														class="size-4 text-blue-400"
														fill="none"
														stroke="currentColor"
														viewBox="0 0 24 24"
													>
														<path
															stroke-linecap="round"
															stroke-linejoin="round"
															stroke-width="2"
															d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
														/>
													</svg>
													<p class="text-sm font-medium text-gray-200">{book.title}</p>
												</div>
												{#if book.author}
													<p class="mb-2 text-xs text-gray-500">מאת {book.author}</p>
												{/if}
												<div class="flex gap-4 text-xs text-gray-400">
													{#if book.processing_stats?.total_chunks !== undefined}
														<span>📦 {book.processing_stats.total_chunks} חלקים עובדו</span>
													{/if}
													{#if book.upload_timestamp}
														<span class="text-gray-500"
															>{new Date(book.upload_timestamp).toLocaleDateString("he-IL")}</span
														>
													{/if}
												</div>
											</div>
											<button
												onclick={() =>
													(deleteConfirm = { bookId: book.book_id, bookTitle: book.title })}
												class="rounded p-2 transition-colors hover:bg-gray-700"
												title="מחק מהספריה"
												aria-label="מחק מהספריה"
											>
												<svg
													class="size-4 text-gray-500 transition-colors hover:text-red-400"
													fill="none"
													stroke="currentColor"
													viewBox="0 0 24 24"
												>
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														stroke-width="2"
														d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
													/>
												</svg>
											</button>
										</div>
									</div>
								{/each}
							</div>
						{/if}
					</div>
				{/if}
			</div>

			<!-- Footer -->
			<div class="border-t border-gray-700 p-6">
				<div class="flex items-center justify-between">
					<div class="text-sm text-gray-500">
						{#if !showExisting}
							{files.filter((f) => f.status === "completed").length} מתוך {files.length} עובדו
						{:else}
							{existingBooks.length} ספרים בספריה
						{/if}
					</div>
					<div class="flex gap-3">
						<button
							onclick={handleClose}
							class="px-4 py-2 text-gray-300 transition-colors hover:text-gray-100"
						>
							סגור
						</button>
						{#if !showExisting}
							<button
								onclick={startProcessing}
								disabled={!files.some((f) => f.status === "pending") || isProcessing}
								class={[
									"rounded-lg px-6 py-2 font-medium transition-all",
									files.some((f) => f.status === "pending") && !isProcessing
										? "bg-blue-500 text-white hover:bg-blue-600"
										: "cursor-not-allowed bg-gray-700 text-gray-500",
								]}
							>
								{#if isProcessing}
									<span class="flex items-center gap-2">
										<span
											class="size-4 animate-spin rounded-full border-2 border-white border-t-transparent"
										></span>
										מעבד...
									</span>
								{:else}
									עבד מסמכים
								{/if}
							</button>
						{/if}
					</div>
				</div>
			</div>
		</div>

		<!-- Delete Confirmation Modal -->
		{#if deleteConfirm}
			<div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
				<div class="mx-4 w-full max-w-md rounded-xl border border-gray-700 bg-gray-800 p-6">
					<div class="mb-4 flex items-start gap-3">
						<div class="rounded-lg bg-red-500/10 p-2">
							<svg
								class="size-5 text-red-500"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
								/>
							</svg>
						</div>
						<div class="flex-1">
							<h3 class="mb-2 text-lg font-medium text-gray-100">מחק ספר</h3>
							<p class="text-sm text-gray-400">
								האם אתה בטוח שברצונך למחוק את <span class="font-medium text-gray-200"
									>"{deleteConfirm.bookTitle}"</span
								>?
							</p>
							<p class="mt-2 text-sm text-gray-500">
								פעולה זו תמחק לצמיתות את כל הנתונים המעובדים כולל חלקים והטמעות.
							</p>
						</div>
					</div>
					{#if deleteError}
						<div class="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3">
							<p class="text-sm text-red-400">{deleteError}</p>
						</div>
					{/if}
					<div class="flex justify-end gap-3">
						<button
							onclick={() => {
								deleteConfirm = null;
								deleteError = null;
							}}
							disabled={isDeleting}
							class="px-4 py-2 text-gray-300 transition-colors hover:text-gray-100 disabled:opacity-50"
						>
							ביטול
						</button>
						<button
							onclick={deleteBook}
							disabled={isDeleting}
							class={[
								"flex items-center gap-2 rounded-lg px-4 py-2 transition-colors",
								isDeleting
									? "cursor-not-allowed bg-red-500/50 text-white/70"
									: "bg-red-500 text-white hover:bg-red-600",
							]}
						>
							{#if isDeleting}
								<span
									class="size-4 animate-spin rounded-full border-2 border-white border-t-transparent"
								></span>
								מוחק...
							{:else}
								מחק ספר
							{/if}
						</button>
					</div>
				</div>
			</div>
		{/if}
	</div>
{/if}
