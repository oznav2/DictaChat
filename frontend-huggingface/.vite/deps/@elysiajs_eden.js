import {
  __publicField
} from "./chunk-6LNZPZHA.js";

// node_modules/@elysiajs/eden/dist/chunk-XYW4OUFN.mjs
var s = class extends Error {
  constructor(e, n) {
    super(n + "");
    this.status = e;
    this.value = n;
  }
};
var i = /(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d\.\d+([+-][0-2]\d:[0-5]\d|Z))|(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d([+-][0-2]\d:[0-5]\d|Z))|(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d([+-][0-2]\d:[0-5]\d|Z))/;
var o = /(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat)\s(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s\d{2}\s\d{4}\s\d{2}:\d{2}:\d{2}\sGMT(?:\+|-)\d{4}\s\([^)]+\)/;
var c = /^(?:(?:(?:(?:0?[1-9]|[12][0-9]|3[01])[/\s-](?:0?[1-9]|1[0-2])[/\s-](?:19|20)\d{2})|(?:(?:19|20)\d{2}[/\s-](?:0?[1-9]|1[0-2])[/\s-](?:0?[1-9]|[12][0-9]|3[01]))))(?:\s(?:1[012]|0?[1-9]):[0-5][0-9](?::[0-5][0-9])?(?:\s[AP]M)?)?$/;
var u = (t) => t.trim().length !== 0 && !Number.isNaN(Number(t));
var d = (t) => {
  if (typeof t != "string") return null;
  let r = t.replace(/"/g, "");
  if (i.test(r) || o.test(r) || c.test(r)) {
    let e = new Date(r);
    if (!Number.isNaN(e.getTime())) return e;
  }
  return null;
};
var a = (t) => {
  let r = t.charCodeAt(0), e = t.charCodeAt(t.length - 1);
  return r === 123 && e === 125 || r === 91 && e === 93;
};
var p = (t) => JSON.parse(t, (r, e) => {
  let n = d(e);
  return n || e;
});
var g = (t) => {
  if (!t) return t;
  if (u(t)) return +t;
  if (t === "true") return true;
  if (t === "false") return false;
  let r = d(t);
  if (r) return r;
  if (a(t)) try {
    return p(t);
  } catch {
  }
  return t;
};
var S = (t) => {
  let r = t.data.toString();
  return r === "null" ? null : g(r);
};

// node_modules/@elysiajs/eden/dist/chunk-F27RTPSD.mjs
var K = (n, e, t) => {
  if (n.endsWith("/") || (n += "/"), e === "index" && (e = ""), !t || !Object.keys(t).length) return `${n}${e}`;
  let s2 = "";
  for (let [c2, a2] of Object.entries(t)) s2 += `${c2}=${a2}&`;
  return `${n}${e}?${s2.slice(0, -1)}`;
};
var $ = typeof FileList > "u";
var M = (n) => $ ? n instanceof Blob : n instanceof FileList || n instanceof File;
var H = (n) => {
  if (!n) return false;
  for (let e in n) {
    if (M(n[e])) return true;
    if (Array.isArray(n[e]) && n[e].find((t) => M(t))) return true;
  }
  return false;
};
var x = (n) => $ ? n : new Promise((e) => {
  let t = new FileReader();
  t.onload = () => {
    let s2 = new File([t.result], n.name, { lastModified: n.lastModified, type: n.type });
    e(s2);
  }, t.readAsArrayBuffer(n);
});
var T = class {
  constructor(e) {
    __publicField(this, "ws");
    __publicField(this, "url");
    this.ws = new WebSocket(e), this.url = e;
  }
  send(e) {
    return Array.isArray(e) ? (e.forEach((t) => this.send(t)), this) : (this.ws.send(typeof e == "object" ? JSON.stringify(e) : e.toString()), this);
  }
  on(e, t, s2) {
    return this.addEventListener(e, t, s2);
  }
  off(e, t, s2) {
    return this.ws.removeEventListener(e, t, s2), this;
  }
  subscribe(e, t) {
    return this.addEventListener("message", e, t);
  }
  addEventListener(e, t, s2) {
    return this.ws.addEventListener(e, (c2) => {
      if (e === "message") {
        let a2 = S(c2);
        t({ ...c2, data: a2 });
      } else t(c2);
    }, s2), this;
  }
  removeEventListener(e, t, s2) {
    return this.off(e, t, s2), this;
  }
  close() {
    return this.ws.close(), this;
  }
};
var j = (n, e = "", t) => new Proxy(() => {
}, { get(s2, c2, a2) {
  return j(n, `${e}/${c2.toString()}`, t);
}, apply(s2, c2, [a2, b2 = {}] = [{}, {}]) {
  let f = a2 !== void 0 && (typeof a2 != "object" || Array.isArray(a2)) ? a2 : void 0, { $query: I2, $fetch: F, $headers: P2, $transform: m, getRaw: C2, ...q2 } = a2 ?? {};
  f ?? (f = q2);
  let w = e.lastIndexOf("/"), E = e.slice(w + 1).toUpperCase(), v = K(n, w === -1 ? "/" : e.slice(0, w), Object.assign(b2.query ?? {}, I2)), D = t.fetcher ?? fetch, l = t.transform ? Array.isArray(t.transform) ? t.transform : [t.transform] : void 0, S2 = m ? Array.isArray(m) ? m : [m] : void 0;
  return S2 && (l ? l = S2.concat(l) : l = S2), E === "SUBSCRIBE" ? new T(v.replace(/^([^]+):\/\//, v.startsWith("https://") ? "wss://" : "ws://")) : (async (N2) => {
    var _a, _b;
    let r, R = { ...(_a = t.$fetch) == null ? void 0 : _a.headers, ...F == null ? void 0 : F.headers, ...b2.headers, ...P2 };
    if (E !== "GET" && E !== "HEAD") {
      r = Object.keys(f).length || Array.isArray(f) ? f : void 0;
      let p2 = r && (typeof r == "object" || Array.isArray(f));
      if (p2 && H(r)) {
        let u2 = new FormData();
        for (let [h, o2] of Object.entries(r)) if ($) u2.append(h, o2);
        else if (o2 instanceof File) u2.append(h, await x(o2));
        else if (o2 instanceof FileList) for (let d2 = 0; d2 < o2.length; d2++) u2.append(h, await x(o2[d2]));
        else if (Array.isArray(o2)) for (let d2 = 0; d2 < o2.length; d2++) {
          let k = o2[d2];
          u2.append(h, k instanceof File ? await x(k) : k);
        }
        else u2.append(h, o2);
        r = u2;
      } else r != null && (R["content-type"] = p2 ? "application/json" : "text/plain", r = p2 ? JSON.stringify(r) : f);
    }
    let i2 = await D(v, { method: E, body: r, ...t.$fetch, ...b2.fetch, ...F, headers: R }), g2;
    if (N2.getRaw) return i2;
    switch ((_b = i2.headers.get("Content-Type")) == null ? void 0 : _b.split(";")[0]) {
      case "application/json":
        g2 = await i2.json();
        break;
      default:
        g2 = await i2.text().then(g);
    }
    let B = i2.status >= 300 || i2.status < 200 ? new s(i2.status, g2) : null, A2 = { data: g2, error: B, response: i2, status: i2.status, headers: i2.headers };
    if (l) for (let p2 of l) {
      let y = p2(A2);
      y instanceof Promise && (y = await y), y != null && (A2 = y);
    }
    return A2;
  })({ getRaw: C2 });
} });
var z = (n, e = { fetcher: fetch }) => new Proxy({}, { get(t, s2) {
  return j(n, s2, e);
} });

// node_modules/@elysiajs/eden/dist/chunk-EO5XYDPY.mjs
var W = class {
  constructor(t) {
    __publicField(this, "ws");
    this.url = t;
    this.ws = new WebSocket(t);
  }
  send(t) {
    return Array.isArray(t) ? (t.forEach((n) => this.send(n)), this) : (this.ws.send(typeof t == "object" ? JSON.stringify(t) : t.toString()), this);
  }
  on(t, n, s2) {
    return this.addEventListener(t, n, s2);
  }
  off(t, n, s2) {
    return this.ws.removeEventListener(t, n, s2), this;
  }
  subscribe(t, n) {
    return this.addEventListener("message", t, n);
  }
  addEventListener(t, n, s2) {
    return this.ws.addEventListener(t, (c2) => {
      if (t === "message") {
        let f = S(c2);
        n({ ...c2, data: f });
      } else n(c2);
    }, s2), this;
  }
  removeEventListener(t, n, s2) {
    return this.off(t, n, s2), this;
  }
  close() {
    return this.ws.close(), this;
  }
};
var N = ["get", "post", "put", "delete", "patch", "options", "head", "connect", "subscribe"];
var I = ["localhost", "127.0.0.1", "0.0.0.0"];
var C = typeof FileList > "u";
var q = (e) => C ? e instanceof Blob : e instanceof FileList || e instanceof File;
var P = (e) => {
  if (!e) return false;
  for (let t in e) if (q(e[t]) || Array.isArray(e[t]) && e[t].find(q)) return true;
  return false;
};
var j2 = (e) => C ? e : new Promise((t) => {
  let n = new FileReader();
  n.onload = () => {
    let s2 = new File([n.result], e.name, { lastModified: e.lastModified, type: e.type });
    t(s2);
  }, n.readAsArrayBuffer(e);
});
var b = (e, t, n = {}, s2 = {}) => {
  if (Array.isArray(e)) {
    for (let c2 of e) if (!Array.isArray(c2)) s2 = b(c2, t, n, s2);
    else {
      let f = c2[0];
      if (typeof f == "string") s2[f.toLowerCase()] = c2[1];
      else for (let [a2, w] of f) s2[a2.toLowerCase()] = w;
    }
    return s2;
  }
  if (!e) return s2;
  switch (typeof e) {
    case "function":
      if (e instanceof Headers) return b(e, t, n, s2);
      let c2 = e(t, n);
      return c2 ? b(c2, t, n, s2) : s2;
    case "object":
      if (e instanceof Headers) return e.forEach((f, a2) => {
        s2[a2.toLowerCase()] = f;
      }), s2;
      for (let [f, a2] of Object.entries(e)) s2[f.toLowerCase()] = a2;
      return s2;
    default:
      return s2;
  }
};
async function* U(e) {
  let t = e.body;
  if (!t) return;
  let n = t.getReader(), s2 = new TextDecoder();
  try {
    for (; ; ) {
      let { done: c2, value: f } = await n.read();
      if (c2) break;
      let a2 = s2.decode(f);
      yield g(a2);
    }
  } finally {
    n.releaseLock();
  }
}
var A = (e, t, n = [], s2) => new Proxy(() => {
}, { get(c2, f) {
  return A(e, t, f === "index" ? n : [...n, f], s2);
}, apply(c2, f, [a2, w]) {
  if (!a2 || w || typeof a2 == "object" && Object.keys(a2).length !== 1 || N.includes(n.at(-1))) {
    let K2 = [...n], k = K2.pop(), g2 = "/" + K2.join("/"), { fetcher: D = fetch, headers: L, onRequest: d2, onResponse: E, fetch: H2 } = t, m = k === "get" || k === "head" || k === "subscribe";
    L = b(L, g2, w);
    let T3 = m ? a2 == null ? void 0 : a2.query : w == null ? void 0 : w.query, R = "";
    if (T3) {
      let r = (h, l) => {
        R += (R ? "&" : "?") + `${encodeURIComponent(h)}=${encodeURIComponent(l)}`;
      };
      for (let [h, l] of Object.entries(T3)) {
        if (Array.isArray(l)) {
          for (let o2 of l) r(h, o2);
          continue;
        }
        if (l != null) {
          if (typeof l == "object") {
            r(h, JSON.stringify(l));
            continue;
          }
          r(h, `${l}`);
        }
      }
    }
    if (k === "subscribe") {
      let r = e.replace(/^([^]+):\/\//, e.startsWith("https://") ? "wss://" : e.startsWith("http://") || I.find((h) => e.includes(h)) ? "ws://" : "wss://") + g2 + R;
      return new W(r);
    }
    return (async () => {
      var _a;
      let r = { method: k == null ? void 0 : k.toUpperCase(), body: a2, ...H2, headers: L };
      r.headers = { ...L, ...b(m ? a2 == null ? void 0 : a2.headers : w == null ? void 0 : w.headers, g2, r) };
      let h = m && typeof a2 == "object" ? a2.fetch : w == null ? void 0 : w.fetch;
      if (r = { ...r, ...h }, m && delete r.body, d2) {
        Array.isArray(d2) || (d2 = [d2]);
        for (let y of d2) {
          let i2 = await y(g2, r);
          typeof i2 == "object" && (r = { ...r, ...i2, headers: { ...r.headers, ...b(i2.headers, g2, r) } });
        }
      }
      if (m && delete r.body, P(a2)) {
        let y = new FormData();
        for (let [i2, p2] of Object.entries(r.body)) {
          if (Array.isArray(p2)) {
            for (let v = 0; v < p2.length; v++) {
              let F = p2[v];
              y.append(i2, F instanceof File ? await j2(F) : F);
            }
            continue;
          }
          if (C) {
            y.append(i2, p2);
            continue;
          }
          if (p2 instanceof File) {
            y.append(i2, await j2(p2));
            continue;
          }
          if (p2 instanceof FileList) {
            for (let v = 0; v < p2.length; v++) y.append(i2, await j2(p2[v]));
            continue;
          }
          y.append(i2, p2);
        }
        r.body = y;
      } else typeof a2 == "object" ? (r.headers["content-type"] = "application/json", r.body = JSON.stringify(a2)) : a2 != null && (r.headers["content-type"] = "text/plain");
      if (m && delete r.body, d2) {
        Array.isArray(d2) || (d2 = [d2]);
        for (let y of d2) {
          let i2 = await y(g2, r);
          typeof i2 == "object" && (r = { ...r, ...i2, headers: { ...r.headers, ...b(i2.headers, g2, r) } });
        }
      }
      let l = e + g2 + R, o2 = await ((s2 == null ? void 0 : s2.handle(new Request(l, r))) ?? D(l, r)), u2 = null, S2 = null;
      if (E) {
        Array.isArray(E) || (E = [E]);
        for (let y of E) try {
          let i2 = await y(o2.clone());
          if (i2 != null) {
            u2 = i2;
            break;
          }
        } catch (i2) {
          i2 instanceof s ? S2 = i2 : S2 = new s(422, i2);
          break;
        }
      }
      if (u2 !== null) return { data: u2, error: S2, response: o2, status: o2.status, headers: o2.headers };
      switch ((_a = o2.headers.get("Content-Type")) == null ? void 0 : _a.split(";")[0]) {
        case "text/event-stream":
          u2 = U(o2);
          break;
        case "application/json":
          u2 = await o2.json();
          break;
        case "application/octet-stream":
          u2 = await o2.arrayBuffer();
          break;
        case "multipart/form-data":
          let y = await o2.formData();
          u2 = {}, y.forEach((i2, p2) => {
            u2[p2] = i2;
          });
          break;
        default:
          u2 = await o2.text().then(g);
      }
      return (o2.status >= 300 || o2.status < 200) && (S2 = new s(o2.status, u2), u2 = null), { data: u2, error: S2, response: o2, status: o2.status, headers: o2.headers };
    })();
  }
  return typeof a2 == "object" ? A(e, t, [...n, Object.values(a2)[0]], s2) : A(e, t, n);
} });
var V = (e, t = {}) => typeof e == "string" ? (t.keepDomain || (e.includes("://") || (e = (I.find((n) => e.includes(n)) ? "http://" : "https://") + e), e.endsWith("/") && (e = e.slice(0, -1))), A(e, t)) : (typeof window < "u" && console.warn("Elysia instance server found on client side, this is not recommended for security reason. Use generic type instead."), A("http://e.ly", t, [], e));

// node_modules/@elysiajs/eden/dist/chunk-V6UUVCFC.mjs
var j3 = async (t) => {
  var _a;
  switch ((_a = t.headers.get("Content-Type")) == null ? void 0 : _a.split(";")[0]) {
    case "application/json":
      return t.json();
    case "application/octet-stream":
      return t.arrayBuffer();
    case "multipart/form-data": {
      let e = await t.formData(), r = {};
      return e.forEach((o2, a2) => {
        r[a2] = o2;
      }), r;
    }
  }
  return t.text().then(g);
};
var T2 = async (t, n) => {
  let e = await j3(t);
  return t.status > 300 ? { data: null, status: t.status, headers: t.headers, retry: n, error: new s(t.status, e) } : { data: e, error: null, status: t.status, headers: t.headers, retry: n };
};
var x2 = (t, n) => (e, { query: r, params: o2, body: a2, ...s2 } = {}) => {
  var _a, _b;
  o2 && Object.entries(o2).forEach(([c2, i2]) => {
    e = e.replace(`:${c2}`, i2);
  });
  let h = (_a = s2.headers) == null ? void 0 : _a["Content-Type"];
  if (!h || h === "application/json") try {
    a2 = JSON.stringify(a2);
  } catch {
  }
  let p2 = (n == null ? void 0 : n.fetcher) || globalThis.fetch, y = r ? Object.fromEntries(Object.entries(r).filter(([c2, i2]) => i2 != null)) : null, d2 = y ? `?${new URLSearchParams(y).toString()}` : "", m = `${t}${e}${d2}`, E = a2 ? { "content-type": "application/json", ...s2.headers } : s2.headers, g2 = { ...s2, method: ((_b = s2.method) == null ? void 0 : _b.toUpperCase()) || "GET", headers: E, body: a2 }, l = () => p2(m, g2).then((c2) => T2(c2, l));
  return l();
};
export {
  x2 as edenFetch,
  z as edenTreaty,
  V as treaty
};
//# sourceMappingURL=@elysiajs_eden.js.map
