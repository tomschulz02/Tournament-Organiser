class CacheManager {
	constructor() {
		this.cache = new Map();
		this.timestamps = new Map();
	}

	set(key, value) {
		this.cache.set(key, value);
		this.timestamps.set(key, new Date());
	}

	get(key) {
		console.log("Looking for cache: ", key);
		console.log("CACHE: ", this.cache);
		return this.cache.get(key);
	}

	getTimestamp(key) {
		return this.timestamps.get(key);
	}

	invalidate(key) {
		this.cache.forEach((value, cacheKey) => {
			if (cacheKey.includes(key)) {
				this.cache.delete(cacheKey);
				this.timestamps.delete(cacheKey);
			}
		});
	}

	isStale(key, clientTimestamp) {
		const lastUpdated = this.getTimestamp(key);
		return !lastUpdated || new Date(clientTimestamp) < lastUpdated;
	}
}

export default CacheManager;
