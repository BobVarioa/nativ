import sqlite3 from "sqlite3";
import { Database, open } from "sqlite";
import {
	Author,
	Media,
	MediaInfo,
	StreamingFormat,
} from "../../providers/media";
import { error, verbose } from "../../utils/log";
import {
	Database as DatabaseService,
	SubscriptionElement,
	WatchHistoryElement,
} from "./service";

async function upgradeDB(
	db: Database<sqlite3.Database, sqlite3.Statement>,
	from: string,
	to: string
): Promise<boolean> {

	return true;
}

export class DiskDatabase implements DatabaseService {
	version = "0.0.0";
	db: Database<sqlite3.Database, sqlite3.Statement>;

	async #fromNull() {
		// NOTE: UserData playlist/watch history implementation notes
		// We don't store the formats like we do in the media cache because this is not meant for rapid playback
		// Though, the media here might be in the media cache for any number of reasons,
		// i.e. the data is duplicated here on purpose
		await this.db.exec(`
		CREATE TABLE DatabaseInfo (
			version NOT NULL DEFAULT "${this.version}"
		);
		INSERT INTO DatabaseInfo DEFAULT VALUES;
		CREATE TABLE Subscriptions (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			provider TEXT NOT NULL,
			provider_id TEXT NOT NULL,
			date_added INTEGER NOT NULL,
			UNIQUE(provider, provider_id)
		);
		CREATE TABLE Playlist (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			description TEXT,
			date_added INTEGER NOT NULL,
			elements INTEGER NOT NULL
		);
		CREATE TABLE PlaylistMedia (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			playlist_id INTEGER NOT NULL,
			media_info INTEGER NOT NULL,
			date_added INTEGER NOT NULL,
			FOREIGN KEY(playlist_id) REFERENCES Playlist(id),
			FOREIGN KEY(media_info) REFERENCES MediaInfo(id)
		);
		CREATE TABLE WatchHistory (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			media_info INTEGER NOT NULL,
			date INTEGER NOT NULL,
			location INTEGER NOT NULL,
			FOREIGN KEY(media_info) REFERENCES MediaInfo(id)
		);
		CREATE TABLE MediaInfo (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			provider TEXT NOT NULL,
			provider_id TEXT NOT NULL,
			title TEXT NOT NULL,
			description TEXT NOT NULL,
			thumbnail_url TEXT,
			thumbnail_alt TEXT,
			author_name TEXT NOT NULL,
			author_provider TEXT NOT NULL,
			author_provider_id TEXT NOT NULL,
			duration INTEGER,
			date_added INTEGER NOT NULL,
			UNIQUE(provider, provider_id)
		);
		CREATE TABLE StreamingFormat (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			url TEXT NOT NULL,
			expires_at INTEGER NOT NULL,
			has_audio BOOLEAN NOT NULL,
			has_video BOOLEAN NOT NULL,
			width INTEGER,
			height INTEGER,
			fps INTEGER,
			bitrate INTEGER,
			mime_type TEXT,
			language TEXT,
			original BOOLEAN,
			media_info_id INTEGER NOT NULL,
    		FOREIGN KEY(media_info_id) REFERENCES MediaInfo(id)
		);
		`);

