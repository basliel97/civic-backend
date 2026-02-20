import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT) || 4000,
  faydaUrl: process.env.FAYDA_API_URL!,
  supabase: {
    url: process.env.SUPABASE_URL!,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  },
  // Better Auth configuration
  databaseUrl: process.env.DATABASE_URL!,
  betterAuthUrl: process.env.BETTER_AUTH_URL || `http://localhost:${process.env.PORT || 4000}`,
  betterAuthSecret: process.env.BETTER_AUTH_SECRET!,
  // CORS trusted origins (comma-separated)
  trustedOrigins: process.env.TRUSTED_ORIGINS,
};