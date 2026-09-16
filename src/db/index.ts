import { CredentialsRepository } from "./credentials";
import { EventRepository } from "./events";
import { ExportRepository } from "./export";
import { GamesRepository } from "./games";
import { GapsRepository } from "./gaps";
import { IgdbRepository } from "./igdb";
import { Kopplung } from "./kopplung";
import { OwnershipRepository } from "./ownership";
import { PlanRepository } from "./plan";
import { PlayStatusRepository } from "./play-status";
import { ReviewRepository } from "./review";
import { SyncRepository } from "./sync";
import { TrophiesRepository } from "./trophies";
import { WishlistImportRepository } from "./wunschliste";

/**
 * Die eine Stelle, an der D1 hereinkommt.
 *
 * Route-Handler rufen niemals env.DB.prepare() auf, sondern gehen ueber ein
 * Repository. Das haelt einen spaeteren Wechsel zu Turso, Postgres oder
 * lokalem SQLite auf src/db/ begrenzt.
 */
export function createRepositories(db: D1Database, npssoKey: string) {
	// Das Protokoll (8.5) kommt zuerst: Jedes schreibende Repository haengt
	// seine Ereignisse in denselben Batch wie die Aenderung.
	const events = new EventRepository(db);
	const playStatus = new PlayStatusRepository(db, events);
	const plan = new PlanRepository(db, events);
	const kopplung = new Kopplung(db, plan, playStatus, events);
	return {
		credentials: new CredentialsRepository(db, npssoKey),
		sync: new SyncRepository(db),
		trophies: new TrophiesRepository(db, events),
		games: new GamesRepository(db, events),
		gaps: new GapsRepository(db),
		igdb: new IgdbRepository(db, events),
		ownership: new OwnershipRepository(db, events),
		plan,
		playStatus,
		kopplung,
		events,
		review: new ReviewRepository(db, playStatus, kopplung, events),
		export: new ExportRepository(db),
		wishlistImport: new WishlistImportRepository(db),
	};
}

export type Repositories = ReturnType<typeof createRepositories>;
