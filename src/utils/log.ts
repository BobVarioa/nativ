
let logLevel = 0;

export function setLogLevel(level: number) {
	logLevel = level;
}

export function verbose(tag: string, msg: string) {
	if (logLevel >= 3) {
		console.log(`${tag}: ${msg}`)
	}
}

export function info(tag: string, msg: string) {
	if (logLevel >= 2) {
		console.log(`${tag}: ${msg}`)
	}
}

export function warn(tag: string, msg: string) {
	if (logLevel >= 1) {
		console.log(`${tag}: ${msg}`)
	}
}

export function error(tag: string, msg: string) {
	if (logLevel >= 0) {
		console.log(`${tag}: ${msg}`)
	}
}

export function expandObject(obj: any, recursive = false): string {
	let str = ""

	for (const [k,v] of Object.entries(obj)) {
		if (recursive && typeof v == "object") {
			str += `${k}=${expandObject(v)},`
		} else {
			str += `${k}=${v},`
		}
	}

	return str;
}