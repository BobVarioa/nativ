import { Extractor, UrlMatcher } from "./extractor";
import { DummyExtractor } from "./dummy/extractor";
import { YoutubeExtractor } from "./youtube/extractor";

export const ExtractorMap = {
	dummy: new DummyExtractor(),
	youtube: new YoutubeExtractor(),
} as const;

export function getMediaFromUrl(url: string) {
	const u = new URL(url);
	for (const extractor of Object.values(ExtractorMap)) {
		const matchers = extractor.getUrls();

		top: for (const matcher of matchers) {
			if (matcher.hostname && matcher.hostname != u.hostname) continue;
			if (matcher.hash && matcher.hash != u.hash) continue;
			if (matcher.href && matcher.href != u.href) continue;
			if (matcher.pathname && matcher.pathname != u.pathname) continue;
			if (matcher.protocol && matcher.protocol != u.protocol) continue;

			if (matcher.searchParams) {
				for (const [k,v] of Object.entries(matcher.searchParams)) {
					if (u.searchParams[k] != v) continue top;
				}
			}

			return extractor.getMediaFromUrl(matcher.id, u);
		}
	}

	return undefined;
}
