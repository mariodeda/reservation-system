# Platform Admin Guide

Platform admin lives at `/platform`. It is for operators who manage restaurants
and system-level operations.

## Main Areas

- Restaurants: tenant cards, tenant creation, status, SMTP health summary, email
  feature state, and tenant detail access.
- Tenant detail: branding, public booking API configuration, CORS origins,
  domains, SMTP, email policy, templates, review URL, staff password reset,
  impersonation, mock data, and destructive actions.
- Logs: platform-visible route failures and operational events.
- Email logs: sent, failed, and skipped email activity across tenants.

## Operator Responsibilities

- Create tenants and assign public keys.
- Configure allowed marketing-site origins.
- Configure domains.
- Configure SMTP per restaurant.
- Enable or disable outbound email flows.
- Maintain booking confirmation and review request templates.
- Configure review URLs used by post-visit review request emails.
- Monitor SMTP health, API logs, and email delivery logs.
- Use impersonation only for support and debugging.

## Security Expectations

- Use a strong operator password.
- Re-authenticate for destructive or sensitive actions when prompted.
- Keep allowed origins narrow.
- Never place tenant SMTP credentials in global environment variables.
- Treat impersonation as privileged support access. Tenant users are not shown
  impersonation state, but platform logs record impersonated mutations.

