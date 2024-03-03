import { ExtractorMap, getMediaFromUrl } from "./providers";
import sqlite3 from "sqlite3";
import { Database, open } from "sqlite";
import { verbose } from "../utils/log";

export interface Image {
	url: string;
	alt?: string;
}

export interface Author {
	name: string;
	provider: string;
	provider_id: string;
}
// e.g. { name: "Bob Varioa", provider: "youtube", provider_id: "@bobvarioa" }

export interface MediaInfo {
	title: string;
	description: string;
	thumbnail?: Image;
	author: Author;
	duration?: number;
}

export interface StreamingFormat {
	url: string;
	expires_at: number;
	has_audio: boolean;
	has_video: boolean;

	width?: number;
	height?: number;
	fps?: number;
	bitrate?: number;

	mime_type?: string;

	language?: string;
	original?: boolean;
}

export class Media {
	info: MediaInfo = {} as MediaInfo;
	info_provider: string;
	info_provider_id: string;

	provider: string;
	provider_id: string;

	cachable: boolean;

	readonly formats: StreamingFormat[] = [];

	constructor() {}

	static database: Database<sqlite3.Database, sqlite3.Statement>;

	static async initDB() {
		const db = await open({
			filename: "./.cache/cache.db",
			driver: sqlite3.cached.Database,
		});

		await db.exec(`
		CREATE TABLE IF NOT EXISTS MediaInfo (
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
			UNIQUE(provider, provider_id)
		);
		CREATE TABLE IF NOT EXISTS StreamingFormat (
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

		Media.database = db;
	}

	static async #insertIntoDB(media: Media) {
		const db = Media.database;

		const insertMediaQuery = `INSERT INTO MediaInfo (provider, provider_id, title, description, thumbnail_url, thumbnail_alt, author_name, author_provider, author_provider_id, duration) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
		const mediaInfoValues = [
			media.provider,
			media.provider_id,
			media.info.title,
			media.info.description,
			media.info.thumbnail.url,
			media.info.thumbnail.alt,
			media.info.author.name,
			media.info.author.provider,
			media.info.author.provider_id,
			media.info.duration,
		];

		try {
			const res = await db.run(insertMediaQuery, mediaInfoValues);

			for (const format of media.formats) {
				const insertStreamingFormat = `INSERT INTO StreamingFormat (url, expires_at, has_audio, has_video, width, height, fps, bitrate, mime_type, language, original, media_info_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
				const streamingFormatValues = [
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
					res.lastID,
				];

				try {
					await db.run(insertStreamingFormat, streamingFormatValues);
				} catch (err) {
					err(
						"MediaCache",
						"Failed to insert streaming format. " + err.message
					);
				}
			}
		} catch (err) {
			err("MediaCache", "Failed to insert media info. " + err.message);
		}

		verbose("MediaCache", "Inserted media into database.");
	}

	static async #getFromDB(
		provider: string,
		provider_id: string
	): Promise<Media | undefined> {
		const db = Media.database;
		const media = new Media();

		const query = `SELECT * FROM MediaInfo WHERE provider = ? AND provider_id = ?`;
		const row = await db.get(query, [provider, provider_id]);
		if (row) {
			// Construct MediaInfo object
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

			// Fetch associated StreamingFormat(s)
			const streamingQuery = `SELECT * FROM StreamingFormat WHERE media_info_id = ?`;
			const streamingRows = await db.all(streamingQuery, [row.id]);
			for (const streamingRow of streamingRows) {
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

				media.addFormat(format);
			}

			return media;
		}

		return undefined;
	}

	static async fromProvider(
		provider: keyof typeof ExtractorMap,
		provider_id: string,
		fromCache: boolean = true
	): Promise<Media> {
		if (fromCache) {
			verbose("MediaCache", "Attempting to get media from database.");
			const m = await Media.#getFromDB(provider, provider_id);
			if (m) {
				verbose("MediaCache", "Success!");
				return m;
			}
			verbose("MediaCache", "Failed to get media from database.");
		}

		const media = await ExtractorMap[provider].getMediaFromId(provider_id);
		media.provider = provider;
		media.provider_id = provider_id;

		if (media.cachable) {
			verbose("MediaCache", "Attempting to insert media into database.");
			Media.#insertIntoDB(media);
		}
		return media;
	}

	static async fromUrl(url: string): Promise<Media> {
		return await getMediaFromUrl(url);
	}

	addInfo<T extends keyof MediaInfo>(prop: T, value: MediaInfo[T]) {
		this.info[prop] = value;
	}

	getFormat(audio: boolean, video: boolean): StreamingFormat {
		const fs = [];

		for (const f of this.formats) {
			if (f.has_audio && f.has_video && audio && video) {
				fs.push(f);
			} else if (f.has_audio && audio && !video) {
				fs.push(f);
			} else if (f.has_video && !audio && video) {
				fs.push(f);
			}
		}

		return this.formats.toSorted(
			(a, b) => a.bitrate ?? 0 - b.bitrate ?? 0
		)[0];
	}

	addFormat(format: StreamingFormat) {
		this.formats.push(format);
	}
}
