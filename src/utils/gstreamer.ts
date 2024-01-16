import Gst from "@girs/node-gst-1.0";
import Gtk from "@girs/node-gtk-3.0";

export interface GlSinkBin extends Gst.Element {
	sink: Gst.Element;
	maxLateness: number;
}
export interface Playbin extends Gst.Pipeline {
	instant_uri: boolean;
	video_sink: Gst.Element;
	uri: string;
}
export interface GtkSink extends Gst.Element {
	widget: Gtk.Widget;
}

export function parseNavigationEvent(structure: Gst.Structure) {
	if (structure.getName() != "GstNavigationMessage") return;

	const type = structure.getString("type");
	if (type != "event") return;

	const event = structure.getValue("event").getBoxed();
	if (event.type != Gst.EventType.NAVIGATION) return;

	const struct = event.getStructure() as Gst.Structure;
	const eventType = struct.getString("event");

	switch (eventType) {
		case "mouse-button-release":
		case "mouse-button-press":
			return {
				type: eventType,
				pointer_x: struct.getDouble("pointer_x")[1],
				pointer_y: struct.getDouble("pointer_y")[1],
				button: struct.getInt("button")[1],
			} as const;

		case "mouse-move":
			return {
				type: eventType,
				pointer_x: struct.getDouble("pointer_x")[1],
				pointer_y: struct.getDouble("pointer_y")[1],
			} as const;

		case "key-press":
		case "key-release":
			return {
				type: eventType,
				key: struct.getString("key")[1],
			} as const;

		case "command":
			return {
				type: eventType,
				command: struct.getUint("command-code")[1],
			} as const;

		default:
			return;
	}
}
