import { Media } from "../media";
import { Extractor, UrlMatcher } from "../extractor";

export class DummyExtractor extends Extractor {
	getUrls(): UrlMatcher[] {
		return [{ hostname: "example.com", id: "dummy" }];
	}
	
	async getMediaFromUrl(id: string, url: URL): Promise<Media> {
		if (id == "dummy") {
			return await this.getMediaFromId("");
		}
		throw new Error("Invalid url id");
	}

	async getMediaFromId(id: string): Promise<Media> {
		const media = new Media();

		return media;
	}
}
