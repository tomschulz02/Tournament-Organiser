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
		return this.cache.get(key);
	}

	getTimestamp(key) {
		return this.timestamps.get(key);
	}

	invalidate(key) {
		this.cache.delete(key);
		this.timestamps.delete(key);
	}

	isStale(key, clientTimestamp) {
		const lastUpdated = this.getTimestamp(key);
		return !lastUpdated || new Date(clientTimestamp) < lastUpdated;
	}
}

export default CacheManager;
