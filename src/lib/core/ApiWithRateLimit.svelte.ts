import { DateTime, Duration } from 'luxon';
import { sleep } from './Utils';
import { AxiosError } from 'axios';

/**
 * A rate limiter that manages a single rate limit bucket.
 * Only provides a wait() method that resolves when a slot is available.
 */
export class ApiWithRateLimit {
	private rateLimit: number;
	private rateLimitInterval: Duration;
	private lastBucketStart: DateTime;
	private requestCount: number;

	public constructor(rateLimit: number, rateLimitIntervalSeconds: number) {
		this.rateLimit = rateLimit;
		this.rateLimitInterval = Duration.fromDurationLike({ seconds: rateLimitIntervalSeconds });
		this.lastBucketStart = DateTime.now();
		this.requestCount = 0;
	}

	/**
	 * Waits until a slot is available in the rate limit bucket, then reserves it.
	 * Resolves when the slot is available and the count has been incremented.
	 */
	public async wait(): Promise<void> {
		const now = DateTime.now();
		const timeSinceLastBucketStart = now.diff(this.lastBucketStart);

		// new bucket started, reset everything
		if (timeSinceLastBucketStart > this.rateLimitInterval) {
			this.lastBucketStart = now;
			this.requestCount = 1;
			return;
		}

		// rate limit exceeded, wait for the next bucket to start
		if (this.requestCount >= this.rateLimit) {
			const nextBucketStart = this.lastBucketStart.plus(this.rateLimitInterval);
			const timeUntilNextBucketStart = nextBucketStart.diff(now);
			await sleep(timeUntilNextBucketStart.toMillis());

			this.lastBucketStart = now;
			this.requestCount = 1;
			return;
		}

		// request count is within the limit, reserve a slot
		this.requestCount++;
	}
}

/**
 * Wrapper class that orchestrates rate-limited requests through a chain of limiters.
 * Calls wait() on each limiter in sequence, makes the request, and retries the entire
 * chain if a 429 error occurs.
 */
export class RateLimitedRequest {
	private limiters: ApiWithRateLimit[];

	constructor(...limiters: ApiWithRateLimit[]) {
		this.limiters = limiters;
	}

	/**
	 * Executes a request through the chain of rate limiters.
	 * Waits for a slot in each limiter in sequence, then makes the request.
	 * If a 429 error occurs, retries the entire chain (waits on all limiters again).
	 */
	public async execute<T>(method: () => Promise<T>): Promise<T> {
		try {
			// Wait for a slot in each limiter in sequence
			for (const limiter of this.limiters) {
				await limiter.wait();
			}
			// Make the request
			return await method();
		} catch (error) {
			if (error instanceof AxiosError && error.response?.status === 429) {
				console.warn('Hit 429 error, retrying entire chain...', error);
				// Retry the entire chain - wait on all limiters again, then retry the request
				return this.execute(method);
			}
			throw error;
		}
	}
}

// Base rate limiters (internal)
const RATE_LIMITER_GLOBAL_BASE = new ApiWithRateLimit(3, 1);
const RATE_LIMITER_SESSION_BASE = new ApiWithRateLimit(20, 60);
const RATE_LIMITER_UPLOAD_BASE = new ApiWithRateLimit(20, 60);
const RATE_LIMITER_UPLOAD_COMMIT_BASE = new ApiWithRateLimit(10, 60);
const RATE_LIMITER_CHAPTER_UPDATE_BASE = new ApiWithRateLimit(25, 60);
const RATE_LIMITER_CHAPTER_DELETE_BASE = new ApiWithRateLimit(30, 60);

// Wrapped rate limiters with chains
export const RATE_LIMITER_GLOBAL = new RateLimitedRequest(RATE_LIMITER_GLOBAL_BASE);
export const RATE_LIMITER_SESSION = new RateLimitedRequest(
	RATE_LIMITER_SESSION_BASE,
	RATE_LIMITER_GLOBAL_BASE
);
export const RATE_LIMITER_UPLOAD = new RateLimitedRequest(
	RATE_LIMITER_UPLOAD_BASE,
	RATE_LIMITER_GLOBAL_BASE
);
export const RATE_LIMITER_CHAPTER_UPDATE = new RateLimitedRequest(
	RATE_LIMITER_CHAPTER_UPDATE_BASE,
	RATE_LIMITER_GLOBAL_BASE
);
export const RATE_LIMITER_UPLOAD_COMMIT = new RateLimitedRequest(
	RATE_LIMITER_UPLOAD_COMMIT_BASE,
	RATE_LIMITER_GLOBAL_BASE
);
export const RATE_LIMITER_CHAPTER_DELETE = new RateLimitedRequest(
	RATE_LIMITER_CHAPTER_DELETE_BASE,
	RATE_LIMITER_GLOBAL_BASE
);
