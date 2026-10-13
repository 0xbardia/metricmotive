// In-page contrast audit core (serialised into the page by scripts/contrast-audit.mjs).
// Composites each text colour over the real ancestor background chain and compares with WCAG AA.
// Limitation: it cannot see through backdrop-filter or gradients, so such rows are flagged `imageBg` and are
// pixel-verified by scripts/contrast-audit.mjs instead of being trusted.
// In-page contrast audit. Returns rows; composites fg over the real ancestor background chain.
export const auditInPage = () => {
  const parse = (s) => { s = (s || "").trim(); let m;
    if ((m = s.match(/^color\(srgb\s+([\d.e-]+)\s+([\d.e-]+)\s+([\d.e-]+)(?:\s*\/\s*([\d.e-]+%?))?\)/))) { const a = m[4] === undefined ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : +m[4]; return [m[1] * 255, m[2] * 255, m[3] * 255, a]; }
    if ((m = s.match(/^rgba?\(([^)]+)\)/))) { const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(parseFloat); return [p[0], p[1], p[2], p[3] === undefined ? 1 : p[3]]; }
    return s === "transparent" ? [0, 0, 0, 0] : null; };
  const over = (f, b) => { const a = f[3] + b[3] * (1 - f[3]); if (!a) return [0, 0, 0, 0]; return [0, 1, 2].map(i => (f[i] * f[3] + b[i] * b[3] * (1 - f[3])) / a).concat(a); };
  const lum = (c) => { const l = c.slice(0, 3).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2]; };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const bgOf = (el) => { const stack = []; let e = el; let hadImage = false;
    while (e && e.nodeType === 1) { const cs = getComputedStyle(e); const c = parse(cs.backgroundColor); if (cs.backgroundImage && cs.backgroundImage !== "none") hadImage = true; if (c && c[3] > 0) { stack.push(c); if (c[3] >= 0.999) break; } e = e.parentElement; }
    let acc = [243, 240, 230, 1]; // html background: bone
    if (stack.length && stack[stack.length - 1][3] >= 0.999) acc = stack.pop();
    while (stack.length) acc = over(stack.pop(), acc);
    return { c: acc, hadImage }; };
  const opacityOf = (el) => { let o = 1; for (let e = el; e && e.nodeType === 1; e = e.parentElement) o *= parseFloat(getComputedStyle(e).opacity); return o; };
  const visible = (el) => { const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false; const cs = getComputedStyle(el); return cs.visibility !== "hidden" && cs.display !== "none"; };
  const classify = (el, cs, disabled) => {
    const tag = el.tagName; const cls = (typeof el.className === "string" ? el.className : "") + " " + (el.parentElement && typeof el.parentElement.className === "string" ? el.parentElement.className : "");
    const mono = /mono/i.test(cs.fontFamily) || /Plex/i.test(cs.fontFamily);
    if (disabled) return "disabled";
    if (tag === "BUTTON" || el.closest("button") || el.closest('[role="button"]') || (tag === "A" && /btn|button/i.test(cls))) return "button";
    if (el.closest("label") || tag === "LABEL" || tag === "LEGEND") return "label";
    if (/badge|rounded-full|pill|chip|verdict|status/i.test(cls) && parseFloat(cs.fontSize) <= 14) return "badge";
    if (mono) return "mono";
    if (parseFloat(cs.fontSize) < 14) return "small";
    return "body";
  };
  const rows = []; const seen = new Set();
  let tagId = 0;
  const push = (el, fg, bgInfo, cs, kind, text) => {
    const f = over([fg[0], fg[1], fg[2], fg[3] * opacityOf(el)], bgInfo.c); const r = ratio(f, bgInfo.c);
    const size = parseFloat(cs.fontSize), bold = parseInt(cs.fontWeight) >= 700; const large = size >= 24 || (size >= 18.66 && bold);
    const need = kind === "border" || kind === "ui" ? 3 : large ? 3 : 4.5;
    const key = [kind, f.map(Math.round).join(), bgInfo.c.map(Math.round).join(), size].join("|");
    if (seen.has(key)) { const row = rows.find(x => x.key === key); row.n++; return; } seen.add(key);
    const tag = el.getAttribute("data-audit") || String(++tagId); el.setAttribute("data-audit", tag);
    rows.push({ auditId: tag, rawFg: fg.slice(), key, kind, ratio: +r.toFixed(2), need, pass: r >= need, size, weight: cs.fontWeight, fg: "rgb(" + f.slice(0, 3).map(Math.round) + ")", bg: "rgb(" + bgInfo.c.slice(0, 3).map(Math.round) + ")", imageBg: bgInfo.hadImage, text: text.slice(0, 40), sel: el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + "." + (typeof el.className === "string" ? el.className.split(/\s+/).slice(0, 3).join(".") : ""), n: 1 });
  };
  for (const el of document.querySelectorAll("body *")) {
    if (!visible(el)) continue;
    const cs = getComputedStyle(el);
    const own = [...el.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim()).map(n => n.textContent.trim()).join(" ");
    const disabled = el.matches(":disabled") || el.closest("[aria-disabled=true]") || el.closest("button:disabled");
    if (own) { const fg = parse(cs.color); if (fg) push(el, fg, bgOf(el), cs, classify(el, cs, disabled), own); }
    if ((el.tagName === "INPUT" || el.tagName === "TEXTAREA") && el.placeholder) { const pc = parse(getComputedStyle(el, "::placeholder").color); if (pc) push(el, pc, bgOf(el), cs, disabled ? "disabled" : "placeholder", el.placeholder); }
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && el.type !== "hidden" && el.type !== "checkbox" && parseFloat(cs.borderTopWidth) > 0) { const bc = parse(cs.borderTopColor); const parentBg = bgOf(el.parentElement || el); if (bc) push(el, bc, parentBg, cs, "border", "[" + el.tagName.toLowerCase() + " border]"); }
    if (el.tagName === "BUTTON" && !disabled && /outline|border/i.test(el.className) && parseFloat(cs.borderTopWidth) > 0) { const bc = parse(cs.borderTopColor); if (bc) push(el, bc, bgOf(el.parentElement || el), cs, "border", "[outline button border] " + (el.innerText || "").slice(0, 20)); }
  }
  return rows;
};
