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
