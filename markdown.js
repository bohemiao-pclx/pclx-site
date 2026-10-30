/* 轻量 Markdown 渲染器：不加载第三方脚本，先转义 HTML，避免 XSS。 */
(function () {
  function escapeHtml(text) {
    return String(text ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]))
  }

  function safeUrl(url) {
    return /^https?:\/\//i.test(url) ? url : ''
  }

  function inline(text) {
    return text
      .replace(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g, (_, alt, url) => `<img class="md-image" src="${safeUrl(url)}" alt="${escapeHtml(alt)}" loading="lazy" />`)
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, label, url) => `<a href="${safeUrl(url)}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>`)
      .replace(/`([^`\n]+)`/g, (_, code) => `<code>${escapeHtml(code)}</code>`)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/__([^_]+)__/g, '<strong>$1</strong>')
      .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>')
      .replace(/~~([^~]+)~~/g, '<del>$1</del>')
      .replace(/@([\p{L}\p{N}_-]{2,20})/gu, '<span class="forum-mention">@$1</span>')
  }

  function render(source) {
    let text = escapeHtml(source).replace(/\r\n/g, '\n')
    const codeBlocks = []
    text = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
      codeBlocks.push(`<pre class="md-code"><code data-lang="${escapeHtml(lang)}">${code}</code></pre>`)
      return `\n@@CODE${codeBlocks.length - 1}@@\n`
    })

    const lines = text.split('\n')
    const html = []
    let listType = null
    let paragraph = []
    let quote = []
    let codeIndex = 0

    const flushParagraph = () => {
      if (paragraph.length) {
        html.push(`<p>${paragraph.map((line) => inline(line)).join('<br />')}</p>`)
        paragraph = []
      }
    }
    const flushList = () => {
      if (listType) { html.push(`</${listType}>`); listType = null }
    }
    const flushQuote = () => {
      if (quote.length) {
        html.push(`<blockquote>${quote.map((line) => inline(line)).join('<br />')}</blockquote>`)
        quote = []
      }
    }

    for (const rawLine of lines) {
      const line = rawLine.trimEnd()
      if (/^@@CODE\d+@@$/.test(line)) {
        flushParagraph(); flushList(); flushQuote()
        html.push(codeBlocks[Number(line.slice(6, -2))])
        continue
      }
      if (!line.trim()) { flushParagraph(); flushList(); flushQuote(); continue }
      if (line.startsWith('&gt; ')) { flushParagraph(); flushList(); quote.push(line.slice(5)); continue }
      const heading = line.match(/^(#{1,6})\s+(.+)$/)
      if (heading) {
        flushParagraph(); flushList(); flushQuote()
        const level = heading[1].length
        html.push(`<h${level}>${inline(heading[2])}</h${level}>`)
        continue
      }
      if (/^(\*\s*){3,}$/.test(line) || /^(-\s*){3,}$/.test(line)) {
        flushParagraph(); flushList(); flushQuote(); html.push('<hr />'); continue
      }
      const unordered = line.match(/^\s*[-*+]\s+(.+)$/)
      if (unordered) {
        flushParagraph(); flushQuote()
        if (listType !== 'ul') { flushList(); html.push('<ul>'); listType = 'ul' }
        html.push(`<li>${inline(unordered[1])}</li>`)
        continue
      }
      const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/)
      if (ordered) {
        flushParagraph(); flushQuote()
        if (listType !== 'ol') { flushList(); html.push('<ol>'); listType = 'ol' }
        html.push(`<li>${inline(ordered[1])}</li>`)
        continue
      }
      flushList(); flushQuote(); paragraph.push(line)
    }
    flushParagraph(); flushList(); flushQuote()
    return html.join('\n')
  }

  function plain(source) {
    return String(source ?? '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/[#>*_`~-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  window.renderMarkdown = render
  window.markdownToPlain = plain
})()
