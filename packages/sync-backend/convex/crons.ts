import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const ORPHAN_ASSET_GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000;

const crons = cronJobs();

crons.cron(
	"cleanup orphan assets",
	"0 4 * * *",
	internal.sync.runOrphanAssetCleanupForAllWorkspaces,
	{ gracePeriodMs: ORPHAN_ASSET_GRACE_PERIOD_MS },
);

crons.interval(
	"cleanup expired device auth requests",
	{ minutes: 10 },
	internal.deviceAuth.cleanupExpired,
	{},
);

export default crons;
