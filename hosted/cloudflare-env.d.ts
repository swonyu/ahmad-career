declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    CAREER_GOOGLE_CLIENT_ID?: string;
    CAREER_GOOGLE_CLIENT_SECRET?: string;
    CAREER_LINKEDIN_CLIENT_ID?: string;
    CAREER_LINKEDIN_CLIENT_SECRET?: string;
  }
}
