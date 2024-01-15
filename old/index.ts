import gi from "node-gtk";
import path from "node:path";
import process from "node:process";
import fs from "node:fs";
import { Innertube, UniversalCache } from "youtubei.js";

const GLib = gi.require("GLib", "2.0");
const Gtk = gi.require("Gtk", "4.0");
const loop = GLib.MainLoop.new(null, false);
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
	const video = builder.getObject("video");
	// const youtube = await Innertube.create({
	// 	cache: new UniversalCache(true, "./cache/")
	// })
	actionButton.on("clicked", () => {
		console.log(video)
		
		console.log(searchForm.buffer.text);
	});
	
	window.setChild(root);
	window.show();
	window.present();

	gi.startLoop();
	loop.run();
	
	
}

function onQuit() {
	loop.quit();
	app.quit();
	return false;
}
