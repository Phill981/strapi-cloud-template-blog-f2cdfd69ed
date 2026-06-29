'use strict';

/**
 * Self-hosted Strapi does not email admin-panel invitations: inviting a user
 * (Settings -> Administration Panel -> Users -> Invite) mints a
 * `registrationToken` and shows a copyable link, but never sends it.
 *
 * This wraps the `admin::user` service `create` method so that whenever an
 * invited user is created (i.e. a registration token is generated and the
 * account is not yet active), we email them the registration link through the
 * configured email plugin.
 */

function buildRegisterUrl(strapi, token) {
  // Full public URL of the admin panel, e.g. https://host/admin
  let base = process.env.ADMIN_PUBLIC_URL || '';

  if (!base) {
    const adminPath = strapi.config.get('admin.url', '/admin');
    const serverUrl = strapi.config.get('server.url', '') || '';
    base = `${serverUrl}${adminPath}`;
  }

  base = base.replace(/\/+$/, '');
  return `${base}/auth/register?registrationToken=${encodeURIComponent(token)}`;
}

async function sendInviteEmail(strapi, user) {
  const url = buildRegisterUrl(strapi, user.registrationToken);
  const name = [user.firstname, user.lastname].filter(Boolean).join(' ') || user.email;

  if (!/^https?:\/\//.test(url)) {
    strapi.log.warn(
      `[admin-invite-email] ADMIN_PUBLIC_URL is not set and no absolute admin URL is configured; ` +
        `the invite link "${url}" is relative and may not work. Set ADMIN_PUBLIC_URL (e.g. https://your-host/admin).`
    );
  }

  await strapi.plugin('email').service('email').send({
    to: user.email,
    subject: 'You have been invited to the Legmon admin panel',
    text:
      `Hello ${name},\n\n` +
      `You have been invited to the Legmon administration panel.\n` +
      `Click the link below to set your password and activate your account:\n\n` +
      `${url}\n\n` +
      `Thanks,\nAdministration Panel`,
    html:
      `<p>Hello ${name},</p>` +
      `<p>You have been invited to the <strong>Legmon</strong> administration panel.</p>` +
      `<p>Click the link below to set your password and activate your account:</p>` +
      `<p><a href="${url}">${url}</a></p>` +
      `<p>Thanks,<br/>Administration Panel</p>`,
  });
}

module.exports = function registerAdminInviteEmail(strapi) {
  const userService = strapi.service('admin::user');

  if (!userService || typeof userService.create !== 'function') {
    strapi.log.warn('[admin-invite-email] admin::user service unavailable; invite emails not wired.');
    return;
  }

  const originalCreate = userService.create.bind(userService);

  userService.create = async (attributes) => {
    const createdUser = await originalCreate(attributes);

    // Only invited users get a registrationToken and start inactive.
    // Users created with a pre-set password don't need the magic link.
    const isInvite = createdUser && createdUser.registrationToken && createdUser.isActive === false;

    if (isInvite) {
      try {
        await sendInviteEmail(strapi, createdUser);
        strapi.log.info(`[admin-invite-email] Invitation email sent to ${createdUser.email}`);
      } catch (err) {
        // Never block user creation on a mail failure — the copyable link
        // in the admin UI is still the source of truth.
        strapi.log.error(`[admin-invite-email] Failed to send invite email to ${createdUser.email}: ${err.message}`);
      }
    }

    return createdUser;
  };

  strapi.log.info('[admin-invite-email] Admin invitation emails enabled.');
};
