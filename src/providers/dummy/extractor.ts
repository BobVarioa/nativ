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

		if (id == "big-buck-bunny") {
			media.addInfo("title", "Big Buck Bunny");
			media.addInfo(
				"description",
				"Oh god, why do so many people use this as test footage, it really, *really* looks awful.\nI mean okay, in all honesty, it does have some merit. It's actually really cool that someone made an entire open source animated movie! (all in blender too!)\nBut really, I do _not_ like how it looks."
			);
			media.addInfo("author", {
				name: "Blender Institute",
				provider: "dummy",
				provider_id: "blender_insitute",
			});
			media.addInfo("duration", -1);
			media.addFormat({
				expires_at: -1,
				has_audio: true,
				has_video: true,
				url: "http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
			});
		} else {
			throw new Error(`Unknown media id "${id}"`)
		}

		return media;
	}
}
