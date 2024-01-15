
let logLevel = 3;

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