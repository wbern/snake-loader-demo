// Snake loader — a fading snake that wanders the viewport on smooth random
// curves and briefly chases the cursor when it comes close. Plain JS, no deps.
// Usage: const snake = startSnake(); ... snake.stop()
function startSnake(opts = {}) {
  const color = opts.color || '15,20,25' // RGB used for trail + head
  const trailMs = opts.trailMs || 1300

  const trail = []
  let dims = { w: 0, h: 0 }, dpr = 1
  let path = [], arcLens = [], totalLen = 0, duration = 14000
  let progressDist = 0, lastTickTime = 0, rafId = 0, smoothEngage = 0
  const mouse = { x: 0, y: 0, active: false }
  const head = { x: 0, y: 0, vx: 0, vy: 0, initialized: false }

  const canvas = document.createElement('canvas')
  canvas.setAttribute('aria-hidden', 'true')
  canvas.style.cssText =
    'position:fixed;top:0;left:0;width:100vw;height:100vh;pointer-events:none;z-index:9999;'
  document.body.appendChild(canvas)
  const ctx = canvas.getContext('2d')

  const rand = (a, b) => a + Math.random() * (b - a)

  function edgePoint(side, w, h) {
    const m = 30
    if (side === 'top') return { x: rand(80, w - 80), y: -m }
    if (side === 'bottom') return { x: rand(80, w - 80), y: h + m }
    if (side === 'left') return { x: -m, y: rand(80, h - 80) }
    return { x: w + m, y: rand(80, h - 80) }
  }

  function interiorPoint(w, h) {
    return { x: rand(w * 0.12, w * 0.88), y: rand(h * 0.12, h * 0.88) }
  }

  function sampleCatmullRom(pts, samplesPerSegment) {
    if (pts.length < 2) return pts.slice()
    const P = [pts[0], ...pts, pts[pts.length - 1]]
    const out = []
    for (let i = 1; i < P.length - 2; i++) {
      const p0 = P[i - 1], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2]
      for (let j = 0; j < samplesPerSegment; j++) {
        const t = j / samplesPerSegment, t2 = t * t, t3 = t2 * t
        const f = (a, b, c, d) =>
          0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3)
        out.push({ x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) })
      }
    }
    out.push(P[P.length - 2])
    return out
  }

  function generatePath(from) {
    const { w, h } = dims
    const sides = ['top', 'right', 'bottom', 'left']
    const startSide = sides[Math.floor(Math.random() * 4)]
    const endSide = sides.filter((s) => s !== startSide)[Math.floor(Math.random() * 3)]
    // First leg swoops in from off-screen; continuation legs stay in-bounds.
    const start = from || edgePoint(startSide, w, h)
    const end = from ? interiorPoint(w, h) : edgePoint(endSide, w, h)

    // Single-sided arc: 1-2 waypoints pushed sideways in one direction.
    const numMid = 1 + Math.floor(Math.random() * 2)
    const waypoints = [start]
    const dx = end.x - start.x, dy = end.y - start.y
    const len = Math.max(1, Math.hypot(dx, dy))
    const nx = -dy / len, ny = dx / len
    const lateralRange = Math.min(w, h) * 0.55
    const lateralSign = Math.random() < 0.5 ? -1 : 1
    for (let i = 1; i <= numMid; i++) {
      const t = i / (numMid + 1)
      const sway = lateralSign * (0.55 + Math.random() * 0.45) * lateralRange
      waypoints.push({
        x: Math.max(60, Math.min(w - 60, start.x + dx * t + nx * sway)),
        y: Math.max(60, Math.min(h - 60, start.y + dy * t + ny * sway)),
      })
    }
    waypoints.push(end)
    return sampleCatmullRom(waypoints, 120)
  }

  function setPath(p) {
    path = p
    arcLens = [0]
    totalLen = 0
    for (let i = 1; i < path.length; i++) {
      totalLen += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y)
      arcLens.push(totalLen)
    }
    progressDist = 0
    const baseSpeed = 260 + Math.random() * 120 // px/s
    duration = Math.max(7000, Math.min(20000, (totalLen / baseSpeed) * 1000))
  }

  function pointAtArc(dist) {
    if (dist <= 0) return path[0]
    if (dist >= totalLen) return path[path.length - 1]
    let lo = 0, hi = arcLens.length - 1
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1
      if (arcLens[mid] <= dist) lo = mid
      else hi = mid
    }
    const t = (dist - arcLens[lo]) / Math.max(0.0001, arcLens[hi] - arcLens[lo])
    return {
      x: path[lo].x + (path[hi].x - path[lo].x) * t,
      y: path[lo].y + (path[hi].y - path[lo].y) * t,
    }
  }

  function resize() {
    dims = { w: window.innerWidth, h: window.innerHeight }
    dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = Math.floor(dims.w * dpr)
    canvas.height = Math.floor(dims.h * dpr)
  }

  function begin() {
    resize()
    setPath(generatePath())
    trail.length = 0
    lastTickTime = 0
    smoothEngage = 0
    Object.assign(head, { vx: 0, vy: 0, initialized: false })
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const n = trail.length
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (let i = 1; i < n; i++) {
      const frac = i / (n - 1)
      ctx.strokeStyle = `rgba(${color},${0.05 + frac * 0.65})`
      ctx.lineWidth = (3 + frac * 6) * dpr
      ctx.beginPath()
      ctx.moveTo(trail[i - 1].x * dpr, trail[i - 1].y * dpr)
      ctx.lineTo(trail[i].x * dpr, trail[i].y * dpr)
      ctx.stroke()
    }
    if (head.initialized) {
      ctx.fillStyle = `rgb(${color})`
      ctx.beginPath()
      ctx.arc(head.x * dpr, head.y * dpr, 7 * dpr, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  function tick(now) {
    const dt = lastTickTime ? Math.min(64, now - lastTickTime) : 16
    lastTickTime = now
    const basePxPerMs = totalLen / duration

    if (!head.initialized) {
      Object.assign(head, pointAtArc(progressDist), { initialized: true })
    }

    // Only chase the cursor when it is within 10% of the viewport's smaller side.
    const range = Math.min(dims.w, dims.h) * 0.1
    let engage = 0
    if (mouse.active) {
      const d = Math.hypot(mouse.x - head.x, mouse.y - head.y)
      if (d < range) engage = Math.min(1, (1 - d / range) * 1.4)
    }
    // Low-pass engagement so the target blends instead of snapping.
    smoothEngage += (engage - smoothEngage) * (engage > smoothEngage ? 0.18 : 0.06)

    // Pause progress along the path while chasing.
    progressDist += basePxPerMs * dt * (1 - smoothEngage * smoothEngage)
    if (progressDist >= totalLen) setPath(generatePath({ x: head.x, y: head.y }))

    const basePt = pointAtArc(progressDist)
    const tx = basePt.x * (1 - smoothEngage) + mouse.x * smoothEngage
    const ty = basePt.y * (1 - smoothEngage) + mouse.y * smoothEngage

    // Steer toward target; never faster than idle path speed.
    const dx = tx - head.x, dy = ty - head.y
    const dist = Math.hypot(dx, dy)
    const maxSpeed = basePxPerMs * 1000
    const mag = Math.min(maxSpeed, dist * 6)
    const dirX = dist > 0.01 ? dx / dist : 0
    const dirY = dist > 0.01 ? dy / dist : 0
    head.vx += (dirX * mag - head.vx) * 0.18
    head.vy += (dirY * mag - head.vy) * 0.18
    const v = Math.hypot(head.vx, head.vy)
    if (v > maxSpeed) { head.vx = (head.vx / v) * maxSpeed; head.vy = (head.vy / v) * maxSpeed }
    head.x = Math.max(0, Math.min(dims.w, head.x + head.vx * dt / 1000))
    head.y = Math.max(0, Math.min(dims.h, head.y + head.vy * dt / 1000))

    const last = trail[trail.length - 1]
    if (!last || Math.hypot(last.x - head.x, last.y - head.y) > 1.2) {
      trail.push({ x: head.x, y: head.y, t: now })
    }
    while (trail.length && now - trail[0].t > trailMs) trail.shift()

    draw()
    rafId = requestAnimationFrame(tick)
  }

  const onMouseMove = (e) => { mouse.x = e.clientX; mouse.y = e.clientY; mouse.active = true }
  const onMouseOut = (e) => { if (!e.relatedTarget) mouse.active = false }
  const onBlur = () => { mouse.active = false }

  window.addEventListener('resize', begin)
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('blur', onBlur)
  document.addEventListener('mouseout', onMouseOut)

  begin()
  rafId = requestAnimationFrame(tick)

  return {
    stop() {
      cancelAnimationFrame(rafId)
      canvas.remove()
      window.removeEventListener('resize', begin)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('mouseout', onMouseOut)
    },
  }
}
