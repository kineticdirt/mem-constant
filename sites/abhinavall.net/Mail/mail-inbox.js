(function () {
  const listEl = document.getElementById('mail-list');
  const detailEl = document.getElementById('mail-detail');
  const statusEl = document.getElementById('mail-status');
  const errorEl = document.getElementById('mail-error');
  const refreshBtn = document.getElementById('mail-refresh');

  let messages = [];
  let activeId = null;

  function showError(msg) {
    if (!errorEl) return;
    errorEl.hidden = !msg;
    errorEl.textContent = msg || '';
  }

  function setStatus(text) {
    if (statusEl) statusEl.textContent = text;
  }

  function formatWhen(iso) {
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso || '';
    }
  }

  function renderDetail(msg) {
    if (!detailEl) return;
    if (!msg) {
      detailEl.innerHTML = '<p class="mail-detail__empty">Select a message to read.</p>';
      return;
    }
    detailEl.innerHTML =
      '<header class="mail-detail__head">' +
      '<h2 class="mail-detail__subject"></h2>' +
      '<p class="mail-detail__meta"></p>' +
      '</header>' +
      '<div class="mail-detail__body"></div>';
    detailEl.querySelector('.mail-detail__subject').textContent = msg.subject || '(no subject)';
    detailEl.querySelector('.mail-detail__meta').textContent =
      'From: ' + (msg.from || 'unknown') + '\nTo: ' + (msg.to || 'abhinav.allam@abhinavall.net') + '\nReceived: ' + formatWhen(msg.receivedAt || msg.timestamp);
    detailEl.querySelector('.mail-detail__body').textContent = msg.text || msg.preview || '(no body)';
  }

  function renderList() {
    if (!listEl) return;
    listEl.innerHTML = '';
    if (!messages.length) {
      listEl.innerHTML = '<p class="mail-detail__empty" style="padding:1rem">No messages yet.</p>';
      renderDetail(null);
      return;
    }
    messages.forEach((m) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mail-item' + (m.id === activeId ? ' is-active' : '');
      btn.innerHTML =
        '<div class="mail-item__from"></div>' +
        '<div class="mail-item__subject"></div>' +
        '<div class="mail-item__meta"></div>';
      btn.querySelector('.mail-item__from').textContent = m.from || 'unknown';
      btn.querySelector('.mail-item__subject').textContent = m.subject || '(no subject)';
      btn.querySelector('.mail-item__meta').textContent = formatWhen(m.receivedAt);
      btn.addEventListener('click', () => selectMessage(m.id));
      listEl.appendChild(btn);
    });
  }

  async function selectMessage(id) {
    activeId = id;
    renderList();
    const cached = messages.find((m) => m.id === id);
    if (cached && cached.text) {
      renderDetail(cached);
      return;
    }
    try {
      const res = await fetch('/api/email/inbox/' + encodeURIComponent(id));
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      renderDetail(data.message);
    } catch (err) {
      renderDetail({ subject: 'Error', text: String(err) });
    }
  }

  async function loadInbox() {
    showError('');
    setStatus('Loading…');
    try {
      const res = await fetch('/api/email/inbox?limit=100');
      if (res.status === 401) {
        showError('Sign in required. Add a Cloudflare Access policy for /Mail and /api/email/inbox (owner email only).');
        setStatus('Unauthorized');
        messages = [];
        renderList();
        return;
      }
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      messages = data.messages || [];
      setStatus(messages.length + ' message(s)');
      if (messages.length && !activeId) activeId = messages[0].id;
      renderList();
      if (activeId) await selectMessage(activeId);
    } catch (err) {
      showError('Could not load inbox: ' + err.message);
      setStatus('Error');
      messages = [];
      renderList();
    }
  }

  refreshBtn?.addEventListener('click', loadInbox);
  loadInbox();
})();
