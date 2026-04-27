/**
 * SFI Product Reviews
 * Loads reviews from Supabase, renders them, handles submissions
 */
(function () {
  'use strict';

  const SUPABASE_URL = 'https://styynhgzrkyoioqjssuw.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN0eXluaGd6cmt5b2lvcWpzc3V3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA0Mjg4NzcsImV4cCI6MjA4NjAwNDg3N30.Qx7g5brABFwFKnv_ZLRYteSXnGSaLTKpDFbbSUYepbE';
  const REVIEWS_PER_PAGE = 5;

  let allReviews = [];
  let displayedCount = 0;
  let currentProductId = null;
  let selectedRating = 0;

  // ── Supabase helpers ─────────────────────────
  function headers() {
    return {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json'
    };
  }

  async function fetchReviews(productId) {
    const url = SUPABASE_URL + '/rest/v1/reviews'
      + '?product_id=eq.' + productId
      + '&review_status=eq.approved'
      + '&select=id,rating,title,body,reviewer_name,verified_purchase,helpful_votes,admin_reply,created_at'
      + '&order=created_at.desc';
    const res = await fetch(url, { headers: headers() });
    if (!res.ok) throw new Error('Failed to load reviews');
    return res.json();
  }

  async function submitReview(data) {
    const res = await fetch(SUPABASE_URL + '/rest/v1/reviews', {
      method: 'POST',
      headers: { ...headers(), 'Prefer': 'return=representation' },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to submit review');
    }
    return res.json();
  }

  async function voteHelpful(reviewId) {
    const url = SUPABASE_URL + '/rest/v1/rpc/increment_helpful_votes';
    // Fallback: use PATCH if RPC doesn't exist
    try {
      const res = await fetch(SUPABASE_URL + '/rest/v1/reviews?id=eq.' + reviewId, {
        method: 'PATCH',
        headers: { ...headers(), 'Prefer': 'return=minimal' },
        body: JSON.stringify({ helpful_votes: 'helpful_votes + 1' })
      });
      // If PATCH doesn't support expressions, read+write
      if (!res.ok) {
        const current = await fetch(SUPABASE_URL + '/rest/v1/reviews?id=eq.' + reviewId + '&select=helpful_votes', { headers: headers() }).then(r => r.json());
        const votes = (current[0]?.helpful_votes || 0) + 1;
        await fetch(SUPABASE_URL + '/rest/v1/reviews?id=eq.' + reviewId, {
          method: 'PATCH',
          headers: { ...headers(), 'Prefer': 'return=minimal' },
          body: JSON.stringify({ helpful_votes: votes })
        });
      }
    } catch (e) { /* silent */ }
  }

  // ── Render helpers ───────────────────────────
  function starsHTML(rating, size) {
    size = size || 14;
    let s = '';
    for (let i = 1; i <= 5; i++) {
      s += '<span style="color:' + (i <= rating ? '#f59e0b' : '#d1d5db') + ';font-size:' + size + 'px">★</span>';
    }
    return s;
  }

  function formatDate(iso) {
    const d = new Date(iso);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
  }

  function renderSummary(reviews) {
    const el = document.getElementById('reviewsSummary');
    if (!el) return;
    if (reviews.length === 0) { el.innerHTML = ''; return; }

    const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
    const counts = [0, 0, 0, 0, 0];
    reviews.forEach(r => { if (r.rating >= 1 && r.rating <= 5) counts[r.rating - 1]++; });

    let barsHTML = '';
    for (let i = 5; i >= 1; i--) {
      const pct = reviews.length > 0 ? (counts[i - 1] / reviews.length * 100) : 0;
      barsHTML += '<div class="review-bar-row">'
        + '<span class="review-bar-label">' + i + '</span>'
        + '<div class="review-bar-track"><div class="review-bar-fill" style="width:' + pct.toFixed(0) + '%"></div></div>'
        + '<span class="review-bar-count">' + counts[i - 1] + '</span>'
        + '</div>';
    }

    el.innerHTML = '<div class="reviews-avg-score">'
      + '<div class="reviews-avg-number">' + avg.toFixed(1) + '</div>'
      + '<div class="reviews-avg-stars">' + starsHTML(Math.round(avg), 16) + '</div>'
      + '<div class="reviews-avg-count">' + reviews.length + ' review' + (reviews.length !== 1 ? 's' : '') + '</div>'
      + '</div>'
      + '<div class="reviews-bars">' + barsHTML + '</div>';
  }

  function renderReviewCard(r) {
    let html = '<div class="review-card">'
      + '<div class="review-card-header">'
      + '<div>'
      + '<span class="review-author">' + escHTML(r.reviewer_name) + '</span> ';
    if (r.verified_purchase) html += '<span class="review-verified">✓ Verified Purchase</span>';
    html += '</div>'
      + '<span class="review-date">' + formatDate(r.created_at) + '</span>'
      + '</div>'
      + '<div class="review-stars">' + starsHTML(r.rating) + '</div>';
    if (r.title) html += '<div class="review-title">' + escHTML(r.title) + '</div>';
    html += '<div class="review-body">' + escHTML(r.body) + '</div>';
    if (r.admin_reply) {
      html += '<div class="review-admin-reply"><strong>Sports Foods Ireland</strong><br>' + escHTML(r.admin_reply) + '</div>';
    }
    html += '<div class="review-helpful">'
      + '<span>Helpful?</span>'
      + '<button class="btn-helpful" data-review-id="' + r.id + '" onclick="window.__sfiVoteHelpful(this)">'
      + '👍 ' + (r.helpful_votes || 0) + '</button>'
      + '</div></div>';
    return html;
  }

  function renderReviews(startIndex) {
    const list = document.getElementById('reviewsList');
    const btn = document.getElementById('loadMoreReviews');
    if (!list) return;

    const end = Math.min(startIndex + REVIEWS_PER_PAGE, allReviews.length);
    let html = startIndex === 0 ? '' : list.innerHTML;

    if (allReviews.length === 0) {
      list.innerHTML = '<div class="no-reviews-yet"><p>No reviews yet. Be the first to review this product!</p></div>';
      if (btn) btn.style.display = 'none';
      return;
    }

    for (let i = startIndex; i < end; i++) {
      html += renderReviewCard(allReviews[i]);
    }
    list.innerHTML = html;
    displayedCount = end;

    if (btn) btn.style.display = displayedCount < allReviews.length ? 'block' : 'none';
  }

  function escHTML(s) {
    if (!s) return '';
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ── Badge & count ────────────────────────────
  function updateBadge(count) {
    const badge = document.getElementById('reviewCountBadge');
    if (badge) badge.textContent = count > 0 ? '(' + count + ')' : '';
    // Also update the rating display above
    const rc = document.getElementById('productReviewCount');
    if (rc) rc.textContent = '(' + count + ' review' + (count !== 1 ? 's' : '') + ')';
  }

  // ── Star rating input ────────────────────────
  function initStarInput() {
    const container = document.getElementById('starRatingInput');
    if (!container) return;
    const stars = container.querySelectorAll('.star-input');

    stars.forEach(function (star) {
      star.addEventListener('mouseenter', function () {
        const val = parseInt(this.dataset.rating);
        stars.forEach(function (s) {
          s.classList.toggle('hover', parseInt(s.dataset.rating) <= val);
        });
      });
      star.addEventListener('click', function () {
        selectedRating = parseInt(this.dataset.rating);
        document.getElementById('reviewRatingValue').value = selectedRating;
        stars.forEach(function (s) {
          s.classList.toggle('active', parseInt(s.dataset.rating) <= selectedRating);
        });
      });
    });
    container.addEventListener('mouseleave', function () {
      stars.forEach(function (s) {
        s.classList.remove('hover');
        s.classList.toggle('active', parseInt(s.dataset.rating) <= selectedRating);
      });
    });
  }

  // ── Form submission ──────────────────────────
  function initForm() {
    const form = document.getElementById('reviewForm');
    if (!form) return;

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      const msg = document.getElementById('reviewFormMessage');
      const btn = document.getElementById('submitReviewBtn');

      if (selectedRating === 0) {
        showMsg(msg, 'Please select a star rating.', 'error');
        return;
      }

      const name = document.getElementById('reviewName').value.trim();
      const email = document.getElementById('reviewEmail').value.trim();
      const title = document.getElementById('reviewTitle').value.trim();
      const body = document.getElementById('reviewBody').value.trim();

      if (!name || !email || !title || !body) {
        showMsg(msg, 'Please fill in all fields.', 'error');
        return;
      }

      btn.disabled = true;
      btn.textContent = 'Submitting...';

      try {
        await submitReview({
          product_id: currentProductId,
          rating: selectedRating,
          title: title,
          body: body,
          reviewer_name: name,
          reviewer_email: email,
          review_status: 'pending',
          verified_purchase: false
        });
        showMsg(msg, 'Thank you! Your review has been submitted and will appear after moderation.', 'success');
        form.reset();
        selectedRating = 0;
        document.querySelectorAll('#starRatingInput .star-input').forEach(function (s) { s.classList.remove('active'); });
      } catch (err) {
        showMsg(msg, 'Sorry, there was an error submitting your review. Please try again.', 'error');
      }
      btn.disabled = false;
      btn.textContent = 'Submit Review';
    });
  }

  function showMsg(el, text, type) {
    if (!el) return;
    el.textContent = text;
    el.className = 'review-form-message ' + type;
    el.style.display = 'block';
    setTimeout(function () { el.style.display = 'none'; }, 8000);
  }

  // ── Helpful vote (global) ────────────────────
  window.__sfiVoteHelpful = function (btn) {
    const id = btn.dataset.reviewId;
    if (!id || btn.dataset.voted) return;
    btn.dataset.voted = '1';
    const current = parseInt(btn.textContent.replace(/[^0-9]/g, '')) || 0;
    btn.innerHTML = '👍 ' + (current + 1);
    btn.style.color = '#2D6A4F';
    btn.style.borderColor = '#2D6A4F';
    voteHelpful(id);
  };

  // ── Main init ────────────────────────────────
  async function initReviews() {
    // Wait for product data to be available
    let attempts = 0;
    while (!window.currentProduct && attempts < 30) {
      await new Promise(function (r) { setTimeout(r, 200); });
      attempts++;
    }
    if (!window.currentProduct) return;

    // Get Supabase UUID — _supabase_id from data-loader, or resolve from legacy_id
    currentProductId = window.currentProduct._supabase_id || null;
    if (!currentProductId) {
      // Fallback: lookup UUID from legacy_id
      const legacyId = window.currentProduct.id;
      if (legacyId) {
        try {
          const lookupUrl = SUPABASE_URL + '/rest/v1/products?legacy_id=eq.' + legacyId + '&select=id&limit=1';
          const lookupRes = await fetch(lookupUrl, { headers: headers() });
          if (lookupRes.ok) {
            const rows = await lookupRes.json();
            if (rows.length > 0) currentProductId = rows[0].id;
          }
        } catch (e) { /* silent */ }
      }
    }
    if (!currentProductId) return;

    try {
      allReviews = await fetchReviews(currentProductId);
      renderSummary(allReviews);
      renderReviews(0);
      updateBadge(allReviews.length);
    } catch (err) {
      document.getElementById('reviewsList').innerHTML = '<p>Unable to load reviews.</p>';
    }

    // Load more button
    var loadMoreBtn = document.getElementById('loadMoreReviews');
    if (loadMoreBtn) {
      loadMoreBtn.addEventListener('click', function () {
        renderReviews(displayedCount);
      });
    }

    initStarInput();
    initForm();
  }

  // ── Boot ─────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initReviews);
  } else {
    initReviews();
  }

})();
