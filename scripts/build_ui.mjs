import process from "node:process";
import fs from "fs-extra";
import path from "node:path";

export function build_ui(filename) {
	console.log("Translating " + filename);
	
	let file = fs.readFileSync(path.join("./src", filename), "utf8");
	
	let i = 0;
	
	function isWhitespace(c) {
		return c == " " || c == "\n" || c == "\r" || c == "\t";
	}
	
	function seekUntil(charset) {
		let old = i;
		let index = 0;
		top: for (; i < file.length; i++) {
			for (let j = 0; j < charset.length; j++) {
				if (charset[j] == file[i]) {
					break top;
				}
			}
			index++;
		}
		i = old;
		return index;
	}
	
	function captureString() {
		let str = "";
		for (; i < file.length; i++) {
			if (file[i] == "\\") {
				switch (file[i + 1]) {
					case "n":
						str += "\n";
						break;
					case "r":
						str += "\r";
						break;
					case "\\":
						str += "\\";
						break;
					case '"':
						str += '"';
						break;
					default:
						throw "Bad escape";
				}
				i++;
				continue;
			}
			if (file[i] == '"') {
				i++;
				break;
			}
			str += file[i];
		}
		return str;
	}
	
	function seekExcept(charset) {
		let old = i;
		let index = 0;
		top: for (; i < file.length; i++) {
			let any = false;
			for (let j = 0; j < charset.length; j++) {
				any ||= charset[j] == file[i];
			}
			if (!any) break;
			index++;
		}
		i = old;
		return index;
	}

	const alpha = "abcdefghijklmnopqrstuvwyxzABCDEFGHIJKLMNOPQRSTUVWYXZ";
	const alphanum = alpha + "0123456789_";
	
	function skipWhitespace() {
		for (; i < file.length; i++) {
			if (isWhitespace(file[i])) continue;
			break;
		}
	}
	
	function parseObject() {
		//  \s+ name#id \s+ { [props] children+ }
	
		let object = { type: "", id: "", properties: {}, children: [] };
	
		skipWhitespace();
	
		let typeI = seekExcept(alphanum);
		object.type = file.slice(i, i + typeI);
		i += typeI;
	
		if (file[i] == "#") {
			i++;
			let idI = seekExcept(alphanum);
			object.id = file.slice(i, i + idI);
			i += idI;
		}
	
		skipWhitespace();
	
		if (file[i] == "{") {
			i++;
			skipWhitespace();
	
			if (file[i] == "[") {
				i++;
				// parse props
				while (true) {
					skipWhitespace();
	
					if (file[i] == "]") {
						i++;
						break;
					}
					if (file[i] == ",") {
						i++;
						continue;
					}
					let nameI = seekUntil("=");
					let name = file.slice(i, i + nameI);
					i += nameI;
	
					i++; // skip =
	
					if (file[i] == '"') {
						i++;
						let prop = captureString();
						object.properties[name] = prop;
					} else {
						throw "Bad property";
					}
				}
			}
	
			for (; i < file.length; ) {
				skipWhitespace();
				if (file[i] == "}") {
					// done
					i++;
					return object;
				}
	
				if (file[i] == '"') {
					i++;
					let str = captureString();
					object.children.push(str);
					continue;
				}
	
				object.children.push(parseObject());
			}
		}
	}
	
	let str = `<?xml version="1.0" encoding="UTF-8"?><interface>`;
	
	let typestr = `declare module "${path.basename(filename)}" {\nimport type Gtk from "@girs/node-gtk-3.0";export function init()\n`;
	
	function printObject(obj) {
		if (typeof obj == "string") {
			str += obj;
			return;
		}
	
		str += `<object class="Gtk${obj.type}"`;
		if (obj.id != "") {
			str += ` id="${obj.id}"`;
			// TODO: hack
			typestr += `function getObject(id: "${obj.id}"): Gtk.${obj.type};\n`
		}
		str += ">";
	
		let props = Object.entries(obj.properties);
		let newProps = {};
	
		let processed = new Set();
	
		for (const [k, v] of props) {
			if (processed.has(k)) continue;
			for (const [k1, v1] of props) {
				if (processed.has(k1)) continue;
				if (k1.startsWith(k) && k1[k.length] == "$") {
					if (!newProps[k]) {
						newProps[k] = { value: v, meta: [] };
					}
					newProps[k].meta.push([k1.slice(k.length + 1), v1]);
					processed.add(k);
					processed.add(k1);
				}
			}
			if (!newProps[k]) {
				newProps[k] = { value: v, meta: [] };
				processed.add(k);
			}
		}
	
		for (const [key, value] of Object.entries(newProps)) {
			str += `<property name="${key}"`;
			if (value.meta.length > 0) {
				for (let i = 0; i < value.meta.length; i++) {
					const element = value.meta[i];
					str += ` ${element[0]}="${element[1]}"`;
				}
			}
			str += ">";
			str += value.value;
			str += "</property>";
		}
	
		if (obj.children.length > 0) {
			for (let i = 0; i < obj.children.length; i++) {
				str += "<child>";
				printObject(obj.children[i]);
				str += "</child>";
			}
		}
	
		str += "</object>";
	}
	
	printObject(parseObject());
	
	str += "</interface>";
	typestr += "}";
	
	fs.outputFileSync(path.join("./build/", path.basename(filename) + ".glade"), str);
	fs.outputFileSync(path.join("./build/", path.basename(filename) + ".d.ts"), typestr);
}

