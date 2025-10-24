/**
 * Useful when you are looking to store a single value in session storage such as a string, number or array
 */
export type ProxiedValue<T> = { value: T };

/**
 * An object that persists to session storage
 */
function sessionObject<T extends object>(key: string, init?: T): T {
    // Create the handler for the proxy
    const sessionObjectHandler = createSessionObjectHandler(key);

    // If there is an existing object in session storage, load it
    const existing = sessionStorage.getItem(key);
    if (existing !== null) {
        return new Proxy<T>(JSON.parse(existing), sessionObjectHandler);
    }

    // Create proxy that saves to session storage on set
    sessionStorage.setItem(key, JSON.stringify(init || {}));
    return new Proxy<T>(init || ({} as T), sessionObjectHandler);
}

function createSessionObjectHandler<T extends object>(key: string): ProxyHandler<T> {
    return {
        get: function (target: T, prop: string) {
            // Return proxied child objects so we can track changes to them
            const value = Reflect.get(target, prop);
            if (isObjectOrArray(value)) {
                return new Proxy(
                    value,
                    createSessionObjectChildHandler(() => sessionStorage.setItem(key, JSON.stringify(target)))
                );
            }

            return value;
        },
        set: function (target: T, prop: string, value: any) {
            // If value is an object then proxy it so we can save changes to session storage
            if (isObjectOrArray(value)) {
                value = new Proxy(
                    value,
                    createSessionObjectChildHandler(() => sessionStorage.setItem(key, JSON.stringify(target)))
                );
            }
            const success = Reflect.set(target, prop, value);
            if (success) {
                sessionStorage.setItem(key, JSON.stringify(target));
            }
            return success;
        },
        deleteProperty(target: T, p: string | symbol): boolean {
            const success = Reflect.deleteProperty(target, p);
            if (success) {
                sessionStorage.setItem(key, JSON.stringify(target));
            }
            return success;
        },
    };
}

function createSessionObjectChildHandler<T extends object>(parentHandler: () => void): ProxyHandler<T> {
    return {
        get: function (target: T, prop: string) {
            const value = Reflect.get(target, prop);
            if (isObjectOrArray(value)) {
                return new Proxy(value, createSessionObjectChildHandler(parentHandler));
            }
            return value;
        },
        set: function (target: T, prop: string, value: any) {
            if (isObjectOrArray(value)) {
                value = new Proxy(value, createSessionObjectChildHandler(parentHandler));
            }
            const success = Reflect.set(target, prop, value);
            if (success) {
                parentHandler();
            }
            return success;
        },
        deleteProperty(target: T, p: string | symbol): boolean {
            const success = Reflect.deleteProperty(target, p);
            if (success) {
                parentHandler();
            }
            return success;
        },
    };
}

function isObjectOrArray(value: any): value is object | any[] {
    return typeof value === "object" && value !== null;
}

export default sessionObject;
