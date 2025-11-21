import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pool from './db.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT ?? 4000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors());
app.use(express.json());

const asyncHandler = (fn) => async (req, res, next) => {
  try {
    await fn(req, res, next);
  } catch (error) {
    next(error);
  }
};

app.get('/api/health', asyncHandler(async (_req, res) => {
  await pool.query('SELECT 1');
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
}));

app.get('/api/customers', asyncHandler(async (_req, res) => {
  const [rows] = await pool.query('SELECT customerID AS id, customerName AS name FROM Customer ORDER BY customerName');
  res.json(rows);
}));

app.get('/api/kitchens', asyncHandler(async (_req, res) => {
  const [rows] = await pool.query(`
    SELECT k.kitchenID AS id,
           k.kitchenName AS name,
           k.location,
           COUNT(m.menuID) AS items
    FROM Kitchen k
    LEFT JOIN Menu m ON m.kitchenID = k.kitchenID
    GROUP BY k.kitchenID
    ORDER BY k.kitchenName
  `);
  res.json(rows);
}));

app.get('/api/kitchens/:id/menu', asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT menuID AS id, itemName, price FROM Menu WHERE kitchenID = ? ORDER BY itemName`,
    [req.params.id]
  );
  res.json(rows);
}));

app.get('/api/menu', asyncHandler(async (_req, res) => {
  const [rows] = await pool.query(`
    SELECT m.menuID AS id,
           m.itemName,
           m.price,
           k.kitchenID,
           k.kitchenName
    FROM Menu m
    JOIN Kitchen k ON k.kitchenID = m.kitchenID
    ORDER BY k.kitchenName, m.itemName
  `);
  res.json(rows);
}));

app.get('/api/orders', asyncHandler(async (_req, res) => {
  const [orders] = await pool.query(`
    SELECT o.orderID AS id,
           o.customerID,
           c.customerName AS customerName,
           o.kitchenID,
           k.kitchenName AS kitchenName,
           o.totalAmount,
           o.status,
           d.partnerID AS partnerId,
           dp.partnerName AS partnerName,
           d.deliveryStatus
    FROM \`Order\` o
    JOIN Customer c ON c.customerID = o.customerID
    JOIN Kitchen k ON k.kitchenID = o.kitchenID
    LEFT JOIN Delivery d ON d.orderID = o.orderID
    LEFT JOIN DeliveryPartner dp ON dp.partnerID = d.partnerID
    ORDER BY o.orderID DESC
    LIMIT 50
  `);

  const [items] = await pool.query(`
    SELECT od.orderID,
           od.menuID,
           m.itemName,
           od.quantity,
           m.price
    FROM OrderDetails od
    JOIN Menu m ON m.menuID = od.menuID
  `);

  const orderItems = items.reduce((acc, item) => {
    acc[item.orderID] = acc[item.orderID] ?? [];
    acc[item.orderID].push({
      menuID: item.menuID,
      itemName: item.itemName,
      price: item.price,
      quantity: item.quantity
    });
    return acc;
  }, {});

  const response = orders.map((order) => ({
    ...order,
    items: orderItems[order.id] ?? []
  }));

  res.json(response);
}));

app.post('/api/orders', asyncHandler(async (req, res) => {
  const { customerId, kitchenId, items } = req.body;

  if (!customerId || !kitchenId || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: 'customerId, kitchenId and at least one order item are required' });
  }

  const sanitizedItems = items
    .map((item) => ({
      menuId: Number(item.menuId),
      quantity: Number(item.quantity)
    }))
    .filter((item) => item.menuId && item.quantity > 0);

  if (sanitizedItems.length === 0) {
    return res.status(400).json({ message: 'Each item must have menuId and quantity > 0' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [validMenus] = await connection.query(
      'SELECT menuID FROM Menu WHERE menuID IN (?) AND kitchenID = ?',
      [sanitizedItems.map((item) => item.menuId), kitchenId]
    );

    if (validMenus.length !== sanitizedItems.length) {
      throw new Error('Menu items do not belong to selected kitchen');
    }

    const [orderResult] = await connection.query(
      'INSERT INTO `Order` (customerID, kitchenID, status) VALUES (?, ?, ?)',
      [customerId, kitchenId, 'Placed']
    );

    const orderId = orderResult.insertId;

    const detailValues = sanitizedItems.map(({ menuId, quantity }) => [orderId, menuId, quantity]);

    await connection.query(
      'INSERT INTO OrderDetails (orderID, menuID, quantity) VALUES ?',
      [detailValues]
    );

    await connection.commit();
    res.status(201).json({ orderId, message: 'Order placed successfully' });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));

app.patch('/api/orders/:orderId/status', asyncHandler(async (req, res) => {
  const { status } = req.body;
  const validStatuses = ['Placed', 'Preparing', 'Out for Delivery', 'Delivered', 'Cancelled'];

  if (!validStatuses.includes(status)) {
    return res.status(400).json({ message: `status must be one of ${validStatuses.join(', ')}` });
  }

  const [result] = await pool.query(
    'UPDATE `Order` SET status = ? WHERE orderID = ?',
    [status, req.params.orderId]
  );

  if (result.affectedRows === 0) {
    return res.status(404).json({ message: 'Order not found' });
  }

  res.json({ message: 'Status updated' });
}));

app.post('/api/payments', asyncHandler(async (req, res) => {
  const { orderId, paymentMethod, amount } = req.body;
  const validMethods = ['UPI', 'Card', 'Cash'];

  if (!orderId || !validMethods.includes(paymentMethod) || !amount) {
    return res.status(400).json({ message: 'orderId, paymentMethod (UPI|Card|Cash) and amount are required' });
  }

  const [orderRows] = await pool.query(
    'SELECT orderID FROM `Order` WHERE orderID = ?',
    [orderId]
  );

  if (orderRows.length === 0) {
    return res.status(404).json({ message: 'Order not found' });
  }

  await pool.query(
    'INSERT INTO Payment (orderID, paymentMethod, amount) VALUES (?, ?, ?)',
    [orderId, paymentMethod, amount]
  );

  res.status(201).json({ message: 'Payment recorded' });
}));

app.get('/api/delivery-partners', asyncHandler(async (_req, res) => {
  const [rows] = await pool.query(`
    SELECT partnerID AS id, partnerName AS name, vehicleType
    FROM DeliveryPartner
    ORDER BY partnerName
  `);
  res.json(rows);
}));

app.post('/api/orders/:orderId/delivery', asyncHandler(async (req, res) => {
  const { partnerId } = req.body;
  if (!partnerId) {
    return res.status(400).json({ message: 'partnerId is required' });
  }

  await pool.query('CALL assign_delivery_partner(?, ?)', [req.params.orderId, partnerId]);
  res.json({ message: 'Delivery partner assigned' });
}));

const clientDir = path.resolve(__dirname, '../../client');
app.use(express.static(clientDir));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return next();
  }
  return res.sendFile(path.join(clientDir, 'index.html'));
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ message: err.message ?? 'Internal Server Error' });
});

app.listen(PORT, () => {
  console.log(`Cloud Kitchen API listening on http://localhost:${PORT}`);
});

