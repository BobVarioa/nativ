
let logLevel = 0;

export function setLogLevel(level: number) {
	logLevel = level;
}

const excluded = new Set();

export function addExclude(tag: string) {
	excluded.add(tag);
}

export function verbose(tag: string, msg: string, additional: number = 0) {
	if (logLevel >= (3 + additional)) {
		if (excluded.has(tag)) return;
		console.log(`${tag}: ${msg}`)
	}
}

export function info(tag: string, msg: string) {
	if (logLevel >= 2) {
		if (excluded.has(tag)) return;
		console.log(`${tag}: ${msg}`)
	}
}

export function warn(tag: string, msg: string) {
	if (logLevel >= 1) {
		if (excluded.has(tag)) return;
		console.log(`${tag}: ${msg}`)
	}
}

export function error(tag: string, msg: string) {
	if (logLevel >= 0) {
		if (excluded.has(tag)) return;
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