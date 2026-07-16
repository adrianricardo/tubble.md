import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

export async function readJsonIfExists(
	filePath: string,
): Promise<unknown | null> {
	try {
		return JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;
	} catch (error) {
		if (
			error &&
			typeof error === "object" &&
			"code" in error &&
			error.code === "ENOENT"
		) {
			return null;
		}
		throw error;
	}
}

/** Replaces one JSON envelope without exposing partial bytes after interruption. */
export async function writeJsonAtomically(
	filePath: string,
	value: unknown,
): Promise<void> {
	const directory = path.dirname(filePath);
	await fs.mkdir(directory, { recursive: true });
	const tempPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
	const handle = await fs.open(tempPath, "wx");
	try {
		await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
		await handle.sync();
	} finally {
		await handle.close();
	}
	try {
		await fs.rename(tempPath, filePath);
		const directoryHandle = await fs.open(directory, "r");
		try {
			await directoryHandle.sync();
		} finally {
			await directoryHandle.close();
		}
	} catch (error) {
		await fs.rm(tempPath, { force: true });
		throw error;
	}
}
