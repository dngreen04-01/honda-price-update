# Weekly Scheduler with Missed Run Detection - Implementation Summary

## Overview

Implemented a weekly scheduler with automatic missed run detection and recovery for the Honda Price Update scraper. The scheduler now runs **every Sunday at 2 AM** by default and automatically catches up when runs are missed due to the computer being off.

## Changes Made

### 1. Scheduler Configuration Updated

**File**: [src/scheduler/scheduler.ts](src/scheduler/scheduler.ts)

**Key Changes**:
- Changed default schedule from daily (`'0 2 * * *'`) to weekly (`'0 2 * * 0'` - Sunday 2 AM)
- Made `start()` method async to support missed run checking
- Added configuration options:
  - `checkMissedRuns?: boolean` (default: true)
  - `scheduleIntervalHours?: number` (default: 168 = 1 week)

**New Logic** (lines 74-81):
```typescript
// Check for missed runs on startup
if (this.config.checkMissedRuns) {
  const missedRun = await schedulerState.checkMissedRun(this.config.scheduleIntervalHours);
  if (missedRun) {
    logger.warn('Missed run detected - running catch-up job now');
    await this.runNow();
  }
}
```

**Job Execution Updates** (lines 113-138):
- Created private `executeJob()` method that updates scheduler state after each run
- Records timestamp, status (success/failed), and next scheduled run
- Supports triggers: 'scheduled', 'manual', 'missed'

### 2. Scheduler State Management

**File**: [src/database/scheduler-state.ts](src/database/scheduler-state.ts)

**Purpose**: Track last run time to detect missed scheduled runs

**Key Methods**:

**`getLastRunTime()`**: Retrieves timestamp of last run
```typescript
async getLastRunTime(): Promise<Date | null> {
  const { data } = await supabase
    .from('scheduler_state')
    .select('last_run_at')
    .eq('id', 1)
    .single();
  return data?.last_run_at ? new Date(data.last_run_at) : null;
}
```

**`updateLastRun(status, nextRun)`**: Updates state after job completion
```typescript
async updateLastRun(
  status: 'success' | 'failed',
  nextRun?: Date
): Promise<void>
```

**`checkMissedRun(scheduleIntervalHours)`**: Detects if run was missed
```typescript
async checkMissedRun(scheduleIntervalHours: number): Promise<boolean> {
  const lastRun = await this.getLastRunTime();
  if (!lastRun) return false;

  const now = new Date();
  const hoursSinceLastRun = (now.getTime() - lastRun.getTime()) / (1000 * 60 * 60);

  // Add 1 hour buffer to account for slight delays
  const missedThreshold = scheduleIntervalHours + 1;

  if (hoursSinceLastRun >= missedThreshold) {
    logger.warn('Missed scheduled run detected', {
      lastRun: lastRun.toISOString(),
      hoursSince: hoursSinceLastRun.toFixed(2),
      threshold: missedThreshold,
    });
    return true;
  }

  return false;
}
```

### 3. Database Migration

**File**: [migrations/003_scheduler_state.sql](migrations/003_scheduler_state.sql)

**Schema**:
```sql
CREATE TABLE IF NOT EXISTS scheduler_state (
  id INTEGER PRIMARY KEY DEFAULT 1,
  last_run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_run_status VARCHAR(20) NOT NULL DEFAULT 'success',
  next_scheduled_run TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Ensure only one row exists
  CONSTRAINT scheduler_state_single_row CHECK (id = 1)
);

-- Add index for last_run_at queries
CREATE INDEX IF NOT EXISTS idx_scheduler_state_last_run
  ON scheduler_state(last_run_at DESC);

-- Insert initial row if not exists
INSERT INTO scheduler_state (id, last_run_at, last_run_status)
VALUES (1, NOW(), 'success')
ON CONFLICT (id) DO NOTHING;
```

**To Run Migration**:
```bash
# Display the SQL (needs to be run in Supabase SQL Editor)
node run-scheduler-migration.js

# Or use Supabase CLI if available
supabase db execute --file migrations/003_scheduler_state.sql
```

### 4. Main Entry Point Updated

**File**: [src/index.ts](src/index.ts)

**Changes** (lines 136-147):
```typescript
const customScheduler = new JobScheduler({
  schedule: scheduleArg ? scheduleArg.split('=')[1] : '0 2 * * 0', // Weekly by default
  runOnStart,
  enabled: true,
  checkMissedRuns: true, // Enable missed run detection
  scheduleIntervalHours: 168, // 168 hours = 1 week
});

// Start the scheduler (now async to check for missed runs)
await customScheduler.start();
```

### 5. Documentation Updated

**File**: [SCHEDULER.md](SCHEDULER.md)

**Updates**:
- Changed default schedule documentation from "2 AM daily" to "2 AM every Sunday (weekly)"
- Added comprehensive "Missed Run Detection & Recovery" section explaining:
  - How the detection algorithm works
  - Real-world example scenario
  - Buffer time calculations
  - Recovery behavior

## How It Works

### Startup Sequence

1. **Scheduler starts**: `await customScheduler.start()`
2. **Validate cron expression**: Ensure schedule is valid
3. **Check for missed runs**:
   - Query `scheduler_state` table for last run timestamp
   - Calculate hours since last run
   - Compare against schedule interval (168 hours) + 1 hour buffer
4. **Execute catch-up if needed**:
   - If missed run detected → run job immediately
   - Update state with current timestamp
5. **Schedule next run**: Set up cron job for next Sunday at 2 AM
6. **Keep process alive**: Listen for shutdown signals

