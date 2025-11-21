const API_BASE =
  window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:4000'
    : '';

const endpoints = {
  health: () => `${API_BASE}/api/health`,
  customers: () => `${API_BASE}/api/customers`,
  kitchens: () => `${API_BASE}/api/kitchens`,
  menuByKitchen: (id) => `${API_BASE}/api/kitchens/${id}/menu`,
  partners: () => `${API_BASE}/api/delivery-partners`,
  orders: () => `${API_BASE}/api/orders`,
  createOrder: () => `${API_BASE}/api/orders`,
  updateOrderStatus: (id) => `${API_BASE}/api/orders/${id}/status`,
  assignPartner: (id) => `${API_BASE}/api/orders/${id}/delivery`
};

const state = {
  customers: [],
  kitchens: [],
  partners: [],
  menu: [],
  cart: [],
  metrics: {
    active: 0,
    delivered: 0,
    revenue: 0,
    basket: 0
  },
  selectedCustomer: null,
  selectedKitchen: null
};

const els = {
  healthIndicator: document.getElementById('health-indicator'),
  customerSelect: document.getElementById('customer-select'),
  kitchenSelect: document.getElementById('kitchen-select'),
  menuList: document.getElementById('menu-list'),
  cartItems: document.getElementById('cart-items'),
  cartTotal: document.getElementById('cart-total'),
  placeOrderBtn: document.getElementById('place-order'),
  ordersList: document.getElementById('orders-list'),
  refreshOrdersBtn: document.getElementById('refresh-orders'),
  refreshAllBtn: document.getElementById('refresh-all'),
  metricsActive: document.getElementById('metric-active'),
  metricsDelivered: document.getElementById('metric-delivered'),
  metricsRevenue: document.getElementById('metric-revenue'),
  metricsBasket: document.getElementById('metric-basket'),
  toast: document.getElementById('toast')
};

const template = (id) => document.getElementById(id).content.firstElementChild.cloneNode(true);

let toastTimer = null;

async function api(path, options) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message ?? 'Request failed');
  }

  return response.json();
}

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR'
  }).format(amount ?? 0);
}

function showToast(message, type = 'info') {
  if (!els.toast) return;
  els.toast.textContent = message;
  els.toast.className = `toast ${type}`;
  els.toast.setAttribute('aria-live', 'polite');

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    els.toast.className = 'toast';
  }, 3500);
}

function renderSelect(select, items, placeholder = 'Select...') {
  select.innerHTML = '';
  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = placeholder;
  select.append(defaultOption);
  items.forEach((item) => {
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = item.name;
    select.append(option);
  });
}

function renderMenu() {
  els.menuList.innerHTML = '';

  if (!state.selectedKitchen) {
    els.menuList.innerHTML = '<p class="muted">Select a kitchen to load its menu.</p>';
    return;
  }

  state.menu.forEach((item) => {
    const node = template('menu-item-template');
    node.querySelector('.menu-name').textContent = item.itemName;
    node.querySelector('.menu-price').textContent = formatCurrency(item.price);
    const qtyInput = node.querySelector('.menu-qty');
    node.querySelector('.add-to-cart').addEventListener('click', () => {
      const quantity = Number(qtyInput.value);
      if (quantity <= 0 || Number.isNaN(quantity)) {
        alert('Quantity must be greater than zero');
        return;
      }
      addToCart({ ...item, quantity });
    });
    els.menuList.append(node);
  });
}

function addToCart(item) {
  const existing = state.cart.find((cartItem) => cartItem.id === item.id);
  if (existing) {
    existing.quantity += item.quantity;
  } else {
    state.cart.push({ ...item });
  }
  renderCart();
}

function removeFromCart(menuId) {
  state.cart = state.cart.filter((item) => item.id !== menuId);
  renderCart();
}

function renderCart() {
  els.cartItems.innerHTML = '';
  if (state.cart.length === 0) {
    els.cartItems.innerHTML = '<p class="muted">No items yet.</p>';
    els.placeOrderBtn.disabled = true;
    els.cartTotal.textContent = '₹0';
    return;
  }

  state.cart.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'cart-item';
    row.innerHTML = `
      <div>
        <strong>${item.itemName}</strong>
        <span class="muted">x${item.quantity}</span>
      </div>
      <div>
        ${formatCurrency(item.price * item.quantity)}
        <button class="link danger" aria-label="Remove ${item.itemName}">×</button>
      </div>
    `;
    row.querySelector('button').addEventListener('click', () => removeFromCart(item.id));
    els.cartItems.append(row);
  });

  const total = state.cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  els.cartTotal.textContent = formatCurrency(total);
  els.placeOrderBtn.disabled = false;
}

function updateMetrics(orders) {
  const active = orders.filter((order) => !['Delivered', 'Cancelled'].includes(order.status)).length;
  const delivered = orders.filter((order) => order.status === 'Delivered');
  const revenue = delivered.reduce((sum, order) => sum + Number(order.totalAmount ?? 0), 0);
  const avgBasket = orders.length > 0 ? orders.reduce((sum, order) => sum + Number(order.totalAmount ?? 0), 0) / orders.length : 0;

  state.metrics = {
    active,
    delivered: delivered.length,
    revenue,
    basket: avgBasket
  };

  els.metricsActive.textContent = active;
  els.metricsDelivered.textContent = delivered.length;
  els.metricsRevenue.textContent = formatCurrency(revenue);
  els.metricsBasket.textContent = formatCurrency(avgBasket);
}

