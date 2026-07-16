import { promises as fs } from "node:fs";
import path from "node:path";
import { type ProjectionScope, projectionScopeKey } from "@hubble.md/sync";
import { z } from "zod/v4";

export const LOCAL_AVAILABILITY_VERSION = 1;

export type GitExclusionResult =
	| { status: "excluded"; pattern: string }
	| { status: "manual"; pattern: string }
	| { status: "not-applicable" };

export type StoredLocalAvailability = {
	scopeKey: string;
	scope: Exclude<ProjectionScope, { kind: "all-accessible" }>;
	displayName: string;
	localRoot: string;
	association: "standalone" | "repo";
	repoRoot: string | null;
	repoName: string | null;
	repoRemoteUrl: string | null;
	gitExclusion: GitExclusionResult;
	createdAt: number;
	updatedAt: number;
	lastConnectedAt: number | null;
};

const directScopeSchema = z.discriminatedUnion("kind", [
	z.object({ kind: z.literal("workspace"), workspaceId: z.string().min(1) }),
	z.object({
		kind: z.literal("folder"),
		workspaceId: z.string().min(1),
		folderId: z.string().min(1),
	}),
]);

const gitExclusionSchema = z.discriminatedUnion("status", [
	z.object({ status: z.literal("excluded"), pattern: z.string().min(1) }),
	z.object({ status: z.literal("manual"), pattern: z.string().min(1) }),
	z.object({ status: z.literal("not-applicable") }),
]);

const storedLocalAvailabilitySchema = z
	.object({
		scopeKey: z.string().min(1),
		scope: directScopeSchema,
		displayName: z.string(),
		localRoot: z.string().min(1),
		association: z.enum(["standalone", "repo"]),
		repoRoot: z.string().min(1).nullable(),
		repoName: z.string().nullable(),
		repoRemoteUrl: z.string().nullable(),
		gitExclusion: gitExclusionSchema,
		createdAt: z.number().finite(),
		updatedAt: z.number().finite(),
		lastConnectedAt: z.number().finite().nullable(),
	})
	.refine((record) => record.scopeKey === projectionScopeKey(record.scope), {
		message: "Local availability scope key does not match its scope",
		path: ["scopeKey"],
	})
	.refine(
		(record) =>
			record.association === "repo" ? record.repoRoot !== null : true,
		{
			message: "Repo-associated availability requires a repository root",
			path: ["repoRoot"],
		},
	);

const localAvailabilityEnvelopeSchema = z.object({
	version: z.literal(LOCAL_AVAILABILITY_VERSION),
	records: z.array(storedLocalAvailabilitySchema),
});

const legacyRepoMountSchema = z.object({
	folderId: z.string().min(1),
	folderName: z.string(),
	workspaceId: z.string().min(1),
	mountPath: z.string().min(1),
	repoDir: z.string().min(1),
	repoName: z.string().nullable().optional(),
	repoRemoteUrl: z.string().nullable().optional(),
});

const legacyRepoMountEnvelopeSchema = z.object({
	mounts: z.array(z.unknown()),
});

async function pathExists(filePath: string): Promise<boolean> {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
}

/** Durably replace a registry without ever exposing a partially written envelope. */
async function writeJsonAtomically(
	filePath: string,
	value: unknown,
): Promise<void> {
	const directory = path.dirname(filePath);
	await fs.mkdir(directory, { recursive: true });
	const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
	const handle = await fs.open(tempPath, "wx");
	try {
		await handle.writeFile(JSON.stringify(value, null, 2), "utf8");
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

export class LocalAvailabilityStore {
	readonly #filePath: string;
	readonly #legacyRepoMountsPath: string;
	readonly #now: () => number;

	constructor(options: {
		filePath: string;
		legacyRepoMountsPath: string;
		now?: () => number;
	}) {
		this.#filePath = options.filePath;
		this.#legacyRepoMountsPath = options.legacyRepoMountsPath;
		this.#now = options.now ?? Date.now;
	}

	async list(): Promise<StoredLocalAvailability[]> {
		if (await pathExists(this.#filePath)) {
			const raw = await fs.readFile(this.#filePath, "utf8");
			return localAvailabilityEnvelopeSchema.parse(JSON.parse(raw))
				.records as StoredLocalAvailability[];
		}

		if (!(await pathExists(this.#legacyRepoMountsPath))) return [];
		const legacyRaw = await fs.readFile(this.#legacyRepoMountsPath, "utf8");
		const legacy = legacyRepoMountEnvelopeSchema.parse(JSON.parse(legacyRaw));
		const migratedAt = this.#now();
		const byScopeKey = new Map<string, StoredLocalAvailability>();
		for (const candidate of legacy.mounts) {
			const parsed = legacyRepoMountSchema.safeParse(candidate);
			if (!parsed.success) continue;
			const mount = parsed.data;
			const scope = {
				kind: "folder" as const,
				workspaceId: mount.workspaceId,
				folderId: mount.folderId,
			};
			const scopeKey = projectionScopeKey(scope);
			byScopeKey.set(scopeKey, {
				scopeKey,
				scope,
				displayName: mount.folderName,
				localRoot: mount.mountPath,
				association: "repo",
				repoRoot: mount.repoDir,
				repoName: mount.repoName ?? null,
				repoRemoteUrl: mount.repoRemoteUrl ?? null,
				gitExclusion: { status: "not-applicable" },
				createdAt: migratedAt,
				updatedAt: migratedAt,
				lastConnectedAt: null,
			});
		}
		const records = [...byScopeKey.values()];
		await this.#save(records);
		return records;
	}

	async upsert(record: StoredLocalAvailability): Promise<void> {
		const parsed = storedLocalAvailabilitySchema.parse(
			record,
		) as StoredLocalAvailability;
		const records = (await this.list()).filter(
			(entry) => entry.scopeKey !== parsed.scopeKey,
		);
		records.push(parsed);
		await this.#save(records);
	}

	async remove(scopeKey: string): Promise<void> {
		await this.#save(
			(await this.list()).filter((entry) => entry.scopeKey !== scopeKey),
		);
	}

	async #save(records: StoredLocalAvailability[]): Promise<void> {
		const envelope = localAvailabilityEnvelopeSchema.parse({
			version: LOCAL_AVAILABILITY_VERSION,
			records,
		});
		await writeJsonAtomically(this.#filePath, envelope);
	}
}
