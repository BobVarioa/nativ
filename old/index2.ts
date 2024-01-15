import gi from "node-gtk";
import path from "node:path";
import process from "node:process";
import fs from "node:fs";
import { Innertube, UniversalCache } from "youtubei.js";

const GLib = gi.require("GLib", "2.0");
const Gtk = gi.require("Gtk", "4.0");
const Gst = gi.require("Gst", "1.0");

gi.startLoop();
Gtk.init();
Gst.init();

const gstVersion = Gst.version();
console.log(
	`GStreamer Version: ${gstVersion[0]}.${gstVersion[1]}.${gstVersion[2]}`
);

const loop = GLib.MainLoop.new(null, false);

const GST_PLAY_FLAG_VIDEO = 1 << 0;
const GST_PLAY_FLAG_AUDIO = 1 << 1;

const gtkglsink = Gst.ElementFactory.make("gtkglsink", "vsink");
const vsink = Gst.ElementFactory.make("glsinkbin", "vsink");
vsink.sink = gtkglsink;

const playbin = Gst.ElementFactory.make("playbin3", "src");
playbin.uri =
	"http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";
playbin.instant_uri = true;
playbin.flags |= GST_PLAY_FLAG_VIDEO | GST_PLAY_FLAG_AUDIO;
playbin.video_sink = vsink;

const app = new Gtk.Application("com.github.bobvarioa.nativ", 0);
app.on("activate", onActivate);
const status = app.run([]);

console.log("Finished with status:", status);

async function onActivate() {
	const window = new Gtk.ApplicationWindow(app);
	window.setTitle("Window");
	window.setDefaultSize(200, 200);
	window.on("close-request", onQuit);
	
	const ui = fs.readFileSync(path.join(process.cwd(), "./static/ui.xml"), "utf-8");
	
	const builder = Gtk.Builder.newFromString(ui, ui.length);
	const root = builder.getObject("root");
	
	const searchForm = builder.getObject("searchForm");
	
	const actionButton = builder.getObject("confirmVideo");

	root.add(gtkglsink.widget)
	if (playbin.setState(Gst.State.PLAYING) == Gst.StateChangeReturn.Failure) {
		console.error("Failed to change pipeline state");
		return;
	}
	// const youtube = await Innertube.create({
	// 	cache: new UniversalCache(true, "./cache/")
	// })
	actionButton.on("clicked", () => {
		console.log(searchForm.buffer.text);
	});
	
	window.setChild(root);
	window.show();
	window.present();

	if (playbin.setState(Gst.State.PLAYING) == Gst.StateChangeReturn.Failure) {
		console.error("Failed to change pipeline state");
		return;
	}
	loop.run();
}

function onQuit() {
	loop.quit();
	app.quit();
	return false;
}
