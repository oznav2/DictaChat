// Added regression test to ensure Docling uses stored message file path.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Message } from "$lib/types/Message";
import type { MessageFile } from "$lib/types/Message";

const downloadFileMock = vi.fn();
const existsSyncMock = vi.fn();
const mkdirMock = vi.fn();
const writeFileMock = vi.fn();

vi.mock("$lib/server/files/downloadFile", () => ({
	downloadFile: (sha256: string, convId: unknown) => downloadFileMock(sha256, convId),
}));

vi.mock("fs", () => ({
	existsSync: (p: string) => existsSyncMock(p),
}));

vi.mock("fs/promises", () => ({
	mkdir: (p: string, opts: unknown) => mkdirMock(p, opts),
	writeFile: (p: string, data: unknown) => writeFileMock(p, data),
}));

describe("preprocessMessages (Docling path)", () => {
	const originalUploadsDir = process.env.UPLOADS_DIR;
	const originalDockerEnv = process.env.DOCKER_ENV;

	beforeEach(() => {
		downloadFileMock.mockReset();
		existsSyncMock.mockReset();
		mkdirMock.mockReset();
		writeFileMock.mockReset();
		process.env.UPLOADS_DIR = "/app/uploads";
		process.env.DOCKER_ENV = "true";
	});

	afterEach(() => {
		if (originalUploadsDir === undefined) {
			delete process.env.UPLOADS_DIR;
		} else {
			process.env.UPLOADS_DIR = originalUploadsDir;
		}
		if (originalDockerEnv === undefined) {
			delete process.env.DOCKER_ENV;
		} else {
			process.env.DOCKER_ENV = originalDockerEnv;
		}
	});

	it("preserves message-provided file.path when GridFS metadata path is missing", async () => {
		existsSyncMock.mockReturnValue(true);
		downloadFileMock.mockResolvedValue({
			type: "base64",
			name: "ignored-gridfs-name",
			value: Buffer.from("%PDF-1.4").toString("base64"),
			mime: "application/pdf",
		} satisfies MessageFile & { type: "base64" });

		const convId = "6964e6b2f0e3e53e32dad255" as unknown as { toString(): string };
		const sha = "e4df048be5522d4c3fe61bd2a2cf1684375193443fee68db4ded0a42dcb4cf4d";
		const storedPath = `/app/uploads/${convId.toString()}/e4df048b_בגצ_בן_חמו.pdf`;

		const messages: Message[] = [
			{
				from: "user",
				content: "please parse",
				files: [
					{
						type: "hash",
						value: sha,
						mime: "application/pdf",
						name: "בגצ בן חמו.pdf",
						path: storedPath,
					},
				],
			} as unknown as Message,
		];

		const { preprocessMessages } = await import("$lib/server/endpoints/preprocessMessages");
		const processed = await preprocessMessages(messages, convId as unknown as any);

		expect(processed).toHaveLength(1);
		expect(processed[0].files).toHaveLength(1);
		expect(processed[0].files?.[0].type).toBe("base64");
		expect(processed[0].files?.[0].mime).toBe("application/pdf");
		expect(processed[0].files?.[0].name).toBe("בגצ בן חמו.pdf");
		expect(processed[0].files?.[0].path).toBe(storedPath);

		expect(writeFileMock).not.toHaveBeenCalled();
		expect(mkdirMock).not.toHaveBeenCalled();
	});
});
