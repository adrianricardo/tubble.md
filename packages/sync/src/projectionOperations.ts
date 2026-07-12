import type { DocumentRelocationImpact } from "./backend.js";
import { contentHash, type FileSystem } from "./fs.js";

export const PROJECTION_OPERATIONS_REL =
	".hubble/pending/projection-operations.json";

type PendingOperationBase = {
	id: string;
	state: "pending";
	documentId: string;
	workspaceId: string;
	folderId: string | null;
	path: string;
	createdAt: number;
	updatedAt: number;
};

export type PendingProjectionOperation =
	| (PendingOperationBase & {
			kind: "missing-document";
			baseHash: string;
	  })
	| (PendingOperationBase & {
			kind: "path-collision";
			localHash: string;
			desiredHash: string;
	  })
	| (PendingOperationBase & {
			kind: "startup-move";
			toPath: string;
			matchedBy: "inode" | "hash";
	  })
	| (PendingOperationBase & {
			kind: "ambiguous-startup-move";
			candidatePaths: string[];
	  })
	| (PendingOperationBase & {
			kind: "guard-conflict";
			expectedHash: string | null;
			actualHash: string | null;
			desiredHash: string;
	  })
	| (PendingOperationBase & {
			kind: "consequential-move";
			toPath: string;
			toFolderId: string | null;
			title: string;
			fingerprint: string;
			impact: DocumentRelocationImpact;
			latestHash: string;
	  });

export type PendingProjectionOperationInput =
	| Omit<
			Extract<PendingProjectionOperation, { kind: "missing-document" }>,
			"id" | "state" | "createdAt" | "updatedAt"
	  >
	| Omit<
			Extract<PendingProjectionOperation, { kind: "path-collision" }>,
			"id" | "state" | "createdAt" | "updatedAt"
	  >
	| Omit<
			Extract<PendingProjectionOperation, { kind: "startup-move" }>,
			"id" | "state" | "createdAt" | "updatedAt"
	  >
	| Omit<
			Extract<PendingProjectionOperation, { kind: "ambiguous-startup-move" }>,
			"id" | "state" | "createdAt" | "updatedAt"
	  >
	| Omit<
			Extract<PendingProjectionOperation, { kind: "guard-conflict" }>,
			"id" | "state" | "createdAt" | "updatedAt"
	  >
	| Omit<
			Extract<PendingProjectionOperation, { kind: "consequential-move" }>,
			"id" | "state" | "createdAt" | "updatedAt"
	  >;

export type ProjectionOperationsManifest = {
	version: 1;
	operations: PendingProjectionOperation[];
};

export function projectionOperationsPath(syncRoot: string): string {
	return `${syncRoot}/${PROJECTION_OPERATIONS_REL}`;
}

export async function loadProjectionOperations(
	fs: Pick<FileSystem, "readFileOrNull">,
	syncRoot: string,
): Promise<ProjectionOperationsManifest> {
	const raw = await fs.readFileOrNull(projectionOperationsPath(syncRoot));
	if (raw === null) return { version: 1, operations: [] };
	const manifest = JSON.parse(raw) as ProjectionOperationsManifest;
	if (manifest.version !== 1 || !Array.isArray(manifest.operations)) {
		throw new Error("Unsupported projection operations manifest");
	}
	return manifest;
}

/**
 * Replace startup blockers while retaining stable IDs and consequential moves.
 * Startup verification reruns independently, but user intent must survive it.
 */
export async function saveProjectionOperations(
	fs: Pick<FileSystem, "ensureDir" | "readFileOrNull" | "writeFile">,
	syncRoot: string,
	inputs: PendingProjectionOperationInput[],
	now: number,
): Promise<ProjectionOperationsManifest> {
	const current = await loadProjectionOperations(fs, syncRoot);
	const retained = current.operations.filter(
		(operation) => operation.kind === "consequential-move",
	);
	const byId = new Map(
		current.operations.map((operation) => [operation.id, operation]),
	);
	const replacements = await Promise.all(
		inputs.map(async (input) => {
			const id = await operationId(input);
			return {
				...input,
				id,
				state: "pending" as const,
				createdAt: byId.get(id)?.createdAt ?? now,
				updatedAt: now,
			};
		}),
	);
	const replacementIds = new Set(replacements.map((operation) => operation.id));
	const operations = [
		...retained.filter((operation) => !replacementIds.has(operation.id)),
		...replacements,
	];
	const manifest = { version: 1 as const, operations };
	await fs.ensureDir(`${syncRoot}/.hubble/pending`);
	await fs.writeFile(
		projectionOperationsPath(syncRoot),
		JSON.stringify(manifest, null, 2),
	);
	return manifest;
}

/** Add or refresh one operation without discarding unrelated pending work. */
export async function upsertProjectionOperation(
	fs: Pick<FileSystem, "ensureDir" | "readFileOrNull" | "writeFile">,
	syncRoot: string,
	input: PendingProjectionOperationInput,
	now: number,
): Promise<ProjectionOperationsManifest> {
	const current = await loadProjectionOperations(fs, syncRoot);
	const id = await operationId(input);
	const previous = current.operations.find((operation) => operation.id === id);
	const operation = {
		...input,
		id,
		state: "pending" as const,
		createdAt: previous?.createdAt ?? now,
		updatedAt: now,
	} as PendingProjectionOperation;
	const manifest = {
		version: 1 as const,
		operations: [
			...current.operations.filter((candidate) => candidate.id !== id),
			operation,
		],
	};
	await fs.ensureDir(`${syncRoot}/.hubble/pending`);
	await fs.writeFile(
		projectionOperationsPath(syncRoot),
		JSON.stringify(manifest, null, 2),
	);
	return manifest;
}

async function operationId(
	input: PendingProjectionOperationInput,
): Promise<string> {
	return `op_${(await contentHash(`${input.kind}\0${input.documentId}\0${input.path}`)).slice(0, 20)}`;
}
