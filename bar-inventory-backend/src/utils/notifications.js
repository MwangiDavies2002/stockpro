/**
 * Notification utilities
 * Extend with email (nodemailer), SMS (Africa's Talking), or push alerts.
 */

/**
 * Called whenever an inventory item's stock drops to or below its threshold.
 * @param {Object} item - inventory_items row
 */
async function sendLowStockAlert(item) {
  const critical = item.stock <= Math.floor(item.threshold / 2);
  const level    = critical ? '🚨 CRITICAL' : '⚠️  LOW';

  // Console log — replace with email/SMS/push in production
  console.log(
    `[STOCK ALERT] ${level} — "${item.name}" has ${item.stock} ${item.unit} left (threshold: ${item.threshold})`
  );

  // ── Example: Africa's Talking SMS ──────────────────────────────────
  // const AfricasTalking = require('africastalking');
  // const at = AfricasTalking({ apiKey: process.env.AT_API_KEY, username: process.env.AT_USERNAME });
  // await at.SMS.send({
  //   to:      [process.env.ADMIN_PHONE],
  //   message: `BarStock Alert: "${item.name}" stock is ${level} (${item.stock} left).`,
  //   from:    process.env.AT_SENDER_ID,
  // });

  // ── Example: Email via nodemailer ──────────────────────────────────
  // const transporter = nodemailer.createTransport({ ... });
  // await transporter.sendMail({
  //   to:      process.env.ADMIN_EMAIL,
  //   subject: `${level} Stock: ${item.name}`,
  //   text:    `${item.name} is running low. Current stock: ${item.stock}. Threshold: ${item.threshold}.`,
  // });
}

/**
 * Called when an order status changes.
 * @param {Object} order  - orders row
 * @param {string} status - new status
 */
async function sendOrderStatusUpdate(order, status) {
  console.log(`[ORDER ALERT] Order #${order.id} → ${status.toUpperCase()}`);
  // Add email/SMS dispatch here
}

module.exports = { sendLowStockAlert, sendOrderStatusUpdate };
