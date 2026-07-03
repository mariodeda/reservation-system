# Platform Admin Guide

Platform admin lives at `/platform`. It is for operators who create restaurants,
configure sensitive system settings, support staff users, and investigate
operational issues across tenants.

Platform admin is not a daily reservation workspace. When an operator needs to
see a tenant's staff UI for support, they should use the tenant detail
impersonation action instead of trying to manage tenant data directly from
platform-only screens.

## Main Areas

| Area | What It Is For |
| --- | --- |
| Restaurants | Tenant cards, tenant creation, status, SMTP health summary, email feature state, and tenant detail access. |
| Tenant detail | Branding, public booking API configuration, origins, domains, SMTP, email policy, templates, review URL, external reservation integrations, staff password reset, impersonation, mock data, and destructive actions. |
| Logs | Platform-visible route failures and operational events. |
| Email logs | Sent, failed, and skipped email activity across tenants. |
| Docs | This bilingual operating guide. |

## Operator Responsibilities

Platform operators own configuration that affects security, delivery, and
external integrations:

- Create restaurants and assign stable slugs.
- Generate and maintain public tenant keys.
- Configure marketing-site allowed origins.
- Configure domains.
- Configure SMTP per restaurant.
- Enable or disable outbound email flows.
- Maintain booking confirmation and review request templates.
- Configure review URLs for post-visit review request emails.
- Configure and monitor one-way external reservation integrations such as
  TheFork and DISH.
- Monitor SMTP health, API logs, and email delivery logs.
- Reset staff passwords when necessary.
- Use impersonation only for support and debugging.

Restaurant staff should not configure these items. Keeping them platform-only
reduces the risk of tenant misconfiguration, credential exposure, and
cross-tenant mistakes.

## Recommended New Tenant Setup

1. Create the tenant with the correct restaurant name, slug, and initial status.
2. Confirm branding and public display details.
3. Confirm or generate the public tenant key.
4. Add all marketing website origins that will call the public API.
5. Configure domains if the tenant uses same-domain routing.
6. Configure SMTP and run an SMTP health check.
7. Configure booking confirmation and review request templates.
8. Configure the review URL if review request emails will be enabled.
9. Configure external reservation integrations only after the restaurant has
   supplied the correct provider credentials and restaurant identifier.
10. Enable the desired email events only after SMTP and templates are ready.
11. Create or reset staff credentials and share them through a secure channel.
12. Ask staff to configure tables, availability, services, and policy before
    accepting live bookings.

## Reading Restaurant Cards

Restaurant cards are designed to surface the most important operational state
without opening each tenant:

- Status tells whether the tenant is active.
- Last booking helps identify recent usage.
- SMTP health shows whether the app can connect to the tenant SMTP server.
- Booking confirmation state shows whether that flow is actually ready.
- Review request state shows whether review request email is actually ready.
- External sync setup shows whether TheFork or DISH are configured and enabled
  on the tenant detail page.

Email flow state is derived from real readiness. A flow should show active only
when the tenant-wide email switch, the specific event switch, SMTP readiness,
required template content, recipient requirements, and review URL requirements
are satisfied.

## Security Expectations

- Use strong operator passwords.
- Re-authenticate when prompted for destructive or sensitive actions.
- Keep allowed origins narrow and exact.
- Do not put tenant SMTP credentials in environment variables.
- Treat impersonation as privileged support access.
- Avoid making tenant operational changes unless actively supporting that
  restaurant.
- Check logs before guessing when a tenant reports a failed save or 403.

Tenant users are not shown impersonation state, but platform logs record
impersonated mutations so support activity remains auditable.

## Common Operator Workflows

### A restaurant cannot save platform tenant settings

1. Confirm the operator is logged into `/platform`.
2. Check whether the action requires password re-authentication.
3. Check platform logs for the failed route and request metadata.
4. Confirm the payload is valid and sanitized fields are not being rejected.
5. Confirm the tenant is not disabled if the operation depends on active status.

### A marketing website cannot call public APIs

1. Confirm it uses the correct public key in `?tenant=<publicKey>`.
2. Confirm its exact origin is listed in allowed origins.
3. Confirm the public endpoint returns tenant data from the browser.
4. Check whether CORS preflight succeeds.
5. Check logs for non-200 public responses.

### A booking or review email did not arrive

1. Check the tenant card SMTP state.
2. Open email logs and filter by tenant and recipient.
3. Look for `sent`, `failed`, or `skipped`.
4. If skipped, fix the policy/configuration reason first.
5. If sent but not received, check recipient spam/quarantine and later bounces.

### External bookings are missing or stale

1. Open the tenant detail page and confirm the provider integration is enabled.
2. For TheFork, confirm Client ID, Client secret, Restaurant UUID, webhook URL,
   and tenant-specific webhook token.
3. For DISH, confirm the manager login still succeeds.
4. Run the relevant manual sync and watch the progress result.
5. Open platform logs and search `external_sync`, provider name, or external
   reservation id.
6. Remember that external reservations are read-only locally except for table
   assignment, but they still reduce public availability for that tenant.