async function placeOrder() {
  if (!state.selectedCustomer || !state.selectedKitchen || state.cart.length === 0) {
    alert('Select customer, kitchen and cart items');
    return;
  }

  els.placeOrderBtn.disabled = true;
  els.placeOrderBtn.textContent = 'Placing...';

  try {
    await api(endpoints.createOrder(), {
      method: 'POST',
      body: JSON.stringify({
        customerId: Number(state.selectedCustomer),
        kitchenId: Number(state.selectedKitchen),
        items: state.cart.map((item) => ({
          menuId: item.id,
          quantity: item.quantity
        }))
      })
    });
    state.cart = [];
    renderCart();
    await loadOrders();
    showToast('Order placed!');
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    els.placeOrderBtn.textContent = 'Place Order';
    els.placeOrderBtn.disabled = state.cart.length === 0;
  }
}

async function loadOrders() {
  els.ordersList.innerHTML = '<p class="muted">Loading...</p>';
  try {
    const orders = await api(endpoints.orders());
    if (orders.length === 0) {
      els.ordersList.innerHTML = '<p class="muted">No orders yet.</p>';
      updateMetrics([]);
      return;
    }

    els.ordersList.innerHTML = '';
    orders.forEach((order) => renderOrderCard(order));
    updateMetrics(orders);
  } catch (error) {
    els.ordersList.innerHTML = `<p class="muted">${error.message}</p>`;
    showToast(error.message, 'error');
  }
}

function renderOrderCard(order) {
  const node = template('order-card-template');
  node.querySelector('.order-title').textContent = `#${order.id} • ${order.customerName}`;
  node.querySelector('.order-subtitle').textContent = `${order.kitchenName}`;
  node.querySelector('.order-total').textContent = formatCurrency(order.totalAmount);

  const list = node.querySelector('.order-items');
  order.items.forEach((item) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <span>${item.itemName} × ${item.quantity}</span>
      <span>${formatCurrency(item.price * item.quantity)}</span>
    `;
    list.append(li);
  });

  const statusSelect = node.querySelector('.order-status');
  statusSelect.value = order.status;

  const partnerSelect = node.querySelector('.order-partner');
  renderSelect(partnerSelect, state.partners, 'Unassigned');
  partnerSelect.value = order.partnerId ?? '';

  node.querySelector('.order-update').addEventListener('click', async () => {
    try {
      await api(endpoints.updateOrderStatus(order.id), {
        method: 'PATCH',
        body: JSON.stringify({ status: statusSelect.value })
      });

      if (partnerSelect.value) {
        await api(endpoints.assignPartner(order.id), {
          method: 'POST',
          body: JSON.stringify({ partnerId: Number(partnerSelect.value) })
        });
      }
      await loadOrders();
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  els.ordersList.append(node);
}

async function loadMenu(kitchenId) {
  els.menuList.innerHTML = '<p class="muted">Loading menu...</p>';
  try {
    state.menu = await api(endpoints.menuByKitchen(kitchenId));
    renderMenu();
  } catch (error) {
    els.menuList.innerHTML = `<p class="muted">${error.message}</p>`;
  }
}

async function loadReferenceData(preserveSelection = true) {
  const previousCustomer = state.selectedCustomer;
  const previousKitchen = state.selectedKitchen;

  const [customers, kitchens, partners] = await Promise.all([
    api(endpoints.customers()),
    api(endpoints.kitchens()),
    api(endpoints.partners())
  ]);

  state.customers = customers;
  state.kitchens = kitchens;
  state.partners = partners;

  renderSelect(els.customerSelect, customers, 'Select customer');
  renderSelect(els.kitchenSelect, kitchens, 'Select kitchen');

  if (preserveSelection) {
    if (previousCustomer && customers.some((c) => String(c.id) === String(previousCustomer))) {
      els.customerSelect.value = previousCustomer;
      state.selectedCustomer = previousCustomer;
    }
    if (previousKitchen && kitchens.some((k) => String(k.id) === String(previousKitchen))) {
      els.kitchenSelect.value = previousKitchen;
      state.selectedKitchen = previousKitchen;
      loadMenu(previousKitchen);
    }
  }
}

async function initialize() {
  try {
    await api(endpoints.health());
    els.healthIndicator.textContent = 'API Connected';
    els.healthIndicator.style.backgroundColor = 'rgba(16,185,129,0.35)';
  } catch (error) {
    els.healthIndicator.textContent = 'API Offline';
    els.healthIndicator.style.backgroundColor = 'rgba(239,68,68,0.35)';
    throw error;
  }

  await loadReferenceData(false);

  els.customerSelect.addEventListener('change', (event) => {
    state.selectedCustomer = event.target.value;
  });

  els.kitchenSelect.addEventListener('change', (event) => {
    state.selectedKitchen = event.target.value;
    if (state.selectedKitchen) {
      loadMenu(state.selectedKitchen);
    } else {
      state.menu = [];
      renderMenu();
    }
  });

  els.placeOrderBtn.addEventListener('click', placeOrder);
  els.refreshOrdersBtn.addEventListener('click', loadOrders);
  els.refreshAllBtn.addEventListener('click', async () => {
    els.refreshAllBtn.disabled = true;
    els.refreshAllBtn.textContent = 'Syncing...';
    try {
      await loadReferenceData();
      await loadOrders();
      showToast('Data refreshed');
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      els.refreshAllBtn.textContent = 'Sync Data';
      els.refreshAllBtn.disabled = false;
    }
  });

  await loadOrders();
}

initialize().catch((error) => {
  console.error(error);
  alert('Unable to connect to API. Check that the backend is running.');
});

