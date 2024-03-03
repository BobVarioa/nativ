import fs from "node:fs";
import UserAgent from "user-agents";

export interface ClientData {
	userAgent: string;
	platform: "desktop" | "mobile";
}

class ClientInfo {
	data: ClientData = {
		userAgent: "Nativ",
		platform: "desktop"
	};

	genClientInfo() {
		const userAgent = new UserAgent({ deviceCategory: "desktop" });
		this.data.userAgent = userAgent.toString();
	}

	load() {
		if (fs.existsSync("./.cache/clientInfo.json")) {
			this.data = JSON.parse(
				fs.readFileSync("./.cache/clientInfo.json", "utf-8")
			) as ClientData;
			return true;
		}

		return false;
	}

	store() {
		fs.writeFileSync("./.cache/clientInfo.json", JSON.stringify(this.data));
		return true;
	}
}

export const clientInfo = new ClientInfo();
