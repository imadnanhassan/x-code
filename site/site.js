// Xcode by DataDropX — shared site behavior (nav, downloads, reveal, footer year)
;(function () {
  var REPO = 'imadnanhassan/x-code'
  window.XCODE_REPO = REPO
  window.XCODE_RELEASES_URL = 'https://github.com/' + REPO + '/releases'

  document.querySelectorAll('[data-year]').forEach(function (el) {
    el.textContent = new Date().getFullYear()
  })

  // ---- active nav link ----
  var page = document.body.getAttribute('data-page')
  if (page) {
    document.querySelectorAll('a[data-page]').forEach(function (a) {
      if (a.getAttribute('data-page') === page) a.setAttribute('aria-current', 'page')
    })
  }

  // ---- mobile nav ----
  var burger = document.querySelector('.nav-burger')
  var mobile = document.querySelector('.nav-mobile')
  if (burger && mobile) {
    burger.addEventListener('click', function () {
      mobile.classList.toggle('open')
      burger.setAttribute('aria-expanded', mobile.classList.contains('open') ? 'true' : 'false')
    })
    mobile.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () { mobile.classList.remove('open') })
    })
  }

  // ---- scroll reveal ----
  // IntersectionObserver handles the smooth entrance during normal scrolling, but a
  // large single jump (Page Down, spacebar, a fast trackpad flick, or a big
  // programmatic scroll) can move past a short section between two paints without
  // ever intersecting it — leaving it stuck at opacity:0 forever. A rAF-throttled
  // fallback on scroll/resize/load double-checks every not-yet-revealed element's
  // actual position so nothing can stay permanently invisible.
  var revealEls = document.querySelectorAll('.reveal')
  if (revealEls.length) {
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (e) {
            if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target) }
          })
        },
        { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
      )
      revealEls.forEach(function (el) { io.observe(el) })

      var ticking = false
      function sweep() {
        ticking = false
        var vh = window.innerHeight
        revealEls.forEach(function (el) {
          if (el.classList.contains('in')) return
          var r = el.getBoundingClientRect()
          if (r.top < vh && r.bottom > 0) { el.classList.add('in'); io.unobserve(el) }
        })
      }
      function onScroll() {
        if (ticking) return
        ticking = true
        requestAnimationFrame(sweep)
      }
      window.addEventListener('scroll', onScroll, { passive: true })
      window.addEventListener('resize', onScroll)
      window.addEventListener('load', sweep)
      setTimeout(sweep, 300)
    } else {
      revealEls.forEach(function (el) { el.classList.add('in') })
    }
  }

  // ---- OS detection ----
  function detectOS() {
    var ua = navigator.userAgent, plat = navigator.platform || ''
    if (/Win/i.test(plat) || /Windows/i.test(ua)) return 'win'
    if (/Mac/i.test(plat) || /Mac OS X/i.test(ua)) return 'mac'
    if (/Linux|X11/i.test(plat) || /Linux/i.test(ua)) return 'linux'
    return 'other'
  }
  window.XCODE_OS = detectOS()

  // ---- latest release fetch (shared across pages) ----
  window.XCODE_fetchLatestRelease = function () {
    return fetch('https://api.github.com/repos/' + REPO + '/releases/latest', {
      headers: { Accept: 'application/vnd.github+json' }
    }).then(function (r) { return r.ok ? r.json() : Promise.reject(r.status) })
  }

  // ---- wire up any [data-dl-*] elements present on the page ----
  window.XCODE_wireDownloads = function (rel) {
    var assets = rel.assets || []
    function find(re) { var a = assets.find(function (x) { return re.test(x.name) }); return a && a.browser_download_url }
    var winExeAsset = assets.find(function (x) { return /\.exe$/i.test(x.name) })
    var winExe = find(/Setup.*\.exe$/i) || find(/\.exe$/i)
    var v = rel.tag_name || rel.name || ''

    document.querySelectorAll('[data-dl-version]').forEach(function (el) {
      el.textContent = v
        ? 'Latest release: ' + v + '  ·  ' + new Date(rel.published_at).toLocaleDateString()
        : 'See all releases on GitHub.'
    })
    document.querySelectorAll('[data-dl-size]').forEach(function (el) {
      if (winExeAsset) el.textContent = '.exe installer · ' + (winExeAsset.size / 1048576).toFixed(0) + ' MB'
    })
    document.querySelectorAll('[data-dl-win]').forEach(function (a) {
      if (winExe) a.href = winExe
    })
    document.querySelectorAll('[data-dl-smart]').forEach(function (a) {
      var target = (window.XCODE_OS === 'win' && winExe) ? winExe : window.XCODE_RELEASES_URL
      a.href = target
      if (window.XCODE_OS === 'mac' || window.XCODE_OS === 'linux') {
        var label = a.querySelector('[data-dl-label]')
        var svg = a.querySelector('svg')
        if (svg) svg.style.display = 'none'
        if (label) label.textContent = window.XCODE_OS === 'mac' ? 'macOS — coming soon' : 'Linux — coming soon'
      }
    })
    return { winExe: winExe, winExeAsset: winExeAsset, version: v }
  }

  // ---- render "what's new" markdown-ish release notes as a simple list ----
  window.XCODE_renderNotes = function (rel, targetEl) {
    var body = (rel.body || '').trim()
    if (!body) { targetEl.innerHTML = '<p style="color:var(--muted)">See the full release on GitHub.</p>'; return }
    var lines = body.split('\n')
    var html = '<ul>'
    var full = ''
    lines.forEach(function (line) {
      line = line.trim()
      if (!line || line.indexOf('## ') === 0) return
      if (line.indexOf('**Full changelog:**') === 0) { full = line.replace('**Full changelog:**', '').trim(); return }
      if (line.indexOf('- ') === 0) html += '<li>' + line.slice(2) + '</li>'
    })
    html += '</ul>'
    if (full) html += '<p style="margin-top:14px"><a href="' + full + '" target="_blank" rel="noopener">View full changelog on GitHub &rarr;</a></p>'
    targetEl.innerHTML = html
  }

  // auto-run on any page that has download-aware elements
  if (document.querySelector('[data-dl-win], [data-dl-smart], [data-dl-version], [data-dl-notes]')) {
    window.XCODE_fetchLatestRelease()
      .then(function (rel) {
        window.XCODE_wireDownloads(rel)
        var notesEl = document.querySelector('[data-dl-notes]')
        if (notesEl) window.XCODE_renderNotes(rel, notesEl)
      })
      .catch(function () {
        document.querySelectorAll('[data-dl-version]').forEach(function (el) {
          el.innerHTML = 'Grab the latest build on <a style="color:var(--orange)" href="' + window.XCODE_RELEASES_URL + '">the releases page</a>.'
        })
        document.querySelectorAll('[data-dl-win], [data-dl-smart]').forEach(function (a) { a.href = window.XCODE_RELEASES_URL })
        var notesEl = document.querySelector('[data-dl-notes]')
        if (notesEl) notesEl.innerHTML = '<p style="color:var(--muted)">See release notes on GitHub.</p>'
      })
  }
})()
