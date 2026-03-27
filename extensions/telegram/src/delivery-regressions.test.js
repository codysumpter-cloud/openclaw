import test from "node:test";
import assert from "node:assert/strict";

import {
	createLaneTextDeliverer,
	createTelegramBoundedProgressController,
	createTelegramTurnDeliveryState,
	shouldSuppressLocalTelegramExecApprovalPrompt
} from "../../../dist/plugin-sdk/thread-bindings-SYAnWHuW.js";

function createDelivererHarness(options = {}) {
	const calls = {
		editPreview: [],
		sendPayload: [],
		deletePreviewMessage: [],
		stopDraftLane: 0,
		flushDraftLane: 0,
		markDelivered: 0,
		logs: []
	};
	const answerLane = {
		stream: options.answerStream ?? {
			messageId: () => void 0,
			previewMode: () => "message",
			previewRevision: () => 1,
			update: () => {},
			sendMayHaveLanded: () => false
		},
		lastPartialText: options.answerLastPartialText,
		hasStreamedMessage: Boolean(options.answerHasStreamedMessage)
	};
	const reasoningLane = {
		stream: options.reasoningStream ?? void 0,
		lastPartialText: options.reasoningLastPartialText,
		hasStreamedMessage: false
	};
	const deliver = createLaneTextDeliverer({
		lanes: { answer: answerLane, reasoning: reasoningLane },
		activePreviewLifecycleByLane: {
			answer: options.answerPreviewLifecycle ?? "complete",
			reasoning: options.reasoningPreviewLifecycle ?? "complete"
		},
		retainPreviewOnCleanupByLane: {
			answer: false,
			reasoning: false
		},
		archivedAnswerPreviews: options.archivedAnswerPreviews ? [...options.archivedAnswerPreviews] : [],
		draftMaxChars: options.draftMaxChars ?? 128,
		editPreview: async (args) => {
			calls.editPreview.push(args);
			if (options.editPreviewError) throw options.editPreviewError;
		},
		sendPayload: async (payload) => {
			calls.sendPayload.push(payload);
			return options.sendPayloadResult ?? true;
		},
		applyTextToPayload: (payload, text) => ({ ...payload, text }),
		deletePreviewMessage: async (messageId) => {
			calls.deletePreviewMessage.push(messageId);
		},
		stopDraftLane: async () => {
			calls.stopDraftLane += 1;
		},
		flushDraftLane: async () => {
			calls.flushDraftLane += 1;
		},
		markDelivered: () => {
			calls.markDelivered += 1;
		},
		log: (message) => {
			calls.logs.push(message);
		}
	});
	return { deliver, calls, lanes: { answer: answerLane, reasoning: reasoningLane } };
}

test("#100 final answer edits archived preview instead of sending a second Telegram message", async () => {
	const harness = createDelivererHarness({
		archivedAnswerPreviews: [
			{ messageId: 77, textSnapshot: "Still working...", deleteIfUnused: true }
		]
	});

	const result = await harness.deliver({
		laneName: "answer",
		text: "Final coherent answer",
		payload: {},
		infoKind: "final"
	});

	assert.equal(result, "preview-finalized");
	assert.equal(harness.calls.editPreview.length, 1);
	assert.equal(harness.calls.editPreview[0].messageId, 77);
	assert.equal(harness.calls.sendPayload.length, 0);
});

test("#100 oversized final answer falls back to one normal send without preview edit duplication", async () => {
	const harness = createDelivererHarness({
		draftMaxChars: 16
	});

	const result = await harness.deliver({
		laneName: "answer",
		text: "This final answer is intentionally too long for Telegram preview editing.",
		payload: {},
		infoKind: "final"
	});

	assert.equal(result, "sent");
	assert.equal(harness.calls.editPreview.length, 0);
	assert.equal(harness.calls.sendPayload.length, 1);
	assert.match(harness.calls.sendPayload[0].text, /intentionally too long/);
});

test("#99 bounded progress emits exactly one update before a long wait and final delivery can follow later", async () => {
	const events = [];
	const turnState = createTelegramTurnDeliveryState();
	const controller = createTelegramBoundedProgressController({
		delayMs: 5,
		turnState,
		hasVisibleDelivery: () => false,
		onProgress: async () => {
			events.push("progress");
			return true;
		}
	});

	controller.arm();
	await new Promise((resolve) => setTimeout(resolve, 25));
	assert.deepEqual(events, ["progress"]);
	assert.equal(turnState.hasProgressUpdateSent(), true);

	await controller.trigger();
	assert.deepEqual(events, ["progress"]);

	events.push("final");
	turnState.markFinalResponseSent();
	assert.deepEqual(events, ["progress", "final"]);

	controller.cancel();
});

test("#99 bounded progress stays quiet when delivery is already visible", async () => {
	const turnState = createTelegramTurnDeliveryState();
	let progressCalls = 0;
	const controller = createTelegramBoundedProgressController({
		delayMs: 5,
		turnState,
		hasVisibleDelivery: () => true,
		onProgress: async () => {
			progressCalls += 1;
			return true;
		}
	});

	controller.arm();
	await new Promise((resolve) => setTimeout(resolve, 25));

	assert.equal(progressCalls, 0);
	assert.equal(turnState.hasProgressUpdateSent(), false);

	controller.cancel();
});

test("/exec does not suppress Telegram approval prompts when Telegram exec approvals are disabled", () => {
	const suppressed = shouldSuppressLocalTelegramExecApprovalPrompt({
		cfg: {
			channels: {
				telegram: {
					execApprovals: {
						enabled: false,
						approvers: ["12345"]
					}
				}
			}
		},
		accountId: "default",
		payload: {
			text: "Approval required.",
			channelData: {
				execApproval: {
					approvalId: "approval-123",
					approvalSlug: "abc123"
				}
			}
		}
	});

	assert.equal(suppressed, false);
});

test("/exec suppresses the local Telegram approval prompt only when Telegram exec approvals are enabled", () => {
	const suppressed = shouldSuppressLocalTelegramExecApprovalPrompt({
		cfg: {
			channels: {
				telegram: {
					execApprovals: {
						enabled: true,
						approvers: ["12345"]
					}
				}
			}
		},
		accountId: "default",
		payload: {
			text: "Approval required.",
			channelData: {
				execApproval: {
					approvalId: "approval-123",
					approvalSlug: "abc123"
				}
			}
		}
	});

	assert.equal(suppressed, true);
});
