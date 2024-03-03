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

function formatTimestamp(ms: number) {
	let timestamp = "";

	const HOUR = 1000 * 60 * 60;
	const MINUTE = 1000 * 60;
	const SECOND = 1000;

	const hours = Math.floor(ms / HOUR);
	if (hours > 1) {
		timestamp += hours + ":";
	}
	const mins = Math.floor((ms - hours * HOUR) / MINUTE);
	const secs = Math.floor((ms - hours * HOUR - mins * MINUTE) / SECOND);
	timestamp +=
		mins.toString().padStart(2, "0") +
		":" +
		secs.toString().padStart(2, "0");

	return timestamp;
}

export class VideoController {
	constructor() {}

	videoWidget: Gtk.Widget;
	playbin: Playbin;

	seekBlocked = false;
	#createSeekbar(): Gtk.Scale {
		const seekbar = Gtk.Scale.newWithRange(
			Gtk.Orientation.HORIZONTAL,
			0,
			100,
			0.5
		);
		seekbar.setDrawValue(false);
		seekbar.connect("value-changed", () => {
			if (this.seekBlocked) {
				this.seekBlocked = false;
				return;
			}

			let amount = seekbar.getValue();
			this.seekTo(amount);
		});
		return seekbar;
	}

	controls: Gtk.Box = undefined;
	controlsActive = 0;
	autohide = true;
	autohideTimer = -1;

	showControls() {
		this.controls.visible = true;
		this.controlsActive = 5;
		if (this.autohide) {
			this.controls.visible = true;
			if (this.autohideTimer != -1) GLib.sourceRemove(this.autohideTimer);
			this.autohideTimer = GLib.timeoutAdd(
				GLib.PRIORITY_DEFAULT,
				1000,
				() => {
					if (this.controlsActive < 1) {
						this.controls.visible = false;
						this.autohideTimer = -1;
						return false;
					}
					this.controlsActive--;
					return true;
				}
			);
		}
	}

	hideControls() {
		this.controls.visible = false;
		this.controlsActive = 0;
	}

	#createPlayButton() {
		const playButton = new Gtk.Button();
		const playButtonImg = new Gtk.Image();
		playButtonImg.setFromIconName(
			"media-playback-start",
			Gtk.IconSize.BUTTON
		);
		playButton.add(playButtonImg);

		playButton.receivesDefault = true;
		playButton.on("clicked", () => {
			this.togglePlay();
		});
		return [playButton, playButtonImg] as const;
	}

	// muted = false;
	volume = 1;

	createWidget() {
		const root = new Gtk.ScrolledWindow();

		const videoBox = new Gtk.Box()
		videoBox.hexpand = true;
		videoBox.vexpand = true;
		videoBox.orientation = Gtk.Orientation.VERTICAL;
		root.add(videoBox)
		
		const videoRoot = new Gtk.Overlay();
		videoRoot.hexpand = true;
		videoRoot.vexpand = true;

		videoRoot.heightRequest = 720;
		root.connect("size-allocate", (allocation) => {
			videoRoot.heightRequest = allocation.height;
		})

		videoBox.packStart(videoRoot, false, false, 0)

		const title = new Gtk.Label();
		videoBox.packStart(title, false, false, 2)

		const description = new Gtk.TextView();
		const descBuff = description.getBuffer();
		this.events.on("media_changed", (media: Media) => {
			descBuff.setText(media.info.description, -1);
		})
		videoBox.packStart(description, false, false, 2)

		const videoContainer = new Gtk.Box();
		videoContainer.hexpand = true;
		videoContainer.vexpand = true;
		videoRoot.add(videoContainer);

		videoContainer.packStart(this.videoWidget, true, true, 2);

		const controlsContainer = new Gtk.Box();
		controlsContainer.orientation = Gtk.Orientation.VERTICAL;
		controlsContainer.hexpand = true;
		controlsContainer.valign = Gtk.Align.END;
		controlsContainer.name = "controlsContainer";

		const seekbar = this.#createSeekbar();
		controlsContainer.add(seekbar);

		const controls = new Gtk.Box();
		controls.orientation = Gtk.Orientation.HORIZONTAL;
		controls.hexpand = true;
		controls.spacing = 10;
		controls.name = "controls";
		controlsContainer.add(controls);

		const [playButton, playButtonImg] = this.#createPlayButton();
		controls.add(playButton);

		const volumeButton = new Gtk.VolumeButton();
		volumeButton.setValue(volumeButton.getAdjustment().getUpper());
		volumeButton.connect("value-changed", () => {
			this.volume = volumeButton.getValue();
			this.playbin.volume = volumeButton.getValue();
		});
		controls.add(volumeButton)
		
		const timestamp = new Gtk.Label();
		timestamp.label = "0:00/0:00";
		controls.add(timestamp);

		videoRoot.addOverlay(controlsContainer);
		this.controls = controlsContainer;

		controlsContainer.on("notify::has-focus", () => {
			this.controlsActive = 5;
		});

		const playerTitleContainer = new Gtk.Box();
		playerTitleContainer.orientation = Gtk.Orientation.HORIZONTAL;
		playerTitleContainer.hexpand = true;
		playerTitleContainer.valign = Gtk.Align.START;
		playerTitleContainer.name = "titleContainer";

		const playerTitle = new Gtk.Label();
		playerTitle.name = "title"
		this.events.on("media_changed", (media: Media) => {
			playerTitle.label = media.info.title;
			title.label = media.info.title;
		})
		playerTitleContainer.add(playerTitle)

		videoRoot.addOverlay(playerTitleContainer)

		this.events.on("pause", () => {
			playButtonImg.setFromIconName(
				"media-playback-start",
				Gtk.IconSize.BUTTON
			);
			this.showControls();
		});

		this.events.on("play", () => {
			this.showControls();
			playButtonImg.setFromIconName(
				"media-playback-pause",
				Gtk.IconSize.BUTTON
			);

			GLib.timeoutAdd(GLib.PRIORITY_DEFAULT, 1000, () => {
				if (this.paused) return false;
				if (this.seeking) return true;

				const duration = this.getDuration();
				if (duration != -1) {
					seekbar.setRange(0, duration / Gst.SECOND);

					try {
						const position = this.getPosition();
						this.seekBlocked = true;
						seekbar.setValue(position / Gst.SECOND);
						timestamp.label = `${formatTimestamp(
							position / Gst.MSECOND
						)}/${formatTimestamp(duration / Gst.MSECOND)}`;
					} catch (e) {
						// ignore seek errors, because they can happen for all sorts of reasons
					}
				}

				return true;
			});
		});

		return root;
	}

	buffering = false;

	video_window_handle = 0;

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
								const currentCaps = this.playbin.video_sink
									.getStaticPad("sink")
									.getCurrentCaps();
								const [, videoHeight] = currentCaps
									.getStructure(0)
									.getInt("height");
								if (nav.pointer_y > videoHeight - 100) {
									this.showControls();
								}
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
		playbin.video_sink = vsink;
		this.videoWidget = widget;
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

	setUserAgent(userAgent: string) {}
}
