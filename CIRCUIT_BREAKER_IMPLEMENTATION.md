# Circuit Breaker Implementation

**Status**: ✅ Complete
**Phase**: 2.3 - Scraping Optimization
**Files Modified**: 2
**Files Created**: 2

---

## Overview

Implemented Circuit Breaker pattern to prevent wasting Firecrawl credits on systematic API failures. When Firecrawl experiences issues (rate limits, outages, credit exhaustion), the circuit breaker will:

1. **Detect failures** after a threshold is reached
2. **Open the circuit** to reject requests immediately (fail-fast)
3. **Attempt recovery** after a timeout period
4. **Close the circuit** when service recovers

---

## Implementation Details

### 1. Circuit Breaker Utility Class

**File**: `src/utils/circuit-breaker.ts` (new)

**Features**:
- Three states: CLOSED (normal), OPEN (failing), HALF_OPEN (testing recovery)
- Configurable thresholds and timeouts
- Automatic state transitions
- Comprehensive logging

**Configuration Options**:
```typescript
{
  name: string;                      // Breaker identifier
  failureThreshold?: number;         // Failures before opening (default: 5)
  resetTimeout?: number;             // Wait time before retry (default: 60s)
  halfOpenSuccessThreshold?: number; // Successes needed to close (default: 2)
}
```

### 2. Integration with Scraper Orchestrator

**File**: `src/scraper/scraper-orchestrator.ts` (modified)

**Changes**:
1. Added two circuit breakers:
   - **Map API Breaker**: 3 failures, 2-minute timeout (discovery is critical)
   - **Batch Scrape Breaker**: 5 failures, 1-minute timeout (scraping can retry sooner)

2. Wrapped Firecrawl API calls:
   - `discoverProducts()` → Map API with circuit breaker
   - `scrapeProducts()` → Batch Scrape API with circuit breaker

**Benefits**:
- Prevents wasting credits during Firecrawl outages
- Fails fast when service is unavailable
- Automatic recovery detection
- Separate breakers for different API endpoints

---

## Testing

**Test Script**: `test-circuit-breaker.ts` (new)

**Test Results**:
```
✅ Circuit opens after 3 failures
✅ Rejects requests immediately when OPEN (fail-fast)
✅ Transitions to HALF_OPEN after timeout
✅ Detects service recovery or continued failure
✅ Prevents wasted API calls during outages
```

**Example Output**:
```
Phase 1: Initial Failures
  Call 1-3: Failed → Circuit OPEN

Phase 2: Circuit OPEN (Fail Fast)
  Call 4-5: Rejected immediately (no API call made)

Phase 3: Waiting for Reset
  Circuit transitions to HALF_OPEN after 5s

Phase 4: Recovery Attempt
  Tests if service recovered
```

---

## How It Works

### State Transitions

```
CLOSED (Normal Operation)
   ↓ (failure_count >= threshold)
OPEN (Rejecting Requests)
   ↓ (timeout expires)
HALF_OPEN (Testing Recovery)
   ↓ (success_count >= threshold)
CLOSED (Recovered)

HALF_OPEN can also return to OPEN if failures continue
```

### Real-World Scenario

**Without Circuit Breaker**:
```
Firecrawl out of credits
↓
Try to scrape 100 URLs
↓
All 100 fail with "insufficient credits"
↓
Wasted time: ~5 minutes
Wasted processing: 100 failed attempts
User experience: Long wait for inevitable failure
```

**With Circuit Breaker**:
```
Firecrawl out of credits
↓
First 3 URLs fail
↓
Circuit opens → reject remaining 97 URLs immediately
↓
Wasted time: ~10 seconds
Wasted processing: 3 failed attempts
User experience: Fast failure with clear error message
After 2 minutes: Automatically retry to detect recovery
```

---

## Configuration Tuning

### Map API Circuit Breaker
```typescript
{
  name: 'Firecrawl Map API',
  failureThreshold: 3,      // Discovery is critical, fail fast
  resetTimeout: 120000,     // 2 minutes (discovery runs infrequently)
  halfOpenSuccessThreshold: 2
}
```

**Rationale**: Discovery is the first step. If it fails, no point in scraping. Use conservative threshold.

### Batch Scrape API Circuit Breaker
```typescript
{
  name: 'Firecrawl Batch Scrape API',
  failureThreshold: 5,      // Allow more retries (individual URLs can fail)
  resetTimeout: 60000,      // 1 minute (scraping is more frequent)
  halfOpenSuccessThreshold: 2
}
```

**Rationale**: Individual scrape failures are expected (404s, timeouts). Higher threshold prevents premature opening.

---

## Error Messages

Users will see clear error messages when circuit is open:

```
ERROR: Circuit breaker Firecrawl Map API is OPEN. Rejecting request. Retry in 87s

Reason: Firecrawl API has failed 3 consecutive times.
Action: Waiting for service to recover. Automatic retry in 87 seconds.
Suggestion: Check Firecrawl status at https://firecrawl.dev/status
```

---

## Monitoring

Circuit breaker logs include:
- State transitions (CLOSED → OPEN → HALF_OPEN)
- Failure counts and thresholds
- Success counts during recovery
- Time until next retry attempt

**Log Examples**:
```json
[INFO] Circuit breaker Firecrawl Map API transitioning to HALF_OPEN
[WARN] Circuit breaker Firecrawl Map API failure (count: 2/3)
[ERROR] Circuit breaker Firecrawl Map API opening due to failures
```

---

## Next Steps

**Completed** ✅:
- Circuit breaker utility class
- Integration with scraper orchestrator
- Comprehensive testing

**Remaining from Phase 2**:
- Puppeteer + Bright Data migration (Section 2.1)

---

## Cost Savings Example

**Scenario**: Firecrawl credit exhaustion during nightly scrape

**Before Circuit Breaker**:
- Discovery: 3 domains × 1 failed Map call = 3 credits wasted
- Scraping: 3 domains × 50 URLs × 1 failed scrape = 150 credits wasted
- Total: 153 credits ($0.15) + 10 minutes of wasted processing

**After Circuit Breaker**:
- Discovery: 1 domain × 3 failed attempts → circuit opens
- Remaining domains: Rejected immediately (0 credits)
- Scraping: Skipped (circuit already open from discovery)
- Total: 3 credits ($0.003) + 30 seconds of processing

**Savings**: 98% reduction in wasted credits during outages

---

## Documentation

- [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) - Phase 2.3 complete
- [test-circuit-breaker.ts](test-circuit-breaker.ts) - Test script with examples
- [src/utils/circuit-breaker.ts](src/utils/circuit-breaker.ts) - Implementation
