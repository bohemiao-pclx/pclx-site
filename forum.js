const API = 'https://pclx-forum.pages.dev'
const AUTH_KEY = 'pclx.forum.web.auth.v1'

const $ = (id) => document.getElementById(id)
const statusEl = $('status')
const listEl = $('postList')
const tabsEl = $('tabs')
const categoriesEl = $('categories')
const toast = $('toast')

let state = { tab: 'all', category: 'all', query: '', posts: [], active: null }
let auth = loadAuth()
let authMode = 'login'
let pendingAttachment = null

function loadAuth() {
  try {
    const raw = localStorage.getItem(AUTH_KEY)
    if (!raw) return null
    const value = JSON.parse(raw)
    return value?.token && value?.user?.username ? value : null
  } catch { return null }
}
function saveAuth(value) {
  auth = value
  try { value ? localStorage.setItem(AUTH_KEY, JSON.stringify(value)) : localStorage.removeItem(AUTH_KEY) } catch {}
  renderAuth()
}
function headers(token) {
  return { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
}
async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    method: options.method || 'GET',
    headers: { ...headers(options.token), ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
    body: options.body ? JSON.stringify(options.body) : undefined
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`)
  return data
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]))
}
function timeAgo(value) {
  const diff = Date.now() - Number(value || 0)
  if (!Number.isFinite(diff) || diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
  if (diff < 86400000 * 30) return `${Math.floor(diff / 86400000)} 天前`
  return new Date(value).toLocaleDateString('zh-CN')
}
const CATEGORY_LABEL = { general: '综合', help: '求助', showcase: '展示', chat: '闲聊' }

function showToast(message) {
  toast.textContent = message
  toast.classList.add('show')
  clearTimeout(showToast.timer)
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 1800)
}
function renderAuth() {
  $('authName').textContent = auth ? auth.user.username : ''
  $('authButton').textContent = auth ? '退出' : '登录 / 注册'
}
function openModal(id) { $(id).hidden = false }
function closeModal(id) { $(id).hidden = true }
document.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => closeModal(button.dataset.close)))
document.querySelectorAll('.modal-backdrop').forEach((backdrop) => backdrop.addEventListener('click', (event) => { if (event.target === backdrop) backdrop.hidden = true }))

async function loadPosts() {
  statusEl.textContent = '正在读取帖子…'
  statusEl.hidden = false
  listEl.innerHTML = ''
  try {
    const params = new URLSearchParams({ limit: '30', offset: '0' })
    if (state.category !== 'all') params.set('category', state.category)
    if (state.query) params.set('q', state.query)
    if (state.tab === 'featured') params.set('featured', '1')
    if (state.tab === 'announcements') params.set('announcements', '1')
    const result = await api(`/api/posts?${params}`)
    state.posts = result.posts || []
    statusEl.hidden = state.posts.length > 0
    if (!state.posts.length) {
      statusEl.hidden = true
      listEl.innerHTML = '<div class="web-empty">这里还没有帖子。<br />登录后成为第一个发帖的人。</div>'
      return
    }
    listEl.innerHTML = state.posts.map((post) => `
      <article class="web-post" data-id="${post.id}">
        <div class="web-post-meta">
          ${post.announcement ? '<span class="web-badge announcement">官方通告</span>' : ''}
          ${post.featured ? '<span class="web-badge featured">精华</span>' : ''}
          <span class="web-badge category">${escapeHtml(CATEGORY_LABEL[post.category] || post.category)}</span>
          <span>${escapeHtml(post.author.username)}</span><span>${timeAgo(post.createdAt)}</span>
        </div>
        <h2>${escapeHtml(post.title)}</h2>
        <p>${escapeHtml(String(post.content || '').slice(0, 190))}${String(post.content || '').length > 190 ? '…' : ''}</p>
        <div class="web-post-foot"><span>♥ ${post.likeCount}</span><span>💬 ${post.commentCount}</span><span class="open">查看讨论 →</span></div>
      </article>
    `).join('')
  } catch (error) {
    statusEl.textContent = `连接论坛失败：${error.message}`
  }
}

tabsEl.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-tab]')
  if (!button) return
  state.tab = button.dataset.tab
  tabsEl.querySelectorAll('button').forEach((item) => item.classList.toggle('active', item === button))
  void loadPosts()
})
categoriesEl.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-cat]')
  if (!button) return
  state.category = button.dataset.cat
  categoriesEl.querySelectorAll('button').forEach((item) => item.classList.toggle('active', item === button))
  void loadPosts()
})
$('searchButton').addEventListener('click', () => { state.query = $('searchInput').value.trim(); void loadPosts() })
$('searchInput').addEventListener('keydown', (event) => { if (event.key === 'Enter') { state.query = $('searchInput').value.trim(); void loadPosts() } })

$('authButton').addEventListener('click', () => {
  if (auth) { saveAuth(null); showToast('已退出论坛'); return }
  authMode = 'login'
  $('authTitle').textContent = '登录论坛'
  $('authSubmit').textContent = '登录'
  $('switchAuth').textContent = '没有账户？注册'
  openModal('authModal')
  $('authUser').focus()
})
$('switchAuth').addEventListener('click', () => {
  authMode = authMode === 'login' ? 'register' : 'login'
  $('authTitle').textContent = authMode === 'login' ? '登录论坛' : '注册论坛账户'
  $('authSubmit').textContent = authMode === 'login' ? '登录' : '注册'
  $('switchAuth').textContent = authMode === 'login' ? '没有账户？注册' : '已有账户？去登录'
})
$('authForm').addEventListener('submit', async (event) => {
  event.preventDefault()
  try {
    const result = await api(authMode === 'login' ? '/api/auth/login' : '/api/auth/register', {
      method: 'POST',
      body: { username: $('authUser').value.trim(), password: $('authPass').value }
    })
    saveAuth(result)
    closeModal('authModal')
    showToast(authMode === 'login' ? '登录成功' : '注册成功')
    void loadPosts()
  } catch (error) { showToast(error.message) }
})

function fileType(file) {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('video/')) return 'video'
  return 'file'
}

async function uploadAttachment(file) {
  if (!file) return
  if (file.size > 100 * 1024 * 1024) {
    setFileStatus('文件超过 100 MB，请选择更小的文件', true)
    return
  }
  pendingAttachment = null
  const status = $('fileStatus')
  status.hidden = false
  status.className = 'file-status'
  status.innerHTML = '<span>正在上传 ' + escapeHtml(file.name) + ' …</span>'
  const form = new FormData()
  form.append('file', file, file.name)
  try {
    const response = await fetch('https://kappa.lol/api/upload', { method: 'POST', body: form })
    const data = await response.json()
    if (!response.ok || !data.link) throw new Error(data.message || '上传失败')
    pendingAttachment = { url: data.link, type: fileType(file), name: file.name }
    status.className = 'file-status'
    status.innerHTML = '<span>✓ ' + escapeHtml(file.name) + ' 已上传</span><button type="button" id="clearFile">×</button>'
    $('clearFile')?.addEventListener('click', () => {
      pendingAttachment = null
      status.hidden = true
      $('newFile').value = ''
    })
  } catch (error) {
    setFileStatus('上传失败：' + error.message, true)
  }
}

function setFileStatus(message, error = false) {
  const status = $('fileStatus')
  status.hidden = false
  status.className = 'file-status' + (error ? ' error' : '')
  status.textContent = message
}

$('newFile').addEventListener('change', () => { void uploadAttachment($('newFile').files[0]) })
const drop = $('fileDrop')
drop.addEventListener('dragover', (event) => { event.preventDefault(); drop.classList.add('dragging') })
drop.addEventListener('dragleave', () => drop.classList.remove('dragging'))
drop.addEventListener('drop', (event) => {
  event.preventDefault()
  drop.classList.remove('dragging')
  const file = event.dataTransfer?.files?.[0]
  if (file) void uploadAttachment(file)
})

$('newPostButton').addEventListener('click', () => {
  if (!auth) { showToast('请先登录论坛'); openModal('authModal'); return }
  openModal('newModal')
  $('newTitle').focus()
})
$('newForm').addEventListener('submit', async (event) => {
  event.preventDefault()
  if (!auth) return
  const pasted = $('newAttachment').value.trim()
  const attachmentUrl = pendingAttachment?.url || pasted || null
  const attachmentType = pendingAttachment?.type || (!pasted ? null : /\.(png|jpe?g|webp|gif|bmp|avif)(\?|$)/i.test(pasted) ? 'image' : /\.(mp4|webm|mov|m4v|ogv)(\?|$)/i.test(pasted) ? 'video' : 'file')
  const attachmentName = pendingAttachment?.name || (pasted ? decodeURIComponent(pasted.split('/').pop().split('?')[0]) : null)
  try {
    await api('/api/posts', {
      method: 'POST', token: auth.token,
      body: { title: $('newTitle').value.trim(), content: $('newContent').value.trim(), category: $('newCategory').value, attachmentUrl, attachmentType, attachmentName }
    })
    closeModal('newModal')
    $('newForm').reset()
    pendingAttachment = null
    $('fileStatus').hidden = true
    showToast('帖子已发布')
    void loadPosts()
  } catch (error) { showToast(error.message) }
})

listEl.addEventListener('click', (event) => {
  const post = event.target.closest('.web-post')
  if (post) void openDetail(Number(post.dataset.id))
})

async function openDetail(id) {
  try {
    const result = await api(`/api/posts/${id}`, { token: auth?.token })
    state.active = result
    renderDetail()
    openModal('postModal')
  } catch (error) { showToast(error.message) }
}

function renderDetail() {
  const { post, comments } = state.active
  const attachment = post.attachmentUrl
    ? post.attachmentType === 'image'
      ? `<img class="detail-media" src="${escapeHtml(post.attachmentUrl)}" alt="${escapeHtml(post.attachmentName || '图片')}" />`
      : post.attachmentType === 'video'
        ? `<video class="detail-media" src="${escapeHtml(post.attachmentUrl)}" controls></video>`
        : `<p><a href="${escapeHtml(post.attachmentUrl)}" target="_blank" rel="noreferrer">附件：${escapeHtml(post.attachmentName || '下载文件')}</a></p>`
    : ''
  const admin = auth?.user?.role === 'admin'
  $('postDetail').innerHTML = `
    <div class="web-post-meta">
      ${post.announcement ? '<span class="web-badge announcement">官方通告</span>' : ''}
      ${post.featured ? '<span class="web-badge featured">精华</span>' : ''}
      <span class="web-badge category">${escapeHtml(CATEGORY_LABEL[post.category] || post.category)}</span>
      <span>${escapeHtml(post.author.username)}</span><span>${timeAgo(post.createdAt)}</span>
    </div>
    <h2 class="detail-title">${escapeHtml(post.title)}</h2>
    <div class="detail-content">${escapeHtml(post.content)}</div>
    ${attachment}
    <div class="detail-actions">
      <button class="like-button ${post.liked ? 'active' : ''}" id="likePost">♥ ${post.likeCount}</button>
      <span>${comments.length} 条评论</span>
      ${admin ? `<span class="admin-flags"><button id="flagFeatured">${post.featured ? '取消精华' : '设为精华'}</button><button id="flagAnnouncement">${post.announcement ? '取消通告' : '设为通告'}</button></span>` : ''}
    </div>
    <div class="detail-comments">${comments.map((item) => `<div class="web-comment"><b>${escapeHtml(item.author.username)}</b><span>${timeAgo(item.createdAt)}</span><p>${escapeHtml(item.content)}</p></div>`).join('') || '<div class="web-empty">还没有评论。</div>'}</div>
    <form class="comment-form" id="commentForm"><input id="commentInput" placeholder="${auth ? '写下评论…' : '登录后发表评论'}" maxlength="5000" /><button class="solid-button" type="submit">发送</button></form>
  `
  $('likePost')?.addEventListener('click', async () => {
    if (!auth) { showToast('请先登录'); openModal('authModal'); return }
    try {
      const result = await api(`/api/posts/${post.id}/like`, { method: 'POST', token: auth.token })
      post.liked = result.liked
      post.likeCount = result.likeCount
      renderDetail()
      void loadPosts()
    } catch (error) { showToast(error.message) }
  })
  $('flagFeatured')?.addEventListener('click', () => toggleFlag('featured'))
  $('flagAnnouncement')?.addEventListener('click', () => toggleFlag('announcement'))
  $('commentForm')?.addEventListener('submit', async (event) => {
    event.preventDefault()
    if (!auth) { showToast('请先登录'); openModal('authModal'); return }
    const content = $('commentInput').value.trim()
    if (!content) return
    try {
      await api(`/api/posts/${post.id}/comments`, { method: 'POST', token: auth.token, body: { content } })
      await openDetail(post.id)
      void loadPosts()
    } catch (error) { showToast(error.message) }
  })
}

async function toggleFlag(flag) {
  if (!auth || auth.user.role !== 'admin' || !state.active) return
  try {
    await api(`/api/admin/posts/${state.active.post.id}/flags`, { method: 'POST', token: auth.token, body: { [flag]: !state.active.post[flag] } })
    await openDetail(state.active.post.id)
    void loadPosts()
    showToast(flag === 'featured' ? '精华状态已更新' : '通告状态已更新')
  } catch (error) { showToast(error.message) }
}

renderAuth()
void loadPosts()
