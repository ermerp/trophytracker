import { CredentialsRepository } from "./credentials";
import { SettingsRepository } from "./settings";
import { SyncRepository } from "./sync";

/**
 * Die eine Stelle, an der D1 hereinkommt.
 *
 * Route-Handler rufen niemals env.DB.prepare() auf, sondern gehen ueber ein
 * Repository. Das haelt einen spaeteren Wechsel zu Turso, Postgres oder
 * lokalem SQLite auf src/db/ begrenzt.
 */
export function createRepositories(db: D1Database, npssoKey: string) {
	return {
		settings: new SettingsRepository(db),
		credentials: new CredentialsRepository(db, npssoKey),
		sync: new SyncRepository(db),
	};
}

export type Repositories = ReturnType<typeof createRepositories>;
