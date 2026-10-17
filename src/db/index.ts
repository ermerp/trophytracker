import { CredentialsRepository } from "./credentials";
import { CronLageRepository } from "./cron-lage";
import { EventRepository } from "./events";
import { ExportRepository } from "./export";
import { GamesRepository } from "./games";
import { GapsRepository } from "./gaps";
import { IgdbRepository } from "./igdb";
import { Kopplung } from "./kopplung";
import { MarktRepository } from "./markt";
import { BesitzRepository } from "./besitz";
import { OwnershipRepository } from "./ownership";
import { PlanRepository } from "./plan";
import { PlayStatusRepository } from "./play-status";
import { PreiseRepository } from "./preise";
import { ReviewRepository } from "./review";
import { ScanRepository } from "./scan";
import { StatsRepository } from "./stats";
import { StoreRepository } from "./store";
import { SyncRepository } from "./sync";
import { TrophaeenRepository } from "./trophaeen";
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
	const credentials = new CredentialsRepository(db, npssoKey);
	const sync = new SyncRepository(db);
	const trophaeen = new TrophaeenRepository(db);
	const games = new GamesRepository(db, events);
	const igdb = new IgdbRepository(db, events);
	const markt = new MarktRepository(db, events);
	const store = new StoreRepository(db, events);
	return {
		credentials,
		sync,
		trophies: new TrophiesRepository(db, events),
		trophaeen,
		games,
		gaps: new GapsRepository(db),
		igdb,
		markt,
		store,
		// Die Lage eines Cron-Aufrufs in einem Batch (Stufe 18j) - aus den
		// Bausteinen derselben Repositories, die die Knoepfe einzeln benutzen.
		cronLage: new CronLageRepository(db, { sync, credentials, trophaeen, store, games, igdb, markt }),
		ownership: new OwnershipRepository(db, events),
		besitz: new BesitzRepository(db, events),
		plan,
		playStatus,
		kopplung,
		events,
		review: new ReviewRepository(db, playStatus, kopplung, events),
		scan: new ScanRepository(db),
		stats: new StatsRepository(db),
		preise: new PreiseRepository(db),
		export: new ExportRepository(db),
		wishlistImport: new WishlistImportRepository(db),
	};
}

export type Repositories = ReturnType<typeof createRepositories>;
