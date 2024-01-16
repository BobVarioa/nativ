export function processCommandArgs(args: string[]): Record<any, any> {
	let obj: Record<any, any> = {};
	let rest = [];

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg.startsWith("--")) {
			if (i + 1 < args.length && !args[i + 1].startsWith("-")) {
				obj[arg.slice(2)] = args[i + 1];
				i++;
				continue;
			}
			obj[arg.slice(2)] = true;
		} else if (arg.startsWith("-")) {
			obj[arg.slice(1)] = true;
		} else {
			rest.push(arg);
		}
	}

	obj.rest = rest;

	return obj;
}
