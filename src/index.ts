import process from "node:process";
import path from "node:path";
import gi from "node-gtk";
import GLib from "gtk:GLib@2.0";
import Gst from "gtk:Gst@1.0";
import Gtk from "gtk:Gtk@3.0";
import Gdk from "gtk:Gdk@3.0";
import { VideoController } from "./elements/video/controller";
import { openDialog } from "./utils/dialog";
import { processCommandArgs } from "./utils/args";
import { expandObject, setLogLevel, verbose } from "./utils/log";
import { Media } from "./providers/media";
import { clientInfo } from "./providers/clientInfo";
import { VideoWidget } from "./elements/video/widget";
import { DatabaseManager } from "./service/database/service";

const flags = processCommandArgs(process.argv.slice(2));

for (const [flag, value] of Object.entries(flags)) {
	switch (flag) {
		case "v":
			if (new Set(flag).size == 1) {
				setLogLevel(flag.length);
			}
			break;

		case "verbose":
			setLogLevel(value == true ? 4 : value);
			break;

		case "q":
		case "quiet":
		case "silent":
			setLogLevel(0);
			break;
	}
}

if (!clientInfo.load()) {
	// TODO: store information and regen as necessary
	clientInfo.genClientInfo();
	// clientInfo.store()
}

if (process.env.XDG_SESSION_TYPE == "x11") {
	gi.require("GdkX11", "3.0");
}

gi.startLoop();
Gtk.init(process.argv);
Gst.init(process.argv);

const display = Gdk.Display.getDefault();
const screen = display.getDefaultScreen();
const css = new Gtk.CssProvider();
css.loadFromPath(path.join(__dirname, "../static/style.css"));
Gtk.StyleContext.addProviderForScreen(screen, css, 1);

const gstVersion = Gst.version();
console.log(
	`GStreamer Version: ${gstVersion[0]}.${gstVersion[1]}.${gstVersion[2]}`
);

const videoController = new VideoController();
videoController.init();

const root = new Gtk.Box();

const win = new Gtk.Window({
	title: "Nativ",
	window_position: Gtk.WindowPosition.CENTER,
} as any);
win.on("delete-event", () => {
	videoController.pause(); // ignore the result cuz the user wants to exit, so doesn't *really* matter

	// save video position

	if (!openDialog("Are you sure you want to quit?")) {
		videoController.play();
		return true;
	}

	Gtk.mainQuit();
	return true;
});
win.setDefaultSize(1280, 720);

const videoRenderer = new VideoWidget(videoController);
videoRenderer.init();
const videoWidget = videoRenderer.createWidget();
root.add(videoWidget);
win.add(root);

win.showAll();

(async () => {
	await DatabaseManager.initialize();
	const media = await Media.fromProvider("dummy", "big-buck-bunny");
	videoController.setMedia(media);
})();

let fullscreen = false;

win.connect("key-press-event", (event) => {
	verbose("keypress", `str: ${event.string}, code: ${event.keyval}`);
	switch (event.string) {
		case "f":
			if (fullscreen) {
				win.unfullscreen();
				fullscreen = false;
			} else {
				win.fullscreen();
				fullscreen = true;
			}
			break;

		case " ":
			videoController.togglePlay();
			break;
	}

	return true;
});

// videoController.videoWidget.realize()

// if (videoController.play() == Gst.StateChangeReturn.FAILURE) {
// 	console.error("Failed to change pipeline state");
// 	Gtk.mainQuit();
// }
Gtk.main();
