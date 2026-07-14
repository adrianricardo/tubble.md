import type {
	StateObject,
	StatePrimitive,
	StoreMiddleware,
} from "@simplestack/store";

export function localStoragePersist<T extends StateObject | StatePrimitive>(
	key: string,
	serialize?: (state: T) => unknown,
): StoreMiddleware<T> {
	return () => ({
		set: (next) => (setter) => {
			next((current) => {
				const nextState =
					typeof setter === "function" ? setter(current) : setter;
				const toStore = serialize ? serialize(nextState) : nextState;
				try {
					localStorage.setItem(key, JSON.stringify(toStore));
				} catch {
					// Browser storage is best-effort; quota and security failures must
					// not prevent the live store from accepting an otherwise valid update.
				}
				return nextState;
			});
		},
	});
}
