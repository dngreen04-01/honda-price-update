# How to Get Your Supabase Keys

## The Issue

You're getting "Invalid API key" because you need the correct **service_role** key from Supabase.

## Steps to Get the Correct Keys

1. **Go to Supabase Dashboard**
   - Visit: https://app.supabase.com
   - Select your project: `fpuhbowlnupfalcgikyz`

2. **Navigate to Project Settings**
   - Click the ⚙️ **Settings** icon in the left sidebar
   - Click **API** in the settings menu

3. **Copy the Correct Keys**

   You'll see two important sections:

   ### Project URL
   ```
   https://fpuhbowlnupfalcgikyz.supabase.co
   ```
   ✅ This is your `SUPABASE_URL` (you already have this correct)

   ### Project API keys

   There are TWO keys shown:

   **❌ anon / public key** (starts with `eyJ...`)
   - This is for client-side apps
   - **DO NOT use this** for the scraper

   **✅ service_role key** (also starts with `eyJ...` but is MUCH longer)
   - This is for server-side apps
   - This has full access to bypass Row Level Security
   - **This is what you need!**
   - It should be around 200+ characters long

4. **Update Your .env File**

   Replace the value of `SUPABASE_SERVICE_KEY` with the **service_role** key:

   ```env
   SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6...VERY_LONG_STRING...
   ```

   ⚠️ **Make sure to copy the entire key** - it's very long (200+ characters)!

5. **Test Again**

   ```bash
   node test-db.js
   ```

   You should now see:
   ```
   ✅ Database connected!
   ✅ Found 3 domains
   ```

## Visual Guide

In the Supabase Dashboard → Settings → API page, you'll see:

```
┌─────────────────────────────────────────────┐
│ Project API keys                             │
├─────────────────────────────────────────────┤
│ anon                                         │
│ public                                       │
│ eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...     │  ← DO NOT USE
│                                              │
│ service_role                                 │
│ secret                                       │
│ eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...     │  ← USE THIS ONE!
│ (very long key)                              │
└─────────────────────────────────────────────┘
```

## Security Note

⚠️ **Never commit the service_role key to git!**
- It has full database access
- The `.gitignore` already excludes `.env` files
- Keep this key secret

## Troubleshooting

**Still getting "Invalid API key"?**
- Make sure you copied the **entire** service_role key (it's very long)
- Check for extra spaces at the beginning or end
- Make sure there are no line breaks in the key
- The key should be one continuous string

**Can't find the service_role key?**
- Make sure you're logged into the correct Supabase account
- Check you're viewing the correct project
- The service_role key might be hidden - click "Reveal" or the eye icon

## After Fixing

Once you've updated the `.env` file with the correct key:

1. Test database: `node test-db.js`
2. If tables don't exist, see [MANUAL_MIGRATION.md](./MANUAL_MIGRATION.md)
3. Run full test: `node test-env.js && node test-db.js`
4. When both pass, you're ready to scrape!
