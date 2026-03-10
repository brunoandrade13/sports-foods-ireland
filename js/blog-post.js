/**
 * SFI Blog Post — Single post renderer
 */
(function() {
'use strict';

const content = document.getElementById('blogPostContent');
const titleEl = document.getElementById('blogPostTitle');
const related = document.getElementById('relatedPosts');
if (!content) return;

const params = new URLSearchParams(window.location.search);
const postId = parseInt(params.get('id'));

// Reuse posts from blog.js or define inline
const posts = window.blogPosts || [];

function fmtDate(d) {
    return new Date(d).toLocaleDateString('en-IE', { day: 'numeric', month: 'long', year: 'numeric' });
}

function tryRender() {
    const allPosts = window.blogPosts || [];
    if (!allPosts.length) { setTimeout(tryRender, 200); return; }

    const post = allPosts.find(p => p.id === postId);
    if (!post) {
        content.innerHTML = '<div style="text-align:center;padding:60px"><h2>Post not found</h2><p><a href="blog.html">← Back to Blog</a></p></div>';
        return;
    }

    if (titleEl) titleEl.textContent = post.title;
    document.title = post.title + ' | SFI Blog';

    content.innerHTML = `
        <div class="container" style="max-width:800px;margin:0 auto;padding:40px 20px">
            <a href="blog.html" class="blog-back-link">← Back to Blog</a>
            <div class="blog-post-header">
                <span class="blog-tag">${post.category}</span>
                <h1>${post.title}</h1>
                <div class="blog-meta">${fmtDate(post.date)} · ${post.readTime} read · By ${post.author}</div>
            </div>
            <div class="blog-post-hero" style="background-image:url('${post.image}')"></div>
            <div class="blog-post-body">
                <p class="blog-lead">${post.excerpt}</p>
                <p>This article is coming soon. We're working on creating comprehensive, expert content to help you perform at your best. Check back soon for the full article!</p>
                <p>In the meantime, browse our <a href="shop.html">product range</a> or <a href="contact.html">contact us</a> for personalised advice.</p>
            </div>
        </div>`;

    // Related posts
    if (related) {
        const others = allPosts.filter(p => p.id !== postId).slice(0, 3);
        related.innerHTML = others.map(p => `
            <article class="blog-card">
                <a href="blog-post.html?id=${p.id}">
                    <div class="blog-card-img" style="background-image:url('${p.image}')"></div>
                    <div class="blog-card-body">
                        <span class="blog-tag">${p.category}</span>
                        <h3>${p.title}</h3>
                        <div class="blog-meta">${fmtDate(p.date)} · ${p.readTime} read</div>
                    </div>
                </a>
            </article>
        `).join('');
    }
}
tryRender();
})();
