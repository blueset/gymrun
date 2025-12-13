import { type TokenData, KV_TOKEN_KEY, type EnvWithAzure } from './graph-auth';
import { type ExerciseGroups } from './gymrun';

const KV_KEY = 'gymrun_storage';

let isLoaded = false;
let isUpdated = false;
let cache: Partial<{
    [KV_TOKEN_KEY]: TokenData;
    lastUpdated: number;
    data: ExerciseGroups;
}> = {};

export async function getFromStorage<T extends keyof typeof cache>(env: EnvWithAzure, key: T): Promise<typeof cache[T]> {
    if (!isLoaded) {
        const stored = await env.STORAGE.get<typeof cache>(KV_KEY, { type: 'json' });
        if (stored) {
            cache = stored;
        }
        isLoaded = true;
    }
    return cache[key];
}

export function setInStorage<T extends keyof typeof cache>(env: EnvWithAzure, key: T, value: typeof cache[T]): void {
    isUpdated = true;
    cache[key] = value;
}

export function deleteFromStorage<T extends keyof typeof cache>(env: EnvWithAzure, key: T): void {
    isUpdated = true;
    delete cache[key];
}

export async function persistStorage(env: EnvWithAzure): Promise<void> {
    if (isUpdated) {
        await env.STORAGE.put(KV_KEY, JSON.stringify(cache));
        isUpdated = false;
    }
}
