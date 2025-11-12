# Scheduler Update Summary

## Changes Made

The scheduler has been updated from **weekly** to **daily** frequency with robust fallback handling.

### 1. Schedule Configuration Updated

**File**: [src/scheduler/scheduler.ts](src/scheduler/scheduler.ts)

**Changes**:
- Default cron expression: `'0 2 * * 0'` (weekly) → `'0 2 * * *'` (daily)
- Schedule interval: `168 hours` (1 week) → `24 hours` (1 day)
- Missed run threshold: `169 hours` (7 days + 1 hour) → `25 hours` (1 day + 1 hour)
- Log description: "Weekly scrape" → "Daily scrape"

### 2. Documentation Updated

**File**: [SCHEDULER.md](SCHEDULER.md)

**Changes**:
- Updated default schedule description to "2 AM daily"
- Updated cron expression examples (daily is now the default)
- Updated missed run detection example to use daily schedule
- Corrected threshold calculation (25 hours for daily vs 169 hours for weekly)

### 3. README.md

**Status**: No changes needed (scheduler not mentioned)

---

## New Behavior

### Schedule
- **Frequency**: Daily (every day at 2:00 AM)
- **Cron Expression**: `0 2 * * *`
- **Timezone**: Europe/London

### Fallback & Missed Run Handling

✅ **Already Implemented** - No additional changes required!

**How it works**:
1. **On Startup**: Scheduler checks database for last run timestamp
2. **Detection**: If `time_since_last_run >= 25 hours` → Missed run detected
3. **Recovery**: Catch-up job executes immediately
4. **Resume**: Normal daily schedule continues

**Example Scenario**:
- **Last Run**: Monday at 2:00 AM
- **Server Down**: Tuesday-Wednesday (computer off)
- **Server Starts**: Thursday at 10:00 AM
- **Detection**: 56 hours since last run > 25 hour threshold
- **Action**: Catch-up job runs immediately at 10:00 AM
- **Next Run**: Friday at 2:00 AM (resumes normal schedule)

### Existing Reliability Features

✅ **State Persistence**: Last run tracked in `scheduler_state` database table  
✅ **Overlap Prevention**: Prevents concurrent job execution  
✅ **Graceful Shutdown**: Handles SIGINT/SIGTERM signals  
✅ **Configurable**: Can override via `--schedule` flag  

---

## Testing Results

### ✅ Configuration Test
- Default schedule: `0 2 * * *` (daily) ✓
- Interval hours: `24` ✓
- Missed run detection: `enabled` ✓
- Threshold: `25 hours` (24 + 1 buffer) ✓

### ✅ Cron Expression Validation
- Expression: `0 2 * * *` is valid ✓
- Description: Every day at 2:00 AM ✓

### ✅ Missed Run Detection Logic
- 20 hours since last run → OK ✓
- 24 hours since last run → OK ✓
- 25 hours since last run → MISSED (catch-up triggered) ✓
- 48 hours since last run → MISSED (catch-up triggered) ✓

---

## Usage

### Start Scheduler (Daily at 2 AM)
```bash
npm run dev:scheduler
```

### Custom Schedule (Override)
```bash
# Every 6 hours
tsx src/index.ts --mode=scheduler --schedule="0 */6 * * *"

# Every Monday at 2 AM (weekly)
tsx src/index.ts --mode=scheduler --schedule="0 2 * * 1"

# Every hour
tsx src/index.ts --mode=scheduler --schedule="0 * * * *"
```

### Run Immediately + Continue on Schedule
```bash
npm run dev:scheduler:now
```

---

## Files Modified

1. **[src/scheduler/scheduler.ts](src/scheduler/scheduler.ts)** - Core scheduler logic
   - Updated default cron expression
   - Updated scheduleIntervalHours
   - Updated log messages

2. **[SCHEDULER.md](SCHEDULER.md)** - Documentation
   - Updated schedule descriptions
   - Updated examples
   - Updated missed run example

---

## Migration Notes

### No Breaking Changes
- Existing `--schedule` flag overrides still work
- Database schema unchanged
- Backward compatible

### After Update
1. Restart scheduler process
2. Verify logs show "Daily scrape (every day at 2 AM)"
3. Check next run time is within 24 hours

### For Production
```bash
# Stop current scheduler
pm2 stop honda-scraper

# Pull changes
git pull

# Rebuild
npm run build

# Start scheduler
pm2 start honda-scraper
pm2 logs honda-scraper
```

---

## Monitoring

Check scheduler is running with new config:
```bash
# View logs for "Daily scrape" message
pm2 logs honda-scraper | grep "Daily scrape"

# Check next run time (should be within 24 hours)
pm2 logs honda-scraper | grep "nextRun"
```

---

## Rollback (if needed)

To revert to weekly schedule:
```bash
tsx src/index.ts --mode=scheduler --schedule="0 2 * * 0"
```

Or modify [src/scheduler/scheduler.ts](src/scheduler/scheduler.ts:40) back to `'0 2 * * 0'` and `168` hours.
