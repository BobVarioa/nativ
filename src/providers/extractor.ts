import { Media } from "./media";

export interface UrlMatcher {
	hostname?: string;
	hash?: string;
	href?: string;
	pathname?: string;
	protocol?: string;
	searchParams?: Record<string, string>;
	id: string;
}

export abstract class Extractor {
	constructor() {}
	
	abstract getMediaFromId(id: string): Promise<Media>;

	abstract getUrls(): UrlMatcher[];

	abstract getMediaFromUrl(id: string, url: URL): Promise<Media>;
}