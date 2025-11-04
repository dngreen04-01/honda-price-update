# Honda Price Monitor - Frontend

A lightweight internal dashboard for monitoring the Honda Price Update scraping system.

## Features

- **Authentication**: Secure login with Supabase Auth
- **Overview Dashboard**: Key metrics and system health monitoring
- **Scraping Tasks**: Monitor scraping performance by supplier
- **Price Changes**: Track price updates and history
- **Shopify Updates**: View Shopify synchronization status
- **Reconciliation**: Identify products missing from either system
- **Actions Required**: Prioritized list of items needing attention

## Tech Stack

- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **Authentication**: Supabase Auth
- **Database**: Supabase PostgreSQL
- **Routing**: React Router v6
- **Charts**: Recharts
- **Icons**: Lucide React
- **Date Formatting**: date-fns

## Setup

1. **Install Dependencies**

```bash
npm install
```

2. **Configure Environment Variables**

Copy `.env.example` to `.env` and fill in your Supabase credentials:

```bash
cp .env.example .env
```

Edit `.env`:
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

To get your Supabase credentials:
- Log in to [Supabase Dashboard](https://app.supabase.com)
- Select your project
- Go to Settings > API
- Copy the Project URL and anon/public key

3. **Set Up Supabase Auth**

In your Supabase project:
- Go to Authentication > Settings
- Enable Email provider
- Configure email templates (optional)
- Add your frontend URL to Site URL and Redirect URLs

4. **Run Development Server**

```bash
npm run dev
```

The app will be available at `http://localhost:5173`

## Build for Production

```bash
npm run build
```

The production build will be in the `dist` directory.

Preview the production build:
```bash
npm run preview
```

## Project Structure

```
frontend/
├── src/
│   ├── components/       # Reusable UI components
│   │   ├── ui/          # Base UI components (Button, Card, Input)
│   │   ├── layout/      # Layout components (DashboardLayout)
│   │   └── ProtectedRoute.tsx
│   ├── context/         # React contexts (AuthContext)
│   ├── lib/            # Libraries and utilities (Supabase client)
│   ├── pages/          # Page components
│   │   ├── Login.tsx
│   │   ├── SignUp.tsx
│   │   └── Dashboard/  # Dashboard pages
│   ├── types/          # TypeScript type definitions
│   ├── App.tsx         # Main app component
│   ├── main.tsx        # App entry point
│   └── index.css       # Global styles
├── public/             # Static assets
├── .env.example        # Environment variables template
├── tailwind.config.js  # Tailwind CSS configuration
├── vite.config.ts      # Vite configuration
└── package.json
```

## Authentication

### Creating the First User

1. Start the dev server: `npm run dev`
2. Navigate to `http://localhost:5173/signup`
3. Create your account with email and password
4. Check your email for verification (if email is configured in Supabase)
5. Log in at `http://localhost:5173/login`

### Managing Users

Users can be managed in the Supabase Dashboard:
- Go to Authentication > Users
- Add, edit, or delete users
- Reset passwords
- Manage user metadata

## Dashboard Pages

### Overview
- Total products tracked
- Scraping status and metrics
- Shopify sync statistics
- Extraction quality metrics
- Recent activity feed

### Scraping Tasks
- Performance by supplier
- Success rates
- Confidence levels
- Last scrape times

### Price Changes
- Recent price updates
- Price history
- Change percentages
- Comparison views

### Shopify Updates
- Sync status
- Updated products
- Last sync time
- Sync history

### Reconciliation
- Products only on supplier sites
- Products only in Shopify
- Discontinued products
- Status tracking

### Actions Required
- High priority items
- Price mismatches
- Missing products
- Low confidence extractions

## Deployment

### Vercel (Recommended)

1. Push your code to GitHub
2. Import project in [Vercel](https://vercel.com)
3. Add environment variables in Vercel dashboard
4. Deploy

### Netlify

1. Push your code to GitHub
2. Import project in [Netlify](https://netlify.com)
3. Build command: `npm run build`
4. Publish directory: `dist`
5. Add environment variables in Netlify dashboard

### Docker

```bash
# Build
docker build -t honda-price-monitor .

# Run
docker run -p 80:80 \
  -e VITE_SUPABASE_URL=your_url \
  -e VITE_SUPABASE_ANON_KEY=your_key \
  honda-price-monitor
```

## Security Considerations

- This is an **internal tool only** - do not expose to the public internet
- Use strong passwords for all accounts
- Enable Row Level Security (RLS) in Supabase if needed
- Regularly review user access
- Keep dependencies updated

## Troubleshooting

### "Missing Supabase environment variables" error
- Make sure `.env` file exists with correct values
- Restart the dev server after changing `.env`

### Authentication not working
- Check Supabase project settings
- Verify Site URL and Redirect URLs are configured
- Check browser console for errors

### Data not loading
- Verify Supabase credentials are correct
- Check Supabase project is not paused
- Check browser network tab for API errors
- Verify database tables exist and have data

## Support

For backend setup and configuration, see the main project README in the parent directory.

## License

Internal use only.
