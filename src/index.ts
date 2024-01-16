/// <reference path="../typings/index.d.ts" />
import process from "node:process";
import gi from "node-gtk";
import GLib from "gtk:GLib@2.0";
import Gst from "gtk:Gst@1.0";
import Gtk from "gtk:Gtk@3.0";
import Gdk from "gtk:Gdk@3.0";
import ui from "ui.gtk";
import { VideoController } from "./elements/video/video";
import { openDialog } from "./utils/dialog";
import { processCommandArgs } from "./utils/args";
import { setLogLevel } from "./utils/log";

const flags = processCommandArgs(process.argv.slice(2))

for (const [flag, value] of Object.entries(flags)) {
	switch (flag) {
		case "v":
		case "vv":
		case "vvv":
		case "vvvv":
			setLogLevel(flag.length);
			break;

		case "verbose":
			setLogLevel(value == true ? 4 : value);
			break;
	}
}

if (process.env.XDG_SESSION_TYPE == "x11") {
	gi.require("GdkX11", "3.0");
}

gi.startLoop();
Gtk.init(process.argv);
Gst.init(process.argv);

ui.init();

const gstVersion = Gst.version();
console.log(
	`GStreamer Version: ${gstVersion[0]}.${gstVersion[1]}.${gstVersion[2]}`
);

const videoController = new VideoController();
videoController.init()
videoController.setUri(
	"http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"
);

const root = ui.getObject("root");

const win = new Gtk.Window({
	title: "node-gtk",
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
win.on("show", () => {
	if (videoController.play() == Gst.StateChangeReturn.FAILURE) {
		console.error("Failed to change pipeline state");
		return;
	}
	Gtk.main();
});
win.setDefaultSize(1280, 720);

const videoWidget = videoController.createWidget();
root.add(videoWidget);
win.add(root);

win.showAll();
