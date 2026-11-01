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
let categoryLabels = {}
let categories = []

function renderCategoryOptions() {
  const all = [{ key: 'all', label: '全部' }, ...categories]
  categoriesEl.innerHTML = all.map((item) => `<button type="button" class="${state.category === item.key ? 'active' : ''}" data-cat="${escapeHtml(item.key)}">${escapeHtml(item.label)}</button>`).join('')
  for (const id of ['newCategory', 'editCategory']) {
    const select = $(id)
    if (select) select.innerHTML = categories.map((item) => `<option value="${escapeHtml(item.key)}">${escapeHtml(item.label)}</option>`).join('')
  }
}

async function loadCategories() {
  try {
    const result = await api('/api/categories')
    categories = result.categories || []
    categoryLabels = Object.fromEntries(categories.map((item) => [item.key, item.label]))
    renderCategoryOptions()
  } catch { /* 保留默认分类按钮 */ }
}

function showToast(message) {
  toast.textContent = message
  toast.classList.add('show')
  clearTimeout(showToast.timer)
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 1800)
}
function renderAuth() {
  $('authName').textContent = auth ? auth.user.username : ''
  $('authButton').textContent = auth ? '退出' : '登录 / 注册'
  $('profileButton').hidden = !auth
  $('teamButton').hidden = !auth
  $('socialButton').hidden = !auth
  $('officialButton').hidden = !auth
  $('categoryAdminButton').hidden = !auth || auth.user.role !== 'admin'
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
    if (state.tab === 'following') params.set('following', '1')
    let result
    if (state.tab === 'favorites') result = await api('/api/favorites', { token: auth?.token })
    else result = await api(`/api/posts?${params}`)
    state.posts = result.posts || []
    statusEl.hidden = state.posts.length > 0
    if (!state.posts.length) {
      statusEl.hidden = true
      listEl.innerHTML = '<div class="web-empty">这里还没有帖子。<br />登录后成为第一个发帖的人。</div>'
      return
    }
    listEl.innerHTML = state.posts.map((post) => `
      <article class="web-post ${post.highlight ? `highlight-${post.highlight}` : ""}" data-id="${post.id}">
        <div class="web-post-meta">
          ${post.announcement ? '<span class="web-badge announcement">官方通告</span>' : ''}
          ${post.pinned ? '<span class="web-badge pinned">置顶</span>' : ''}${post.pinned ? '<span class="web-badge pinned">置顶</span>' : ''}${post.featured ? '<span class="web-badge featured">精华</span>' : ''}
          <span class="web-badge category">${escapeHtml(categoryLabels[post.category] || post.category)}</span>
          <button class="author-link" data-profile-id="${post.author.id}">${escapeHtml(post.author.username)}</button><span>${timeAgo(post.createdAt)}</span>
        </div>
        <h2>${escapeHtml(post.title)}</h2>
        <p>${escapeHtml(markdownToPlain(String(post.content || '')).slice(0, 190))}${markdownToPlain(String(post.content || '')).length > 190 ? '…' : ''}</p>
        ${post.poll?.length ? `<div class="web-poll">${post.poll.map((option, index) => `<button type="button" data-vote="${post.id}:${index}">${escapeHtml(option)}</button>`).join('')}</div>` : ''}
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

$('categoryAdminButton').addEventListener('click', () => { if (auth?.user.role === 'admin') openModal('categoryModal') })
$('categoryForm').addEventListener('submit', async (event) => {
  event.preventDefault()
  if (!auth || auth.user.role !== 'admin') return
  try {
    await api('/api/admin/categories', { method: 'POST', token: auth.token, body: { key: $('categoryKey').value.trim().toLowerCase(), label: $('categoryLabel').value.trim() } })
    $('categoryForm').reset()
    closeModal('categoryModal')
    showToast('板块已创建')
    await loadCategories()
  } catch (error) { showToast(error.message) }
})
$('officialButton').addEventListener('click', async () => {
  if (!auth) return
  try {
    const result = await api('/api/official', { token: auth.token })
    $('officialList').innerHTML = result.messages.length ? result.messages.map((item) => `<div class="official-item"><b>${escapeHtml(item.title)}</b><p>${escapeHtml(item.content)}</p><small>${timeAgo(item.createdAt)}</small></div>`).join('') : '<div class="web-empty">暂时没有官方消息。</div>'
    for (const item of result.messages.filter((message) => !message.isRead)) await api('/api/official/read', { method: 'POST', token: auth.token, body: { id: item.id } })
    openModal('officialModal')
  } catch (error) { showToast(error.message) }
})
$('profileButton').addEventListener('click', () => { if (auth) void openProfile(auth.user.id) })
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

async function uploadToHost(file) {
  const form = new FormData()
  form.append('file', file, file.name)
  const response = await fetch('https://kappa.lol/api/upload', { method: 'POST', body: form })
  const data = await response.json()
  if (!response.ok || !data.link) throw new Error(data.message || '上传失败')
  return data.link
}

async function uploadAvatar(file) {
  if (!file || !auth) return
  if (!file.type.startsWith('image/')) { showToast('头像必须是图片'); return }
  if (file.size > 5 * 1024 * 1024) { showToast('头像不能超过 5 MB'); return }
  try {
    showToast('正在上传头像…')
    const url = await uploadToHost(file)
    const result = await api('/api/me/avatar', { method: 'PUT', token: auth.token, body: { avatarUrl: url } })
    saveAuth({ ...auth, user: { ...auth.user, avatarUrl: result.user.avatarUrl || url } })
    await openProfile(auth.user.id)
    showToast('头像已更新')
  } catch (error) { showToast('上传头像失败：' + error.message) }
}

async function openProfile(userId) {
  try {
    const result = await api(`/api/users/${userId}`, { token: auth?.token })
    const own = auth?.user?.id === result.user.id
    $('profileContent').innerHTML = `
      <div class="web-profile">
        <div class="web-profile-cover" style="${result.user.coverUrl ? `background-image:url('${escapeHtml(result.user.coverUrl)}')` : ''}">
          ${own ? '<label class="web-cover-edit">更换背景<input id="coverFile" type="file" accept="image/*" hidden /></label>' : ''}
        </div>
        <div class="web-profile-head">
          <div class="web-profile-avatar">${result.user.avatarUrl ? `<img src="${escapeHtml(result.user.avatarUrl)}" alt="" />` : escapeHtml(result.user.username.slice(0, 1).toUpperCase())}${result.user.avatarFrame ? `<img class="web-avatar-frame" src="${escapeHtml(result.user.avatarFrame)}" alt="" />` : ""}</div>
          <div><h2>${escapeHtml(result.user.username)} ${result.user.title ? `<em class="web-title-badge">${escapeHtml(result.user.title)}</em>` : ''}</h2><span>${result.user.role === 'admin' ? '管理员 · ' : ''}加入于 ${new Date(result.user.createdAt).toLocaleDateString('zh-CN')} · ID：${escapeHtml(result.user.accountId || `PCLX-${String(result.user.id).padStart(6, '0')}`)}</span></div>
          ${own ? '<button class="solid-button web-avatar-button" id="checkinButton">签到</button><button class="solid-button web-avatar-button" id="editProfileButton">编辑资料</button><label class="solid-button web-avatar-button">上传头像<input id="avatarFile" type="file" accept="image/*" hidden /></label>' : `<button class="solid-button web-avatar-button" id="followButton">${result.user.isFollowing ? '已关注' : '+ 关注'}</button><button class="solid-button web-avatar-button" id="dmButton">私聊</button><button class="mini-button" id="friendButton">加好友</button>`}
        </div>
        <p class="web-profile-bio">${escapeHtml(result.user.bio || '这个人很神秘，还没有写简介。')}</p>
        <div class="web-profile-meta"><span>${result.user.gender === 'male' ? '男' : result.user.gender === 'female' ? '女' : '保密'}</span>${result.user.age != null ? `<span>${result.user.age} 岁</span>` : ''}${result.user.ipLocation ? `<span>IP 属地：${escapeHtml(result.user.ipLocation)}</span>` : ''}</div>
        <div class="web-level"><div><b>Lv.${result.user.level || 1}</b><span>${result.user.xp || 0} XP</span></div><div class="web-level-bar"><span style="width:${result.user.nextLevelXp ? Math.min(100, Math.max(0, ((result.user.xp || 0) - (result.user.currentLevelXp || 0)) / Math.max(1, result.user.nextLevelXp - (result.user.currentLevelXp || 0)) * 100)) : 100}%"></span></div><small>${result.user.nextLevelXp ? `距离下一级还需 ${Math.max(0, result.user.nextLevelXp - (result.user.xp || 0))} XP` : '已达到最高等级'}</small></div>
        <div class="web-profile-stats"><span><b>${result.user.postCount}</b> 帖子</span><span><b>${result.user.followerCount}</b> 粉丝</span><span><b>${result.user.followingCount}</b> 关注</span><span><b>${result.user.likeCount}</b> 获赞</span></div>
        <div class="web-profile-posts"><b>最近发布</b>${result.posts.length ? result.posts.map((post) => `<div class="web-profile-post"><span>${post.announcement ? '官方通告 · ' : ''}${post.featured ? '精华 · ' : ''}${escapeHtml(post.title)}</span><small>${timeAgo(post.createdAt)}</small></div>`).join('') : '<div class="web-empty">还没有发布过帖子。</div>'}</div>
      </div>`
    $('avatarFile')?.addEventListener('change', () => { void uploadAvatar($('avatarFile').files[0]) })
    $('coverFile')?.addEventListener('change', () => { void uploadProfileCover($('coverFile').files[0], result.user) })
    $('editProfileButton')?.addEventListener('click', () => openProfileEditor(result.user))
    $('checkinButton')?.addEventListener('click', async () => {
      if (!auth) return
      try {
        const checkin = await api('/api/checkin', { method: 'POST', token: auth.token })
        showToast(`签到成功，获得 ${checkin.xpAdded} XP`)
        await openProfile(result.user.id)
      } catch (error) { showToast(error.message) }
    })
    $('dmButton')?.addEventListener('click', async () => {
      if (!auth) { openModal('authModal'); return }
      const targetId = result.user.id
      try { const dm = await api('/api/conversations/dm', { method: 'POST', token: auth.token, body: { userId: targetId } }); closeModal('profileModal'); openSocial(dm.conversationId) } catch (error) { showToast(error.message) }
    })
    $('friendButton')?.addEventListener('click', async () => {
      if (!auth) { openModal('authModal'); return }
      try { await api('/api/friends/request', { method: 'POST', token: auth.token, body: { username: result.user.username } }); showToast('好友请求已发送') } catch (error) { showToast(error.message) }
    })
    $('blockButton')?.addEventListener('click', async () => {
      if (!auth) { openModal('authModal'); return }
      if (!confirm('屏蔽后看不到该用户的帖子，确定？')) return
      try { await api(`/api/users/${result.user.id}/block`, { method: 'POST', token: auth.token }); showToast('已屏蔽该用户'); closeModal('profileModal') } catch (error) { showToast(error.message) }
    })
    $('followButton')?.addEventListener('click', async () => {
      if (!auth) { openModal('authModal'); return }
      try {
        const following = await api(`/api/users/${result.user.id}/follow`, { method: result.user.isFollowing ? 'DELETE' : 'POST', token: auth.token })
        result.user.isFollowing = following.following
        result.user.followerCount = following.followerCount
        await openProfile(result.user.id)
        showToast(following.following ? '已关注' : '已取消关注')
      } catch (error) { showToast(error.message) }
    })
    openModal('profileModal')
  } catch (error) { showToast(error.message) }
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
  try {
    const url = await uploadToHost(file)
    pendingAttachment = { url, type: fileType(file), name: file.name }
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
      body: { title: $('newTitle').value.trim(), content: $('newContent').value.trim(), category: $('newCategory').value, attachmentUrl, attachmentType, attachmentName, poll: $('newPoll').value.split('\n').map((x) => x.trim()).filter(Boolean), highlight: $('newHighlight').value }
    })
    closeModal('newModal')
    $('newForm').reset()
    pendingAttachment = null
    $('fileStatus').hidden = true
    showToast('帖子已发布')
    void loadPosts()
  } catch (error) { showToast(error.message) }
})

listEl.addEventListener('click', async (event) => {
  const voteBtn = event.target.closest('[data-vote]')
  if (voteBtn && auth) { event.stopPropagation(); const [postId, idx] = voteBtn.dataset.vote.split(':'); try { await api(`/api/posts/${postId}/vote`, { method: 'POST', token: auth.token, body: { optionIndex: Number(idx) } }); showToast('投票成功'); void loadPosts() } catch (error) { showToast(error.message) } return }
  if (voteBtn && !auth) { openModal('authModal'); return }
  const author = event.target.closest('.author-link')
  if (author) { event.stopPropagation(); void openProfile(Number(author.dataset.profileId)); return }
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

function openEdit(post) {
  if (!auth || (auth.user.id !== post.author.id && auth.user.role !== 'admin')) return
  $('editTitle').value = post.title
  $('editContent').value = post.content
  $('editCategory').value = post.category
  openModal('editModal')
}

$('editForm').addEventListener('submit', async (event) => {
  event.preventDefault()
  if (!auth || !state.active) return
  const post = state.active.post
  try {
    await api(`/api/posts/${post.id}`, {
      method: 'PUT', token: auth.token,
      body: {
        title: $('editTitle').value.trim(),
        content: $('editContent').value.trim(),
        category: $('editCategory').value,
        attachmentUrl: post.attachmentUrl || null,
        attachmentType: post.attachmentType || null,
        attachmentName: post.attachmentName || null
      }
    })
    closeModal('editModal')
    await openDetail(post.id)
    void loadPosts()
    showToast('帖子已更新')
  } catch (error) { showToast(error.message) }
})

async function uploadProfileCover(file, profile) {
  if (!auth || !file) return
  if (!file.type.startsWith('image/')) { showToast('背景必须是图片'); return }
  try {
    const coverUrl = await uploadToHost(file)
    const response = await api('/api/me/profile', { method: 'PUT', token: auth.token, body: { username: profile.username, bio: profile.bio || '', gender: profile.gender || 'secret', age: profile.age ?? null, ipLocation: profile.ipLocation || '', coverUrl } })
    saveAuth({ ...auth, user: { ...auth.user, ...response.user } })
    await openProfile(profile.id)
    showToast('背景图已更新')
  } catch (error) { showToast(error.message) }
}

function openProfileEditor(profile) {
  $('profileName').value = profile.username
  $('profileBio').value = profile.bio || ''
  $('profileGender').value = profile.gender || 'secret'
  $('profileAge').value = profile.age ?? ''
  $('profileIp').value = profile.ipLocation || ''
  $('profileTitle').innerHTML = (profile.unlockedTitles || ['新手']).map((title) => `<option value="${escapeHtml(title)}">${escapeHtml(title)}</option>`).join('')
  $('profileTitle').value = profile.title || (profile.unlockedTitles || ['新手'])[0]
  $('profileEditForm').dataset.cover = profile.coverUrl || ''
  openModal('profileEditModal')
}

$('profileEditForm').addEventListener('submit', async (event) => {
  event.preventDefault()
  if (!auth) return
  try {
    const response = await api('/api/me/profile', { method: 'PUT', token: auth.token, body: {
      username: $('profileName').value.trim(), bio: $('profileBio').value.trim(), gender: $('profileGender').value,
      age: $('profileAge').value, ipLocation: $('profileIp').value.trim(), title: $('profileTitle').value, coverUrl: $('profileEditForm').dataset.cover || ''
    } })
    saveAuth({ ...auth, user: { ...auth.user, ...response.user } })
    closeModal('profileEditModal')
    await openProfile(auth.user.id)
    showToast('个人资料已更新')
  } catch (error) { showToast(error.message) }
})

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
      ${post.pinned ? '<span class="web-badge pinned">置顶</span>' : ''}${post.pinned ? '<span class="web-badge pinned">置顶</span>' : ''}${post.featured ? '<span class="web-badge featured">精华</span>' : ''}
      <span class="web-badge category">${escapeHtml(categoryLabels[post.category] || post.category)}</span>
      <button class="author-link" data-profile-id="${post.author.id}">${escapeHtml(post.author.username)}</button><span>${timeAgo(post.createdAt)}</span>
    </div>
    <h2 class="detail-title">${escapeHtml(post.title)}</h2>
    <div class="detail-content md-content">${renderMarkdown(post.content)}</div>
    ${attachment}
    <div class="detail-actions">
      <button class="like-button ${post.liked ? 'active' : ''}" id="likePost">♥ ${post.likeCount}</button>
      <span>${comments.length} 条评论</span>
      ${admin ? `<span class="admin-flags"><button id="flagPinned">${post.pinned ? '取消置顶' : '置顶'}</button><button id="flagFeatured">${post.featured ? '取消精华' : '设为精华'}</button><button id="flagAnnouncement">${post.announcement ? '取消通告' : '设为通告'}</button></span>` : ''}${(auth && (auth.user.id === post.author.id || admin)) ? '<button class="text-button" id="editPost">编辑帖子</button>' : ''}
    </div>
    <div class="detail-comments">${comments.map((item) => `<div class="web-comment"><b>${escapeHtml(item.author.username)}</b><span>${timeAgo(item.createdAt)}</span><div class="web-comment-body md-content">${renderMarkdown(item.content)}</div></div>`).join('') || '<div class="web-empty">还没有评论。</div>'}</div>
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
  $('flagPinned')?.addEventListener('click', () => toggleFlag('pinned'))
  $('flagFeatured')?.addEventListener('click', () => toggleFlag('featured'))
  $('flagAnnouncement')?.addEventListener('click', () => toggleFlag('announcement'))
  $('editPost')?.addEventListener('click', () => openEdit(post))
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

document.getElementById('postDetail')?.addEventListener('click', (event) => {
  const author = event.target.closest('.author-link')
  if (author) void openProfile(Number(author.dataset.profileId))
})

renderAuth()
void loadCategories()
void loadPosts()

/* ==================== 好友与私聊 ==================== */
const social = {
  friends: [],
  requests: [],
  conversations: [],
  activeId: null,
  messages: []
}

function socialAvatar(user) {
  const initial = escapeHtml(String(user?.username || '?').slice(0, 1).toUpperCase())
  return user?.avatarUrl ? `<img src="${escapeHtml(user.avatarUrl)}" alt="" />` : `<span>${initial}</span>`
}

function socialName(user) {
  return escapeHtml(user?.username || '未知用户')
}

async function loadSocial(preserveActive = true) {
  if (!auth) return
  const [friendData, conversationData] = await Promise.all([
    api('/api/friends', { token: auth.token }),
    api('/api/conversations', { token: auth.token })
  ])
  social.friends = friendData.friends || []
  social.requests = friendData.incoming || []
  social.conversations = conversationData.conversations || []
  if (!preserveActive) social.activeId = null
  if (social.activeId && !social.conversations.some((item) => item.id === social.activeId)) social.activeId = null
  renderSocial()
  if (social.activeId) await loadMessages(social.activeId)
}

function renderSocial() {
  const friendList = $('friendsList')
  const requestList = $('friendRequests')
  const conversationList = $('conversationList')
  if (!friendList) return
  requestList.innerHTML = social.requests.length ? social.requests.map((user) => `
    <div class="social-request">
      <div class="social-person-main"><span class="social-avatar">${socialAvatar(user)}</span><b>${socialName(user)}</b></div>
      <div class="social-request-actions">
        <button type="button" data-request="${user.requestId}" data-accept="1">接受</button>
        <button type="button" data-request="${user.requestId}" data-accept="0">拒绝</button>
      </div>
    </div>`).join('') : '<div class="social-empty">没有新的好友请求</div>'
  friendList.innerHTML = social.friends.length ? social.friends.map((user) => `
    <button type="button" class="social-person" data-friend="${user.id}">
      <span class="social-avatar">${socialAvatar(user)}</span>
      <span class="social-person-main"><b>${socialName(user)}</b><small>${escapeHtml(user.role === 'admin' ? '管理员' : '好友')}</small></span>
    </button>`).join('') : '<div class="social-empty">还没有好友，先在上方搜索用户名添加</div>'
  conversationList.innerHTML = social.conversations.length ? social.conversations.map((conversation) => {
    const other = conversation.members.find((member) => member.id !== auth.user.id) || conversation.members[0] || {}
    const name = conversation.type === 'group' ? (conversation.name || '群聊') : other.username || '私聊'
    return `<button type="button" class="social-person ${social.activeId === conversation.id ? 'active' : ''}" data-conversation="${conversation.id}">
      <span class="social-avatar">${conversation.type === 'group' ? '群' : socialAvatar(other)}</span>
      <span class="social-person-main"><b>${escapeHtml(name)}</b><small>${escapeHtml(String(conversation.lastMessage || '还没有消息').slice(0, 30))}</small></span>
    </button>`
  }).join('') : '<div class="social-empty">还没有聊天</div>'
}

async function openSocial(conversationId = null) {
  if (!auth) { openModal('authModal'); return }
  openModal('socialModal')
  try {
    await loadSocial(false)
    if (conversationId) await selectConversation(Number(conversationId))
    else if (social.conversations.length) await selectConversation(social.conversations[0].id)
  } catch (error) { showToast(error.message) }
}

async function selectConversation(conversationId) {
  social.activeId = conversationId
  const conversation = social.conversations.find((item) => item.id === conversationId)
  const head = $('chatHead')
  if (head) {
    if (!conversation) head.textContent = '选择好友开始聊天'
    else if (conversation.type === 'group') head.textContent = conversation.name || '群聊'
    else {
      const other = conversation.members.find((member) => member.id !== auth.user.id) || {}
      head.innerHTML = `<span class="social-avatar small">${socialAvatar(other)}</span><b>${socialName(other)}</b>`
    }
  }
  $('chatForm').hidden = false
  renderSocial()
  await loadMessages(conversationId)
}

async function loadMessages(conversationId) {
  try {
    const result = await api(`/api/conversations/${conversationId}/messages`, { token: auth.token })
    social.messages = result.messages || []
    renderMessages()
  } catch (error) { showToast(error.message) }
}

function socialAttachment(message) {
  if (!message.attachmentUrl) return ''
  const url = escapeHtml(message.attachmentUrl)
  const name = escapeHtml(message.attachmentName || '附件')
  if (message.attachmentType === 'image') {
    return `<a href="${url}" target="_blank" rel="noreferrer"><img class="social-media social-media-image" src="${url}" alt="${name}" loading="lazy" /></a>`
  }
  if (message.attachmentType === 'video') {
    return `<video class="social-media social-media-video" src="${url}" controls preload="metadata"></video>`
  }
  return `<a class="social-file" href="${url}" target="_blank" rel="noreferrer">📎 ${name}</a>`
}

function renderMessages() {
  const box = $('chatMessages')
  if (!box) return
  box.innerHTML = social.messages.length ? social.messages.map((message) => {
    const mine = message.author?.id === auth.user.id
    const roomInvite = message.kind === 'room' && message.roomCode
    const attachment = roomInvite ? '' : socialAttachment(message)
    const content = message.content ? `<div class="social-bubble">${escapeHtml(message.content)}</div>` : ''
    const invite = roomInvite ? `<div class="social-room-invite">
      <b>联机房间邀请</b>
      <span>${escapeHtml(message.content || '邀请你加入房间')}</span>
      <code>${escapeHtml(message.roomCode)}</code>
      <div><button type="button" data-room-accept="${escapeHtml(message.roomCode)}">同意加入</button><button type="button" data-room-decline="${escapeHtml(message.roomCode)}">拒绝</button></div>
    </div>` : ''
    const room = !roomInvite && message.kind === 'room' && message.roomCode ? `<div class="social-room">房间：${escapeHtml(message.roomCode)}</div>` : ''
    return `<div class="social-message ${mine ? 'mine' : ''}">
      ${mine ? '' : `<span class="social-avatar tiny">${socialAvatar(message.author)}</span>`}
      <div class="social-message-body">${content}${attachment}${invite}${room}<small>${escapeHtml(message.author?.username || '')} · ${timeAgo(message.createdAt)}</small></div>
    </div>`
  }).join('') : '<div class="social-empty">暂无消息，打个招呼吧</div>'
  box.scrollTop = box.scrollHeight
}

async function sendSocialMessage(event) {
  event.preventDefault()
  const input = $('chatInput')
  const fileInput = $('chatFile')
  const file = fileInput?.files?.[0] || null
  const content = input.value.trim()
  if ((!content && !file) || !social.activeId || !auth) return
  const submit = event.target.querySelector('button[type="submit"]')
  if (submit) submit.disabled = true
  try {
    let attachmentUrl = null
    let attachmentType = null
    let attachmentName = null
    if (file) {
      if (file.size > 100 * 1024 * 1024) throw new Error('文件超过 100 MB')
      attachmentUrl = await uploadToHost(file)
      attachmentType = fileType(file)
      attachmentName = file.name
    }
    await api(`/api/conversations/${social.activeId}/messages`, {
      method: 'POST', token: auth.token,
      body: { content, attachmentUrl, attachmentType, attachmentName }
    })
    input.value = ''
    if (fileInput) fileInput.value = ''
    await loadMessages(social.activeId)
    await loadSocial()
  } catch (error) { showToast(error.message) } finally {
    if (submit) submit.disabled = false
  }
}

async function startDirectMessage(userId) {
  if (!auth) { openModal('authModal'); return }
  try {
    const result = await api('/api/conversations/dm', { method: 'POST', token: auth.token, body: { userId } })
    openSocial(result.conversationId)
  } catch (error) { showToast(error.message) }
}

$('socialButton')?.addEventListener('click', () => { void openSocial() })
$('addFriendForm')?.addEventListener('submit', async (event) => {
  event.preventDefault()
  const username = $('addFriendName').value.trim()
  if (!username || !auth) return
  try {
    const result = await api('/api/friends/request', { method: 'POST', token: auth.token, body: { username } })
    $('addFriendName').value = ''
    showToast(result.accepted ? '你们已经成为好友' : '好友请求已发送')
    await loadSocial()
  } catch (error) { showToast(error.message) }
})
$('friendRequests')?.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-request]')
  if (!button || !auth) return
  try {
    await api('/api/friends/respond', { method: 'POST', token: auth.token, body: { id: Number(button.dataset.request), accept: button.dataset.accept === '1' } })
    showToast(button.dataset.accept === '1' ? '已接受好友请求' : '已拒绝')
    await loadSocial()
  } catch (error) { showToast(error.message) }
})
$('friendsList')?.addEventListener('click', (event) => {
  const item = event.target.closest('[data-friend]')
  if (item) void startDirectMessage(Number(item.dataset.friend))
})
$('conversationList')?.addEventListener('click', (event) => {
  const item = event.target.closest('[data-conversation]')
  if (item) void selectConversation(Number(item.dataset.conversation))
})
$('chatForm')?.addEventListener('submit', (event) => { void sendSocialMessage(event) })
$('chatFile')?.addEventListener('change', () => {
  const file = $('chatFile').files?.[0]
  if (file) showToast('已选择：' + file.name)
})


/* ==================== 组队大厅 / 房间 ==================== */
const teamState = { rooms: [], active: null, details: null }

function teamAvatar(user) {
  return `<span class="team-avatar">${user?.avatarUrl ? `<img src="${escapeHtml(user.avatarUrl)}" alt="" />` : escapeHtml(String(user?.username || '?').slice(0, 1).toUpperCase())}${user?.avatarFrame ? `<img class="team-avatar-frame" src="${escapeHtml(user.avatarFrame)}" alt="" />` : ''}</span>`
}

async function loadTeamLobby() {
  if (!auth) { openModal('authModal'); return }
  openModal('teamModal')
  const list = $('teamRooms')
  list.innerHTML = '<div class="web-empty">正在读取组队大厅…</div>'
  try {
    const result = await api('/api/team-lobby')
    teamState.rooms = result.rooms || []
    list.innerHTML = teamState.rooms.length ? teamState.rooms.map((room) => `
      <article class="team-room-card">
        <div class="team-room-card-head"><div>${teamAvatar(room.host)}<div><b>${escapeHtml(room.title)}</b><small>房主 ${escapeHtml(room.host.username)} · ${room.memberCount} 人</small></div></div><span class="team-live">组队中</span></div>
        <div class="team-tags">${room.version ? `<span>${escapeHtml(room.version)}</span>` : ''}${room.loader ? `<span>${escapeHtml(room.loader)}</span>` : ''}</div>
        <p class="team-resources">${room.resources.length ? room.resources.slice(0, 6).map((item) => escapeHtml(String(item).split('::')[2] || item)).join(' · ') : '没有登记资源'}</p>
        <div class="team-room-card-actions"><button type="button" data-team-join="${escapeHtml(room.code)}">加入房间</button><button type="button" data-team-copy="${escapeHtml(room.code)}">复制房间码</button></div>
      </article>`).join('') : '<div class="web-empty">暂时没有同步到组队大厅的房间。</div>'
  } catch (error) { list.innerHTML = `<div class="web-empty">${escapeHtml(error.message)}</div>` }
}

async function joinTeamRoom(code) {
  if (!auth) { openModal('authModal'); return }
  try {
    await api(`/api/rooms/${encodeURIComponent(code)}/join`, { method: 'POST', token: auth.token })
    closeModal('teamModal')
    await openTeamRoom(code)
  } catch (error) { showToast(error.message) }
}

async function openTeamRoom(code) {
  try {
    const result = await api(`/api/rooms/${encodeURIComponent(code)}`, { token: auth.token })
    teamState.active = result.room
    teamState.details = result.room
    openModal('teamRoomModal')
    renderTeamRoom()
  } catch (error) { showToast(error.message) }
}

function renderTeamRoom() {
  const room = teamState.active
  if (!room) return
  $('teamRoomHead').innerHTML = `<p class="eyebrow"><span class="dot"></span> TEAM ROOM</p><div class="team-room-title"><h2>${escapeHtml(room.title)}</h2><code>${escapeHtml(room.code)}</code></div>`
  $('teamMembers').innerHTML = room.members.map((member) => `<div class="team-member">${teamAvatar(member)}<div><b>${escapeHtml(member.username)}</b><small>${member.isHost ? '房主' : '成员'}</small></div>${room.isHost && !member.isHost ? `<span class="team-member-actions"><button type="button" data-team-transfer="${member.id}">转让</button><button type="button" data-team-kick="${member.id}">踢出</button></span>` : ''}</div>`).join('')
  $('teamRoomInfo').innerHTML = `<div><span>版本</span><b>${escapeHtml(room.version || '未登记')}</b></div><div><span>加载器</span><b>${escapeHtml(room.loader || '未知')}</b></div><div><span>资源</span><b>${room.resources.length ? room.resources.map((item) => escapeHtml(String(item).split('::')[2] || item)).join(' / ') : '未登记'}</b></div>`
  const actions = []
  if (room.isHost) {
    actions.push(`<label class="team-sync"><input type="checkbox" id="teamSync" ${room.synced ? 'checked' : ''}/> 同步到组队大厅</label>`)
    actions.push(`<button type="button" id="teamInvite">邀请好友</button>`)
  }
  actions.push(`<button type="button" id="teamDownload">下载同款实例</button>`)
  actions.push(`<button type="button" id="teamLeave">${room.isHost ? '关闭房间' : '离开房间'}</button>`)
  $('teamRoomActions').innerHTML = actions.join('')
  $('teamChat').innerHTML = room.messages.length ? room.messages.map((message) => `<div class="team-chat-message"><b>${escapeHtml(message.author.username)}</b><span>${escapeHtml(message.content)}</span><small>${timeAgo(message.createdAt)}</small></div>`).join('') : '<div class="web-empty">还没有聊天消息。</div>'
  $('teamChat').scrollTop = $('teamChat').scrollHeight
}

async function sendTeamChat(event) {
  event.preventDefault()
  const content = $('teamChatInput').value.trim()
  if (!content || !teamState.active) return
  try {
    await api(`/api/rooms/${encodeURIComponent(teamState.active.code)}/messages`, { method: 'POST', token: auth.token, body: { content } })
    $('teamChatInput').value = ''
    await openTeamRoom(teamState.active.code)
  } catch (error) { showToast(error.message) }
}

async function roomAction(action, userId) {
  if (!teamState.active) return
  const code = teamState.active.code
  try {
    await api(`/api/rooms/${encodeURIComponent(code)}/${action}`, { method: 'POST', token: auth.token, body: userId ? { userId } : {} })
    showToast(action === 'kick' ? '已踢出成员' : '已转让房主')
    await openTeamRoom(code)
  } catch (error) { showToast(error.message) }
}

async function teamInviteFriend() {
  const room = teamState.active
  if (!room) return
  try {
    const result = await api('/api/friends', { token: auth.token })
    const candidates = (result.friends || []).filter((friend) => !room.members.some((member) => member.id === friend.id))
    if (!candidates.length) { showToast('没有可邀请的好友'); return }
    const names = candidates.map((friend, index) => `${index + 1}. ${friend.username}`).join('\n')
    const index = Number(window.prompt(`选择要邀请的好友：\\n${names}`)) - 1
    const friend = candidates[index]
    if (!friend) return
    await api(`/api/rooms/${encodeURIComponent(room.code)}/invite`, { method: 'POST', token: auth.token, body: { userId: friend.id } })
    showToast('邀请已发送到私聊')
  } catch (error) { showToast(error.message) }
}

async function respondRoomInvite(code, accept) {
  try {
    const invites = (await api('/api/room-invites', { token: auth.token })).invites || []
    const invite = invites.find((item) => item.code === code)
    if (invite) await api(`/api/room-invites/${invite.id}/respond`, { method: 'POST', token: auth.token, body: { accept } })
    if (accept) { closeModal('socialModal'); await joinTeamRoom(code) }
    else { showToast('已拒绝邀请'); await loadMessages(social.activeId) }
  } catch (error) { showToast(error.message) }
}

$('teamButton')?.addEventListener('click', () => { void loadTeamLobby() })
$('teamRefresh')?.addEventListener('click', () => { void loadTeamLobby() })
$('teamRooms')?.addEventListener('click', (event) => {
  const join = event.target.closest('[data-team-join]')
  const copy = event.target.closest('[data-team-copy]')
  if (join) void joinTeamRoom(join.dataset.teamJoin)
  if (copy) { navigator.clipboard?.writeText(copy.dataset.teamCopy); showToast('房间码已复制') }
})
$('teamChatForm')?.addEventListener('submit', (event) => { void sendTeamChat(event) })
$('teamRoomActions')?.addEventListener('click', (event) => {
  if (event.target.id === 'teamLeave') {
    if (!teamState.active) return
    void api(`/api/rooms/${encodeURIComponent(teamState.active.code)}${teamState.active.isHost ? '' : '/leave'}`, { method: teamState.active.isHost ? 'DELETE' : 'POST', token: auth.token }).then(() => { closeModal('teamRoomModal'); teamState.active = null; showToast('已退出房间') }).catch((error) => showToast(error.message))
  }
  if (event.target.id === 'teamInvite') void teamInviteFriend()
  if (event.target.id === 'teamDownload') { navigator.clipboard?.writeText(`PCL-X 同款实例：${teamState.active?.version || ''} ${teamState.active?.loader || ''}`); showToast('实例信息已复制，请在启动器版本页安装对应版本') }
})
$('teamMembers')?.addEventListener('click', (event) => {
  const kick = event.target.closest('[data-team-kick]')
  const transfer = event.target.closest('[data-team-transfer]')
  if (kick) void roomAction('kick', Number(kick.dataset.teamKick))
  if (transfer) void roomAction('transfer', Number(transfer.dataset.teamTransfer))
})
$('teamRoomActions')?.addEventListener('change', async (event) => {
  if (event.target.id === 'teamSync' && teamState.active) {
    try { await api(`/api/rooms/${encodeURIComponent(teamState.active.code)}`, { method: 'PATCH', token: auth.token, body: { ...teamState.active, synced: event.target.checked } }); teamState.active.synced = event.target.checked; showToast(event.target.checked ? '已同步到组队大厅' : '已取消同步') } catch (error) { showToast(error.message) }
  }
})
$('chatMessages')?.addEventListener('click', (event) => {
  const accept = event.target.closest('[data-room-accept]')
  const decline = event.target.closest('[data-room-decline]')
  if (accept) void respondRoomInvite(accept.dataset.roomAccept, true)
  if (decline) void respondRoomInvite(decline.dataset.roomDecline, false)
})

setInterval(() => {
  if (auth && !$('teamRoomModal').hidden && teamState.active) openTeamRoom(teamState.active.code).catch(() => undefined)
}, 2500)

setInterval(() => {
  if (!auth || $('socialModal').hidden) return
  if (social.activeId) loadMessages(social.activeId).catch(() => undefined)
  loadSocial().catch(() => undefined)
}, 2000)
