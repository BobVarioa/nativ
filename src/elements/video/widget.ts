import GLib from "gtk:GLib@2.0";
import { VideoController } from "./controller";
import Gtk from "gtk:Gtk@3.0";
import { GlSinkBin, GtkSink } from "../../utils/gstreamer";
import Gst from "gtk:Gst@1.0";
import { Media } from "../../providers/media";
import { info, verbose } from "../../utils/log";

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

export class VideoWidget {
	constructor(public controller: VideoController) {}

	videoWidget: Gtk.Widget;

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
			this.controller.seekTo(amount);
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
			this.controller.togglePlay();
		});
		return [playButton, playButtonImg] as const;
	}

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
			verbose("GStreamer", "Using glsink");
			glsink.sink = gtkglsink;

			vsink = glsink;
			widget = gtkglsink.widget;
		} else {
			verbose("GStreamer", "Using gtksink");
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
		this.controller.playbin.video_sink = vsink;
		this.videoWidget = widget;
	}

	createWidget() {
		const root = new Gtk.ScrolledWindow();

		const videoBox = new Gtk.Box();
		videoBox.hexpand = true;
		videoBox.vexpand = true;
		videoBox.orientation = Gtk.Orientation.VERTICAL;
		root.add(videoBox);

		const videoRoot = new Gtk.Overlay();
		videoRoot.hexpand = true;
		videoRoot.vexpand = true;

		videoRoot.heightRequest = 720;
		root.connect("size-allocate", (allocation) => {
			videoRoot.heightRequest = allocation.height;
		});

		videoBox.packStart(videoRoot, false, false, 0);

		const title = new Gtk.Label();
		videoBox.packStart(title, false, false, 2);

		const description = new Gtk.TextView();
		const descBuff = description.getBuffer();
		this.controller.events.on("media_changed", (media: Media) => {
			descBuff.setText(media.info.description, -1);
		});
		videoBox.packStart(description, false, false, 2);

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
			this.controller.volume = volumeButton.getValue();
			this.controller.playbin.volume = volumeButton.getValue();
		});
		controls.add(volumeButton);

		const timestamp = new Gtk.Label();
		timestamp.label = "0:00/0:00"; // TODO: base on media.duration
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

		// const playerTitle = new Gtk.Label();
		// playerTitle.name = "title"
		this.controller.events.on("media_changed", (media: Media) => {
			// playerTitle.label = media.info.title;
			title.label = media.info.title;
		});
		// playerTitleContainer.add(playerTitle)

		videoRoot.addOverlay(playerTitleContainer);

		this.controller.events.on("pause", () => {
			playButtonImg.setFromIconName(
				"media-playback-start",
				Gtk.IconSize.BUTTON
			);
			this.showControls();
		});

		this.controller.events.on("play", () => {
			this.showControls();
			playButtonImg.setFromIconName(
				"media-playback-pause",
				Gtk.IconSize.BUTTON
			);

			GLib.timeoutAdd(GLib.PRIORITY_DEFAULT, 1000, () => {
				if (this.controller.paused) return false;
				if (this.controller.seeking) return true;

				const duration = this.controller.getDuration();
				if (duration != -1) {
					seekbar.setRange(0, duration / Gst.SECOND);

					try {
						const position = this.controller.getPosition();
						this.seekBlocked = true;
						seekbar.setValue(position / Gst.SECOND);
						
						const currentTime = formatTimestamp(
							position / Gst.MSECOND
						);
						const totalTime = formatTimestamp(
							duration / Gst.MSECOND
						);
						timestamp.label = `${currentTime}/${totalTime}`;
					} catch (e) {
						// ignore seek errors, because they can happen for all sorts of reasons
					}
				}

				return true;
			});
		});

		this.controller.events.on("mouse-move", (nav) => {
			const vsink = this.controller.playbin.video_sink;
			const currentCaps = vsink.getStaticPad("sink").getCurrentCaps();
			const [, videoHeight] = currentCaps.getStructure(0).getInt("height");
			if (nav.pointer_y > videoHeight - 100) {
				this.showControls();
			}
		});

		return root;
	}
}
