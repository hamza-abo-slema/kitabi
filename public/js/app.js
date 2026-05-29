/**
 * app.js — تطبيق كتابي، المنطق الرئيسي
 */

const API = '/api';
let currentUser = null;
let currentTab = 'home';

document.addEventListener('DOMContentLoaded', async () => {
  console.log('[Kitabi] App starting...');

  try { await initAudio(); } catch(e) { console.warn('[App] Audio init error:', e); }
  try { await initDetection(); } catch(e) { console.warn('[App] Detection init error:', e); }

  initNavigation();
  initAuth();
  initPlayer();
  initTheme();
  initSearch();

  loadTab('home');
  tryRestoreSession();
  console.log('[Kitabi] Ready');
});

async function initAudio() {
  const ok = await window.audioEngine.init();
  if (ok) {
    window.audioEngine.onProtectionChange = (active) => {
      updateProtectionIndicator(active);
    };
  }
}

async function initDetection() {
  try {
    window.detectionEngine.onProtectionTrigger = (data) => {
      window.audioEngine.activateProtection();
      updateProtectionIndicator(true);
      showToast('تم تفعيل الحماية الصوتية — تم اكتشاف نشاط تسجيل محتمل', 'info');
    };
    window.detectionEngine.onProtectionRelease = () => {
      window.audioEngine.deactivateProtection();
      updateProtectionIndicator(false);
    };
    await window.detectionEngine.start();
  } catch (e) {
    console.warn('[App] Detection engine init failed:', e);
  }
}

function initNavigation() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.tab));
  });
  document.getElementById('globalSearch').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const q = e.target.value.trim();
      if (q) { loadHomeWithSearch(q); navigateTo('home'); }
    }
  });
}

function navigateTo(tab, pushState = true) {
  currentTab = tab;
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
    btn.setAttribute('aria-selected', btn.dataset.tab === tab);
  });
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const map = { home:'page-home', categories:'page-categories', profile:'page-profile',
    book:'page-book', subscription:'page-subscription', admin:'page-admin' };
  const el = document.getElementById(map[tab]);
  if (el) el.classList.add('active');
  if (tab === 'home') loadHome();
  else if (tab === 'categories') loadCategories();
  else if (tab === 'profile') loadProfile();
  else if (tab === 'subscription') loadSubscription();
  else if (tab === 'admin') loadAdmin();
  window.scrollTo(0, 0);
}

function loadTab(tab) { navigateTo(tab, false); }

