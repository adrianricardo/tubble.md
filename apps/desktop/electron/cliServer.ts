import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { StringDecoder } from "node:string_decoder";

export type CliCommandHandlers = Record<
	string,
	(args: unknown) => Promise<unknown> | unknown
>;

export type CliServer = {
	socketPath: string;
	close(): Promise<void>;
};

type CliRequest = {
	id: string;
	cmd: string;
	args?: unknown;
};

type CliResponse =
	| { id: string; ok: true; result: unknown }
	| { id: string; ok: false; error: string };

export async function startCliServer({
	socketPath,
	handlers,
}: {
	socketPath: string;
	handlers: CliCommandHandlers;
}): Promise<CliServer> {
	await fs.mkdir(path.dirname(socketPath), { recursive: true });
	await fs.rm(socketPath, { force: true });

	const server = net.createServer((socket) => {
		const decoder = new StringDecoder("utf8");
		let buffer = "";

		const processLine = (line: string) => {
			if (line.trim().length === 0) return;
			void handleLine(line, handlers).then((response) => {
				socket.write(`${JSON.stringify(response)}\n`);
			});
		};

		socket.on("data", (chunk) => {
			buffer += decoder.write(chunk);
			while (true) {
				const newline = buffer.indexOf("\n");
				if (newline === -1) break;
				const line = buffer.slice(0, newline);
				buffer = buffer.slice(newline + 1);
				processLine(line);
			}
		});

		socket.on("end", () => {
			buffer += decoder.end();
			if (buffer.length > 0) processLine(buffer);
		});
	});

	await new Promise<void>((resolve, reject) => {
		const onError = (error: Error) => {
			server.off("listening", onListening);
			reject(error);
		};
		const onListening = () => {
			server.off("error", onError);
			resolve();
		};
		server.once("error", onError);
		server.once("listening", onListening);
		server.listen(socketPath);
	});
	await fs.chmod(socketPath, 0o600);

	return {
		socketPath,
		async close() {
			await new Promise<void>((resolve, reject) => {
				server.close((error) => {
					if (error) reject(error);
					else resolve();
				});
			});
			await fs.rm(socketPath, { force: true });
		},
	};
}

async function handleLine(
	line: string,
	handlers: CliCommandHandlers,
): Promise<CliResponse> {
	let request: CliRequest;
	try {
		request = parseRequest(line);
	} catch (error) {
		return { id: "", ok: false, error: errorMessage(error) };
	}

	const handler = handlers[request.cmd];
	if (!handler) {
		return {
			id: request.id,
			ok: false,
			error: `Unknown CLI command: ${request.cmd}`,
		};
	}

	try {
		const result = await handler(request.args ?? {});
		return { id: request.id, ok: true, result };
	} catch (error) {
		return { id: request.id, ok: false, error: errorMessage(error) };
	}
}

function parseRequest(line: string): CliRequest {
	const parsed = JSON.parse(line) as Partial<CliRequest>;
	if (typeof parsed.id !== "string" || parsed.id.length === 0) {
		throw new Error("CLI request missing string id");
	}
	if (typeof parsed.cmd !== "string" || parsed.cmd.length === 0) {
		throw new Error("CLI request missing string cmd");
	}
	return {
		id: parsed.id,
		cmd: parsed.cmd,
		args: parsed.args,
	};
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