		return true;
	}

	async initialize(): Promise<boolean> {
		const db = await open({
			filename: "./.cache/nativ.db",
			driver: sqlite3.cached.Database,
		});
		this.db = db;

		let dbConfig: { version: string };
		try {
			dbConfig = await db.get("SELECT * FROM DatabaseInfo;");
		} catch (e) {}

		if (!dbConfig) {
			return await this.#fromNull();
		}

		if (dbConfig.version != this.version) {
			return await upgradeDB(db, dbConfig.version, this.version);
		}
	}

	async insertMedia(media: Media): Promise<number> {
		const query = `
		INSERT INTO MediaInfo 
			(provider, provider_id, title, description, thumbnail_url, thumbnail_alt, author_name, author_provider, author_provider_id, duration, date_added) 
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(provider, provider_id) DO UPDATE 
				SET 
					title = excluded.title, 
					description = excluded.description, 
					thumbnail_url = excluded.thumbnail_url, 
					thumbnail_alt = excluded.thumbnail_alt, 
					author_name = excluded.author_name, 
					author_provider = excluded.author_provider, 
					author_provider_id = excluded.author_provider_id, 
					duration = excluded.duration, 
					date_added = excluded.date_added;`;
		const values = [
			media.provider,
			media.provider_id,
			media.info.title,
			media.info.description,
			media.info.thumbnail?.url,
			media.info.thumbnail?.alt,
			media.info.author.name,
			media.info.author.provider,
			media.info.author.provider_id,
			media.info.duration,
			Date.now(),
		];

		try {
			const res = await this.db.run(query, values);

			for (const format of media.formats) {
				this.insertStreamingFormat(format, res.lastID);
			}

			return res.lastID;
		} catch (e) {
			error(
				"DatabaseManager",
				"Failed to insert media info. " + e.message
			);
			return -1;
		}
	}

	async insertStreamingFormat(
		format: StreamingFormat,
		media_id: number
	): Promise<number> {
		const query = `INSERT INTO StreamingFormat (url, expires_at, has_audio, has_video, width, height, fps, bitrate, mime_type, language, original, media_info_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`;
		const values = [
			format.url,
			format.expires_at,
			format.has_audio,
			format.has_video,
			format.width,
			format.height,
			format.fps,
			format.bitrate,
			format.mime_type,
			format.language,
			format.original,
			media_id,
		];

		try {
			const res = await this.db.run(query, values);

			return res.lastID;
		} catch (e) {
			error(
				"DatabaseManager",
				"Failed to insert streaming format. " + e.message
			);
			return -1;
		}
	}

	async getStreamingFormats(
		media_info_id: number
	): Promise<StreamingFormat[]> {
		const arr = [];

		const query = `SELECT * FROM StreamingFormat WHERE media_info_id = ?;`;
		const rows = await this.db.all(query, [media_info_id]);
		for (const streamingRow of rows) {
			const format: StreamingFormat = {
				url: streamingRow.url,
				expires_at: streamingRow.expires_at,
				has_audio: streamingRow.has_audio,
				has_video: streamingRow.has_video,
				width: streamingRow.width,
				height: streamingRow.height,
				fps: streamingRow.fps,
				bitrate: streamingRow.bitrate,
				mime_type: streamingRow.mime_type,
				language: streamingRow.language,
				original: streamingRow.original,
			};

			arr.push(format);
		}

		return arr;
	}

	#parseMediaRow(row: any): Media {
		const media = new Media();

		const mediaInfo: MediaInfo = {
			title: row.title,
			description: row.description,
			thumbnail: {
				url: row.thumbnail_url,
				alt: row.thumbnail_alt,
			},
			author: {
				name: row.author_name,
				provider: row.author_provider,
				provider_id: row.author_provider_id,
			},
			duration: row.duration,
		};

		media.info = mediaInfo;

		return media;
	}

	async getMedia(
		provider: string,
		provider_id: string
	): Promise<Media | undefined> {
		const query = `SELECT * FROM MediaInfo WHERE provider = ? AND provider_id = ?;`;
		const row = await this.db.get(query, [provider, provider_id]);
		if (row) {
			const media = this.#parseMediaRow(row);

			// Fetch associated StreamingFormat(s)
			const formats = await this.getStreamingFormats(row.id);
			for (const format of formats) {
				media.addFormat(format);
			}

			return media;
		}

		return undefined;
	}

	async pruneExpiredData() {
		// prune expired formats
		const expiredFormats = await this.db.all(
			"SELECT * FROM StreamingFormat WHERE expires_at <= ?;",
			Date.now()
		);
		const infoIds = new Set();
		for (const format of expiredFormats) {
			infoIds.add(format.media_info_id);
		}

		// const deleteCacheBy = -1; // -1 -> never
		// const expiredMedia = await this.db.all("SELECT * FROM MediaInfo WHERE date_added <= ?;", deleteCacheBy)
		// for (const media of expiredMedias) {
		// 	infoIds.add(media.id)
		// }

		for (const id of infoIds) {
			await this.db.run(
				`DELETE FROM StreamingFormat WHERE media_info_id = ?;`,
				id
			);
			// await db.run(`DELETE FROM MediaInfo WHERE id = ?;`, id)
		}

		return true;
	}

	async insertWatchHistory(media: Media, date: number, location: number) {
		const query =
			"INSERT INTO WatchHistory (media_info_id, date, location) VALUES (?, ?, ?);";
		const media_info_id = await this.insertMedia(media);
		const values = [media_info_id, date, location];

		try {
			const res = await this.db.run(query, values);

			return res.lastID;
		} catch (e) {
			error(
				"DatabaseManager",
				"Failed to insert watch history. " + e.message
			);
			return -1;
		}
	}

	/**
	 *
	 * @param from the start date
	 * @param to the end date, by default: `Date.now()`
	 */
	async getWatchHistory(
		from: number,
		to?: number
	): Promise<WatchHistoryElement[]> {
		const query = `SELECT WatchHistory.*, MediaInfo.*
			FROM WatchHistory
			INNER JOIN MediaInfo ON WatchHistory.media_info = MediaInfo.id
			WHERE WatchHistory.date >= ? AND WatchHistory.date <= ?;`;
		const values = [from, to ?? Date.now()];

		try {
			const res = await this.db.all(query, values);
			const arr: WatchHistoryElement[] = [];

			for (const row of res) {
				const media = this.#parseMediaRow(row);
				arr.push({
					date: row.date,
					location: row.location,
					media,
				});
			}

			return arr;
		} catch (e) {
			error(
				"DatabaseManager",
				"Failed to get watch history." + e.message
			);
			return undefined;
		}
	}

	async addSubscription(author: Author): Promise<number> {
		const query =
			"INSERT INTO Subscriptions (name, provider, provider_id, date_added) VALUES (?, ?, ?, ?);";
		const values = [
			author.name,
			author.provider,
			author.provider_id,
			Date.now(),
		];

		try {
			const res = await this.db.run(query, values);

			return res.lastID;
		} catch (e) {
			error("DatabaseManager", "Failed to add subscription." + e.message);
			return -1;
		}
	}

	async deleteSubscription(provider: string, provider_id: string) {
		const query =
			"DELETE FROM Subscriptions WHERE provider = ? AND provider_id = ?;";
		const values = [provider, provider_id];

		try {
			await this.db.run(query, values);

			return true;
		} catch (e) {
			error(
				"DatabaseManager",
				"Failed to delete subscription." + e.message
			);
			return false;
		}
	}

	async getSubscriptions(): Promise<SubscriptionElement[]> {
		const query = "SELECT * FROM Subscriptions;";

		try {
			const res = await this.db.all(query);
			const arr: SubscriptionElement[] = [];

			for (const row of res) {
				arr.push({
					author: {
						name: row.name,
						provider: row.provider,
						provider_id: row.provider_id,
					},
					date_added: row.date_added,
				});
			}

			return arr;
		} catch (e) {
			error(
				"DatabaseManager",
				"Failed to get subscriptions." + e.message
			);
			return undefined;
		}
	}
}
