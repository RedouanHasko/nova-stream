const prisma = require("../db");
const { publishNotificationEvent } = require("./notification-stream");

async function getMatchingUsers({ role, resellerId, userIds } = {}) {
  const users = await prisma.user.findMany({ orderBy: { createdAt: "desc" } });
  return (Array.isArray(users) ? users : []).filter((user) => {
    if (
      role &&
      (user.role || "").toString().toLowerCase() !==
        role.toString().toLowerCase()
    ) {
      return false;
    }
    if (
      resellerId !== undefined &&
      Number(user.resellerId || 0) !== Number(resellerId)
    ) {
      return false;
    }
    if (
      Array.isArray(userIds) &&
      userIds.length > 0 &&
      !userIds.map((id) => Number(id)).includes(Number(user.id))
    ) {
      return false;
    }
    return true;
  });
}

async function createNotification({
  userId,
  type = "INFO",
  title,
  message,
  link = "/credits",
  data = null,
}) {
  if (!prisma.notification || !userId || !title || !message) return null;

  const created = await prisma.notification.create({
    data: {
      userId: Number(userId),
      type,
      title,
      message,
      link,
      data,
    },
  });

  publishNotificationEvent(Number(userId), "notification", {
    type: "notification",
    notification: created,
  });

  return created;
}

async function createNotificationsForUsers(users, payload) {
  const uniqueIds = [
    ...new Set((users || []).map((user) => Number(user.id)).filter(Boolean)),
  ];
  const results = [];

  for (const userId of uniqueIds) {
    try {
      const created = await createNotification({ ...payload, userId });
      if (created) results.push(created);
    } catch (error) {
      console.error("Failed creating notification for user", userId, error);
    }
  }

  return results;
}

async function notifyUsersByRole(role, payload) {
  const users = await getMatchingUsers({ role });
  return createNotificationsForUsers(users, payload);
}

async function notifyResellerUsers(resellerId, payload) {
  if (!resellerId) return [];
  const users = await getMatchingUsers({ resellerId });
  return createNotificationsForUsers(users, payload);
}

module.exports = {
  createNotification,
  createNotificationsForUsers,
  notifyUsersByRole,
  notifyResellerUsers,
};
