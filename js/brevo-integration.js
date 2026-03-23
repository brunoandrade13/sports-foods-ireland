/**
 * Sports Foods Ireland - Brevo Email Integration
 * Client-side: tracker identification + calls Supabase Edge Function for emails
 * API key is stored server-side (Supabase secrets) for security
 */

const SFI_BREVO = {
  SUPABASE_URL: 'https://styynhgzrkyoioqjssuw.supabase.co',
  LISTS: { NEWSLETTER: 5, CUSTOMERS: 6, B2B: 7 },
  TEMPLATES: {
    WELCOME_NEWSLETTER: 1,
    ORDER_CONFIRMATION: 2,
    SHIPPING_CONFIRMATION: 3,
    POST_PURCHASE_REVIEW: 4,
    ABANDONED_CART: 5,
    B2B_WELCOME: 6
  },

  // Identify user for Brevo tracker (client-side, no API key needed)
  identifyUser(email, firstName, lastName) {
    if (!email || !window.sendinblue) return;
    window.sendinblue.identify(email, {
      FIRSTNAME: firstName || '',
      LASTNAME: lastName || ''
    });
  },

  // Call Supabase Edge Function (server-side proxy to Brevo)
  async _callBrevoProxy(action, data) {
    try {
      const res = await fetch(`${this.SUPABASE_URL}/functions/v1/brevo-proxy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...data })
      });
      return await res.json();
    } catch (err) {
      console.error('Brevo proxy error:', err);
      return { success: false, message: 'Network error. Please try again.' };
    }
  },

  // Newsletter subscription
  async subscribeNewsletter(email, firstName = '') {
    return await this._callBrevoProxy('subscribe_newsletter', {
      email, firstName, listId: this.LISTS.NEWSLETTER,
      templateId: this.TEMPLATES.WELCOME_NEWSLETTER
    });
  },

  // Order confirmation
  async sendOrderConfirmation(order) {
    return await this._callBrevoProxy('send_order_confirmation', {
      email: order.email,
      templateId: this.TEMPLATES.ORDER_CONFIRMATION,
      params: {
        FIRSTNAME: order.firstName || 'Customer',
        ORDER_ID: order.orderId,
        ORDER_DATE: new Date().toLocaleDateString('en-IE'),
        ORDER_TOTAL: order.total,
        PAYMENT_METHOD: order.paymentMethod || 'Card',
        ORDER_ITEMS: (order.items || []).map(i => `${i.name} x${i.quantity} - €${i.total}`).join('<br>'),
        SHIPPING_ADDRESS: order.shippingAddress || ''
      },
      listId: this.LISTS.CUSTOMERS,
      attributes: {
        FIRSTNAME: order.firstName, LASTNAME: order.lastName,
        CUSTOMER_TYPE: order.customerType || 'b2c',
        LAST_ORDER_DATE: new Date().toISOString().split('T')[0]
      }
    });
  },

  // Shipping confirmation
  async sendShippingConfirmation(order) {
    return await this._callBrevoProxy('send_template', {
      email: order.email,
      templateId: this.TEMPLATES.SHIPPING_CONFIRMATION,
      params: {
        FIRSTNAME: order.firstName || 'Customer',
        ORDER_ID: order.orderId,
        TRACKING_NUMBER: order.trackingNumber || '',
        CARRIER: order.carrier || 'An Post / DPD',
        ESTIMATED_DELIVERY: order.estimatedDelivery || '2-5 business days',
        TRACKING_URL: order.trackingUrl || 'https://sportsfoodsireland.ie/tracking.html'
      }
    });
  },

  // Post-purchase review request
  async sendReviewRequest(email, firstName) {
    return await this._callBrevoProxy('send_template', {
      email, templateId: this.TEMPLATES.POST_PURCHASE_REVIEW,
      params: { FIRSTNAME: firstName || 'Customer' }
    });
  },

  // B2B Welcome
  async sendB2BWelcome(email, firstName) {
    return await this._callBrevoProxy('send_b2b_welcome', {
      email, firstName, listId: this.LISTS.B2B,
      templateId: this.TEMPLATES.B2B_WELCOME
    });
  },

  // Track ecommerce event (client-side, no API key needed)
  trackEvent(eventName, data) {
    if (window.sendinblue) {
      window.sendinblue.track(eventName, {}, data);
    }
  },

  trackPurchase(order) {
    this.trackEvent('order_completed', {
      id: order.orderId, revenue: parseFloat(order.total),
      items: (order.items || []).map(i => ({
        name: i.name, price: parseFloat(i.price), quantity: i.quantity
      }))
    });
  }
};

// Auto-init: hook newsletter forms
document.addEventListener('DOMContentLoaded', () => {
  const nlForms = document.querySelectorAll('.newsletter-form, #newsletter-form, [data-newsletter]');
  nlForms.forEach(form => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const emailInput = form.querySelector('input[type="email"]');
      const nameInput = form.querySelector('input[name="name"], input[name="firstName"]');
      if (!emailInput || !emailInput.value) return;
      const result = await SFI_BREVO.subscribeNewsletter(emailInput.value, nameInput ? nameInput.value : '');
      let msg = form.querySelector('.newsletter-msg');
      if (!msg) { msg = document.createElement('p'); msg.className = 'newsletter-msg'; form.appendChild(msg); }
      msg.textContent = result.message;
      msg.style.cssText = `color:${result.success ? '#169B62' : '#ef4444'};margin-top:8px;font-size:14px`;
      if (result.success) { emailInput.value = ''; if (nameInput) nameInput.value = ''; }
    });
  });
});

window.SFI_BREVO = SFI_BREVO;