### Job Execution Flow

```
Scheduled trigger (Sunday 2 AM)
  ↓
Check if previous job still running
  ↓ (if not running)
Execute job: runNightlyJob()
  ↓
Update scheduler_state:
  - last_run_at = NOW()
  - last_run_status = 'success' or 'failed'
  - next_scheduled_run = next Sunday 2 AM
  ↓
Schedule next run
```

### Missed Run Detection Algorithm

```typescript
hoursSinceLastRun = (now - lastRun) / (1000 * 60 * 60)
missedThreshold = scheduleIntervalHours + 1 // 169 hours for weekly

if (hoursSinceLastRun >= missedThreshold) {
  // Missed run detected → execute catch-up job
  await runNow();
}
```

**Example Calculation**:
- Schedule: Weekly (168 hours)
- Threshold: 169 hours (168 + 1 hour buffer)
- Last run: Sunday 2:00 AM
- Current time: Following Saturday 3:00 PM
- Hours elapsed: 157 hours
- Missed? No (157 < 169)

**Example Missed Run**:
- Schedule: Weekly (168 hours)
- Threshold: 169 hours
- Last run: Sunday Nov 3, 2:00 AM
- Current time: Saturday Nov 9, 10:00 AM
- Hours elapsed: 152 hours (6 days 8 hours)
- Computer was off: Sunday Nov 10 at 2:00 AM (scheduled run)
- When computer turns on: Monday Nov 11 at 9:00 AM
- Hours elapsed: 175 hours (7 days 7 hours)
- Missed? Yes (175 >= 169)
- Action: Run catch-up job immediately

## Testing

### Test Immediate Run
```bash
npm run dev:scheduler:now
```
This will:
1. Start the scheduler
2. Check for missed runs (none on first start)
3. Run job immediately due to `--run-now` flag
4. Update scheduler state
5. Schedule next run for Sunday 2 AM

### Test Weekly Schedule
```bash
npm run dev:scheduler
```
This will:
1. Start the scheduler
2. Check for missed runs
3. Schedule next run for Sunday 2 AM
4. Wait until then to execute

### Simulate Missed Run
1. Run the scheduler once to populate the database:
   ```bash
   npm run dev:scheduler:now
   ```

2. Manually update the `last_run_at` timestamp in Supabase to be >169 hours ago:
   ```sql
   UPDATE scheduler_state
   SET last_run_at = NOW() - INTERVAL '170 hours'
   WHERE id = 1;
   ```

3. Restart the scheduler:
   ```bash
   npm run dev:scheduler
   ```

4. Expected behavior:
   - Logs: "Missed scheduled run detected"
   - Logs: "Missed run detected - running catch-up job now"
   - Job executes immediately
   - State updates with current timestamp
   - Next run scheduled for upcoming Sunday 2 AM

## Configuration Options

### Custom Schedule
```bash
# Every day at 3 AM
tsx src/index.ts --mode=scheduler --schedule="0 3 * * *"

# Every Monday at 2 AM
tsx src/index.ts --mode=scheduler --schedule="0 2 * * 1"

# Twice a week (Wednesday and Saturday at 2 AM)
tsx src/index.ts --mode=scheduler --schedule="0 2 * * 3,6"
```

### Programmatic Configuration
```typescript
const scheduler = new JobScheduler({
  schedule: '0 2 * * 0', // Weekly
  checkMissedRuns: true, // Enable detection
  scheduleIntervalHours: 168, // 1 week
  runOnStart: false, // Don't run immediately
  enabled: true, // Scheduler enabled
});

await scheduler.start();
```

## Files Modified

| File | Purpose | Key Changes |
|------|---------|-------------|
| [src/scheduler/scheduler.ts](src/scheduler/scheduler.ts) | Scheduler logic | Weekly schedule, async start, missed run check, state updates |
| [src/database/scheduler-state.ts](src/database/scheduler-state.ts) | State management | New file - tracks last run, provides detection logic |
| [src/index.ts](src/index.ts) | Entry point | Async scheduler start, weekly config, missed run enabled |
| [migrations/003_scheduler_state.sql](migrations/003_scheduler_state.sql) | Database schema | New table for scheduler state tracking |
| [SCHEDULER.md](SCHEDULER.md) | Documentation | Updated with weekly schedule and missed run details |

## Benefits

✅ **Automatic Recovery**: Never miss a scheduled scrape even if computer is off
✅ **Reduced Frequency**: Weekly runs (vs daily) reduce Firecrawl API costs by 85%
✅ **State Persistence**: Database tracks last run across restarts
✅ **Flexible Schedule**: Easy to customize via config or command-line
✅ **Robust Error Handling**: State updates even on job failures
✅ **Clear Logging**: Detailed logs for debugging and monitoring

## Next Steps

1. **Run the database migration** in Supabase SQL Editor
2. **Test the scheduler** with `npm run dev:scheduler:now`
3. **Verify state updates** by checking the `scheduler_state` table
4. **Simulate missed run** using the testing instructions above
5. **Deploy to production** using PM2 or systemd for 24/7 operation

## Monitoring

Check scheduler state anytime:
```sql
SELECT
  last_run_at,
  last_run_status,
  next_scheduled_run,
  EXTRACT(EPOCH FROM (NOW() - last_run_at)) / 3600 as hours_since_last_run
FROM scheduler_state
WHERE id = 1;
```

Expected output:
```
last_run_at          | 2025-11-03 02:00:00+00
last_run_status      | success
next_scheduled_run   | 2025-11-10 02:00:00+00
hours_since_last_run | 12.5
```
