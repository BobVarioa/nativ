const gi = require("node-gtk");
/**
 * @type {import("@girs/node-glib-2.0").GLib}
 */
const GLib = gi.require("GLib", "2.0");
/**
 * @type {import("@girs/node-gst-1.0").Gst}
 */
const Gst = gi.require("Gst", "1.0");
const Gtk = gi.require("Gtk", "3.0");

gi.startLoop();
Gtk.init();
Gst.init();

const gstVersion = Gst.version();
console.log(
	`GStreamer Version: ${gstVersion[0]}.${gstVersion[1]}.${gstVersion[2]}`
);

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

/* const bus = pipeline.getBus();
let watchI = 0;
function addWatch(func) {
	bus.addWatch(watchI, func);
	return watchI++;
}

async function untilState(type) {
	return new Promise((res, rej) => {
		let id = addWatch((_, msg) => {
			if (msg.type == type) res();
		});
		bus.removeWatch(id);
	});
}

addWatch((bus, msg) => {
	switch (msg.type) {
		case Gst.MessageType.EOS:
			console.log("Got EOS");
			// pipeline.setState(Gst.State.PAUSED)
			// console.log(sink.queryPosition(Gst.Format.TIME))
			// if (!sink.seekSimple(Gst.Format.TIME, Gst.SeekFlags.FLUSH | Gst.SeekFlags.KEY_UNIT, 10e9)) {
			// 	console.log("Seek Failed")
			// }
			// pipeline.setState(Gst.State.PLAYING)
			break;
		case Gst.MessageType.ERROR:
			const [err, dbg] = msg.parseError();
			console.log("Got error: " + err.message + " (dbg: " + dbg + ")");
			loop.quit();
			break;
		default:
			console.log(Gst.MessageType[msg.type]);
			break;
	}

	return true;
}); */

const win = new Gtk.Window({
	title: "node-gtk",
	window_position: Gtk.WindowPosition.CENTER,
});

win.on("show", () => {
});

win.on("destroy", Gtk.mainQuit);
win.setDefaultSize(1280, 720);
win.add(gtkglsink.widget);
if (playbin.setState(Gst.State.PLAYING) == Gst.StateChangeReturn.Failure) {
	console.error("Failed to change pipeline state");
	return;
}
win.showAll();
Gtk.main();