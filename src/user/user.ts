import sqlite3 from "sqlite3";
import { Database, open } from "sqlite";

export class UserData {
	/*
	- watch history
	- (local) subscriptions
	- (local) playlists
	- video stop time
	*/

	static async initDB() {
		const db = await open({
			filename: "./.cache/userdata.db",
			driver: sqlite3.cached.Database,
		});
	}
}