import GLib from "gtk:GLib@2.0";
import Gst from "gtk:Gst@1.0";
import Gtk from "gtk:Gtk@3.0";
import EventEmitter from "node:events";
import { DebounceAsync, DebounceSync, Throttle } from "../../utils/decorators";
import {
	GlSinkBin,
	GtkSink,
	Playbin,
	parseNavigationEvent,
} from "../../utils/gstreamer";
import { error, expandObject, verbose } from "../../utils/log";
import { clientInfo } from "../../providers/clientInfo";
import { Media } from "../../providers/media";

const GST_PLAY_FLAG_VIDEO = 1 << 0;
const GST_PLAY_FLAG_AUDIO = 1 << 1;

export class VideoController {
	constructor() {}

	playbin: Playbin;

	// muted = false;
	volume = 1;

	buffering = false;

	video_window_handle = 0;

	init() {
		const playbin = Gst.ElementFactory.make("playbin3", "src") as Playbin;
		this.playbin = playbin;

		if (playbin == null) {
			error("GStreamer", "Failed to initalize playbin");
			throw 0;
		}

		playbin.connect("source-setup", (ele) => {
			if (!ele.name.startsWith("souphttpsrc")) return;
			ele.userAgent = clientInfo.data.userAgent;
		});
		// playbin.setUserAgent(clientInfo.data.userAgent);

		playbin.getBus().addWatch(GLib.PRIORITY_DEFAULT, (bus, msg) => {
			switch (msg.type) {
				case Gst.MessageType.ERROR:
					let [err, m] = msg.parseError();
					throw new Error(err.message + "\n" + m);

				case Gst.MessageType.EOS:
					// end of stream
					verbose("GStreamer", "EOS");
					break;

				case Gst.MessageType.TAG:
					const tag = msg.parseTag();
					break;

				case Gst.MessageType.BUFFERING:
					const percent = msg.parseBuffering();

					if (percent == 100) {
						this.playbin.setState(Gst.State.PLAYING);
						this.buffering = false;
						verbose("GStreamer", "BUFFERING_END");
					} else if (!this.buffering) {
						this.buffering = true;
						this.playbin.setState(Gst.State.PAUSED);
						verbose("GStreamer", "BUFFERING_START");
					}
					break;

				case Gst.MessageType.LATENCY:
					this.playbin.recalculateLatency();
					verbose("GStreamer", "LATENCY");
					break;

				case Gst.MessageType.QOS:
					let [format, dropped, processed] = msg.parseQosStats();
					verbose(
						"GStreamer",
						`${Gst.Format[format]}: dropped ${dropped}, processed ${processed}`
					);
					break;

				case Gst.MessageType.ELEMENT: {
					const structure = msg.getStructure();

					const name = structure.getName();
					switch (name) {
						case "GstNavigationMessage":
							let nav = parseNavigationEvent(structure);
							if (!nav) break;

							// so they don't explode the log
							if (nav.type == "mouse-move") {
								verbose(
									"GStreamer",
									`GstNavigationMessage (${expandObject(
										nav
									)})`,
									1
								);
							} else {
								verbose(
									"GStreamer",
									`GstNavigationMessage (${expandObject(
										nav
									)})`
								);
							}

							if (
								nav.type == "mouse-button-press" &&
								nav.button == 1
							) {
								this.togglePlay();
							}

							if (nav.type == "mouse-move") {
								this.events.emit("mouse-move", nav);
							}

							break;

						default:
							verbose(
								"GStreamer",
								`${name} (${structure.toString()})`
							);
							break;
					}
					break;
				}

				case Gst.MessageType.STATE_CHANGED:
					let [oldS, newS, pendingS] = msg.parseStateChanged();
					verbose(
						"GStreamer",
						`${Gst.State[oldS]} -> ${Gst.State[newS]} (${Gst.State[pendingS]})`
					);
					break;

				case Gst.MessageType.RESET_TIME:
					const time = msg.parseResetTime();
					verbose("GStreamer", `RESET_TIME (${time})`);
					break;

				case Gst.MessageType.STREAM_STATUS:
					const [status, element] = msg.parseStreamStatus();
					// this might be a little overkill but it works
					this.durationDirty = true;
					verbose(
						"GStreamer",
						`STREAM ${Gst.StreamStatusType[status]} ${element}`
					);
					break;

				default:
					verbose("GStreamer", Gst.MessageType[msg.type]);
					break;
			}
			return true;
		});

		playbin.instant_uri = true;
		playbin.flags |= GST_PLAY_FLAG_VIDEO | GST_PLAY_FLAG_AUDIO;
	}

	events = new EventEmitter();

	setMedia(media: Media) {
		this.durationDirty = true;

		this.playbin.uri = media.getFormat(true, true).url;
		this.playbin.setState(Gst.State.READY);
		this.events.emit("media_changed", media);
	}

	setUri(uri: string) {
		this.durationDirty = true;
		this.playbin.uri = uri;

		this.playbin.setState(Gst.State.READY);
		this.events.emit("media_changed", uri);
	}

	durationDirty = true;
	durationCache = 0;
	getDuration() {
		if (this.durationDirty) {
			const [success, duration] = this.playbin.queryDuration(
				Gst.Format.TIME
			);
			if (success) {
				this.durationDirty = false;
				this.durationCache = duration;
				return duration;
			}
			return -1;
		}
		return this.durationCache;
	}

	@DebounceSync(500)
	getPosition() {
		const [success, position] = this.playbin.queryPosition(Gst.Format.TIME);
		if (success) {
			return position;
		}
		return -1;
	}

	seeking = false;

	@Throttle(750, function (secs) {
		verbose("VideoController", `Seek Requested (to ${secs})`);
		this.seeking = true;
	})
	seekTo(secs: number) {
		if (this.buffering) {
			verbose("VideoController", `Seek Failed, Buffering (to ${secs})`);
			setTimeout(() => this.seekTo(secs), 100);
		} else {
			this.seeking = false;

			// this.playbin.seekSimple(
			// 	Gst.Format.TIME,
			// 	Gst.SeekFlags.FLUSH | Gst.SeekFlags.ACCURATE,
			// 	secs * Gst.SECOND
			// );
			let success = this.playbin.seek(
				1.0,
				Gst.Format.TIME,
				Gst.SeekFlags.FLUSH | Gst.SeekFlags.ACCURATE,
				Gst.SeekType.SET,
				secs * Gst.SECOND,
				Gst.SeekType.NONE,
				Gst.CLOCK_TIME_NONE
			);
			this.events.emit("seek", secs);
			verbose("VideoController", `Seek Performed (to ${secs})`);
			if (!success) {
				error("GStreamer", "failed to seek");
			}
		}
	}

	paused = true;

	play() {
		if (this.paused) {
			this.paused = false;
			let res = this.playbin.setState(Gst.State.PLAYING);
			this.events.emit("play", res);
			verbose("VideoController", "Play");
			return res;
		}
		return Gst.StateChangeReturn.SUCCESS;
	}

	pause() {
		if (!this.paused) {
			this.paused = true;
			let res = this.playbin.setState(Gst.State.PAUSED);
			this.events.emit("pause", res);
			verbose("VideoController", "Pause");
			return res;
		}
		return Gst.StateChangeReturn.SUCCESS;
	}

	togglePlay() {
		if (this.paused) {
			return this.play();
		}
		return this.pause();
	}
}
