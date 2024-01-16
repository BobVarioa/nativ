import GLib from "gtk:GLib@2.0";
import Gst from "gtk:Gst@1.0";
import Gtk from "gtk:Gtk@3.0";
import EventEmitter from "node:events";
import video from "video.gtk";
import { DebounceAsync, DebounceSync, Throttle } from "../../utils/decorators";
import {
	GlSinkBin,
	GtkSink,
	Playbin,
	parseNavigationEvent,
} from "../../utils/gstreamer";
import { error, expandObject, verbose } from "../../utils/log";

const GST_PLAY_FLAG_VIDEO = 1 << 0;
const GST_PLAY_FLAG_AUDIO = 1 << 1;

export class VideoController {
	constructor() {}

	videoWidget: Gtk.Widget;
	playbin: Playbin;

	createWidget() {
		video.init();

		const root = video.getObject("root");
		const videoContainer = video.getObject("videoContainer");
		videoContainer.add(this.videoWidget);

		const controls = video.getObject("controls");

		const pauseButton = video.getObject("pause");
		pauseButton.on("clicked", () => {
			this.togglePlay();
		});

		const seekbar = Gtk.Scale.newWithRange(
			Gtk.Orientation.HORIZONTAL,
			0,
			100,
			0.5
		);
		let seekBlocked = false;
		seekbar.connect("value-changed", () => {
			if (seekBlocked) {
				seekBlocked = false;
				return;
			}

			let amount = seekbar.getValue();
			this.seekTo(amount);
		});
		this.events.on("play", () => {
			GLib.timeoutAdd(GLib.PRIORITY_DEFAULT, 1000, () => {
				if (this.paused) return false;
				if (this.desiredPosition) return true;

				const duration = this.getDuration();
				seekbar.setRange(0, duration / Gst.SECOND);

				try {
					const position = this.getPosition();
					seekBlocked = true;
					seekbar.setValue(position / Gst.SECOND);
				} catch (e) {
					// ignore seek errors, because they can happen for all sorts of reasons
				}

				return true;
			});
		});

		controls.packEnd(seekbar, true, true, 2);
		return root;
	}

	buffering = false;

	init() {
		let widget: Gtk.Widget;

		const gtkglsink = Gst.ElementFactory.make(
			"gtkglsink",
			"gtkglsink"
		) as GtkSink;

		let vsink: Gst.Element;
		let glsink = Gst.ElementFactory.make(
			"glsinkbin",
			"glsinkbin"
		) as GlSinkBin;
		if (gtkglsink != null && glsink != null) {
			console.log("glsink");
			glsink.sink = gtkglsink;

			vsink = glsink;
			widget = gtkglsink.widget;
		} else {
			console.log("gtksink");
			let gtksink = Gst.ElementFactory.make(
				"gtksink",
				"gtksink"
			) as GtkSink;

			if (gtksink == null) {
				console.error("dead");
				throw 0;
			}

			vsink = gtksink;
			widget = gtksink.widget;
		}

		const playbin = Gst.ElementFactory.make("playbin3", "src") as Playbin;

		if (playbin == null) {
			error("GStreamer", "Failed to initalize playbin");
			throw 0;
		}

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
						// this.playbin.setState(Gst.State.PLAYING);
						this.buffering = false;
						verbose("GStreamer", "BUFFERING_END");
					} else if (!this.buffering) {
						this.buffering = true;
						// this.playbin.setState(Gst.State.PAUSED);
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
							if (nav.type == "mouse-move") break;
							verbose(
								"GStreamer",
								`GstNavigationMessage (${expandObject(nav)})`
							);

							if (nav.type == "mouse-button-press" && nav.button == 1) {
								this.togglePlay()
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

				default:
					verbose("GStreamer", Gst.MessageType[msg.type]);
					break;
			}
			return true;
		});

		playbin.instant_uri = true;
		playbin.flags |= GST_PLAY_FLAG_VIDEO | GST_PLAY_FLAG_AUDIO;
		playbin.video_sink = vsink;

		this.videoWidget = widget;
		this.playbin = playbin;
	}

	events = new EventEmitter();

	setUri(uri: string) {
		this.playbin.uri = uri;
		this.events.emit("media_changed", uri);
	}

	@DebounceSync(1000)
	getDuration() {
		const [success, duration] = this.playbin.queryDuration(Gst.Format.TIME);
		if (success) {
			return duration;
		}
		throw new Error("failed to get duration");
	}

	@DebounceSync(500)
	getPosition() {
		const [success, position] = this.playbin.queryPosition(Gst.Format.TIME);
		if (success) {
			return position;
		}
		throw new Error("failed to get position");
	}

	desiredPosition = 0;

	@Throttle(750, function (secs) {
		this.desiredPosition = secs;
	})
	seekTo(secs: number) {
		if (this.buffering) {
			verbose("VideoController", `Seek Failed, Buffering (${secs})`);
			setTimeout(() => this.seekTo(secs), 100);
		} else {
			this.desiredPosition = 0;

			let success = this.playbin.seekSimple(
				Gst.Format.TIME,
				Gst.SeekFlags.FLUSH |
					Gst.SeekFlags.ACCURATE |
					Gst.SeekFlags.TRICKMODE,
				secs * Gst.SECOND
			);
			this.events.emit("seek", secs);
			verbose("VideoController", `Seek Performed (${secs})`);
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
			return res;
		}
		return Gst.StateChangeReturn.SUCCESS;
	}

	pause() {
		if (!this.paused) {
			this.paused = true;
			let res = this.playbin.setState(Gst.State.PAUSED);
			this.events.emit("pause", res);
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
