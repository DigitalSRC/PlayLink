// Where the app's legal pages and support contact live. They are served from the LandingPage
// branch through GitHub Pages; once silvenari.com is set as its custom domain, GitHub redirects
// these github.io addresses there by itself, so the app needs no change. If the pages ever move
// somewhere GitHub does not redirect from, change SITE_URL and ship a new build.

/** The landing page's address. Ends with a slash so page names can be appended. */
export const SITE_URL = 'https://digitalsrc.github.io/PlayLink/';

export const PRIVACY_URL = `${SITE_URL}privacy.html`;
export const TERMS_URL = `${SITE_URL}terms.html`;
/** Google Play asks for a web page that explains how to delete an account. */
export const DELETE_ACCOUNT_URL = `${SITE_URL}delete-account.html`;

/** Forwards to the developer's own inbox (Cloudflare Email Routing on silvenari.com). */
export const SUPPORT_EMAIL = 'support@silvenari.com';

/** PlayLink is for adults only; sign-up asks the player to confirm it. */
export const MIN_AGE = 18;
