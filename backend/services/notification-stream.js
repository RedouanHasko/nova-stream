const clientsByUser = new Map();

function writeSseEvent(res, event, payload) {
  if (!res || res.writableEnded) return;
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload || {})}\n\n`);
}

function registerNotificationClient(userId, res) {
  const key = Number(userId);
  if (!clientsByUser.has(key)) {
    clientsByUser.set(key, new Set());
  }

  const bucket = clientsByUser.get(key);
  bucket.add(res);
  writeSseEvent(res, "connected", {
    ok: true,
    userId: key,
    timestamp: new Date().toISOString(),
  });

  return () => {
    const currentBucket = clientsByUser.get(key);
    if (!currentBucket) return;
    currentBucket.delete(res);
    if (currentBucket.size === 0) {
      clientsByUser.delete(key);
    }
  };
}

function publishNotificationEvent(userId, event, payload) {
  const key = Number(userId);
  const bucket = clientsByUser.get(key);
  if (!bucket || bucket.size === 0) return;

  for (const res of bucket) {
    writeSseEvent(res, event, payload);
  }
}

module.exports = {
  registerNotificationClient,
  publishNotificationEvent,
};
