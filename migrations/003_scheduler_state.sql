-- Migration: Add scheduler_state table
-- Purpose: Track last run time to detect missed scheduled runs

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

COMMENT ON TABLE scheduler_state IS 'Tracks scheduler state to detect missed runs when computer is off';
COMMENT ON COLUMN scheduler_state.last_run_at IS 'Timestamp of last successful or attempted run';
COMMENT ON COLUMN scheduler_state.last_run_status IS 'Status of last run: success or failed';
COMMENT ON COLUMN scheduler_state.next_scheduled_run IS 'Expected next run time';
