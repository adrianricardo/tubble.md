export type FileAction = "none" | "reload" | "conflict" | "match";

type FileChangeInput = {
	editorContent: string;
	baseline: string;
	diskContent: string;
};

/** Classify what to do when disk content may have diverged from the editor. */
export function classifyFileChange({
	editorContent,
	baseline,
	diskContent,
}: FileChangeInput): FileAction {
	if (diskContent === baseline) return "none";
	if (diskContent === editorContent) return "match";
	if (editorContent === baseline) return "reload";
	return "conflict";
}
