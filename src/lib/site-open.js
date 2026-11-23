// SITUATION on reactioncore.uk asks to sign in with Google (or LinkedIn) — src/site/auth.js — and keeps each person's
// dashboards in Supabase (deploy/site.sql); CONTEXT stays open to everyone. Set to true to open SITUATION to everyone
// again (no sign-in, the dashboards kept in the visitor's own browser); the server reads the same switch.
export const SITE_OPEN = false;
