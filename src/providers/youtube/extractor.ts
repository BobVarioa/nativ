import { clientInfo } from "../clientInfo";
import { Media, Image } from "../media";
import { Extractor, UrlMatcher } from "../extractor";
import { Innertube, UniversalCache } from "youtubei.js";
import Gtk from "gtk:Gtk@3.0";
import Gdk from "gtk:Gdk@3.0";
import { verbose } from "../../utils/log";
import GLib from "gtk:GLib@2.0";
import { openDialog } from "../../utils/dialog";

export class YoutubeExtractor extends Extractor {
	getUrls(): UrlMatcher[] {
		return [
			// example: https://www.youtube.com/watch?v=<id>
			{ hostname: "youtube.com", pathname: "/watch", id: "watch" },
			// example: https://youtu.be/<id>
			{ hostname: "youtu.be", id: "youtu.be" },
		];
	}

	async getMediaFromUrl(id: string, url: URL): Promise<Media> {
		switch (id) {
			case "watch":
				return await this.getMediaFromId(url.searchParams.get("v"));
			case "youtu.be":
				return await this.getMediaFromId(url.pathname.slice(1));

			default:
				throw new Error("unknown url id");
		}
	}

	initalized = false;

	innertube: Innertube;

	async init() {
		const yt = await Innertube.create({
			cache: new UniversalCache(true, "./.cache"),
		});

		
		const msg = new Gtk.MessageDialog({ modal: true, buttons: Gtk.ButtonsType.NONE });
		yt.session.on("auth-pending", (data) => {
			verbose("yt-auth", "here")

			GLib.timeoutAdd(GLib.PRIORITY_DEFAULT, 1, () => {
				msg.text = `Open this link (${data.verification_url}) in your browser, and enter the code ${data.user_code} to authenticate`;

				const res = msg.run();
				msg.destroy();
			
				return false
			})
		});

		yt.session.on("auth", ({ credentials }) => {
			msg.close();
		});

		yt.session.on("update-credentials", async ({ credentials }) => {
			await yt.session.oauth.cacheCredentials();
		});

		await yt.session.signIn();
		await yt.session.oauth.cacheCredentials();

		if (yt.session.context.client.userAgent) {
			clientInfo.data.userAgent = yt.session.context.client.userAgent;
		}

		this.innertube = yt;
		this.initalized = true;
	}

	async getMediaFromId(id: string): Promise<Media> {
		if (!this.initalized) {
			await this.init();
		}

		const info = await this.innertube.getInfo(id);

		const media = new Media();
		media.cachable = true;
		media.addInfo("title", info.basic_info.title);
		media.addInfo("description", info.basic_info.short_description);
		const thumb = info.basic_info.thumbnail;
		if (thumb) {
			// TODO: filter through thumbs
			media.addInfo("thumbnail", { url: thumb[0].url });
		}
		media.addInfo("author", {
			name: info.basic_info.channel.name,
			provider: "youtube",
			provider_id: info.basic_info.channel.id,
		});

		for (const f of info.streaming_data.formats) {
			media.addFormat({
				url: f.url,
				expires_at: parseInt(
					new URL(f.url).searchParams.get("expire") ?? "0"
				),
				has_audio: f.has_audio ?? false,
				has_video: f.has_video ?? false,
				bitrate: f.bitrate,
				mime_type: f.mime_type,
				fps: f.fps,
				width: f.width,
				height: f.height,
				language: f.language,
				original: f.is_original,
			});
		}

		media.addInfo("duration", info.basic_info.duration)

		return media;
	}
}
