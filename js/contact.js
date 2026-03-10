/**
 * SFI Contact Form Handler
 */
(function() {
'use strict';
const form = document.getElementById('contactForm');
if (!form) return;

form.addEventListener('submit', async function(e) {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    const orig = btn.textContent;
    btn.textContent = 'Sending...';
    btn.disabled = true;

    const data = {
        name: form.querySelector('#name').value.trim(),
        email: form.querySelector('#email').value.trim(),
        subject: form.querySelector('#subject').value,
        message: form.querySelector('#message').value.trim(),
        created_at: new Date().toISOString()
    };

    try {
        if (window.sfi?.db?.insert) {
            await sfi.db.insert('contact_messages', data);
        }
        form.innerHTML = `
            <div style="text-align:center;padding:40px 0">
                <div style="font-size:3rem;margin-bottom:16px">✅</div>
                <h2>Message Sent!</h2>
                <p style="color:var(--color-text-secondary);margin-top:8px">
                    Thanks ${data.name}, we'll get back to you within 24 hours.
                </p>
            </div>`;
    } catch (err) {
        btn.textContent = orig;
        btn.disabled = false;
        if (typeof showNotification === 'function') {
            showNotification('Failed to send. Please try again.', 'error');
        }
    }
});
})();
