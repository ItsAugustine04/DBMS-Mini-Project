## Cloud Kitchen Ordering Stack

This repo contains a complete backend + frontend that sits on top of the existing `CloudKitchen` MySQL schema defined in `CloudKitchen.sql`. The stack is lightweight:

- **MySQL** database seeded via `CloudKitchen.sql`
- **Node.js / Express** API (`server/`)
- **Vanilla HTML/CSS/JS** dashboard (`client/`) served directly by the API

### 1. Set up the database

```bash
mysql -u root -p < CloudKitchen.sql
```

The script drops/creates the `CloudKitchen` database, tables, sample data, triggers and stored procedures (`place_new_order`, `add_payment`, `assign_delivery_partner`, etc.).

### 2. Configure and run the backend

```bash
cd server
cp env.sample .env             # update values as needed
npm install
npm run dev                    # or: npm start
```

Environment variables:

| Name | Description | Default |
| --- | --- | --- |
| `DB_HOST` | MySQL host | `localhost` |
| `DB_USER` | MySQL username | `root` |
| `DB_PASSWORD` | MySQL password | _empty_ |
| `DB_NAME` | Target database | `CloudKitchen` |
| `DB_POOL_LIMIT` | Connection pool size | `10` |
| `PORT` | Express port / frontend origin | `4000` |

Key API endpoints (all JSON):

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/api/health` | DB connectivity probe |
| GET | `/api/customers` | List customers |
| GET | `/api/kitchens` | List kitchens with menu counts |
| GET | `/api/kitchens/:id/menu` | Menu items for a kitchen |
| POST | `/api/orders` | Create order; payload contains `customerId`, `kitchenId`, and `items` array |
| GET | `/api/orders` | Orders with line items, totals, and delivery assignments |
| PATCH | `/api/orders/:orderId/status` | Update order status |
| POST | `/api/orders/:orderId/delivery` | Assign delivery partner (wraps stored procedure) |
| POST | `/api/payments` | Record payment for an order |

All routes are implemented with parameter validation and use MySQL transactions so order totals stay in sync with the triggers defined in the SQL script.

### 3. Frontend (served from the same Express app)

Navigating to `http://localhost:4000/` loads the dashboard stored in `client/`. Features include:

- Customer & kitchen selectors populated from live DB data.
- Menu browser per kitchen with cart management.
- Order placement hitting `/api/orders` (quantities validated per kitchen).
- Live orders board with status changes and delivery-partner assignment (calls `/api/orders/:id/status` and the stored procedure through `/api/orders/:id/delivery`).

Because the frontend uses the API endpoints directly, any edits made in the UI persist to the MySQL backend immediately.

### 4. Testing checklist

1. **Health** – `curl http://localhost:4000/api/health`.
2. **Menu load** – select kitchens in the UI and verify menu items match the DB.
3. **Order creation** – add multiple dishes to the cart, place an order, and confirm the new rows in `Order` + `OrderDetails` + trigger-calculated totals.
4. **Status flow** – change status via the dashboard and verify `Order.status` updates.
5. **Delivery assignment** – pick a partner from the dropdown; confirm `Delivery` + `Order.status` via SQL.

> If Node.js/npm are not available on your machine yet, install the LTS build from https://nodejs.org/en/download/.