function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '--';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h} س ${m} د`;
  if (m > 0) return `${m} دقيقة`;
  return `${s} ثانية`;
}

function escapeHtml(text) {
  if (!text) return '';
  const d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}

// ==================== HOME ====================

async function loadHome() {
  const el = document.getElementById('homeContent');
  try {
    const [fR, lR, pR, rR] = await Promise.all([
      fetch(API+'/books/featured'), fetch(API+'/books/latest'),
      fetch(API+'/books/popular'), fetch(API+'/books/recommended')
    ]);
    const featured = (await fR.json()).books || [];
    const latest = (await lR.json()).books || [];
    const popular = (await pR.json()).books || [];
    const recommended = (await rR.json()).books || [];

    let html = '';

    if (featured.length > 0) {
      const f = featured[0];
      html += `<div class="hero-section" role="banner" tabindex="0" onclick="showBookDetail('${f.id}')">
        <div class="hero-content">
          <span class="hero-badge">كتاب مميز</span>
          <h2>${escapeHtml(f.title)}</h2>
          <p>${escapeHtml(f.description||'')} — ${escapeHtml(f.author)}</p>
          <button class="btn-primary" onclick="event.stopPropagation();startPlayback('${f.id}')">▶ استمع الآن</button>
        </div>
        <img class="hero-cover" src="${f.cover_url}" alt="" loading="lazy">
      </div>`;
    }

    if (latest.length > 0) html += renderSection('الأحدث', latest, true);
    if (popular.length > 0) html += renderSection('الأكثر مشاهدة', popular, true);
    if (recommended.length > 0) html += renderSection('ترشيحات لك', recommended, true);

    if (latest.length === 0 && popular.length === 0 && recommended.length === 0) {
      html += `<div class="section" style="text-align:center;padding:60px">
        <div style="font-size:64px;margin-bottom:16px">📚</div>
        <h2>مرحباً بك في كتابي</h2>
        <p style="color:var(--text-muted);margin-bottom:12px">لا توجد كتب بعد. قم بإضافة كتابك الأول من لوحة الإدارة.</p>
        ${currentUser && currentUser.is_admin ? '<button class="btn-primary" onclick="navigateTo(\'admin\')">➕ إضافة كتاب</button>' : ''}
      </div>`;
    }

    el.innerHTML = html;
  } catch (e) {
    el.innerHTML = '<div class="loading">تعذر تحميل الصفحة الرئيسية</div>';
  }
}

function renderSection(title, books, scroll) {
  const cards = books.map(b => {
    const dur = formatDuration(b.duration_seconds);
    return `<div class="book-card" role="listitem" tabindex="0"
      onclick="showBookDetail('${b.id}')" onkeydown="if(event.key==='Enter')showBookDetail('${b.id}')"
      aria-label="${escapeHtml(b.title)} — ${escapeHtml(b.author)} — ${dur}">
      <img class="card-img" src="${b.cover_url}" alt="غلاف ${escapeHtml(b.title)}" loading="lazy">
      <div class="card-body">
        <div class="card-title">${escapeHtml(b.title)}</div>
        <div class="card-author">${escapeHtml(b.author)}</div>
        <div class="card-meta"><span>⭐ ${b.rating||'--'}</span><span>${dur}</span><span> ${(b.listens||0).toLocaleString('ar-SA')}</span></div>
      </div></div>`;
  }).join('');
  const cls = scroll ? 'books-scroll' : 'books-grid';
  return `<div class="section"><div class="section-header"><h2>${escapeHtml(title)}</h2></div>
    <div class="${cls}" role="list">${cards}</div></div>`;
}

function loadHomeWithSearch(query) {
  fetch(API+'/books?search='+encodeURIComponent(query))
    .then(r=>r.json()).then(d => {
      const el = document.getElementById('homeContent');
      if (d.books.length === 0) {
        el.innerHTML = `<div class="section" style="text-align:center;padding:60px">
          <div style="font-size:48px;margin-bottom:16px">🔍</div><h2>لا توجد نتائج لـ "${escapeHtml(query)}"</h2>
          <p style="color:var(--text-muted)">جرب كلمات بحث أخرى</p></div>`;
      } else {
        el.innerHTML = `<div class="section"><div class="section-header"><h2>نتائج البحث عن "${escapeHtml(query)}"</h2></div>
          <div class="books-grid">${d.books.map(b => renderBookCard(b)).join('')}</div></div>`;
      }
    });
}

function renderBookCard(book) {
  const dur = formatDuration(book.duration_seconds);
  return `<div class="book-card" role="listitem" tabindex="0"
    onclick="showBookDetail('${book.id}')" onkeydown="if(event.key==='Enter')showBookDetail('${book.id}')"
    aria-label="${escapeHtml(book.title)} — ${escapeHtml(book.author)} — ${dur}">
    <img class="card-img" src="${book.cover_url}" alt="غلاف ${escapeHtml(book.title)}" loading="lazy">
    <div class="card-body">
      <div class="card-title">${escapeHtml(book.title)}</div>
      <div class="card-author">${escapeHtml(book.author)}</div>
      <div class="card-meta"><span>⭐ ${book.rating||'--'}</span><span>${dur}</span></div>
    </div></div>`;
}

// ==================== CATEGORIES ====================

async function loadCategories() {
  const el = document.getElementById('categoriesContent');
  try {
    const res = await fetch(API+'/books/categories');
    const cats = (await res.json()).categories || [];
    el.innerHTML = `<div class="categories-grid" role="list">
      ${cats.map(c => `<div class="category-card" role="listitem" tabindex="0"
        onclick="showCategory('${c.id}')" onkeydown="if(event.key==='Enter')showCategory('${c.id}')">
        <div class="cat-icon">${c.icon||'📚'}</div><h3>${escapeHtml(c.name)}</h3>
        <div class="cat-count">${c.book_count||0} كتاب</div></div>`).join('')}</div>`;
    if (cats.length === 0) el.innerHTML = '<div class="section" style="text-align:center;padding:40px"><p style="color:var(--text-muted)">لا توجد تصنيفات بعد. يمكن إضافتها عبر لوحة الإدارة.</p></div>';
  } catch(e) {
    el.innerHTML = '<div class="loading">تعذر تحميل التصنيفات</div>';
  }
}

async function showCategory(catId) {
  const el = document.getElementById('categoriesContent');
  try {
    const res = await fetch(`${API}/books/categories/${catId}`);
    const d = await res.json();
    el.innerHTML = `<div style="margin-bottom:20px"><button class="btn-secondary" onclick="loadCategories()">→ العودة للتصنيفات</button></div>
      <div class="section-header"><h1>${escapeHtml(d.category.name)}</h1></div>
      <p style="color:var(--text-muted);margin-bottom:20px">${escapeHtml(d.category.description||'')}</p>
      <div class="books-grid">${(d.books||[]).map(b=>renderBookCard(b)).join('')||'<p style="color:var(--text-muted)">لا توجد كتب بعد</p>'}</div>`;
  } catch(e) { el.innerHTML = '<div class="loading">تعذر التحميل</div>'; }
}

// ==================== BOOK DETAIL ====================

async function showBookDetail(bookId) {
  try {
    const res = await fetch(API+'/books/'+bookId);
    const d = await res.json();
    const b = d.book;
    const dur = formatDuration(b.duration_seconds);
    document.getElementById('bookDetailContent').innerHTML = `
      <div class="book-detail-page">
        <div class="detail-back">
          <button class="btn-secondary" onclick="navigateTo('${currentTab==='book'?'home':currentTab}')">→ العودة</button>
        </div>
        <div class="detail-cover-wrapper">
          <img class="detail-cover" src="${b.cover_url}" alt="غلاف ${escapeHtml(b.title)}" loading="lazy">
        </div>
        <div class="detail-info">
          <div class="detail-meta-bar">
            <span>⭐ ${b.rating||'--'}</span>
            <span>${dur}</span>
            <span>👁 ${(b.listens||0).toLocaleString('ar-SA')}</span>
          </div>
          <h1 class="detail-title">${escapeHtml(b.title)}</h1>
          <div class="detail-author">👤 ${escapeHtml(b.author)}</div>
          ${b.narrator?`<div class="detail-narrator">🎙 رواية: ${escapeHtml(b.narrator)}</div>`:''}
          <button class="btn-primary detail-play-btn" onclick="startPlayback('${b.id}')">▶ استمع الآن</button>
          <div class="detail-duration">المدة: <strong>${dur}</strong></div>
          <p class="detail-description">${escapeHtml(b.description||'لا يوجد وصف متاح لهذا الكتاب.')}</p>
          ${currentUser?`<button class="btn-secondary" onclick="addToLibrary('${b.id}')" style="margin-top:12px">📚 أضف إلى مكتبتي</button>`:''}
        </div>
      </div>`;
    navigateTo('book', false);
  } catch(e) { showToast('تعذر تحميل تفاصيل الكتاب', 'error'); }
}

// ==================== PLAYBACK ====================

let currentPlaylist = [];
let currentPlayIndex = 0;

async function startPlayback(bookId) {
  try {
    const res = await fetch(API+'/books/'+bookId);
    const d = await res.json();
    const book = d.book;
    fetch(API+'/books/'+bookId+'/listen', {method:'POST'});
    const ok = await window.audioEngine.loadBook(book);
    if (!ok) return;
    document.getElementById('pbCover').src = book.cover_url;
    document.getElementById('pbTitle').textContent = book.title;
    document.getElementById('pbAuthor').textContent = book.author;
    document.getElementById('pbDuration').textContent = formatDuration(book.duration_seconds);
    document.getElementById('playerBar').classList.add('visible');
    window.audioEngine.onTimeUpdate = (time) => {
      document.getElementById('pbCurrent').textContent = window.audioEngine.formatTime(time);
      document.getElementById('pbSeek').value = book.duration_seconds > 0 ? (time/book.duration_seconds)*100 : 0;
      if (currentUser) saveProgress(book.id, time);
    };
    window.audioEngine.onEnded = () => { document.getElementById('pbPlay').textContent = '▶'; };
    window.audioEngine.play(0);
    document.getElementById('pbPlay').textContent = '⏸';
    document.getElementById('pbSpeed').textContent = '1×';
    currentPlaylist = [book]; currentPlayIndex = 0;
    showToast('▶ جارٍ تشغيل "'+book.title+'"', 'success');
    if (currentTab !== 'book') navigateTo('home', false);
  } catch(e) { showToast('تعذر بدء التشغيل', 'error'); }
}

function initPlayer() {
  const pbPlay = document.getElementById('pbPlay');
  const pbSeek = document.getElementById('pbSeek');
  const pbBack = document.getElementById('pbBack');
  const pbForward = document.getElementById('pbForward');
  const pbSpeed = document.getElementById('pbSpeed');
  const pbVolume = document.getElementById('pbVolume');

  pbPlay.addEventListener('click', () => {
    const ae = window.audioEngine;
    if (!ae.currentBook) return;
    if (ae.isPlaying) { ae.pause(); pbPlay.textContent = '▶'; }
    else { ae.resume(); pbPlay.textContent = '⏸'; }
  });

  pbSeek.addEventListener('input', () => {
    const ae = window.audioEngine;
    if (!ae.currentBook) return;
    ae.seek((parseFloat(pbSeek.value)/100)*ae.duration);
  });

  pbBack.addEventListener('click', () => {
    const ae = window.audioEngine;
    if (ae.currentBook) ae.skipBack(10);
  });

  pbForward.addEventListener('click', () => {
    const ae = window.audioEngine;
    if (ae.currentBook) ae.skipForward(10);
  });

  pbSpeed.addEventListener('click', () => {
    const ae = window.audioEngine;
    const speeds = [0.5,0.75,1,1.25,1.5,1.75,2,2.5,3];
    const idx = speeds.indexOf(ae.playbackRate);
    const r = speeds[(idx+1)%speeds.length];
    ae.setPlaybackRate(r);
    pbSpeed.textContent = r+'×';
    showToast('السرعة: '+r+'×', 'info');
  });

  pbVolume.addEventListener('click', () => {
    const ae = window.audioEngine;
    if (ae.volume > 0) { ae._lastVolume = ae.volume; ae.setVolume(0); pbVolume.textContent = '🔇'; }
    else { ae.setVolume(ae._lastVolume||1); pbVolume.textContent = '🔊'; }
  });

  document.addEventListener('keydown', (e) => {
    const ae = window.audioEngine;
    if (!ae.currentBook) return;
    if (e.key === 'ArrowLeft') { ae.skipBack(10); e.preventDefault(); }
    if (e.key === 'ArrowRight') { ae.skipForward(10); e.preventDefault(); }
    if (e.key === ' ') { e.preventDefault();
      if (ae.isPlaying) { ae.pause(); pbPlay.textContent = '▶'; }
      else { ae.resume(); pbPlay.textContent = '⏸'; }
    }
  });
}

// ==================== PROFILE ====================

async function loadProfile() {
  const el = document.getElementById('profileContent');
  if (!currentUser) {
    el.innerHTML = `<div class="section" style="text-align:center;padding:60px">
      <div style="font-size:64px;margin-bottom:16px">👤</div><h2>الرجاء تسجيل الدخول</h2>
      <p style="color:var(--text-muted);margin-bottom:20px">سجل الدخول لعرض ملفك الشخصي</p>
      <button class="btn-primary" onclick="openAuthModal()">تسجيل الدخول</button></div>`;
    return;
  }
  try {
    const res = await fetch(API+'/users/me', {headers:{'Authorization':'Bearer '+localStorage.getItem('kitabi_token')}});
    const d = await res.json();
    const u = d.user; const s = d.stats;
    const prem = u.subscription_status === 'premium';
    el.innerHTML = `
      <div class="page-header"><h1>أنا</h1></div>
      <div class="profile-header">
        <div class="profile-avatar" aria-hidden="true">${u.name.charAt(0)}</div>
        <div class="profile-info">
          <h2>${escapeHtml(u.name)}</h2>
          <div class="email">${escapeHtml(u.email)}</div>
          <span class="badge ${prem?'badge-premium':'badge-free'}">${prem?'مشترك مميز':'حساب مجاني'}</span>
        </div>
      </div>
      <div class="profile-stats">
        <div class="stat-card"><div class="num">${s.library}</div><div class="label">مكتبتي</div></div>
        <div class="stat-card"><div class="num">${s.inProgress}</div><div class="label">قيد الاستماع</div></div>
        <div class="stat-card"><div class="num">${s.bookmarks}</div><div class="label">العلامات</div></div>
      </div>
      <div class="profile-sections">
        <div class="profile-section"><div class="ps-header" onclick="toggleSection(this)" tabindex="0" aria-expanded="false"><span class="ps-icon">📚</span><h3>مكتبتي</h3><span>▼</span></div><div class="ps-content" id="profile-library"></div></div>
        <div class="profile-section"><div class="ps-header" onclick="toggleSection(this)" tabindex="0" aria-expanded="false"><span class="ps-icon">🔖</span><h3>العلامات</h3><span>▼</span></div><div class="ps-content" id="profile-bookmarks"></div></div>
        <div class="profile-section"><div class="ps-header" onclick="toggleSection(this)" tabindex="0" aria-expanded="false"><span class="ps-icon">▶</span><h3>قيد الاستماع</h3><span>▼</span></div><div class="ps-content" id="profile-progress"></div></div>
        <div class="profile-section"><div class="ps-header" onclick="toggleSection(this)" tabindex="0" aria-expanded="false"><span class="ps-icon">⭐</span><h3>الاشتراك</h3><span>▼</span></div><div class="ps-content" id="profile-subscription">
          <p style="color:var(--text-secondary);margin-bottom:12px">الحالة: <strong>${prem?'مشترك مميز':'مجاني'}</strong>${u.subscription_end?'<br>تاريخ الانتهاء: '+new Date(u.subscription_end).toLocaleDateString('ar-SA'):''}</p>
          ${!prem?'<button class="btn-primary" onclick="navigateTo(\'subscription\')">اشترك الآن</button>':''}</div></div>
        <div class="profile-section"><div class="ps-header" onclick="toggleSection(this)" tabindex="0" aria-expanded="false"><span class="ps-icon">ℹ️</span><h3>حول كتابي</h3><span>▼</span></div><div class="ps-content"><p style="color:var(--text-secondary);line-height:1.8"><strong>📚 كتابي</strong> — منصة الكتب الصوتية الذكية.<br>الإصدار: 1.0.0<br>ميزة حصرية: حماية صوتية ذكية ضد تسجيل الشاشة باستخدام تقنية عكس الطور (Phase Inversion).<br><br>عند اكتشاف محاولة تسجيل، يتم تفعيل قناة صوتية ثانية معكوسة الطور لتسجيل صمت تام.<br><br>مصمم ليكون سهل الاستخدام للمكفوفين — متوافق مع قارئات الشاشة.</p></div></div>
        ${u.is_admin?`<div class="profile-section"><div class="ps-header" onclick="navigateTo('admin')" tabindex="0"><span class="ps-icon">⚙️</span><h3>لوحة الإدارة</h3></div></div>`:''}
        <div class="profile-section"><div class="ps-header" onclick="logoutUser()" tabindex="0" style="color:var(--error)"><span class="ps-icon">🚪</span><h3>تسجيل الخروج</h3></div></div>
      </div>`;
    loadProfileLibrary(); loadProfileBookmarks(); loadProfileProgress();
  } catch(e) { el.innerHTML = '<div class="loading">تعذر تحميل الملف الشخصي</div>'; }
}

async function loadProfileLibrary() {
  if (!currentUser) return;
  const el = document.getElementById('profile-library');
  try {
    const res = await fetch(API+'/users/library', {headers:{'Authorization':'Bearer '+localStorage.getItem('kitabi_token')}});
    const books = (await res.json()).books || [];
    el.innerHTML = books.length ? `<div class="books-grid">${books.map(b=>renderBookCard(b)).join('')}</div>`
      : '<p style="color:var(--text-muted);padding:12px 0">مكتبتك فارغة</p>';
  } catch(e) { el.innerHTML = '<p style="color:var(--text-muted)">تعذر التحميل</p>'; }
}

async function loadProfileBookmarks() {
  if (!currentUser) return;
  const el = document.getElementById('profile-bookmarks');
  try {
    const res = await fetch(API+'/users/bookmarks', {headers:{'Authorization':'Bearer '+localStorage.getItem('kitabi_token')}});
    const bms = (await res.json()).bookmarks || [];
    el.innerHTML = bms.length ? bms.map(b=>`<div style="display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid var(--border-light)">
      <img src="${b.cover_url}" style="width:40px;height:40px;border-radius:6px;object-fit:cover">
      <div style="flex:1"><div style="font-weight:600;font-size:14px">${escapeHtml(b.title)}</div>
      <div style="font-size:12px;color:var(--text-muted)">@ ${window.audioEngine.formatTime(b.position_seconds)}</div></div>
      <button class="btn-icon" onclick="startPlayback('${b.book_id}')">▶</button></div>`).join('')
      : '<p style="color:var(--text-muted);padding:12px 0">لا توجد علامات</p>';
  } catch(e) { el.innerHTML = '<p style="color:var(--text-muted)">تعذر التحميل</p>'; }
}

async function loadProfileProgress() {
  if (!currentUser) return;
  const el = document.getElementById('profile-progress');
  try {
    const res = await fetch(API+'/users/progress', {headers:{'Authorization':'Bearer '+localStorage.getItem('kitabi_token')}});
    const items = (await res.json()).progress || [];
    el.innerHTML = items.length ? items.map(p=>{
      const pct = p.duration_seconds > 0 ? Math.round((p.position_seconds/p.duration_seconds)*100) : 0;
      return `<div style="display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid var(--border-light)">
        <img src="${p.cover_url}" style="width:40px;height:40px;border-radius:6px;object-fit:cover">
        <div style="flex:1"><div style="font-weight:600;font-size:14px">${escapeHtml(p.title)}</div>
        <div style="font-size:12px;color:var(--text-muted)">${pct}% مكتمل</div>
        <div style="height:4px;background:var(--border);border-radius:2px;margin-top:4px"><div style="height:100%;width:${pct}%;background:var(--primary);border-radius:2px"></div></div></div>
        <button class="btn-icon" onclick="startPlayback('${p.book_id}')">▶</button></div>`;
    }).join('') : '<p style="color:var(--text-muted);padding:12px 0">لم تبدأ الاستماع بعد</p>';
  } catch(e) { el.innerHTML = '<p style="color:var(--text-muted)">تعذر التحميل</p>'; }
}

function toggleSection(header) {
  const content = header.nextElementSibling;
  const expanded = header.getAttribute('aria-expanded') === 'true';
  content.classList.toggle('open');
  header.setAttribute('aria-expanded', !expanded);
  header.querySelector('span:last-child').textContent = expanded ? '▼' : '▲';
}

// ==================== SUBSCRIPTION ====================

async function loadSubscription() {
  const el = document.getElementById('subscriptionContent');
  try {
    const res = await fetch(API+'/subscriptions/plans');
    const plans = (await res.json()).plans || [];
    el.innerHTML = `<div class="page-header"><h1>خطط الاشتراك</h1></div>
      <p style="color:var(--text-secondary);margin-bottom:24px">اختر الخطة المناسبة لك</p>
      <div class="subscription-plans">${plans.map(p => {
        const feats = JSON.parse(p.features||'[]');
        return `<div class="plan-card${p.is_popular?' popular':''}">
          ${p.is_popular?'<div class="popular-badge">الأكثر شعبية</div>':''}
          <div class="plan-name">${escapeHtml(p.name)}</div>
          <div class="plan-price"><span class="amount">${p.price_monthly===0?'0':p.price_monthly}</span><span class="currency">${p.price_monthly===0?'مجاني':'ر.س/شهر'}</span></div>
          ${p.price_yearly>0?`<div class="plan-duration">أو ${p.price_yearly} ر.س سنوياً</div>`:'<div class="plan-duration">&nbsp;</div>'}
          <ul class="plan-features">${feats.map(f=>'<li>'+escapeHtml(f)+'</li>').join('')}</ul>
          ${currentUser
            ? `<button class="btn-${p.price_monthly===0?'secondary':'primary'}" style="width:100%;justify-content:center" onclick="openPayment('${p.id}')">${p.price_monthly===0?'اشتراك مجاني':'اشترك الآن'}</button>`
            : `<button class="btn-primary" style="width:100%;justify-content:center" onclick="openAuthModal()">سجل للاشتراك</button>`}
        </div>`;
      }).join('')}</div>
      <div class="payment-section" id="paymentSection" style="display:none"></div>`;
  } catch(e) { el.innerHTML = '<div class="loading">تعذر تحميل الخطط</div>'; }
}

function openPayment(planId) {
  const el = document.getElementById('paymentSection');
  el.style.display = 'block';
  el.innerHTML = `<h3>💳 إتمام الدفع</h3>
    <form id="paymentForm" onsubmit="processPayment(event,'${planId}')">
      <div class="form-group"><label for="cardName">اسم حامل البطاقة</label><input type="text" id="cardName" placeholder="الاسم على البطاقة" required></div>
      <div class="form-group card-input-wrapper"><label for="cardNumber">رقم البطاقة</label>
        <input type="text" id="cardNumber" placeholder="0000 0000 0000 0000" maxlength="19" required inputmode="numeric">
        <div class="card-icons" aria-hidden="true">💳</div></div>
      <div class="form-row">
        <div class="form-group"><label for="cardExpiry">تاريخ الانتهاء</label><input type="text" id="cardExpiry" placeholder="MM/YY" maxlength="5" required></div>
        <div class="form-group"><label for="cardCvv">رمز CVV</label><input type="text" id="cardCvv" placeholder="•••" maxlength="4" required inputmode="numeric"></div>
      </div>
      <button type="submit" class="btn-primary" style="width:100%;justify-content:center;padding:14px">🔒 دفع آمن — تأكيد الاشتراك</button>
      <p style="text-align:center;font-size:12px;color:var(--text-muted);margin-top:12px">🔒 جميع المعاملات مشفرة. لن يتم تخزين بيانات البطاقة.</p>
    </form>`;
  el.scrollIntoView({behavior:'smooth'});
}

async function processPayment(event, planId) {
  event.preventDefault();
  const btn = event.target.querySelector('button[type="submit"]');
  btn.disabled = true; btn.textContent = 'جاري المعالجة...';
  const cardNumber = document.getElementById('cardNumber').value.replace(/\s/g,'');
  if (cardNumber && cardNumber.length < 12) {
    showToast('رقم البطاقة غير صالح', 'error');
    btn.disabled = false; btn.textContent = '🔒 دفع آمن — تأكيد الاشتراك';
    return;
  }
  try {
    const res = await fetch(API+'/subscriptions/subscribe', {
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+localStorage.getItem('kitabi_token')},
      body: JSON.stringify({
        plan_id: planId, payment_method: 'card',
        card_number: cardNumber, card_expiry: document.getElementById('cardExpiry').value,
        card_cvv: document.getElementById('cardCvv').value, card_name: document.getElementById('cardName').value
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error||'فشلت المعاملة');
    showToast('✅ '+data.message, 'success');
    document.getElementById('paymentSection').innerHTML =
      `<div style="text-align:center;padding:20px"><div style="font-size:64px;margin-bottom:16px">✅</div>
      <h3>تم الاشتراك بنجاح!</h3><p style="color:var(--text-secondary)">${data.message}</p>
      <p style="color:var(--text-muted);font-size:14px;margin-top:8px">البطاقة: ${data.card||'—'}</p>
      <p style="color:var(--text-muted);font-size:14px">صالح حتى: ${data.valid_until||'—'}</p>
      <button class="btn-primary" style="margin-top:20px" onclick="navigateTo('profile')">الذهاب لملفي الشخصي</button></div>`;
    if (currentUser) currentUser.subscription_status = 'premium';
  } catch(e) { showToast('❌ '+e.message, 'error'); btn.disabled = false; btn.textContent = '🔒 دفع آمن — تأكيد الاشتراك'; }
}

// ==================== ADMIN ====================

async function loadAdmin() {
  const el = document.getElementById('adminContent');
  if (!currentUser || !currentUser.is_admin) {
    el.innerHTML = '<div class="loading">غير مصرح لك بالدخول</div>';
    return;
  }
  el.innerHTML = `<div class="page-header"><h1>⚙️ لوحة الإدارة</h1></div>
    <div class="profile-section"><div class="ps-header" style="cursor:default"><span class="ps-icon">📤</span><h3>إضافة كتاب صوتي جديد</h3></div>
    <div class="ps-content open"><form id="addBookForm" style="padding:12px 0">
      <div class="form-group"><label for="bookTitle">عنوان الكتاب *</label><input type="text" id="bookTitle" required placeholder="البؤساء"></div>
      <div class="form-group"><label for="bookAuthor">المؤلف *</label><input type="text" id="bookAuthor" required placeholder="فيكتور هوجو"></div>
      <div class="form-group"><label for="bookNarrator">الراوي</label><input type="text" id="bookNarrator" placeholder="محمد الخريصي"></div>
      <div class="form-group"><label for="bookDescription">الوصف</label><textarea id="bookDescription" rows="3" placeholder="وصف مختصر"></textarea></div>
      <div class="form-group"><label for="bookCategory">التصنيف</label><select id="bookCategory" aria-label="اختر تصنيف الكتاب"></select></div>
      <div class="form-group"><label for="bookDuration">المدة (بالدقائق)</label><input type="number" id="bookDuration" placeholder="مثلاً 25 = 25 دقيقة" min="1" aria-describedby="durationHint"><div id="durationHint" style="font-size:12px;color:var(--text-muted);margin-top:4px">25 = 25 دقيقة، 70 = ساعة و10 دقائق</div></div>
      <div class="form-group"><label for="bookAudio">الملف الصوتي *</label><input type="file" id="bookAudio" accept=".mp3,.wav,.ogg,.flac,.opus" aria-required="true"></div>
      <div class="form-group"><label for="bookCover">صورة الغلاف</label><input type="file" id="bookCover" accept="image/*"></div>
      <button type="submit" class="btn-primary">📤 إضافة الكتاب</button>
    </form></div></div>`;
  try {
    const res = await fetch(API+'/books/categories');
    const cats = (await res.json()).categories || [];
    const sel = document.getElementById('bookCategory');
    cats.forEach(c => { const o = document.createElement('option'); o.value=c.id; o.textContent=c.name; sel.appendChild(o); });
  } catch(e) {}
  document.getElementById('addBookForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'جارٍ الرفع...';
    const fd = new FormData();
    fd.append('title', document.getElementById('bookTitle').value);
    fd.append('author', document.getElementById('bookAuthor').value);
    fd.append('narrator', document.getElementById('bookNarrator').value);
    fd.append('description', document.getElementById('bookDescription').value);
    fd.append('category_id', document.getElementById('bookCategory').value);
    fd.append('duration_seconds', parseInt(document.getElementById('bookDuration').value || 0) * 60);
    if (document.getElementById('bookAudio').files[0]) fd.append('audio', document.getElementById('bookAudio').files[0]);
    if (document.getElementById('bookCover').files[0]) fd.append('cover', document.getElementById('bookCover').files[0]);
    try {
      const res = await fetch(API+'/books', {method:'POST', headers:{'Authorization':'Bearer '+localStorage.getItem('kitabi_token')}, body: fd});
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      showToast('✅ '+data.message, 'success');
      e.target.reset();
    } catch(err) { showToast('❌ '+err.message, 'error'); }
    btn.disabled = false; btn.textContent = '📤 إضافة الكتاب';
  });
}

// ==================== AUTH ====================

function initAuth() {
  document.getElementById('authBtn').addEventListener('click', openAuthModal);
  document.getElementById('authModalClose').addEventListener('click', closeAuthModal);
  document.getElementById('authModal').addEventListener('click', (e) => { if(e.target===e.currentTarget) closeAuthModal(); });
  document.getElementById('showRegister').addEventListener('click', () => {
    document.getElementById('authModalTitle').textContent = 'إنشاء حساب جديد';
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('registerForm').style.display = 'block';
  });
  document.getElementById('showLogin').addEventListener('click', () => {
    document.getElementById('authModalTitle').textContent = 'تسجيل الدخول';
    document.getElementById('registerForm').style.display = 'none';
    document.getElementById('loginForm').style.display = 'block';
  });
  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    try {
      const res = await fetch(API+'/users/login', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({email,password})});
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      localStorage.setItem('kitabi_token', data.token);
      currentUser = data.user;
      updateAuthUI(); closeAuthModal();
      showToast('👋 مرحباً، '+data.user.name, 'success');
      if (currentTab === 'profile') loadProfile();
    } catch(err) { showToast('❌ '+err.message, 'error'); }
  });
  document.getElementById('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('regName').value;
    const email = document.getElementById('regEmail').value;
    const password = document.getElementById('regPassword').value;
    try {
      const res = await fetch(API+'/users/register', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name,email,password})});
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      localStorage.setItem('kitabi_token', data.token);
      currentUser = data.user;
      updateAuthUI(); closeAuthModal();
      showToast('🎉 مرحباً بك في كتابي، '+data.user.name, 'success');
      if (currentTab === 'profile') loadProfile();
    } catch(err) { showToast('❌ '+err.message, 'error'); }
  });
}

function openAuthModal() {
  const modal = document.getElementById('authModal');
  modal.classList.add('open');
  document.getElementById('loginForm').style.display = 'block';
  document.getElementById('registerForm').style.display = 'none';
  const title = document.getElementById('authModalTitle');
  title.textContent = 'تسجيل الدخول';
  setTimeout(() => document.getElementById('loginEmail').focus(), 100);
}

function closeAuthModal() {
  document.getElementById('authModal').classList.remove('open');
  document.getElementById('authBtn').focus();
}

function tryRestoreSession() {
  const token = localStorage.getItem('kitabi_token');
  if (!token) return;
  fetch(API+'/users/me', {headers:{'Authorization':'Bearer '+token}})
    .then(r=>r.json()).then(d => {
      if (d.user) { currentUser = d.user; updateAuthUI(); if (currentTab==='profile') loadProfile(); }
      else localStorage.removeItem('kitabi_token');
    }).catch(() => localStorage.removeItem('kitabi_token'));
}

function updateAuthUI() {
  const btn = document.getElementById('authBtn');
  btn.innerHTML = currentUser
    ? '<span aria-hidden="true">👤</span><span>'+escapeHtml(currentUser.name)+'</span>'
    : '<span aria-hidden="true">👤</span><span>دخول</span>';
}

function logoutUser() {
  localStorage.removeItem('kitabi_token');
  currentUser = null;
  updateAuthUI();
  showToast('تم تسجيل الخروج', 'info');
  if (currentTab === 'profile') loadProfile();
}

async function addToLibrary(bookId) {
  try {
    const res = await fetch(API+'/users/library/'+bookId, {method:'POST', headers:{'Authorization':'Bearer '+localStorage.getItem('kitabi_token')}});
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    showToast('📚 تمت إضافة الكتاب إلى مكتبتك', 'success');
  } catch(e) { showToast('❌ '+e.message, 'error'); }
}

async function saveProgress(bookId, position) {
  try {
    await fetch(API+'/users/progress', {method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+localStorage.getItem('kitabi_token')},
      body: JSON.stringify({book_id:bookId, position_seconds:position, completed:0})});
  } catch(e) {}
}

function initTheme() {
  const btn = document.getElementById('themeToggle');
  const saved = localStorage.getItem('kitabi_theme');
  if (saved === 'light') { document.body.classList.add('light-mode'); btn.textContent = '☀️'; }
  btn.addEventListener('click', () => {
    document.body.classList.toggle('light-mode');
    const isLight = document.body.classList.contains('light-mode');
    btn.textContent = isLight ? '☀️' : '🌙';
    localStorage.setItem('kitabi_theme', isLight ? 'light' : 'dark');
  });
}

function initSearch() {
  let t;
  document.getElementById('globalSearch').addEventListener('input', (e) => {
    clearTimeout(t);
    const q = e.target.value.trim();
    if (q.length >= 2) t = setTimeout(() => loadHomeWithSearch(q), 500);
  });
}

function updateProtectionIndicator(active) {
  const el = document.getElementById('protectionIndicator');
  document.getElementById('protectionIcon').textContent = '🛡️';
  if (active) {
    el.className = 'protection-indicator triggered';
    document.getElementById('protectionText').textContent = '⚠️ الحماية مفعلة';
    document.getElementById('pbProtection').style.display = 'flex';
  } else {
    el.className = 'protection-indicator idle';
    document.getElementById('protectionText').textContent = 'الحماية نشطة';
    document.getElementById('pbProtection').style.display = 'none';
  }
}

function showToast(msg, type) {
  const c = document.getElementById('toastContainer');
  const t = document.createElement('div');
  t.className = 'toast '+type;
  t.textContent = msg;
  t.setAttribute('role', 'alert');
  c.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}
