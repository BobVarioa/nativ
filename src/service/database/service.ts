import { Author, Media, MediaInfo, StreamingFormat } from "../../providers/media";
import { DiskDatabase } from "./disk";

export interface WatchHistoryElement {
	media: Media;
	date: number;
	location: number;
}

export interface SubscriptionElement {
	author: Author;
	date_added: number;
}

export interface Database {
	/**
	 * The function that must be called before anything else in the service
	 * @returns `true` if successful, `false` otherwise
	 */
	initialize(): Promise<boolean>;

	/**
	 * 
	 * @param media The media to insert
	 * @returns A unique identifier to refer to this media
	 */
	insertMedia(media: Media): Promise<number>;

	/**
	 * 
	 * @param format The streaming format to insert
	 * @param media_id A media identifier to refer to a media in the database
	 */
	insertStreamingFormat(
		format: StreamingFormat,
		media_id: number
	): Promise<number>;

	getStreamingFormats(media_info_id: number): Promise<StreamingFormat[]>;

	getMedia(provider: string, provider_id: string): Promise<Media | undefined>;

	pruneExpiredData(): Promise<boolean>;

	insertWatchHistory(media: Media, date: number, location: number): Promise<number>;

	/**
	 *
	 * @param from the start date
	 * @param to the end date, by default: `Date.now()`
	 */
	getWatchHistory(from: number, to?: number): Promise<WatchHistoryElement[]>;

	addSubscription(author: Author): Promise<number>;

	deleteSubscription(provider: string, provider_id: string): Promise<boolean>;

	getSubscriptions(): Promise<SubscriptionElement[]>;
}

export const DatabaseManager = new DiskDatabase();