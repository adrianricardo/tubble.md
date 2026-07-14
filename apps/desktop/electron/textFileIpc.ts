export function encodeTextForIpc(content: string): number[] {
	return Array.from(new TextEncoder().encode(content));
}

export function requireEncodedTextBytes(bytes: unknown): Uint8Array {
	if (
		!Array.isArray(bytes) ||
		bytes.some(
			(byte) =>
				typeof byte !== "number" ||
				!Number.isInteger(byte) ||
				byte < 0 ||
				byte > 255,
		)
	) {
		throw new Error("write-file-text requires encoded bytes");
	}
	return Uint8Array.from(bytes);
}
