const nav = document.getElementById('nav')
const navToggle = document.getElementById('navToggle')
const navLinks = document.getElementById('navLinks')
const toast = document.getElementById('toast')
const year = document.getElementById('year')

if (year) year.textContent = String(new Date().getFullYear())

window.addEventListener('scroll', () => {
  nav?.classList.toggle('scrolled', window.scrollY > 18)
}, { passive: true })

navToggle?.addEventListener('click', () => {
  const open = navLinks?.classList.toggle('open') ?? false
  navToggle.setAttribute('aria-expanded', String(open))
})

navLinks?.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', () => {
    navLinks.classList.remove('open')
    navToggle?.setAttribute('aria-expanded', 'false')
  })
})

const observer = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible')
        observer.unobserve(entry.target)
      }
    }
  },
  { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
)
document.querySelectorAll('.reveal').forEach((element) => observer.observe(element))

function showToast(message) {
  if (!toast) return
  toast.textContent = message
  toast.classList.add('show')
  clearTimeout(showToast.timer)
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 1800)
}

document.getElementById('copyCode')?.addEventListener('click', async () => {
  const code = '9gu5'
  try {
    await navigator.clipboard.writeText(code)
    showToast('提取码 9gu5 已复制')
  } catch {
    const area = document.createElement('textarea')
    area.value = code
    document.body.appendChild(area)
    area.select()
    try { document.execCommand('copy'); showToast('提取码 9gu5 已复制') } catch { showToast('复制失败，请手动选择 9gu5') }
    area.remove()
  }
})

// 轻微视差：只在桌面端启用，避免移动端抖动。
const heroVisual = document.getElementById('heroVisual')
if (heroVisual && window.matchMedia('(pointer:fine)').matches) {
  window.addEventListener('pointermove', (event) => {
    const x = (event.clientX / window.innerWidth - 0.5) * 8
    const y = (event.clientY / window.innerHeight - 0.5) * 8
    heroVisual.style.transform = `translate(${x}px, ${y}px)`
  }, { passive: true })
}

// 图床被拦截时使用内嵌兜底图，避免官网出现破图。
for (const image of document.querySelectorAll('img[data-fallback]')) {
  image.addEventListener('error', () => {
    if (image.dataset.fallbackUsed) return
    image.dataset.fallbackUsed = '1'
    image.src = image.dataset.fallback
  })
}


// 图床 URL 被网络拦截时，回退到 GitHub Pages 上的同图 URL。
for (const image of document.querySelectorAll('img[data-fallback-url]')) {
  image.addEventListener('error', () => {
    if (image.dataset.fallbackUsed) return
    image.dataset.fallbackUsed = '1'
    image.src = image.dataset.fallbackUrl
  })
}

// 从更新清单读取最新版本，下载按钮直接指向 GitHub Release 资源
fetch('https://pclx-forum.pages.dev/api/update', { cache: 'no-store' })
  .then((response) => response.json())
  .then((data) => {
    if (!data || !data.version) return
    const file = data.url || data.sourceUrl
    const name = (() => { try { return decodeURIComponent(new URL(file).pathname.split('/').pop() || '') } catch { return '' } })()
    const download = document.getElementById('downloadLatest')
    if (download && file) download.href = file
    const fileName = document.getElementById('downloadFileName')
    if (fileName && name) fileName.textContent = name
    const note = document.getElementById('downloadNote')
    if (note) note.textContent = `最新版本：PCL-X ${data.version} · 约 ${Math.round((data.size || 0) / 1024 / 1024)} MB · 使用加速下载`
    const meta = document.getElementById('downloadFileMeta')
    if (meta) meta.textContent = `Windows x64 · ${Number(data.size || 0).toLocaleString('en-US')} bytes`
    const hash = document.getElementById('downloadHash')
    if (hash && data.sha256) hash.textContent = data.sha256

    // 每次更新后，官网所有版本号统一从更新清单同步
    const version = String(data.version || '').replace(/^v/i, '')
    if (version) {
      const date = data.publishedAt ? new Date(data.publishedAt) : new Date()
      const dateText = `${date.getUTCFullYear()}.${String(date.getUTCMonth() + 1).padStart(2, '0')}.${String(date.getUTCDate()).padStart(2, '0')}`
      const setText = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value }
      setText('siteVersionBrand', version)
      setText('siteVersionDownloadNav', `下载 ${version}`)
      setText('siteVersionDownloadHero', `下载 ${version}`)
      setText('siteVersionPortable', `Portable ${version}`)
      setText('siteVersionUpdateText', version)
      setText('siteVersionRelease', version)
      setText('siteReleaseDate', dateText)
      setText('siteVersionReleaseTitle', `当前版本，${version}。`)
      setText('siteVersionPanel', `${version} / portable`)
      setText('siteVersionFaq', version)
      document.title = `PCL-X ${version} — Minecraft，从这里开始`
      const desc = document.getElementById('siteDescription')
      if (desc) desc.setAttribute('content', `PCL-X ${version} — 为 Minecraft 打造的现代启动器。版本、存档、联机、AI、论坛与自动更新，一个应用全都有。`)
      const link = document.getElementById('latestReleaseLink')
      if (link) link.href = `https://github.com/bohemiao-pclx/pclx-updates/releases/tag/v${version}`
    }
  })
  .catch(() => {
    const note = document.getElementById('downloadNote')
    if (note) note.textContent = '获取版本信息失败，仍可点击下载最新版。'
  })
