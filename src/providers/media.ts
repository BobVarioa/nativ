import { ExtractorMap, getMediaFromUrl } from "./providers";
import sqlite3 from "sqlite3";
import { Database, open } from "sqlite";
import { error, verbose } from "../utils/log";
import { DatabaseManager } from "../service/database/service";

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

	cachable = false;

	readonly formats: StreamingFormat[] = [];

	constructor() {}

	static database: Database<sqlite3.Database, sqlite3.Statement>;


	static async fromProvider(
		provider: keyof typeof ExtractorMap,
		provider_id: string,
		fromCache: boolean = true
	): Promise<Media> {
		if (fromCache) {
			verbose("MediaCache", "Looking for cached media.");
			const m = await DatabaseManager.getMedia(provider, provider_id);
			if (m) {
				verbose("MediaCache", "Found cached media.");
				return m;
			}
			verbose("MediaCache", "No cached media.");
		}

		const media = await ExtractorMap[provider].getMediaFromId(provider_id);
		media.provider = provider;
		media.provider_id = provider_id;

		if (media.cachable) {
			verbose("MediaCache", "Attempting to cache media.");
			if (DatabaseManager.insertMedia(media)) {
				error("MediaCache", "Failed to cache media.");
			} else {
				verbose("MediaCache", "Cached media.");
			}

	
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
