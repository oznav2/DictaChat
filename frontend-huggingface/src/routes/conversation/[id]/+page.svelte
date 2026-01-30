<script lang="ts">
	import ChatWindow from "$lib/components/chat/ChatWindow.svelte";
	import { pendingMessage } from "$lib/stores/pendingMessage";
	import { isAborted } from "$lib/stores/isAborted";
	import { onMount } from "svelte";
	import { page } from "$app/state";
	import { beforeNavigate, invalidateAll } from "$app/navigation";
	import { base } from "$app/paths";
	import { ERROR_MESSAGES, error } from "$lib/stores/errors";
	import { findCurrentModel } from "$lib/utils/models";
	import type { Message } from "$lib/types/Message";
	import {
		MessageUpdateStatus,
		MessageUpdateType,
		MessageMemoryUpdateType,
		MessageReasoningUpdateType,
	} from "$lib/types/MessageUpdate";
	import { memoryUi } from "$lib/stores/memoryUi";
	import titleUpdate from "$lib/stores/titleUpdate";
	import file2base64 from "$lib/utils/file2base64";
	import { addChildren } from "$lib/utils/tree/addChildren";
	import { addSibling } from "$lib/utils/tree/addSibling";
	import { fetchMessageUpdates } from "$lib/utils/messageUpdates";
	import type { v4 } from "uuid";
	import { useSettingsStore } from "$lib/stores/settings.js";
	import { derived as deriveStore, get } from "svelte/store";
	import { enabledServers } from "$lib/stores/mcpServers";
	import { browser } from "$app/environment";
	import {
		addBackgroundGeneration,
		removeBackgroundGeneration,
	} from "$lib/stores/backgroundGenerations";
	import type { TreeNode, TreeId } from "$lib/utils/tree/tree";
	import "katex/dist/katex.min.css";
	import { updateDebouncer } from "$lib/utils/updates.js";
	import SubscribeModal from "$lib/components/SubscribeModal.svelte";
	import { loading } from "$lib/stores/loading.js";
	import { requireAuthUser } from "$lib/utils/auth.js";
	import { dispatchMemoryEvent } from "$lib/stores/memoryEvents";

	let { data = $bindable() } = $props();

	let pending = $state(false);
	let initialRun = true;
	let showSubscribeModal = $state(false);

	let files: File[] = $state([]);
	let resetProcessingTimeout: ReturnType<typeof setTimeout> | null = null;

	function scheduleResetProcessing(delayMs: number) {
		if (resetProcessingTimeout) {
			clearTimeout(resetProcessingTimeout);
		}
		resetProcessingTimeout = setTimeout(() => {
			resetProcessingTimeout = null;
			memoryUi.resetProcessing();
		}, delayMs);
	}

	function resetProcessingNow() {
		if (resetProcessingTimeout) {
			clearTimeout(resetProcessingTimeout);
			resetProcessingTimeout = null;
		}
		memoryUi.resetProcessing();
	}

	let conversations = $state(data.conversations);
	$effect(() => {
		conversations = data.conversations;
	});

	const settings = useSettingsStore();
	const disableStreamSetting = deriveStore(settings, (s) => s.disableStream);

	function createMessagesPath<T>(messages: TreeNode<T>[], msgId?: TreeId): TreeNode<T>[] {
		if (initialRun) {
			if (!msgId && page.url.searchParams.get("leafId")) {
				msgId = page.url.searchParams.get("leafId") as string;
				page.url.searchParams.delete("leafId");
			}
			if (!msgId && browser && localStorage.getItem("leafId")) {
				msgId = localStorage.getItem("leafId") as string;
			}
			initialRun = false;
		}

		const msg = messages.find((msg) => msg.id === msgId) ?? messages.at(-1);
		if (!msg) return [];
		// ancestor path
		const { ancestors } = msg;
		const path = [];
		if (ancestors?.length) {
			for (const ancestorId of ancestors) {
				const ancestor = messages.find((msg) => msg.id === ancestorId);
				if (ancestor) {
					path.push(ancestor);
				}
			}
		}

		// push the node itself in the middle
		path.push(msg);

		// children path
		let childrenIds = msg.children;
		while (childrenIds?.length) {
			let lastChildId = childrenIds.at(-1);
			const lastChild = messages.find((msg) => msg.id === lastChildId);
			if (lastChild) {
				path.push(lastChild);
			}
			childrenIds = lastChild?.children;
		}

		return path;
	}

	function createMessagesAlternatives<T>(messages: TreeNode<T>[]): TreeId[][] {
		const alternatives = [];
		for (const message of messages) {
			if (message.children?.length) {
				alternatives.push(message.children);
			}
		}
		return alternatives;
	}

	// this function is used to send new message to the backends
	async function writeMessage({
		prompt,
		messageId = messagesPath.at(-1)?.id ?? undefined,
		isRetry = false,
	}: {
		prompt?: string;
		messageId?: ReturnType<typeof v4>;
		isRetry?: boolean;
	}): Promise<void> {
		let messageToWriteToId: Message["id"] | undefined = undefined;
		let clientUserMessageId: Message["id"] | undefined = undefined;
		let clientAssistantMessageId: Message["id"] | undefined = undefined;
		try {
			$isAborted = false;
			$loading = true;
			pending = true;
			const base64Files = await Promise.all(
				(files ?? []).map((file) =>
					file2base64(file).then((value) => ({
						type: "base64" as const,
						value,
						mime: file.type,
						name: file.name,
					}))
				)
			);

			if (isRetry && messageId) {
				// two cases, if we're retrying a user message with a newPrompt set,
				// it means we're editing a user message
				// if we're retrying on an assistant message, newPrompt cannot be set
				// it means we're retrying the last assistant message for a new answer

				const messageToRetry = messages.find((message) => message.id === messageId);

				if (!messageToRetry) {
					$error = "Message not found";
				}

				if (messageToRetry?.from === "user" && (prompt || isRetry)) {
					// add a sibling to this message from the user, with the alternative prompt
					// add a children to that sibling, where we can write to
					const newUserMessageId = addSibling(
						{
							messages,
							rootMessageId: data.rootMessageId,
						},
						{
							from: "user",
							content: prompt ?? messageToRetry.content,
							files: messageToRetry.files,
						},
						messageId
					);
					clientUserMessageId = newUserMessageId;
					messageToWriteToId = addChildren(
						{
							messages,
							rootMessageId: data.rootMessageId,
						},
						{ from: "assistant", content: "" },
						newUserMessageId
					);
					clientAssistantMessageId = messageToWriteToId;
				} else if (messageToRetry?.from === "assistant") {
					// we're retrying an assistant message, to generate a new answer
					// just add a sibling to the assistant answer where we can write to
					messageToWriteToId = addSibling(
						{
							messages,
							rootMessageId: data.rootMessageId,
						},
						{ from: "assistant", content: "" },
						messageId
					);
					clientAssistantMessageId = messageToWriteToId;
				}
			} else {
				// just a normal linear conversation, so we add the user message
				// and the blank assistant message back to back
				const newUserMessageId = addChildren(
					{
						messages,
						rootMessageId: data.rootMessageId,
					},
					{
						from: "user",
						content: prompt ?? "",
						files: base64Files,
					},
					messageId
				);
				clientUserMessageId = newUserMessageId;

				if (!data.rootMessageId) {
					data.rootMessageId = newUserMessageId;
				}

				messageToWriteToId = addChildren(
					{
						messages,
						rootMessageId: data.rootMessageId,
					},
					{
						from: "assistant",
						content: "",
					},
					newUserMessageId
				);
				clientAssistantMessageId = messageToWriteToId;
			}

			const userMessage = messages.find((message) => message.id === messageId);
			const messageToWriteTo = messages.find((message) => message.id === messageToWriteToId);
			if (!messageToWriteTo) {
				throw new Error("Message to write to not found");
			}

			// Set active message ID for memory processing history capture
			memoryUi.assistantStreamStarted({
				conversationId: page.params.id,
				messageId: messageToWriteTo.id,
			});

			const messageUpdatesAbortController = new AbortController();

			const messageUpdatesIterator = await fetchMessageUpdates(
				page.params.id,
				{
					base,
					inputs: prompt,
					messageId,
					isRetry,
					files: isRetry ? userMessage?.files : base64Files,
					clientUserMessageId,
					clientAssistantMessageId,
					selectedMcpServerNames: $enabledServers.map((s) => s.name),
					selectedMcpServers: $enabledServers.map((s) => ({
						name: s.name,
						url: s.url,
						headers: s.headers,
					})),
				},
				messageUpdatesAbortController.signal
			).catch((err) => {
				error.set(err.message);
			});
			if (messageUpdatesIterator === undefined) return;

			files = [];
			let buffer = "";
			let bufferedStreamLen = 0;
			// Initialize lastUpdateTime outside the loop to persist between updates
			let lastUpdateTime = new Date();
			const flushStreamBuffer = (currentTime: Date) => {
				if ($disableStreamSetting) return;
				if (buffer.length === 0) return;

				// DEFENSIVE: Validate messageToWriteTo still exists (enterprise robustness)
				if (!messageToWriteTo) {
					console.error("[flushStreamBuffer] messageToWriteTo became null during streaming");
					buffer = "";
					return;
				}

				messageToWriteTo.content += buffer;
				const len = buffer.length;
				buffer = "";
				bufferedStreamLen += len;
				lastUpdateTime = currentTime;

				// DEFENSIVE: Ensure updates is an array
				const existingUpdates = Array.isArray(messageToWriteTo.updates)
					? messageToWriteTo.updates
					: [];
				const lastUpdate = existingUpdates.at(-1);
				const marker = {
					type: MessageUpdateType.Stream as const,
					token: "",
					len: bufferedStreamLen,
				};

				if (lastUpdate?.type === MessageUpdateType.Stream && lastUpdate.token === "") {
					// DEFENSIVE: Validate len is a number
					const lastLen =
						typeof lastUpdate.len === "number" && lastUpdate.len >= 0 ? lastUpdate.len : 0;
					const merged = {
						...lastUpdate,
						token: "",
						len: lastLen + bufferedStreamLen,
					};
					messageToWriteTo.updates = [...existingUpdates.slice(0, -1), merged];
				} else {
					messageToWriteTo.updates = [...existingUpdates, marker];
				}
				bufferedStreamLen = 0;
			};

			for await (const update of messageUpdatesIterator) {
				if ($isAborted) {
					// DEFENSIVE: Flush pending buffer before aborting to prevent data loss
					if (buffer.length > 0 && messageToWriteTo) {
						flushStreamBuffer(new Date());
					}
					messageUpdatesAbortController.abort();
					return;
				}

				// Remove null characters added due to remote keylogging prevention
				// See server code for more details
				// DEFENSIVE: Type guard to prevent crash if token is undefined
				if (update.type === MessageUpdateType.Stream) {
					if (typeof update.token === "string") {
						update.token = update.token.replaceAll("\0", "");
					} else {
						console.warn("[stream] Received non-string token:", typeof update.token);
						update.token = "";
					}
				}

				const isKeepAlive =
					update.type === MessageUpdateType.Status &&
					update.status === MessageUpdateStatus.KeepAlive;

				const currentTime = new Date();

				// If we receive a non-stream update (e.g. tool/status/final answer),
				// flush any buffered stream tokens so the UI doesn't appear to cut
				// mid-sentence while tools are running or the final answer arrives.
				if (
					update.type !== MessageUpdateType.Stream &&
					!$disableStreamSetting &&
					buffer.length > 0
				) {
					flushStreamBuffer(currentTime);
				}

				if (
					!isKeepAlive &&
					update.type !== MessageUpdateType.Stream &&
					update.type !== MessageUpdateType.FinalAnswer
				) {
					messageToWriteTo.updates = [...(messageToWriteTo.updates ?? []), update];
				}

				if (update.type === MessageUpdateType.Stream) {
					if (!$disableStreamSetting) {
						buffer += update.token;
						if (currentTime.getTime() - lastUpdateTime.getTime() > updateDebouncer.maxUpdateTime) {
							flushStreamBuffer(currentTime);
						}
						pending = false;
					}
				} else if (update.type === MessageUpdateType.FinalAnswer) {
					// Mirror server-side merge behavior so the UI reflects the
					// final text once tools complete, while preserving any
					// pre‑tool streamed content when appropriate.
					const hadTools =
						messageToWriteTo.updates?.some((u) => u.type === MessageUpdateType.Tool) ?? false;

					if (hadTools) {
						// DEFENSIVE: Ensure existing is always a string to prevent .replace()/.endsWith() crashes
						const existing = messageToWriteTo.content ?? "";
						const finalText = update.text ?? "";
						const trimmedExistingSuffix = existing.replace(/\s+$/, "");
						const trimmedFinalPrefix = finalText.replace(/^\s+/, "");
						const alreadyStreamed =
							finalText &&
							(existing.endsWith(finalText) ||
								(trimmedFinalPrefix.length > 0 &&
									trimmedExistingSuffix.endsWith(trimmedFinalPrefix)));

						if (existing && existing.length > 0) {
							if (alreadyStreamed) {
								// A. Already streamed the same final text; keep as-is.
								messageToWriteTo.content = existing;
							} else if (
								finalText &&
								(finalText.startsWith(existing) ||
									(trimmedExistingSuffix.length > 0 &&
										trimmedFinalPrefix.startsWith(trimmedExistingSuffix)))
							) {
								// B. Final text already includes streamed prefix; use it verbatim.
								messageToWriteTo.content = finalText;
							} else {
								// C. Merge with a paragraph break for readability.
								const needsGap = !/\n\n$/.test(existing) && !/^\n/.test(finalText ?? "");
								messageToWriteTo.content = existing + (needsGap ? "\n\n" : "") + finalText;
							}
						} else {
							messageToWriteTo.content = finalText;
						}
					} else {
						// No tools: final answer replaces streamed content so
						// the provider's final text is authoritative.
						messageToWriteTo.content = update.text ?? "";
					}

					if (update.memoryMeta) {
						memoryUi.memoryMetaUpdated({
							conversationId: page.params.id,
							messageId: messageToWriteTo.id,
							meta: update.memoryMeta,
						});
					}
					if (!isKeepAlive) {
						messageToWriteTo.updates = [...(messageToWriteTo.updates ?? []), update];
					}
				} else if (
					update.type === MessageUpdateType.Status &&
					update.status === MessageUpdateStatus.Error
				) {
					// Check if this is a 402 payment required error
					if (update.statusCode === 402) {
						showSubscribeModal = true;
					} else {
						$error = update.message ?? "An error has occurred";
					}
				} else if (update.type === MessageUpdateType.Title) {
					const convInData = conversations.find(({ id }) => id === page.params.id);
					if (convInData) {
						convInData.title = update.title;

						$titleUpdate = {
							title: update.title,
							convId: page.params.id,
						};
					}
				} else if (update.type === MessageUpdateType.File) {
					messageToWriteTo.files = [
						...(messageToWriteTo.files ?? []),
						{ type: "hash", value: update.sha, mime: update.mime, name: update.name },
					];
				} else if (update.type === MessageUpdateType.RouterMetadata) {
					// Update router metadata immediately when received
					messageToWriteTo.routerMetadata = {
						route: update.route,
						model: update.model,
					};
				} else if (update.type === MessageUpdateType.Reasoning) {
					if (
						update.subtype === MessageReasoningUpdateType.Stream &&
						"token" in update &&
						typeof update.token === "string"
					) {
						messageToWriteTo.reasoning = (messageToWriteTo.reasoning ?? "") + update.token;
					}
				} else if (update.type === MessageUpdateType.Memory) {
					// Handle memory system events for real-time UI feedback
					if (update.subtype === MessageMemoryUpdateType.Searching) {
						memoryUi.setProcessingSearching(update.query);
					} else if (update.subtype === MessageMemoryUpdateType.Found) {
						// Update processing status with count
						memoryUi.setProcessingFound(update.count);
						// Process memoryMeta early for immediate display of known context and citations
						// This shows the user what memories are being used BEFORE the final answer
						if (update.memoryMeta) {
							memoryUi.memoryMetaUpdated({
								conversationId: page.params.id,
								messageId: messageToWriteTo.id,
								meta: update.memoryMeta,
							});
						}
					} else if (update.subtype === MessageMemoryUpdateType.Storing) {
						memoryUi.setProcessingStatus("storing");
					} else if (update.subtype === MessageMemoryUpdateType.Stored) {
						const state = get(memoryUi);
						const existing = state.data.recentMemories ?? [];
						memoryUi.setRecentMemories(
							[
								{
									memory_id: update.memoryId,
									tier: update.tier,
									preview: update.preview,
									created_at: update.createdAt ?? null,
								},
								...existing,
							].slice(0, 100)
						);
						// Skip dispatching event for pending IDs - prevents unnecessary panel refreshes
						// Actual memory ID will be available on next conversation load
						if (update.memoryId && update.memoryId !== "pending") {
							dispatchMemoryEvent({
								type: "memory_updated",
								userId: "admin",
								detail: {
									source: "memory_stored",
									memoryId: update.memoryId,
									tier: update.tier,
									conversationId: page.params.id,
								},
							});
						}
						scheduleResetProcessing(1500);
					} else if (update.subtype === MessageMemoryUpdateType.Outcome) {
						memoryUi.setProcessingStatus("learning");
						// Skip dispatching if no actual memory IDs to update
						// Prevents expensive panel refreshes for empty outcome events
						const memoryIds = update.memoryIds ?? [];
						if (memoryIds.length > 0) {
							dispatchMemoryEvent({
								type: "memory_updated",
								userId: "admin",
								detail: {
									source: "response_outcome",
									memoryIds,
									conversationId: page.params.id,
								},
							});
						}
						// Clear status after a short delay
						scheduleResetProcessing(2000);
					} else if (update.subtype === MessageMemoryUpdateType.Degraded) {
						// Memory system is temporarily unavailable (circuit breaker open)
						// This prevents UI freezes by notifying the user immediately
						memoryUi.setProcessingStatus("degraded");
						// Don't block - continue without memory context
						console.debug("Memory system degraded:", update.reason, update.message);
						scheduleResetProcessing(3000);
					} else if (update.subtype === MessageMemoryUpdateType.DocumentIngesting) {
						// Document upload/processing progress
						memoryUi.setDocumentProcessing({
							documentName: update.documentName,
							stage: update.stage,
							chunksProcessed: update.chunksProcessed,
							totalChunks: update.totalChunks,
							recognized: update.recognized,
						});
						// If completed or recognized, reset after delay
						if (update.stage === "completed" || update.stage === "recognized") {
							scheduleResetProcessing(3000);
						}
					} else if (update.subtype === MessageMemoryUpdateType.ToolIngesting) {
						// Tool result ingestion progress (enhanced ingestion)
						memoryUi.setToolIngestion({
							toolName: update.toolName,
							stage: update.stage,
							entitiesExtracted: update.entitiesExtracted,
							linkedDocuments: update.linkedDocuments,
						});
						// If completed, reset after delay
						if (update.stage === "completed") {
							scheduleResetProcessing(2000);
						}
					}
				}
			}
		} catch (err) {
			if (err instanceof Error && err.message.includes("overloaded")) {
				$error = "Too much traffic, please try again.";
			} else if (err instanceof Error && err.message.includes("429")) {
				$error = ERROR_MESSAGES.rateLimited;
			} else if (err instanceof Error) {
				$error = err.message;
			} else {
				$error = ERROR_MESSAGES.default;
			}
			console.error(err);
		} finally {
			$loading = false;
			pending = false;
			resetProcessingNow();
			// Mark stream finished to preserve memory processing history
			if (messageToWriteToId) {
				memoryUi.assistantStreamFinished({
					conversationId: page.params.id,
					messageId: messageToWriteToId,
				});
			}
			// Phase 23.8 P1.4: Defer invalidateAll() to avoid overlapping with heavy post-processing
			// Wait for browser idle time before refreshing data to reduce jank spikes
			// This prevents invalidateAll from competing with citation enhancement and markdown rendering
			const deferredInvalidate = () => {
				invalidateAll().catch((err) => console.warn("Background invalidateAll failed:", err));
			};
			if (typeof requestIdleCallback !== "undefined") {
				requestIdleCallback(deferredInvalidate, { timeout: 500 });
			} else {
				setTimeout(deferredInvalidate, 100);
			}
		}
	}

	async function stopGeneration() {
		await fetch(`${base}/conversation/${page.params.id}/stop-generating`, {
			method: "POST",
		}).then((r) => {
			if (r.ok) {
				setTimeout(() => {
					$isAborted = true;
					$loading = false;
				}, 500);
			} else {
				$isAborted = true;
				$loading = false;
			}
		});
	}

	function handleKeydown(event: KeyboardEvent) {
		// Stop generation on ESC key when loading
		if (event.key === "Escape" && $loading) {
			event.preventDefault();
			stopGeneration();
		}
	}

	onMount(async () => {
		if ($pendingMessage) {
			files = $pendingMessage.files;
			await writeMessage({ prompt: $pendingMessage.content });
			$pendingMessage = undefined;
		}

		const streaming = isConversationStreaming(messages);
		if (streaming) {
			addBackgroundGeneration({ id: page.params.id, startedAt: Date.now() });
			$loading = true;
		}
	});

	async function onMessage(content: string) {
		await writeMessage({ prompt: content });
	}

	async function onRetry(payload: { id: Message["id"]; content?: string }) {
		if (requireAuthUser()) return;

		const lastMsgId = payload.id;
		messagesPath = createMessagesPath(messages, lastMsgId);

		await writeMessage({
			prompt: payload.content,
			messageId: payload.id,
			isRetry: true,
		});
	}

	async function onShowAlternateMsg(payload: { id: Message["id"] }) {
		const msgId = payload.id;
		messagesPath = createMessagesPath(messages, msgId);
	}

	let messages = $state(data.messages);
	$effect(() => {
		messages = data.messages;
	});

	function isConversationStreaming(msgs: Message[]): boolean {
		const lastAssistant = [...msgs].reverse().find((msg) => msg.from === "assistant");
		if (!lastAssistant) return false;
		const hasFinalAnswer =
			lastAssistant.updates?.some((update) => update.type === MessageUpdateType.FinalAnswer) ??
			false;
		const hasError =
			lastAssistant.updates?.some(
				(update) =>
					update.type === MessageUpdateType.Status && update.status === MessageUpdateStatus.Error
			) ?? false;
		return !hasFinalAnswer && !hasError;
	}

	$effect(() => {
		const streaming = isConversationStreaming(messages);
		if (streaming) {
			$loading = true;
		} else if (!pending) {
			$loading = false;
		}

		if (!streaming && browser) {
			removeBackgroundGeneration(page.params.id);
		}
	});

	// create a linear list of `messagesPath` from `messages` that is a tree of threaded messages
	let messagesPath = $derived(createMessagesPath(messages));
	let messagesAlternatives = $derived(createMessagesAlternatives(messages));

	$effect(() => {
		if (browser && messagesPath.at(-1)?.id) {
			localStorage.setItem("leafId", messagesPath.at(-1)?.id as string);
		}
	});

	beforeNavigate((navigation) => {
		if (!page.params.id) return;

		const navigatingAway =
			navigation.to?.route.id !== page.route.id || navigation.to?.params?.id !== page.params.id;

		if ($loading && navigatingAway) {
			addBackgroundGeneration({ id: page.params.id, startedAt: Date.now() });
		}

		$isAborted = true;
		$loading = false;
	});

	let title = $derived.by(() => {
		const rawTitle = conversations.find((conv) => conv.id === page.params.id)?.title ?? data.title;
		return rawTitle ? rawTitle.charAt(0).toUpperCase() + rawTitle.slice(1) : rawTitle;
	});
</script>

<svelte:window onkeydown={handleKeydown} />

<svelte:head>
	<title>{title}</title>
</svelte:head>

<ChatWindow
	loading={$loading}
	{pending}
	messages={messagesPath as Message[]}
	{messagesAlternatives}
	shared={data.shared}
	preprompt={data.preprompt}
	bind:files
	onmessage={onMessage}
	onretry={onRetry}
	onshowAlternateMsg={onShowAlternateMsg}
	onstop={stopGeneration}
	models={data.models}
	currentModel={findCurrentModel(data.models, data.oldModels, data.model)}
/>

{#if showSubscribeModal}
	<SubscribeModal close={() => (showSubscribeModal = false)} />
{/if}
