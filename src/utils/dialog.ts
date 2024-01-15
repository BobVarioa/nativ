import Gtk from "gtk:Gtk@3.0";

export function openDialog(text: string): boolean {
	const msg = new Gtk.MessageDialog({ modal: true, buttons: Gtk.ButtonsType.OK_CANCEL });
	msg.text = text;

	const res = msg.run();
	msg.destroy();

	return res == Gtk.ResponseType.OK;
}