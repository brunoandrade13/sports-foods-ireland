/**
 * SFI Blog — Static blog content renderer
 */
(function() {
'use strict';

const grid = document.getElementById('blogGrid');
const featured = document.getElementById('featuredPost');
if (!grid) return;

const posts = [
    {
        id: 1, slug: 'nutrition-guide-endurance',
        title: 'The Complete Nutrition Guide for Endurance Athletes',
        excerpt: 'Everything you need to know about fueling your body for long-distance events, from carb-loading strategies to race-day nutrition plans.',
        category: 'nutrition', date: '2026-01-28', readTime: '8 min',
        image: 'img/blog/nutrition-guide.jpg',
        author: 'SFI Team'
    },
    {
        id: 2, slug: 'triathlon-gear-2026',
        title: 'Best Triathlon Gear for 2026: Our Top Picks',
        excerpt: 'We tested the latest wetsuits, bikes, and running shoes to bring you our expert recommendations for the upcoming season.',
        category: 'gear', date: '2026-01-22', readTime: '6 min',
        image: 'img/blog/triathlon-gear.jpg',
        author: 'SFI Team'
    },
    {
        id: 3, slug: 'recovery-tips-runners',
        title: '5 Recovery Tips Every Runner Should Know',
        excerpt: 'Post-run recovery is just as important as the run itself. Learn the science-backed strategies that help you bounce back faster.',
        category: 'training', date: '2026-01-15', readTime: '5 min',
        image: 'img/blog/recovery-tips.jpg',
        author: 'SFI Team'
    },
    {
        id: 4, slug: 'dublin-marathon-2026',
        title: 'Dublin Marathon 2026: Training Plan & Tips',
        excerpt: 'Planning to run the Dublin Marathon? Here\'s a 16-week training plan plus insider tips from experienced finishers.',
        category: 'events', date: '2026-01-10', readTime: '10 min',
        image: 'img/blog/dublin-marathon.jpg',
        author: 'SFI Team'
    },
    {
        id: 5, slug: 'protein-powder-guide',
        title: 'Whey vs Plant Protein: Which is Right for You?',
        excerpt: 'A detailed comparison of whey and plant-based proteins, covering absorption rates, amino acid profiles, and which suits your goals.',
        category: 'nutrition', date: '2026-01-05', readTime: '7 min',
        image: 'img/blog/protein-guide.jpg',
        author: 'SFI Team'
    },
    {
        id: 6, slug: 'open-water-swimming-ireland',
        title: 'Open Water Swimming in Ireland: A Beginner\'s Guide',
        excerpt: 'From choosing the right wetsuit to finding the best spots around Ireland, everything you need to start open water swimming.',
        category: 'training', date: '2025-12-20', readTime: '9 min',
        image: 'img/blog/open-water.jpg',
        author: 'SFI Team'
    }
];

let currentCategory = 'all';

function fmtDate(d) {
    const dt = new Date(d);
    return dt.toLocaleDateString('en-IE', { day: 'numeric', month: 'long', year: 'numeric' });
}

function renderFeatured() {
    if (!featured) return;
    const p = posts[0];
    featured.innerHTML = `
        <a href="blog-post.html?id=${p.id}" class="blog-featured-link">
            <div class="blog-featured-img" style="background-image:url('${p.image}')"></div>
            <div class="blog-featured-content">
                <span class="blog-tag">${p.category}</span>
                <h2>${p.title}</h2>
                <p>${p.excerpt}</p>
                <div class="blog-meta">${fmtDate(p.date)} · ${p.readTime} read</div>
            </div>
        </a>`;
}

function renderGrid() {
    const filtered = currentCategory === 'all'
        ? posts.slice(1)
        : posts.filter(p => p.category === currentCategory);

    if (!filtered.length) {
        grid.innerHTML = '<p style="text-align:center;padding:40px;color:var(--color-text-secondary)">No posts in this category yet.</p>';
        return;
    }

    grid.innerHTML = filtered.map(p => `
        <article class="blog-card">
            <a href="blog-post.html?id=${p.id}">
                <div class="blog-card-img" style="background-image:url('${p.image}')"></div>
                <div class="blog-card-body">
                    <span class="blog-tag">${p.category}</span>
                    <h3>${p.title}</h3>
                    <p>${p.excerpt}</p>
                    <div class="blog-meta">${fmtDate(p.date)} · ${p.readTime} read</div>
                </div>
            </a>
        </article>
    `).join('');
}

// Category filtering
document.querySelectorAll('.blog-cat-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        document.querySelectorAll('.blog-cat-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        currentCategory = this.dataset.category;
        renderGrid();
    });
});

renderFeatured();
renderGrid();

// Export for blog-post.html
window.blogPosts = posts;
})();
