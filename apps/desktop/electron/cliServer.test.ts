import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { type CliServer, startCliServer } from "./cliServer";

const tempDirs: string[] = [];
const servers: CliServer[] = [];

async function tempSocketPath(): Promise<string> {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), "hubble-cli-server-"));
	tempDirs.push(dir);
	return path.join(dir, "cli.sock");
}

afterEach(async () => {
	for (const server of servers.splice(0)) {
		await server.close().catch(() => {});
	}
	for (const dir of tempDirs.splice(0)) {
		await fs.rm(dir, { recursive: true, force: true });
	}
});

describe("cliServer", () => {
	it("frames multiple requests on one connection", async () => {
		const socketPath = await tempSocketPath();
		servers.push(
			await startCliServer({
				socketPath,
				handlers: {
					echo: (args) => args,
				},
			}),
		);

		const responses = await sendLines(socketPath, [
			JSON.stringify({ id: "one", cmd: "echo", args: { value: 1 } }),
			JSON.stringify({ id: "two", cmd: "echo", args: { value: 2 } }),
		]);

		expect(responses).toEqual([
			{ id: "one", ok: true, result: { value: 1 } },
			{ id: "two", ok: true, result: { value: 2 } },
		]);
	});

	it("handles partial UTF-8 JSON lines split across chunks", async () => {
		const socketPath = await tempSocketPath();
		servers.push(
			await startCliServer({
				socketPath,
				handlers: {
					echo: (args) => args,
				},
			}),
		);

		const request = `${JSON.stringify({
			id: "unicode",
			cmd: "echo",
			args: { value: "多 chunk" },
		})}\n`;
		const bytes = Buffer.from(request, "utf8");
		const splitAt = bytes.indexOf(Buffer.from("多")) + 1;
		const response = await sendChunks(
			socketPath,
			[bytes.subarray(0, splitAt), bytes.subarray(splitAt)],
			1,
		);

		expect(response).toEqual([
			{ id: "unicode", ok: true, result: { value: "多 chunk" } },
		]);
	});

	it("returns ok:false for unknown commands", async () => {
		const socketPath = await tempSocketPath();
		servers.push(await startCliServer({ socketPath, handlers: {} }));

		const [response] = await sendLines(socketPath, [
			JSON.stringify({ id: "missing", cmd: "nope" }),
		]);

		expect(response).toMatchObject({
			id: "missing",
			ok: false,
			error: "Unknown CLI command: nope",
		});
	});

	it("returns ok:false when a handler throws", async () => {
		const socketPath = await tempSocketPath();
		servers.push(
			await startCliServer({
				socketPath,
				handlers: {
					fail: () => {
						throw new Error("boom");
					},
				},
			}),
		);

		const [response] = await sendLines(socketPath, [
			JSON.stringify({ id: "bad", cmd: "fail" }),
		]);

		expect(response).toEqual({ id: "bad", ok: false, error: "boom" });
	});

	it("sets the socket file mode to 0600", async () => {
		const socketPath = await tempSocketPath();
		servers.push(await startCliServer({ socketPath, handlers: {} }));

		const stat = await fs.stat(socketPath);
		expect(stat.mode & 0o777).toBe(0o600);
	});

	it("removes a stale socket path before listening", async () => {
		const socketPath = await tempSocketPath();
		await fs.writeFile(socketPath, "stale");

		servers.push(await startCliServer({ socketPath, handlers: {} }));

		const stat = await fs.stat(socketPath);
		expect(stat.isSocket()).toBe(true);
	});
});

function sendLines(socketPath: string, lines: string[]) {
	return sendChunks(
		socketPath,
		lines.map((line) => Buffer.from(`${line}\n`, "utf8")),
	);
}

function sendChunks(
	socketPath: string,
	chunks: Buffer[],
	expectedResponses = chunks.length,
): Promise<Array<Record<string, unknown>>> {
	return new Promise((resolve, reject) => {
		const socket = net.createConnection(socketPath);
		let buffer = "";
		const responses: Array<Record<string, unknown>> = [];
		socket.on("connect", () => {
			for (const chunk of chunks) socket.write(chunk);
		});
		socket.on("data", (chunk) => {
			buffer += chunk.toString("utf8");
			while (true) {
				const newline = buffer.indexOf("\n");
				if (newline === -1) break;
				const line = buffer.slice(0, newline);
				buffer = buffer.slice(newline + 1);
				responses.push(JSON.parse(line) as Record<string, unknown>);
				if (responses.length === expectedResponses) {
					socket.end();
					resolve(responses);
				}
			}
		});
		socket.on("error", reject);
	});
}
