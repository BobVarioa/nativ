export function DebounceSync(ms: number) {
	return function (
		target: any,
		propertyKey: string,
		descriptor: PropertyDescriptor
	) {
		let method = descriptor.value as () => any;
		let lastCall = 0;
		let lastValue = undefined;
		descriptor.value = function () {
			if (performance.now() - lastCall > ms) {
				lastCall = performance.now();
				lastValue = method.call(this);
				return lastValue;
			}
			return lastValue;
		};
	};
}

export function DebounceAsync(ms: number) {
	return function (
		target: any,
		propertyKey: string,
		descriptor: PropertyDescriptor
	) {
		let method = descriptor.value as (...args: any[]) => any;
		let timer = undefined;
		let arr = [];
		descriptor.value = async function (...args) {
			clearTimeout(timer);
			timer = setTimeout(() => {
				let val = method.apply(this, args);
				arr.forEach((v) => v(val));
			}, ms);
			return new Promise((res, rej) => {
				arr.push(res);
			});
		};
	};
}

export function Throttle(minDelay: number, onFail = (...stuff) => {}) {
	return function (
		target: any,
		propertyKey: string,
		descriptor: PropertyDescriptor
	) {
		let method = descriptor.value as (...args: any[]) => void;
		let lastCall = 0;
		let lastArgs = undefined;
		descriptor.value = function newMethod(...args) {
			const diff = performance.now() - lastCall;
			if (lastCall != 0 && diff < minDelay) {
				if (lastArgs == undefined) {
					setTimeout(() => {
						newMethod.apply(this, lastArgs);
					}, minDelay - diff);
				}
				lastArgs = args;
				onFail.apply(this, args);
			} else {
				lastCall = performance.now();
				lastArgs = undefined;
				method.apply(this, args);
			}
		};
	};
}
