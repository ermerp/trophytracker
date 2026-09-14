import { CredentialsRepository } from "./credentials";
import { ExportRepository } from "./export";
import { GamesRepository } from "./games";
import { OwnershipRepository } from "./ownership";
import { PlayStatusRepository } from "./play-status";
import { ReviewRepository } from "./review";
import { SettingsRepository } from "./settings";
import { SyncRepository } from "./sync";
import { TrophiesRepository } from "./trophies";

/**
 * Die eine Stelle, an der D1 hereinkommt.
 *
 * Route-Handler rufen niemals env.DB.prepare() auf, sondern gehen ueber ein
 * Repository. Das haelt einen spaeteren Wechsel zu Turso, Postgres oder
 * lokalem SQLite auf src/db/ begrenzt.
 */
export function createRepositories(db: D1Database, npssoKey: string) {
	const playStatus = new PlayStatusRepository(db);
	return {
		settings: new SettingsRepository(db),
		credentials: new CredentialsRepository(db, npssoKey),
		sync: new SyncRepository(db),
		trophies: new TrophiesRepository(db),
		games: new GamesRepository(db),
		ownership: new OwnershipRepository(db),
		playStatus,
		review: new ReviewRepository(db, playStatus),
		export: new ExportRepository(db),
	};
}

export type Repositories = ReturnType<typeof createRepositories>;
