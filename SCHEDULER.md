# Scheduler Guide

The scraper now supports **scheduler mode** to keep the server running continuously and execute scraping jobs on a schedule.

## Quick Start

### Development Mode (with auto-reload)
```bash
npm run dev:scheduler
```
Starts the scheduler in development mode. Runs the job at **2 AM daily** by default.

### Development Mode (run immediately)
```bash
npm run dev:scheduler:now
```
Starts the scheduler and runs the first job immediately, then continues on schedule.

### Production Mode
```bash
npm run build
npm run start:scheduler
```
Compile TypeScript and start the scheduler in production mode.

## Modes

### Scheduler Mode (Continuous)
```bash
tsx src/index.ts --mode=scheduler
```
- ✅ Keeps server running continuously
- ✅ Executes scraping jobs on schedule (default: 2 AM daily)
- ✅ Detects and recovers from missed runs when computer is off
- ✅ Prevents overlapping job executions
- ✅ Graceful shutdown on SIGINT/SIGTERM

### Once Mode (Default)
```bash
npm run scrape
```
- Runs the job once immediately
- Exits after completion
- Good for testing or manual runs

## Custom Schedule

You can customize the schedule using cron expressions:

```bash
# Run every hour
tsx src/index.ts --mode=scheduler --schedule="0 * * * *"

# Run every 6 hours
tsx src/index.ts --mode=scheduler --schedule="0 */6 * * *"

# Run at 3:30 AM daily
tsx src/index.ts --mode=scheduler --schedule="30 3 * * *"

# Run every Monday at 2 AM
tsx src/index.ts --mode=scheduler --schedule="0 2 * * 1"
```

### Cron Expression Format
```
┌────────────── minute (0-59)
│ ┌──────────── hour (0-23)
│ │ ┌────────── day of month (1-31)
│ │ │ ┌──────── month (1-12)
│ │ │ │ ┌────── day of week (0-7, 0 and 7 are Sunday)
│ │ │ │ │
* * * * *
```

Examples:
- `0 2 * * *` - Every day at 2:00 AM (daily - default)
- `0 2 * * 0` - Every Sunday at 2:00 AM (weekly)
- `0 */6 * * *` - Every 6 hours
- `30 3 * * 1` - Every Monday at 3:30 AM
- `0 0 1 * *` - First day of every month at midnight

## Features

### Missed Run Detection & Recovery
The scheduler automatically detects when scheduled runs were missed (e.g., when your computer was turned off) and executes a catch-up job immediately on startup.

**How it works:**
1. On startup, the scheduler checks the last run timestamp in the database
2. If the time since the last run exceeds the schedule interval + 1 hour buffer, it's considered a missed run
3. A catch-up job is executed immediately before resuming the normal schedule
4. After each successful run, the state is updated with the timestamp

**Example:**
- Schedule: Daily (every day at 2 AM)
- Last run: Monday Nov 11 at 2:00 AM
- Computer off: Tuesday-Wednesday
- Computer on: Thursday Nov 14 at 10:00 AM
- Detection: 2 days 8 hours (56 hours) > 25 hours threshold → Missed run detected
- Action: Catch-up job runs immediately at 10:00 AM
- Next run: Friday Nov 15 at 2:00 AM (normal schedule)

### Overlap Prevention
The scheduler prevents multiple jobs from running simultaneously. If a job is still running when the next scheduled time arrives, it will skip that execution and log a warning.

### Graceful Shutdown
Press `Ctrl+C` to gracefully stop the scheduler. It will:
1. Stop accepting new scheduled jobs
2. Wait for any running job to complete (if needed)
3. Exit cleanly

### Persistent Operation
The scheduler keeps the Node.js process alive indefinitely. It will continue running until:
- You manually stop it (Ctrl+C)
- The process receives a SIGTERM signal
- An unhandled error occurs

## Process Management

### Using PM2 (Recommended for Production)
```bash
# Install PM2
npm install -g pm2

# Start scheduler with PM2
pm2 start npm --name "honda-scraper" -- run start:scheduler

# View logs
pm2 logs honda-scraper

# Stop
pm2 stop honda-scraper

# Restart
pm2 restart honda-scraper

# Auto-start on system reboot
pm2 startup
pm2 save
```

### Using systemd (Linux)
Create `/etc/systemd/system/honda-scraper.service`:
```ini
[Unit]
Description=Honda Price Scraper
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/Honda Price Update
ExecStart=/usr/bin/npm run start:scheduler
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable honda-scraper
sudo systemctl start honda-scraper
sudo systemctl status honda-scraper
```

### Using Docker
```dockerfile
FROM node:20-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --production

COPY . .
RUN npm run build

CMD ["npm", "run", "start:scheduler"]
```

Build and run:
```bash
docker build -t honda-scraper .
docker run -d --name honda-scraper --restart unless-stopped honda-scraper
```

## Monitoring

### View Logs
The scheduler logs all activities:
- Startup information with next scheduled run time
- Job execution start/completion
- Errors and warnings
- Overlap prevention messages

### Health Checks
You can add HTTP health check endpoint or check process status:
```bash
# Check if process is running
ps aux | grep "node.*index.js.*scheduler"

# With PM2
pm2 status
```

## Troubleshooting

### Scheduler not running
- Check that you're using `--mode=scheduler`
- Verify cron expression is valid
- Check logs for errors

### Job not executing
- Verify the schedule with next run time in logs
- Check timezone settings (default: Europe/London)
- Ensure no overlap with previous jobs

### Memory leaks
- Monitor memory usage over time
- Consider adding memory limits with PM2 or Docker
- Restart periodically if needed

## Architecture

The scheduler is implemented in [src/scheduler/scheduler.ts](src/scheduler/scheduler.ts) and uses:
- **node-cron**: For cron-based scheduling
- **Overlap prevention**: Prevents concurrent job execution
- **Graceful shutdown**: Handles SIGINT/SIGTERM signals
- **Configurable schedules**: Via command-line arguments

The main entry point [src/index.ts](src/index.ts) supports two modes:
- **once**: Run job immediately and exit (default)
- **scheduler**: Keep running and execute on schedule
