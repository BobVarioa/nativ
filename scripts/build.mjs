import esbuild from "esbuild";
import path from "node:path";
import fs from "node:fs";
import { glob } from "glob";
import { build_ui } from "./build_ui.mjs";

(await glob("./src/**/*.gtk")).forEach(v => {
	build_ui(v.slice(4))
});

/**
 * @type {import("esbuild").Plugin}
 */
let uiPlugin = {
	name: "gtk_ui",
	setup(build) {
		build.onResolve({ filter: /\.gtk$/ }, (args) => ({
			path: args.path,
			namespace: "ui",
		}));

		build.onLoad({ filter: /.*/, namespace: "ui" }, (args) => {
			const ui = fs.readFileSync(
				path.join("./build/", args.path + ".glade"),
				"utf-8"
			);

			return {
				contents: `
				// ${args.path}
				import Gtk from "gtk:Gtk@3.0";
				
				let builder;
				export default {
					getObject(name) {
						return builder.getObject(name);
					},
					init() {
						builder = Gtk.Builder.newFromString(\`${ui}\`, ${ui.length});
					}
				};`,
				loader: "js",
			};
		});
	},
};

/**
 * @type {import("esbuild").Plugin}
 */
let gtkPlugin = {
	name: "gtk",
	setup(build) {
		build.onResolve({ filter: /^gtk:/ }, (args) => ({
			path: args.path.slice(4),
			namespace: "gtk",
		}));

		build.onLoad({ filter: /.*/, namespace: "gtk" }, (args) => {
			const [lib, version] = args.path.split("@")
			return {
				contents: `
				// ${args.path}
				import gi from "node-gtk";
				const thing = gi.require("${lib}", "${version}")
				export default thing;`,
				loader: "js",
			};
		});
	},
};

await esbuild.build({
	entryPoints: ["src/index.ts"],
	outfile: "./dist/index.cjs",
	bundle: true,
	outbase: "src",
	platform: "node",
	external: ["node-gtk", "sqlite", "sqlite3"],
	format: "cjs",
	plugins: [gtkPlugin, uiPlugin],
});
