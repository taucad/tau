async function Module(moduleArg = {}) {
  var moduleRtn;
  var g = moduleArg,
    aa = !!globalThis.window,
    ba = !!globalThis.WorkerGlobalScope,
    ca = globalThis.process?.versions?.node && 'renderer' != globalThis.process?.type;
  if (ca) {
    const { createRequire: a } = await import('node:module');
    var require = a(import.meta.url);
  }
  var da = './this.program',
    ea = (a, b) => {
      throw b;
    },
    ha = import.meta.url,
    ia = '',
    ja,
    ka;
  if (ca) {
    var fs = require('node:fs');
    ha.startsWith('file:') && (ia = require('node:path').dirname(require('node:url').fileURLToPath(ha)) + '/');
    ka = (a) => {
      a = la(a) ? new URL(a) : a;
      return fs.readFileSync(a);
    };
    ja = async (a) => {
      a = la(a) ? new URL(a) : a;
      return fs.readFileSync(a, void 0);
    };
    1 < process.argv.length && (da = process.argv[1].replace(/\\/g, '/'));
    process.argv.slice(2);
    ea = (a, b) => {
      process.exitCode = a;
      throw b;
    };
  } else if (aa || ba) {
    try {
      ia = new URL('.', ha).href;
    } catch {}
    ba &&
      (ka = (a) => {
        var b = new XMLHttpRequest();
        b.open('GET', a, !1);
        b.responseType = 'arraybuffer';
        b.send(null);
        return new Uint8Array(b.response);
      });
    ja = async (a) => {
      if (la(a))
        return new Promise((c, d) => {
          var e = new XMLHttpRequest();
          e.open('GET', a, !0);
          e.responseType = 'arraybuffer';
          e.onload = () => {
            200 == e.status || (0 == e.status && e.response) ? c(e.response) : d(e.status);
          };
          e.onerror = d;
          e.send(null);
        });
      var b = await fetch(a, { credentials: 'same-origin' });
      if (b.ok) return b.arrayBuffer();
      throw Error(b.status + ' : ' + b.url);
    };
  }
  var ma = console.log.bind(console),
    p = console.error.bind(console),
    na,
    oa = !1,
    pa,
    la = (a) => a.startsWith('file://'),
    qa,
    ra,
    u,
    w,
    y,
    sa,
    D,
    E,
    ta,
    ua,
    F,
    va,
    wa = !1;
  function xa() {
    var a = ya.buffer;
    u = new Int8Array(a);
    y = new Int16Array(a);
    w = new Uint8Array(a);
    sa = new Uint16Array(a);
    D = new Int32Array(a);
    E = new Uint32Array(a);
    ta = new Float32Array(a);
    g.HEAPF64 = ua = new Float64Array(a);
    F = new BigInt64Array(a);
    va = new BigUint64Array(a);
  }
  function H(a) {
    g.onAbort?.(a);
    a = 'Aborted(' + a + ')';
    p(a);
    oa = !0;
    a += '. Build with -sASSERTIONS for more info.';
    wa && za();
    a = new WebAssembly.RuntimeError(a);
    ra?.(a);
    throw a;
  }
  var Aa;
  async function Ba(a) {
    if (!na)
      try {
        var b = await ja(a);
        return new Uint8Array(b);
      } catch {}
    if (a == Aa && na) a = new Uint8Array(na);
    else if (ka) a = ka(a);
    else throw 'both async and sync fetching of the wasm failed';
    return a;
  }
  async function Ca(a, b) {
    try {
      var c = await Ba(a);
      return await WebAssembly.instantiate(c, b);
    } catch (d) {
      (p(`failed to asynchronously prepare wasm: ${d}`), H(d));
    }
  }
  async function Da(a) {
    var b = Aa;
    if (!na && !la(b) && !ca)
      try {
        var c = fetch(b, { credentials: 'same-origin' });
        return await WebAssembly.instantiateStreaming(c, a);
      } catch (d) {
        (p(`wasm streaming compile failed: ${d}`), p('falling back to ArrayBuffer instantiation'));
      }
    return Ca(b, a);
  }
  class Ea {
    name = 'ExitStatus';
    constructor(a) {
      this.message = `Program terminated with exit(${a})`;
      this.status = a;
    }
  }
  var Fa = (a) => {
      for (; 0 < a.length; ) a.shift()(g);
    },
    Ga = [],
    Ha = [],
    Ia = () => {
      var a = g.preRun.shift();
      Ha.push(a);
    },
    Ja = !0,
    Ka = [],
    Ma = (a) => {
      var b = Ka[a];
      b || (Ka[a] = b = La.get(a));
      return b;
    },
    Na = (a, b) => {
      for (var c = 0, d = a.length - 1; 0 <= d; d--) {
        var e = a[d];
        '.' === e ? a.splice(d, 1) : '..' === e ? (a.splice(d, 1), c++) : c && (a.splice(d, 1), c--);
      }
      if (b) for (; c; c--) a.unshift('..');
      return a;
    },
    Oa = (a) => {
      var b = '/' === a.charAt(0),
        c = '/' === a.slice(-1);
      (a = Na(
        a.split('/').filter((d) => !!d),
        !b,
      ).join('/')) ||
        b ||
        (a = '.');
      a && c && (a += '/');
      return (b ? '/' : '') + a;
    },
    Pa = (a) => {
      var b = /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/.exec(a).slice(1);
      a = b[0];
      b = b[1];
      if (!a && !b) return '.';
      b &&= b.slice(0, -1);
      return a + b;
    },
    Qa = (a) => a && a.match(/([^\/]+|\/)\/*$/)[1],
    Ra = (a, b) => Oa(a + '/' + b),
    Sa = () => {
      if (ca) {
        var a = require('node:crypto');
        return (b) => a.randomFillSync(b);
      }
      return (b) => crypto.getRandomValues(b);
    },
    Ta = (a) => {
      (Ta = Sa())(a);
    },
    Ua = (...a) => {
      for (var b = '', c = !1, d = a.length - 1; -1 <= d && !c; d--) {
        c = 0 <= d ? a[d] : I.cwd();
        if ('string' != typeof c) throw new TypeError('Arguments to path.resolve must be strings');
        if (!c) return '';
        b = c + '/' + b;
        c = '/' === c.charAt(0);
      }
      b = Na(
        b.split('/').filter((e) => !!e),
        !c,
      ).join('/');
      return (c ? '/' : '') + b || '.';
    },
    Va = (a, b) => {
      function c(h) {
        for (var k = 0; k < h.length && '' === h[k]; k++);
        for (var m = h.length - 1; 0 <= m && '' === h[m]; m--);
        return k > m ? [] : h.slice(k, m - k + 1);
      }
      a = Ua(a).slice(1);
      b = Ua(b).slice(1);
      a = c(a.split('/'));
      b = c(b.split('/'));
      for (var d = Math.min(a.length, b.length), e = d, f = 0; f < d; f++)
        if (a[f] !== b[f]) {
          e = f;
          break;
        }
      d = [];
      for (f = e; f < a.length; f++) d.push('..');
      d = d.concat(b.slice(e));
      return d.join('/');
    },
    Wa = globalThis.TextDecoder && new TextDecoder(),
    Xa = (a, b, c, d) => {
      c = b + c;
      if (d) return c;
      for (; a[b] && !(b >= c); ) ++b;
      return b;
    },
    Ya = (a, b = 0, c, d) => {
      b >>>= 0;
      c = Xa(a, b, c, d);
      if (16 < c - b && a.buffer && Wa) return Wa.decode(a.subarray(b, c));
      for (d = ''; b < c; ) {
        var e = a[b++];
        if (e & 128) {
          var f = a[b++] & 63;
          if (192 == (e & 224)) d += String.fromCharCode(((e & 31) << 6) | f);
          else {
            var h = a[b++] & 63;
            e =
              224 == (e & 240)
                ? ((e & 15) << 12) | (f << 6) | h
                : ((e & 7) << 18) | (f << 12) | (h << 6) | (a[b++] & 63);
            65536 > e
              ? (d += String.fromCharCode(e))
              : ((e -= 65536), (d += String.fromCharCode(55296 | (e >> 10), 56320 | (e & 1023))));
          }
        } else d += String.fromCharCode(e);
      }
      return d;
    },
    Za = [],
    $a = (a) => {
      for (var b = 0, c = 0; c < a.length; ++c) {
        var d = a.charCodeAt(c);
        127 >= d ? b++ : 2047 >= d ? (b += 2) : 55296 <= d && 57343 >= d ? ((b += 4), ++c) : (b += 3);
      }
      return b;
    },
    ab = (a, b, c, d) => {
      c >>>= 0;
      if (!(0 < d)) return 0;
      var e = c;
      d = c + d - 1;
      for (var f = 0; f < a.length; ++f) {
        var h = a.codePointAt(f);
        if (127 >= h) {
          if (c >= d) break;
          b[c++ >>> 0] = h;
        } else if (2047 >= h) {
          if (c + 1 >= d) break;
          b[c++ >>> 0] = 192 | (h >> 6);
          b[c++ >>> 0] = 128 | (h & 63);
        } else if (65535 >= h) {
          if (c + 2 >= d) break;
          b[c++ >>> 0] = 224 | (h >> 12);
          b[c++ >>> 0] = 128 | ((h >> 6) & 63);
          b[c++ >>> 0] = 128 | (h & 63);
        } else {
          if (c + 3 >= d) break;
          b[c++ >>> 0] = 240 | (h >> 18);
          b[c++ >>> 0] = 128 | ((h >> 12) & 63);
          b[c++ >>> 0] = 128 | ((h >> 6) & 63);
          b[c++ >>> 0] = 128 | (h & 63);
          f++;
        }
      }
      b[c >>> 0] = 0;
      return c - e;
    },
    bb = (a) => {
      var b = Array($a(a) + 1);
      a = ab(a, b, 0, b.length);
      b.length = a;
      return b;
    },
    cb = [];
  function db(a, b) {
    cb[a] = { input: [], output: [], Eb: b };
    eb(a, fb);
  }
  var fb = {
      open(a) {
        var b = cb[a.node.rdev];
        if (!b) throw new I.Ya(43);
        a.tty = b;
        a.seekable = !1;
      },
      close(a) {
        a.tty.Eb.fsync(a.tty);
      },
      fsync(a) {
        a.tty.Eb.fsync(a.tty);
      },
      read(a, b, c, d) {
        if (!a.tty || !a.tty.Eb.uc) throw new I.Ya(60);
        for (var e = 0, f = 0; f < d; f++) {
          try {
            var h = a.tty.Eb.uc(a.tty);
          } catch (k) {
            throw new I.Ya(29);
          }
          if (void 0 === h && 0 === e) throw new I.Ya(6);
          if (null === h || void 0 === h) break;
          e++;
          b[c + f] = h;
        }
        e && (a.node.atime = Date.now());
        return e;
      },
      write(a, b, c, d) {
        if (!a.tty || !a.tty.Eb.jc) throw new I.Ya(60);
        try {
          for (var e = 0; e < d; e++) a.tty.Eb.jc(a.tty, b[c + e]);
        } catch (f) {
          throw new I.Ya(29);
        }
        d && (a.node.mtime = a.node.ctime = Date.now());
        return e;
      },
    },
    gb = {
      uc() {
        a: {
          if (!Za.length) {
            var a = null;
            if (ca) {
              var b = Buffer.alloc(256),
                c = 0,
                d = process.stdin.fd;
              try {
                c = fs.readSync(d, b, 0, 256);
              } catch (e) {
                if (e.toString().includes('EOF')) c = 0;
                else throw e;
              }
              0 < c && (a = b.slice(0, c).toString('utf-8'));
            } else globalThis.window?.prompt && ((a = window.prompt('Input: ')), null !== a && (a += '\n'));
            if (!a) {
              a = null;
              break a;
            }
            Za = bb(a);
          }
          a = Za.shift();
        }
        return a;
      },
      jc(a, b) {
        null === b || 10 === b ? (ma(Ya(a.output)), (a.output = [])) : 0 != b && a.output.push(b);
      },
      fsync(a) {
        0 < a.output?.length && (ma(Ya(a.output)), (a.output = []));
      },
      Uc() {
        return {
          qd: 25856,
          sd: 5,
          pd: 191,
          rd: 35387,
          od: [
            3, 28, 127, 21, 4, 0, 1, 0, 17, 19, 26, 0, 18, 15, 23, 22, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
          ],
        };
      },
      Vc() {
        return 0;
      },
      Wc() {
        return [24, 80];
      },
    },
    hb = {
      jc(a, b) {
        null === b || 10 === b ? (p(Ya(a.output)), (a.output = [])) : 0 != b && a.output.push(b);
      },
      fsync(a) {
        0 < a.output?.length && (p(Ya(a.output)), (a.output = []));
      },
    },
    J = {
      yb: null,
      jb() {
        return J.createNode(null, '/', 16895, 0);
      },
      createNode(a, b, c, d) {
        if (24576 === (c & 61440) || I.isFIFO(c)) throw new I.Ya(63);
        J.yb ||
          (J.yb = {
            dir: {
              node: {
                vb: J.$a.vb,
                xb: J.$a.xb,
                lookup: J.$a.lookup,
                Cb: J.$a.Cb,
                rename: J.$a.rename,
                unlink: J.$a.unlink,
                rmdir: J.$a.rmdir,
                readdir: J.$a.readdir,
                symlink: J.$a.symlink,
              },
              stream: { rb: J.cb.rb },
            },
            file: {
              node: { vb: J.$a.vb, xb: J.$a.xb },
              stream: { rb: J.cb.rb, read: J.cb.read, write: J.cb.write, Lb: J.cb.Lb, Rb: J.cb.Rb },
            },
            link: { node: { vb: J.$a.vb, xb: J.$a.xb, readlink: J.$a.readlink }, stream: {} },
            oc: { node: { vb: J.$a.vb, xb: J.$a.xb }, stream: I.Hc },
          });
        c = I.createNode(a, b, c, d);
        K(c.mode)
          ? ((c.$a = J.yb.dir.node), (c.cb = J.yb.dir.stream), (c.eb = {}))
          : I.isFile(c.mode)
            ? ((c.$a = J.yb.file.node), (c.cb = J.yb.file.stream), (c.mb = 0), (c.eb = null))
            : 40960 === (c.mode & 61440)
              ? ((c.$a = J.yb.link.node), (c.cb = J.yb.link.stream))
              : 8192 === (c.mode & 61440) && ((c.$a = J.yb.oc.node), (c.cb = J.yb.oc.stream));
        c.atime = c.mtime = c.ctime = Date.now();
        a && ((a.eb[b] = c), (a.atime = a.mtime = a.ctime = c.atime));
        return c;
      },
      Dd(a) {
        return a.eb ? (a.eb.subarray ? a.eb.subarray(0, a.mb) : new Uint8Array(a.eb)) : new Uint8Array(0);
      },
      $a: {
        vb(a) {
          var b = {};
          b.dev = 8192 === (a.mode & 61440) ? a.id : 1;
          b.ino = a.id;
          b.mode = a.mode;
          b.nlink = 1;
          b.uid = 0;
          b.gid = 0;
          b.rdev = a.rdev;
          K(a.mode)
            ? (b.size = 4096)
            : I.isFile(a.mode)
              ? (b.size = a.mb)
              : 40960 === (a.mode & 61440)
                ? (b.size = a.link.length)
                : (b.size = 0);
          b.atime = new Date(a.atime);
          b.mtime = new Date(a.mtime);
          b.ctime = new Date(a.ctime);
          b.blksize = 4096;
          b.blocks = Math.ceil(b.size / b.blksize);
          return b;
        },
        xb(a, b) {
          for (var c of ['mode', 'atime', 'mtime', 'ctime']) null != b[c] && (a[c] = b[c]);
          void 0 !== b.size &&
            ((b = b.size),
            a.mb != b &&
              (0 == b
                ? ((a.eb = null), (a.mb = 0))
                : ((c = a.eb),
                  (a.eb = new Uint8Array(b)),
                  c && a.eb.set(c.subarray(0, Math.min(b, a.mb))),
                  (a.mb = b))));
        },
        lookup() {
          J.$b || ((J.$b = new I.Ya(44)), (J.$b.stack = '<generic error, no stack>'));
          throw J.$b;
        },
        Cb(a, b, c, d) {
          return J.createNode(a, b, c, d);
        },
        rename(a, b, c) {
          try {
            var d = M(b, c);
          } catch (f) {}
          if (d) {
            if (K(a.mode)) for (var e in d.eb) throw new I.Ya(55);
            ib(d);
          }
          delete a.parent.eb[a.name];
          b.eb[c] = a;
          a.name = c;
          b.ctime = b.mtime = a.parent.ctime = a.parent.mtime = Date.now();
        },
        unlink(a, b) {
          delete a.eb[b];
          a.ctime = a.mtime = Date.now();
        },
        rmdir(a, b) {
          var c = M(a, b),
            d;
          for (d in c.eb) throw new I.Ya(55);
          delete a.eb[b];
          a.ctime = a.mtime = Date.now();
        },
        readdir(a) {
          return ['.', '..', ...Object.keys(a.eb)];
        },
        symlink(a, b, c) {
          a = J.createNode(a, b, 41471, 0);
          a.link = c;
          return a;
        },
        readlink(a) {
          if (40960 !== (a.mode & 61440)) throw new I.Ya(28);
          return a.link;
        },
      },
      cb: {
        read(a, b, c, d, e) {
          var f = a.node.eb;
          if (e >= a.node.mb) return 0;
          a = Math.min(a.node.mb - e, d);
          if (8 < a && f.subarray) b.set(f.subarray(e, e + a), c);
          else for (d = 0; d < a; d++) b[c + d] = f[e + d];
          return a;
        },
        write(a, b, c, d, e, f) {
          b.buffer === u.buffer && (f = !1);
          if (!d) return 0;
          a = a.node;
          a.mtime = a.ctime = Date.now();
          if (b.subarray && (!a.eb || a.eb.subarray)) {
            if (f) return ((a.eb = b.subarray(c, c + d)), (a.mb = d));
            if (0 === a.mb && 0 === e) return ((a.eb = b.slice(c, c + d)), (a.mb = d));
            if (e + d <= a.mb) return (a.eb.set(b.subarray(c, c + d), e), d);
          }
          f = e + d;
          var h = a.eb ? a.eb.length : 0;
          h >= f ||
            ((f = Math.max(f, (h * (1048576 > h ? 2 : 1.125)) >>> 0)),
            0 != h && (f = Math.max(f, 256)),
            (h = a.eb),
            (a.eb = new Uint8Array(f)),
            0 < a.mb && a.eb.set(h.subarray(0, a.mb), 0));
          if (a.eb.subarray && b.subarray) a.eb.set(b.subarray(c, c + d), e);
          else for (f = 0; f < d; f++) a.eb[e + f] = b[c + f];
          a.mb = Math.max(a.mb, e + d);
          return d;
        },
        rb(a, b, c) {
          1 === c ? (b += a.position) : 2 === c && I.isFile(a.node.mode) && (b += a.node.mb);
          if (0 > b) throw new I.Ya(28);
          return b;
        },
        Lb(a, b, c, d, e) {
          if (!I.isFile(a.node.mode)) throw new I.Ya(43);
          a = a.node.eb;
          if (e & 2 || !a || a.buffer !== u.buffer) {
            d = !0;
            H();
            e = void 0;
            if (!e) throw new I.Ya(48);
            if (a) {
              if (0 < c || c + b < a.length)
                a.subarray ? (a = a.subarray(c, c + b)) : (a = Array.prototype.slice.call(a, c, c + b));
              u.set(a, e >>> 0);
            }
          } else ((d = !1), (e = a.byteOffset));
          return { gb: e, kd: d };
        },
        Rb(a, b, c, d) {
          J.cb.write(a, b, 0, d, c, !1);
          return 0;
        },
      },
    },
    jb = (a, b) => {
      var c = 0;
      a && (c |= 365);
      b && (c |= 146);
      return c;
    },
    kb = async (a) => {
      a = await ja(a);
      return new Uint8Array(a);
    },
    lb = 0,
    mb = null,
    nb = [],
    pb = async (a, b) => {
      'undefined' != typeof Browser && ob();
      for (var c of nb) if (c.canHandle(b)) return c.handle(a, b);
      return a;
    },
    rb = async (a, b, c, d, e, f, h, k) => {
      var m = b ? Ua(Oa(a + '/' + b)) : a;
      lb++;
      g.monitorRunDependencies?.(lb);
      try {
        var l = c;
        'string' == typeof c && (l = await kb(c));
        l = await pb(l, m);
        k?.();
        if (!f) {
          c = b;
          a && ((a = 'string' == typeof a ? a : qb(a)), (c = b ? Oa(a + '/' + b) : a));
          var n = jb(d, e),
            r = I.create(c, n);
          if (l) {
            if ('string' == typeof l) {
              var q = Array(l.length);
              b = 0;
              for (var t = l.length; b < t; ++b) q[b] = l.charCodeAt(b);
              l = q;
            }
            I.chmod(r, n | 146);
            var v = I.open(r, 577);
            I.write(v, l, 0, l.length, 0, h);
            I.close(v);
            I.chmod(r, n);
          }
        }
      } finally {
        (lb--, g.monitorRunDependencies?.(lb), 0 == lb && mb && ((h = mb), (mb = null), h()));
      }
    };
  function ob() {
    var a, b, c;
    I.bc = !0;
    a ??= g.stdin;
    b ??= g.stdout;
    c ??= g.stderr;
    a ? I.Ib('/dev', 'stdin', a) : I.symlink('/dev/tty', '/dev/stdin');
    b ? I.Ib('/dev', 'stdout', null, b) : I.symlink('/dev/tty', '/dev/stdout');
    c ? I.Ib('/dev', 'stderr', null, c) : I.symlink('/dev/tty1', '/dev/stderr');
    I.open('/dev/stdin', 0);
    I.open('/dev/stdout', 1);
    I.open('/dev/stderr', 1);
  }
  function eb(a, b) {
    I.rc[a] = { cb: b };
  }
  function K(a) {
    return 16384 === (a & 61440);
  }
  function M(a, b) {
    var c = K(a.mode) ? ((c = sb(a, 'x')) ? c : a.$a.lookup ? 0 : 2) : 54;
    if (c) throw new I.Ya(c);
    for (c = I.Db[tb(a.id, b)]; c; c = c.Kb) {
      var d = c.name;
      if (c.parent.id === a.id && d === b) return c;
    }
    return I.lookup(a, b);
  }
  function ib(a) {
    var b = tb(a.parent.id, a.name);
    if (I.Db[b] === a) I.Db[b] = a.Kb;
    else
      for (b = I.Db[b]; b; ) {
        if (b.Kb === a) {
          b.Kb = a.Kb;
          break;
        }
        b = b.Kb;
      }
  }
  function N(a, b = {}) {
    if (!a) throw new I.Ya(44);
    b.Vb ?? (b.Vb = !0);
    '/' === a.charAt(0) || (a = I.cwd() + '/' + a);
    var c = 0;
    a: for (; 40 > c; c++) {
      a = a.split('/').filter((k) => !!k);
      for (var d = I.root, e = '/', f = 0; f < a.length; f++) {
        var h = f === a.length - 1;
        if (h && b.parent) break;
        if ('.' !== a[f])
          if ('..' === a[f])
            if (((e = Pa(e)), I.ec(d))) {
              a = e + '/' + a.slice(f + 1).join('/');
              c--;
              continue a;
            } else d = d.parent;
          else {
            e = Oa(e + '/' + a[f]);
            try {
              d = M(d, a[f]);
            } catch (k) {
              if (44 === k?.nb && h && b.Zc) return { path: e };
              throw k;
            }
            !d.wb || (h && !b.Vb) || (d = d.wb.root);
            if (40960 === (d.mode & 61440) && (!h || b.ub)) {
              if (!d.$a.readlink) throw new I.Ya(52);
              d = d.$a.readlink(d);
              '/' === d.charAt(0) || (d = Pa(e) + '/' + d);
              a = d + '/' + a.slice(f + 1).join('/');
              continue a;
            }
          }
      }
      return { path: e, node: d };
    }
    throw new I.Ya(32);
  }
  function qb(a) {
    for (var b; ; ) {
      if (I.ec(a)) return ((a = a.jb.xc), b ? ('/' !== a[a.length - 1] ? `${a}/${b}` : a + b) : a);
      b = b ? `${a.name}/${b}` : a.name;
      a = a.parent;
    }
  }
  function tb(a, b) {
    for (var c = 0, d = 0; d < b.length; d++) c = ((c << 5) - c + b.charCodeAt(d)) | 0;
    return ((a + c) >>> 0) % I.Db.length;
  }
  function ub(a) {
    var b = tb(a.parent.id, a.name);
    a.Kb = I.Db[b];
    I.Db[b] = a;
  }
  function sb(a, b) {
    return I.vc
      ? 0
      : (b.includes('r') && !(a.mode & 292)) ||
          (b.includes('w') && !(a.mode & 146)) ||
          (b.includes('x') && !(a.mode & 73))
        ? 2
        : 0;
  }
  function vb(a, b) {
    if (!K(a.mode)) return 54;
    try {
      return (M(a, b), 20);
    } catch (c) {}
    return sb(a, 'wx');
  }
  function wb(a, b, c) {
    try {
      var d = M(a, b);
    } catch (e) {
      return e.nb;
    }
    if ((a = sb(a, 'wx'))) return a;
    if (c) {
      if (!K(d.mode)) return 54;
      if (I.ec(d) || qb(d) === I.cwd()) return 10;
    } else if (K(d.mode)) return 31;
    return 0;
  }
  function xb(a, b) {
    if (!a) throw new I.Ya(b);
    return a;
  }
  function O(a) {
    a = I.Qc(a);
    if (!a) throw new I.Ya(8);
    return a;
  }
  function yb(a, b = -1) {
    a = Object.assign(new I.Ec(), a);
    if (-1 == b)
      a: {
        for (b = 0; b <= I.Fc; b++) if (!I.streams[b]) break a;
        throw new I.Ya(33);
      }
    a.fd = b;
    return (I.streams[b] = a);
  }
  function zb(a, b = -1) {
    a = yb(a, b);
    a.cb?.xd?.(a);
    return a;
  }
  function Ab(a, b, c) {
    var d = a?.cb.xb;
    a = d ? a : b;
    d ??= b.$a.xb;
    xb(d, 63);
    d(a, c);
  }
  function Bb(a) {
    var b = [];
    for (a = [a]; a.length; ) {
      var c = a.pop();
      b.push(c);
      a.push(...c.Qb);
    }
    return b;
  }
  function Cb(a) {
    var b = { nd: 4096, Ad: 4096, blocks: 1e6, md: 5e5, ld: 5e5, files: I.ic, yd: I.ic - 1, Bd: 42, flags: 2, Gd: 255 };
    a.$a.Ac && Object.assign(b, a.$a.Ac(a.jb.$c.root));
    return b;
  }
  function Db(a, b, c) {
    'undefined' == typeof c && ((c = b), (b = 438));
    return I.Cb(a, b | 8192, c);
  }
  function Eb(a, b, c, d) {
    Ab(a, b, { mode: (c & 4095) | (b.mode & -4096), ctime: Date.now(), sc: d });
  }
  function Hb(a, b, c) {
    if (K(b.mode)) throw new I.Ya(31);
    if (!I.isFile(b.mode)) throw new I.Ya(28);
    var d = sb(b, 'w');
    if (d) throw new I.Ya(d);
    Ab(a, b, { size: c, timestamp: Date.now() });
  }
  function Ib(a, b, c, d) {
    a = 'string' == typeof a ? a : qb(a);
    b = Oa(a + '/' + b);
    return I.create(b, jb(c, d));
  }
  function Jb(a) {
    if (!(a.Xc || a.Yc || a.link || a.eb))
      if (globalThis.XMLHttpRequest)
        H(
          'Lazy loading should have been performed (contents set) in createLazyFile, but it was not. Lazy loading only works in web workers. Use --embed-file or --preload-file in emcc on the main thread.',
        );
      else
        try {
          a.eb = ka(a.url);
        } catch (b) {
          throw new I.Ya(29);
        }
  }
  var I = {
      root: null,
      Qb: [],
      rc: {},
      streams: [],
      ic: 1,
      Db: null,
      pc: '/',
      bc: !1,
      vc: !0,
      Mc: null,
      Yb: 0,
      Ya: class {
        name = 'ErrnoError';
        constructor(a) {
          this.nb = a;
        }
      },
      Ec: class {
        Ab = {};
        node = null;
        get object() {
          return this.node;
        }
        set object(a) {
          this.node = a;
        }
        get flags() {
          return this.Ab.flags;
        }
        set flags(a) {
          this.Ab.flags = a;
        }
        get position() {
          return this.Ab.position;
        }
        set position(a) {
          this.Ab.position = a;
        }
      },
      Dc: class {
        $a = {};
        cb = {};
        wb = null;
        constructor(a, b, c, d) {
          a ||= this;
          this.parent = a;
          this.jb = a.jb;
          this.id = I.ic++;
          this.name = b;
          this.mode = c;
          this.rdev = d;
          this.atime = this.mtime = this.ctime = Date.now();
        }
        get read() {
          return 365 === (this.mode & 365);
        }
        set read(a) {
          a ? (this.mode |= 365) : (this.mode &= -366);
        }
        get write() {
          return 146 === (this.mode & 146);
        }
        set write(a) {
          a ? (this.mode |= 146) : (this.mode &= -147);
        }
        get Yc() {
          return K(this.mode);
        }
        get Xc() {
          return 8192 === (this.mode & 61440);
        }
      },
      createNode(a, b, c, d) {
        a = new I.Dc(a, b, c, d);
        ub(a);
        return a;
      },
      ec(a) {
        return a === a.parent;
      },
      isFile(a) {
        return 32768 === (a & 61440);
      },
      isFIFO(a) {
        return 4096 === (a & 61440);
      },
      isSocket(a) {
        return 49152 === (a & 49152);
      },
      Fc: 4096,
      Qc: (a) => I.streams[a],
      Hc: {
        open(a) {
          a.cb = I.Oc(a.node.rdev).cb;
          a.cb.open?.(a);
        },
        rb() {
          throw new I.Ya(70);
        },
      },
      hc: (a) => a >> 8,
      Ed: (a) => a & 255,
      Jb: (a, b) => (a << 8) | b,
      Oc: (a) => I.rc[a],
      Bc(a, b) {
        function c(k) {
          I.Yb--;
          return b(k);
        }
        function d(k) {
          if (k) {
            if (!d.Kc) return ((d.Kc = !0), c(k));
          } else ++f >= e.length && c(null);
        }
        'function' == typeof a && ((b = a), (a = !1));
        I.Yb++;
        1 < I.Yb && p(`warning: ${I.Yb} FS.syncfs operations in flight at once, probably just doing extra work`);
        var e = Bb(I.root.jb),
          f = 0,
          h;
        for (h of e) h.type.Bc ? h.type.Bc(h, a, d) : d(null);
      },
      jb(a, b, c) {
        var d = '/' === c;
        if (d && I.root) throw new I.Ya(10);
        if (!d && c) {
          var e = N(c, { Vb: !1 });
          c = e.path;
          e = e.node;
          if (e.wb) throw new I.Ya(10);
          if (!K(e.mode)) throw new I.Ya(54);
        }
        b = { type: a, $c: b, xc: c, Qb: [] };
        a = a.jb(b);
        a.jb = b;
        b.root = a;
        d ? (I.root = a) : e && ((e.wb = b), e.jb && e.jb.Qb.push(b));
        return a;
      },
      Ld(a) {
        a = N(a, { Vb: !1 });
        if (!a.node.wb) throw new I.Ya(28);
        a = a.node;
        var b = a.wb,
          c = Bb(b);
        for ([, e] of Object.entries(I.Db))
          for (; e; ) {
            var d = e.Kb;
            c.includes(e.jb) && ib(e);
            var e = d;
          }
        a.wb = null;
        a.jb.Qb.splice(a.jb.Qb.indexOf(b), 1);
      },
      lookup(a, b) {
        return a.$a.lookup(a, b);
      },
      Cb(a, b, c) {
        var d = N(a, { parent: !0 }).node;
        a = Qa(a);
        if (!a) throw new I.Ya(28);
        if ('.' === a || '..' === a) throw new I.Ya(20);
        var e = vb(d, a);
        if (e) throw new I.Ya(e);
        if (!d.$a.Cb) throw new I.Ya(63);
        return d.$a.Cb(d, a, b, c);
      },
      Ac(a) {
        return Cb(N(a, { ub: !0 }).node);
      },
      Jd(a) {
        return Cb(a.node);
      },
      create(a, b = 438) {
        return I.Cb(a, (b & 4095) | 32768, 0);
      },
      mkdir(a, b = 511) {
        return I.Cb(a, (b & 1023) | 16384, 0);
      },
      Fd(a, b) {
        var c = a.split('/'),
          d = '',
          e;
        for (e of c)
          if (e) {
            if (d || '/' === a.charAt(0)) d += '/';
            d += e;
            try {
              I.mkdir(d, b);
            } catch (f) {
              if (20 != f.nb) throw f;
            }
          }
      },
      symlink(a, b) {
        if (!Ua(a)) throw new I.Ya(44);
        var c = N(b, { parent: !0 }).node;
        if (!c) throw new I.Ya(44);
        b = Qa(b);
        var d = vb(c, b);
        if (d) throw new I.Ya(d);
        if (!c.$a.symlink) throw new I.Ya(63);
        return c.$a.symlink(c, b, a);
      },
      rename(a, b) {
        var c = Pa(a),
          d = Pa(b),
          e = Qa(a),
          f = Qa(b);
        var h = N(a, { parent: !0 });
        var k = h.node;
        h = N(b, { parent: !0 });
        h = h.node;
        if (!k || !h) throw new I.Ya(44);
        if (k.jb !== h.jb) throw new I.Ya(75);
        var m = M(k, e);
        a = Va(a, d);
        if ('.' !== a.charAt(0)) throw new I.Ya(28);
        a = Va(b, c);
        if ('.' !== a.charAt(0)) throw new I.Ya(55);
        try {
          var l = M(h, f);
        } catch (n) {}
        if (m !== l) {
          b = K(m.mode);
          if ((e = wb(k, e, b))) throw new I.Ya(e);
          if ((e = l ? wb(h, f, b) : vb(h, f))) throw new I.Ya(e);
          if (!k.$a.rename) throw new I.Ya(63);
          if (m.wb || (l && l.wb)) throw new I.Ya(10);
          if (h !== k && (e = sb(k, 'w'))) throw new I.Ya(e);
          ib(m);
          try {
            (k.$a.rename(m, h, f), (m.parent = h));
          } catch (n) {
            throw n;
          } finally {
            ub(m);
          }
        }
      },
      rmdir(a) {
        var b = N(a, { parent: !0 }).node;
        a = Qa(a);
        var c = M(b, a),
          d = wb(b, a, !0);
        if (d) throw new I.Ya(d);
        if (!b.$a.rmdir) throw new I.Ya(63);
        if (c.wb) throw new I.Ya(10);
        b.$a.rmdir(b, a);
        ib(c);
      },
      readdir(a) {
        a = N(a, { ub: !0 }).node;
        return xb(a.$a.readdir, 54)(a);
      },
      unlink(a) {
        var b = N(a, { parent: !0 }).node;
        if (!b) throw new I.Ya(44);
        a = Qa(a);
        var c = M(b, a),
          d = wb(b, a, !1);
        if (d) throw new I.Ya(d);
        if (!b.$a.unlink) throw new I.Ya(63);
        if (c.wb) throw new I.Ya(10);
        b.$a.unlink(b, a);
        ib(c);
      },
      readlink(a) {
        a = N(a).node;
        if (!a) throw new I.Ya(44);
        if (!a.$a.readlink) throw new I.Ya(28);
        return a.$a.readlink(a);
      },
      stat(a, b) {
        a = N(a, { ub: !b }).node;
        return xb(a.$a.vb, 63)(a);
      },
      fstat(a) {
        var b = O(a);
        a = b.node;
        var c = b.cb.vb;
        b = c ? b : a;
        c ??= a.$a.vb;
        xb(c, 63);
        return c(b);
      },
      lstat(a) {
        return I.stat(a, !0);
      },
      chmod(a, b, c) {
        a = 'string' == typeof a ? N(a, { ub: !c }).node : a;
        Eb(null, a, b, c);
      },
      lchmod(a, b) {
        I.chmod(a, b, !0);
      },
      fchmod(a, b) {
        a = O(a);
        Eb(a, a.node, b, !1);
      },
      chown(a, b, c, d) {
        a = 'string' == typeof a ? N(a, { ub: !d }).node : a;
        Ab(null, a, { timestamp: Date.now(), sc: d });
      },
      lchown(a, b, c) {
        I.chown(a, b, c, !0);
      },
      fchown(a) {
        a = O(a);
        Ab(a, a.node, { timestamp: Date.now(), sc: !1 });
      },
      truncate(a, b) {
        if (0 > b) throw new I.Ya(28);
        a = 'string' == typeof a ? N(a, { ub: !0 }).node : a;
        Hb(null, a, b);
      },
      Cd(a, b) {
        a = O(a);
        if (0 > b || 0 === (a.flags & 2097155)) throw new I.Ya(28);
        Hb(a, a.node, b);
      },
      Md(a, b, c) {
        a = N(a, { ub: !0 }).node;
        xb(a.$a.xb, 63)(a, { atime: b, mtime: c });
      },
      open(a, b, c = 438) {
        if ('' === a) throw new I.Ya(44);
        if ('string' == typeof b) {
          var d = { r: 0, 'r+': 2, w: 577, 'w+': 578, a: 1089, 'a+': 1090 }[b];
          if ('undefined' == typeof d) throw Error(`Unknown file open mode: ${b}`);
          b = d;
        }
        c = b & 64 ? (c & 4095) | 32768 : 0;
        if ('object' == typeof a) d = a;
        else {
          var e = a.endsWith('/');
          var f = N(a, { ub: !(b & 131072), Zc: !0 });
          d = f.node;
          a = f.path;
        }
        f = !1;
        if (b & 64)
          if (d) {
            if (b & 128) throw new I.Ya(20);
          } else {
            if (e) throw new I.Ya(31);
            d = I.Cb(a, c | 511, 0);
            f = !0;
          }
        if (!d) throw new I.Ya(44);
        8192 === (d.mode & 61440) && (b &= -513);
        if (b & 65536 && !K(d.mode)) throw new I.Ya(54);
        if (
          !f &&
          (d
            ? 40960 === (d.mode & 61440)
              ? (e = 32)
              : ((e = ['r', 'w', 'rw'][b & 3]),
                b & 512 && (e += 'w'),
                (e = K(d.mode) && ('r' !== e || b & 576) ? 31 : sb(d, e)))
            : (e = 44),
          e)
        )
          throw new I.Ya(e);
        b & 512 && !f && I.truncate(d, 0);
        b &= -131713;
        b = yb({ node: d, path: qb(d), flags: b, seekable: !0, position: 0, cb: d.cb, jd: [], error: !1 });
        b.cb.open && b.cb.open(b);
        f && I.chmod(d, c & 511);
        return b;
      },
      close(a) {
        if (null === a.fd) throw new I.Ya(8);
        a.ac && (a.ac = null);
        try {
          a.cb.close && a.cb.close(a);
        } catch (b) {
          throw b;
        } finally {
          I.streams[a.fd] = null;
        }
        a.fd = null;
      },
      rb(a, b, c) {
        if (null === a.fd) throw new I.Ya(8);
        if (!a.seekable || !a.cb.rb) throw new I.Ya(70);
        if (0 != c && 1 != c && 2 != c) throw new I.Ya(28);
        a.position = a.cb.rb(a, b, c);
        a.jd = [];
        return a.position;
      },
      read(a, b, c, d, e) {
        if (0 > d || 0 > e) throw new I.Ya(28);
        if (null === a.fd) throw new I.Ya(8);
        if (1 === (a.flags & 2097155)) throw new I.Ya(8);
        if (K(a.node.mode)) throw new I.Ya(31);
        if (!a.cb.read) throw new I.Ya(28);
        var f = 'undefined' != typeof e;
        if (!f) e = a.position;
        else if (!a.seekable) throw new I.Ya(70);
        b = a.cb.read(a, b, c, d, e);
        f || (a.position += b);
        return b;
      },
      write(a, b, c, d, e, f) {
        if (0 > d || 0 > e) throw new I.Ya(28);
        if (null === a.fd) throw new I.Ya(8);
        if (0 === (a.flags & 2097155)) throw new I.Ya(8);
        if (K(a.node.mode)) throw new I.Ya(31);
        if (!a.cb.write) throw new I.Ya(28);
        a.seekable && a.flags & 1024 && I.rb(a, 0, 2);
        var h = 'undefined' != typeof e;
        if (!h) e = a.position;
        else if (!a.seekable) throw new I.Ya(70);
        b = a.cb.write(a, b, c, d, e, f);
        h || (a.position += b);
        return b;
      },
      Lb(a, b, c, d, e) {
        if (0 !== (d & 2) && 0 === (e & 2) && 2 !== (a.flags & 2097155)) throw new I.Ya(2);
        if (1 === (a.flags & 2097155)) throw new I.Ya(2);
        if (!a.cb.Lb) throw new I.Ya(43);
        if (!b) throw new I.Ya(28);
        return a.cb.Lb(a, b, c, d, e);
      },
      Rb(a, b, c, d, e) {
        return a.cb.Rb ? a.cb.Rb(a, b, c, d, e) : 0;
      },
      cc(a, b, c) {
        if (!a.cb.cc) throw new I.Ya(59);
        return a.cb.cc(a, b, c);
      },
      readFile(a, b = {}) {
        b.flags = b.flags || 0;
        b.encoding = b.encoding || 'binary';
        'utf8' !== b.encoding && 'binary' !== b.encoding && H(`Invalid encoding type "${b.encoding}"`);
        var c = I.open(a, b.flags);
        a = I.stat(a).size;
        var d = new Uint8Array(a);
        I.read(c, d, 0, a, 0);
        'utf8' === b.encoding && (d = Ya(d));
        I.close(c);
        return d;
      },
      writeFile(a, b, c = {}) {
        c.flags = c.flags || 577;
        a = I.open(a, c.flags, c.mode);
        'string' == typeof b && (b = new Uint8Array(bb(b)));
        ArrayBuffer.isView(b) ? I.write(a, b, 0, b.byteLength, void 0, c.td) : H('Unsupported data type');
        I.close(a);
      },
      cwd: () => I.pc,
      chdir(a) {
        a = N(a, { ub: !0 });
        if (null === a.node) throw new I.Ya(44);
        if (!K(a.node.mode)) throw new I.Ya(54);
        var b = sb(a.node, 'x');
        if (b) throw new I.Ya(b);
        I.pc = a.path;
      },
      Id() {
        I.bc = !1;
        for (var a of I.streams) a && I.close(a);
      },
      zd(a, b) {
        try {
          var c = N(a, { ub: !b });
          a = c.path;
        } catch (f) {}
        var d = !1,
          e = null;
        try {
          ((c = N(a, { parent: !0 })), Qa(a), (c = N(a, { ub: !b })), (d = !0), (e = c.node));
        } catch (f) {}
        return d ? e : null;
      },
      vd(a, b) {
        a = 'string' == typeof a ? a : qb(a);
        for (b = b.split('/').reverse(); b.length; ) {
          var c = b.pop();
          if (c) {
            var d = Oa(a + '/' + c);
            try {
              I.mkdir(d);
            } catch (e) {
              if (20 != e.nb) throw e;
            }
            a = d;
          }
        }
        return d;
      },
      Ib(a, b, c, d) {
        a = Ra('string' == typeof a ? a : qb(a), b);
        b = jb(!!c, !!d);
        var e;
        (e = I.Ib).hc ?? (e.hc = 64);
        e = I.Jb(I.Ib.hc++, 0);
        eb(e, {
          open(f) {
            f.seekable = !1;
          },
          close() {
            d?.buffer?.length && d(10);
          },
          read(f, h, k, m) {
            for (var l = 0, n = 0; n < m; n++) {
              try {
                var r = c();
              } catch (q) {
                throw new I.Ya(29);
              }
              if (void 0 === r && 0 === l) throw new I.Ya(6);
              if (null === r || void 0 === r) break;
              l++;
              h[k + n] = r;
            }
            l && (f.node.atime = Date.now());
            return l;
          },
          write(f, h, k, m) {
            for (var l = 0; l < m; l++)
              try {
                d(h[k + l]);
              } catch (n) {
                throw new I.Ya(29);
              }
            m && (f.node.mtime = f.node.ctime = Date.now());
            return l;
          },
        });
        return Db(a, b, e);
      },
      ud(a, b, c, d, e) {
        class f {
          Zb = !1;
          Ab = [];
          Pb = void 0;
          mc = 0;
          lc = 0;
          get(l) {
            if (!(l > this.length - 1 || 0 > l)) {
              var n = l % this.chunkSize;
              return this.Pb((l / this.chunkSize) | 0)[n];
            }
          }
          Gc(l) {
            this.Pb = l;
          }
          nc() {
            var l = new XMLHttpRequest();
            l.open('HEAD', c, !1);
            l.send(null);
            (200 <= l.status && 300 > l.status) ||
              304 === l.status ||
              H("Couldn't load " + c + '. Status: ' + l.status);
            var n = Number(l.getResponseHeader('Content-length')),
              r,
              q = (r = l.getResponseHeader('Accept-Ranges')) && 'bytes' === r;
            l = (r = l.getResponseHeader('Content-Encoding')) && 'gzip' === r;
            var t = 1048576;
            q || (t = n);
            var v = this;
            v.Gc((x) => {
              var B = x * t,
                A = (x + 1) * t - 1;
              A = Math.min(A, n - 1);
              if ('undefined' == typeof v.Ab[x]) {
                var z = v.Ab;
                B > A && H('invalid range (' + B + ', ' + A + ') or no bytes requested!');
                A > n - 1 && H('only ' + n + ' bytes available! programmer error!');
                var C = new XMLHttpRequest();
                C.open('GET', c, !1);
                n !== t && C.setRequestHeader('Range', 'bytes=' + B + '-' + A);
                C.responseType = 'arraybuffer';
                C.overrideMimeType && C.overrideMimeType('text/plain; charset=x-user-defined');
                C.send(null);
                (200 <= C.status && 300 > C.status) ||
                  304 === C.status ||
                  H("Couldn't load " + c + '. Status: ' + C.status);
                B = void 0 !== C.response ? new Uint8Array(C.response || []) : bb(C.responseText || '');
                z[x] = B;
              }
              'undefined' == typeof v.Ab[x] && H('doXHR failed!');
              return v.Ab[x];
            });
            if (l || !n)
              ((t = n = 1),
                (t = n = this.Pb(0).length),
                ma('LazyFiles on gzip forces download of the whole file when length is accessed'));
            this.mc = n;
            this.lc = t;
            this.Zb = !0;
          }
          get length() {
            this.Zb || this.nc();
            return this.mc;
          }
          get chunkSize() {
            this.Zb || this.nc();
            return this.lc;
          }
        }
        if (globalThis.XMLHttpRequest) {
          ba ||
            H(
              'Cannot do synchronous binary XHRs outside webworkers in modern browsers. Use --embed-file or --preload-file in emcc',
            );
          var h = new f();
          var k = void 0;
        } else ((k = c), (h = void 0));
        var m = Ib(a, b, d, e);
        h ? (m.eb = h) : k && ((m.eb = null), (m.url = k));
        Object.defineProperties(m, {
          mb: {
            get: function () {
              return this.eb.length;
            },
          },
        });
        a = {};
        for (const [l, n] of Object.entries(m.cb))
          a[l] = (...r) => {
            Jb(m);
            return n(...r);
          };
        a.read = (l, n, r, q, t) => {
          Jb(m);
          l = l.node.eb;
          if (t >= l.length) n = 0;
          else {
            q = Math.min(l.length - t, q);
            if (l.slice) for (var v = 0; v < q; v++) n[r + v] = l[t + v];
            else for (v = 0; v < q; v++) n[r + v] = l.get(t + v);
            n = q;
          }
          return n;
        };
        a.Lb = () => {
          Jb(m);
          H();
          throw new I.Ya(48);
        };
        m.cb = a;
        return m;
      },
    },
    P = (a, b, c) => ((a >>>= 0) ? Ya(w, a, b, c) : '');
  function Kb(a, b, c) {
    if ('/' === b.charAt(0)) return b;
    a = -100 === a ? I.cwd() : O(a).path;
    if (0 == b.length) {
      if (!c) throw new I.Ya(44);
      return a;
    }
    return a + '/' + b;
  }
  function Lb(a, b) {
    E[(a >>> 2) >>> 0] = b.dev;
    E[((a + 4) >>> 2) >>> 0] = b.mode;
    E[((a + 8) >>> 2) >>> 0] = b.nlink;
    E[((a + 12) >>> 2) >>> 0] = b.uid;
    E[((a + 16) >>> 2) >>> 0] = b.gid;
    E[((a + 20) >>> 2) >>> 0] = b.rdev;
    F[((a + 24) >>> 3) >>> 0] = BigInt(b.size);
    D[((a + 32) >>> 2) >>> 0] = 4096;
    D[((a + 36) >>> 2) >>> 0] = b.blocks;
    var c = b.atime.getTime(),
      d = b.mtime.getTime(),
      e = b.ctime.getTime();
    F[((a + 40) >>> 3) >>> 0] = BigInt(Math.floor(c / 1e3));
    E[((a + 48) >>> 2) >>> 0] = (c % 1e3) * 1e6;
    F[((a + 56) >>> 3) >>> 0] = BigInt(Math.floor(d / 1e3));
    E[((a + 64) >>> 2) >>> 0] = (d % 1e3) * 1e6;
    F[((a + 72) >>> 3) >>> 0] = BigInt(Math.floor(e / 1e3));
    E[((a + 80) >>> 2) >>> 0] = (e % 1e3) * 1e6;
    F[((a + 88) >>> 3) >>> 0] = BigInt(b.ino);
    return 0;
  }
  var Mb = void 0,
    Q = () => {
      var a = D[(+Mb >>> 2) >>> 0];
      Mb += 4;
      return a;
    },
    Nb = {},
    Ob = (a) => {
      for (; a.length; ) {
        var b = a.pop();
        a.pop()(b);
      }
    };
  function Pb(a) {
    return this.fb(E[(a >>> 2) >>> 0]);
  }
  var Qb = {},
    R = {},
    Rb = {},
    Sb = class extends Error {
      constructor(a) {
        super(a);
        this.name = 'InternalError';
      }
    },
    T = (a, b, c) => {
      function d(k) {
        k = c(k);
        if (k.length !== a.length) throw new Sb('Mismatched type converter count');
        for (var m = 0; m < a.length; ++m) S(a[m], k[m]);
      }
      a.forEach((k) => (Rb[k] = b));
      var e = Array(b.length),
        f = [],
        h = 0;
      for (let [k, m] of b.entries())
        R.hasOwnProperty(m)
          ? (e[k] = R[m])
          : (f.push(m),
            Qb.hasOwnProperty(m) || (Qb[m] = []),
            Qb[m].push(() => {
              e[k] = R[m];
              ++h;
              h === f.length && d(e);
            }));
      0 === f.length && d(e);
    },
    U = (a) => {
      a >>>= 0;
      for (var b = ''; ; ) {
        var c = w[a++ >>> 0];
        if (!c) return b;
        b += String.fromCharCode(c);
      }
    },
    V = class extends Error {
      constructor(a) {
        super(a);
        this.name = 'BindingError';
      }
    },
    Tb = (a) => {
      throw new V(a);
    };
  function Ub(a, b, c = {}) {
    var d = b.name;
    if (!a) throw new V(`type "${d}" must have a positive integer typeid pointer`);
    if (R.hasOwnProperty(a)) {
      if (c.Tc) return;
      throw new V(`Cannot register type '${d}' twice`);
    }
    R[a] = b;
    delete Rb[a];
    Qb.hasOwnProperty(a) && ((b = Qb[a]), delete Qb[a], b.forEach((e) => e()));
  }
  function S(a, b, c = {}) {
    return Ub(a, b, c);
  }
  var Vb = (a, b, c) => {
      switch (b) {
        case 1:
          return c ? (d) => u[d >>> 0] : (d) => w[d >>> 0];
        case 2:
          return c ? (d) => y[(d >>> 1) >>> 0] : (d) => sa[(d >>> 1) >>> 0];
        case 4:
          return c ? (d) => D[(d >>> 2) >>> 0] : (d) => E[(d >>> 2) >>> 0];
        case 8:
          return c ? (d) => F[(d >>> 3) >>> 0] : (d) => va[(d >>> 3) >>> 0];
        default:
          throw new TypeError(`invalid integer width (${b}): ${a}`);
      }
    },
    Wb = (a) => {
      throw new V(a.Za.ib.ab.name + ' instance already deleted');
    },
    Xb = !1,
    Yb = () => {},
    Zb = (a) => {
      if (!globalThis.FinalizationRegistry) return ((Zb = (b) => b), a);
      Xb = new FinalizationRegistry((b) => {
        b = b.Za;
        --b.count.value;
        0 === b.count.value && (b.pb ? b.tb.zb(b.pb) : b.ib.ab.zb(b.gb));
      });
      Zb = (b) => {
        var c = b.Za;
        c.pb && Xb.register(b, { Za: c }, b);
        return b;
      };
      Yb = (b) => {
        Xb.unregister(b);
      };
      return Zb(a);
    },
    $b = [];
  function ac() {}
  var bc = (a, b) => Object.defineProperty(b, 'name', { value: a }),
    cc = {},
    dc = (a, b, c) => {
      if (void 0 === a[b].bb) {
        var d = a[b];
        a[b] = function (...e) {
          if (!a[b].bb.hasOwnProperty(e.length)) {
            var f = -1,
              h;
            for (h in a[b].bb) {
              var k = +h;
              k > e.length && (0 > f || k < f) && (f = k);
            }
            if (0 <= f) for (; e.length < f; ) e.push(void 0);
          }
          if (!a[b].bb.hasOwnProperty(e.length))
            throw new V(
              `Function '${c}' called with an invalid number of arguments (${e.length}) - expects one of (${a[b].bb})!`,
            );
          return a[b].bb[e.length].apply(this, e);
        };
        a[b].bb = [];
        a[b].bb[d.Bb] = d;
      }
    },
    ec = (a, b) => {
      var c = '';
      b.some((d) =>
        d.length !== a.length
          ? !1
          : d.every((e, f) => {
                var h = R[e];
                return (void 0 !== h && !0 === h.optional) ||
                  'emscripten::val' === e ||
                  ('bigint' === typeof a[f] && 'number' === e) ||
                  ('object' === typeof a[f] && void 0 !== h && void 0 !== h.ab && a[f] instanceof h.ab.constructor) ||
                  typeof a[f] === e ||
                  ('number' === typeof e &&
                    void 0 !== h &&
                    ((e = h.name),
                    (('std::string' === e || 'std::wstring' === e) && 'string' === typeof a[f]) ||
                      ('bool' === e && 'boolean' === typeof a[f]) ||
                      ('number' === typeof a[f] &&
                        ('char' === e ||
                          'signed char' === e ||
                          'unsigned char' === e ||
                          'short' === e ||
                          'unsigned short' === e ||
                          'int' === e ||
                          'unsigned int' === e ||
                          'long' === e ||
                          'unsigned long' === e ||
                          'float' === e ||
                          'double' === e ||
                          'int64_t' === e ||
                          'uint64_t' === e)) ||
                      ('string' === h.valueType && 'string' === typeof a[f]) ||
                      ('number' === h.valueType && 'number' === typeof a[f])))
                  ? !0
                  : !1;
              })
            ? ((c = d.join(', ')), !0)
            : !1,
      );
      return c;
    },
    fc = (a, b, c, d) => {
      dc(a, b, c);
      if (void 0 !== a[b].bb && void 0 !== a[b].bb[d] && void 0 === a[b].bb[d].kb) {
        var e = a[b].bb[d];
        a[b].bb[d] = function (...f) {
          var h = ec(f, a[b].bb[f.length].Gb);
          if (!a[b].bb[f.length].kb.hasOwnProperty(h))
            throw (
              (h = a[b].bb[f.length].Gb.map((k) => '(' + k.map((m) => ('string' === typeof m ? m : R[m].name)) + ')')),
              (f = f.map((k) =>
                'object' === typeof k && k.constructor && k.constructor.name ? k.constructor.name : typeof k,
              )),
              new V(`Function '${c}' called with an invalid signature (${f}) - expects one of (${h})!`)
            );
          return a[b].bb[f.length].kb[h].apply(this, f);
        };
        a[b].bb[d].kb = {};
        a[b].bb[d].kb[e.Fb] = e;
        a[b].bb[d].Gb = [];
        e.Mb && a[b].bb[d].Gb.push(e.Mb);
      }
    },
    gc = (a, b) => {
      if (g.hasOwnProperty(a)) throw new V(`Cannot register public name '${a}' twice`);
      g[a] = b;
    },
    hc = (a) => {
      a = a.replace(/[^a-zA-Z0-9_]/g, '$');
      var b = a.charCodeAt(0);
      return 48 <= b && 57 >= b ? `_${a}` : a;
    };
  function ic(a, b, c, d, e, f, h, k) {
    this.name = a;
    this.constructor = b;
    this.Hb = c;
    this.zb = d;
    this.qb = e;
    this.Nc = f;
    this.Tb = h;
    this.Jc = k;
    this.bd = [];
  }
  var jc = (a, b, c) => {
      for (; b !== c; ) {
        if (!b.Tb) throw new V(`Expected null or instance of ${c.name}, got an instance of ${b.name}`);
        a = b.Tb(a);
        b = b.qb;
      }
      return a;
    },
    kc = (a) => {
      if (null === a) return 'null';
      var b = typeof a;
      return 'object' === b || 'array' === b || 'function' === b ? a.toString() : '' + a;
    };
  function lc(a, b) {
    if (null === b) {
      if (this.dc) throw new V(`null is not a valid ${this.name}`);
      return 0;
    }
    if (!b.Za) throw new V(`Cannot pass "${kc(b)}" as a ${this.name}`);
    if (!b.Za.gb) throw new V(`Cannot pass deleted object as a pointer of type ${this.name}`);
    return jc(b.Za.gb, b.Za.ib.ab, this.ab);
  }
  function mc(a, b) {
    if (null === b) {
      if (this.dc) throw new V(`null is not a valid ${this.name}`);
      if (this.Xb) {
        var c = this.kc();
        null !== a && a.push(this.zb, c);
        return c;
      }
      return 0;
    }
    if (!b || !b.Za) throw new V(`Cannot pass "${kc(b)}" as a ${this.name}`);
    if (!b.Za.gb) throw new V(`Cannot pass deleted object as a pointer of type ${this.name}`);
    if (!this.Wb && b.Za.ib.Wb)
      throw new V(
        `Cannot convert argument of type ${b.Za.tb ? b.Za.tb.name : b.Za.ib.name} to parameter type ${this.name}`,
      );
    c = jc(b.Za.gb, b.Za.ib.ab, this.ab);
    if (this.Xb) {
      if (void 0 === b.Za.pb) throw new V('Passing raw pointer to smart pointer is illegal');
      switch (this.hd) {
        case 0:
          if (b.Za.tb === this) c = b.Za.pb;
          else
            throw new V(
              `Cannot convert argument of type ${b.Za.tb ? b.Za.tb.name : b.Za.ib.name} to parameter type ${this.name}`,
            );
          break;
        case 1:
          c = b.Za.pb;
          break;
        case 2:
          if (b.Za.tb === this) c = b.Za.pb;
          else {
            var d = b.clone();
            c = this.cd(
              c,
              W(() => d['delete']()),
            );
            null !== a && a.push(this.zb, c);
          }
          break;
        default:
          throw new V('Unsupported sharing policy');
      }
    }
    return c;
  }
  function nc(a, b) {
    if (null === b) {
      if (this.dc) throw new V(`null is not a valid ${this.name}`);
      return 0;
    }
    if (!b.Za) throw new V(`Cannot pass "${kc(b)}" as a ${this.name}`);
    if (!b.Za.gb) throw new V(`Cannot pass deleted object as a pointer of type ${this.name}`);
    if (b.Za.ib.Wb) throw new V(`Cannot convert argument of type ${b.Za.ib.name} to parameter type ${this.name}`);
    return jc(b.Za.gb, b.Za.ib.ab, this.ab);
  }
  var oc = (a, b, c) => {
      if (b === c) return a;
      if (void 0 === c.qb) return null;
      a = oc(a, b, c.qb);
      return null === a ? null : c.Jc(a);
    },
    pc = {},
    qc = (a, b) => {
      if (void 0 === b) throw new V('ptr should not be undefined');
      for (; a.qb; ) ((b = a.Tb(b)), (a = a.qb));
      return pc[b];
    },
    rc = (a, b) => {
      if (!b.ib || !b.gb) throw new Sb('makeClassHandle requires ptr and ptrType');
      if (!!b.tb !== !!b.pb) throw new Sb('Both smartPtrType and smartPtr must be specified');
      b.count = { value: 1 };
      return Zb(Object.create(a, { Za: { value: b, writable: !0 } }));
    };
  function sc(a, b, c, d, e, f, h, k, m, l, n) {
    this.name = a;
    this.ab = b;
    this.dc = c;
    this.Wb = d;
    this.Xb = e;
    this.ad = f;
    this.hd = h;
    this.yc = k;
    this.kc = m;
    this.cd = l;
    this.zb = n;
    e || void 0 !== b.qb ? (this.lb = mc) : ((this.lb = d ? lc : nc), (this.ob = null));
  }
  var tc = (a, b) => {
      if (!g.hasOwnProperty(a)) throw new Sb('Replacing nonexistent public symbol');
      g[a] = b;
      g[a].Bb = void 0;
      g[a].Fb = void 0;
      g[a].Mb = void 0;
    },
    uc = (a, b, c = []) => {
      b = Ma(b)(...c);
      return 'p' == a[0] ? b >>> 0 : b;
    },
    vc =
      (a, b) =>
      (...c) =>
        uc(a, b, c),
    X = (a, b) => {
      a = U(a);
      var c = a.includes('p') ? vc(a, b) : Ma(b);
      if ('function' != typeof c) throw new V(`unknown function pointer with signature ${a}: ${b}`);
      return c;
    };
  class wc extends Error {}
  var yc = (a) => {
      a = xc(a);
      var b = U(a);
      Y(a);
      return b;
    },
    zc = (a, b) => {
      function c(f) {
        e[f] || R[f] || (Rb[f] ? Rb[f].forEach(c) : (d.push(f), (e[f] = !0)));
      }
      var d = [],
        e = {};
      b.forEach(c);
      throw new wc(`${a}: ` + d.map(yc).join([', ']));
    };
  function Ac(a) {
    for (var b = 1; b < a.length; ++b) if (null !== a[b] && void 0 === a[b].ob) return !0;
    return !1;
  }
  function Bc(a, b, c, d, e, f) {
    var h = b.length;
    if (2 > h) throw new V("argTypes array size mismatch! Must at least get return value and 'this' types!");
    var k = null !== b[1] && null !== c,
      m = Ac(b);
    c = !b[0].wc;
    var l = b[0],
      n = b[1];
    d = [a, Tb, d, e, Ob, l.fb.bind(l), n?.lb.bind(n)];
    for (e = 2; e < h; ++e) ((l = b[e]), d.push(l.lb.bind(l)));
    if (!m) for (e = k ? 1 : 2; e < b.length; ++e) null !== b[e].ob && d.push(b[e].ob);
    m = Ac(b);
    e = b.length - 2;
    n = [];
    l = ['fn'];
    k && l.push('thisWired');
    for (h = 0; h < e; ++h) (n.push(`arg${h}`), l.push(`arg${h}Wired`));
    n = n.join(',');
    l = l.join(',');
    n = `return function (${n}) {\n`;
    m && (n += 'var destructors = [];\n');
    var r = m ? 'destructors' : 'null',
      q = 'humanName throwBindingError invoker fn runDestructors fromRetWire toClassParamWire'.split(' ');
    k && (n += `var thisWired = toClassParamWire(${r}, this);\n`);
    for (h = 0; h < e; ++h) {
      var t = `toArg${h}Wire`;
      n += `var arg${h}Wired = ${t}(${r}, arg${h});\n`;
      q.push(t);
    }
    n += (c || f ? 'var rv = ' : '') + `invoker(${l});\n`;
    if (m) n += 'runDestructors(destructors);\n';
    else
      for (h = k ? 1 : 2; h < b.length; ++h)
        ((f = 1 === h ? 'thisWired' : 'arg' + (h - 2) + 'Wired'),
          null !== b[h].ob && ((n += `${f}_dtor(${f});\n`), q.push(`${f}_dtor`)));
    c && (n += 'var ret = fromRetWire(rv);\nreturn ret;\n');
    b = new Function(q, n + '}\n')(...d);
    return bc(a, b);
  }
  var Cc = (a, b) => {
      for (var c = [], d = 0; d < a; d++) c.push(E[((b + 4 * d) >>> 2) >>> 0]);
      return c;
    },
    Dc = (a) => {
      a = a.trim();
      const b = a.indexOf('(');
      return -1 === b ? a : a.slice(0, b);
    },
    Ec = (a) => {
      var b = R[a];
      return 'emscripten::val' === b.name
        ? 'emscripten::val'
        : 'std::string' === b.name || 'std::wstring' === b.name
          ? 'string'
          : 'bool' === b.name
            ? 'boolean'
            : 'char;signed char;unsigned char;short;unsigned short;int;unsigned int;long;unsigned long;float;double;int64_t;uint64_t'
                  .split(';')
                  .includes(b.name)
              ? 'number'
              : 'string' === b.valueType
                ? 'string'
                : 'number' === b.valueType
                  ? 'number'
                  : a;
    },
    Fc = (a, b, c) => {
      if (!(a instanceof Object)) throw new V(`${c} with invalid "this": ${a}`);
      if (!(a instanceof b.ab.constructor)) throw new V(`${c} incompatible with "this" of type ${a.constructor.name}`);
      if (!a.Za.gb) throw new V(`cannot call emscripten binding method ${c} on deleted object`);
      return jc(a.Za.gb, a.Za.ib.ab, b.ab);
    },
    Gc = [],
    Hc = [0, 1, , 1, null, 1, !0, 1, !1, 1];
  function Ic(a) {
    a >>>= 0;
    9 < a && 0 === --Hc[a + 1] && ((Hc[a] = void 0), Gc.push(a));
  }
  var Z = (a) => {
      if (!a) throw new V(`Cannot use deleted val. handle = ${a}`);
      return Hc[a];
    },
    W = (a) => {
      switch (a) {
        case void 0:
          return 2;
        case null:
          return 4;
        case !0:
          return 6;
        case !1:
          return 8;
        default:
          const b = Gc.pop() || Hc.length;
          Hc[b] = a;
          Hc[b + 1] = 1;
          return b;
      }
    },
    Kc = {
      name: 'emscripten::val',
      fb: (a) => {
        var b = Z(a);
        Ic(a);
        return b;
      },
      lb: (a, b) => W(b),
      sb: Pb,
      ob: null,
    },
    Lc = (a, b, c) => {
      switch (b) {
        case 1:
          return c
            ? function (d) {
                return this.fb(u[d >>> 0]);
              }
            : function (d) {
                return this.fb(w[d >>> 0]);
              };
        case 2:
          return c
            ? function (d) {
                return this.fb(y[(d >>> 1) >>> 0]);
              }
            : function (d) {
                return this.fb(sa[(d >>> 1) >>> 0]);
              };
        case 4:
          return c
            ? function (d) {
                return this.fb(D[(d >>> 2) >>> 0]);
              }
            : function (d) {
                return this.fb(E[(d >>> 2) >>> 0]);
              };
        default:
          throw new TypeError(`invalid integer width (${b}): ${a}`);
      }
    },
    Mc = (a, b) => {
      var c = R[a];
      if (void 0 === c) throw ((a = `${b} has unknown type ${yc(a)}`), new V(a));
      return c;
    },
    Nc = (a, b) => {
      switch (b) {
        case 4:
          return function (c) {
            return this.fb(ta[(c >>> 2) >>> 0]);
          };
        case 8:
          return function (c) {
            return this.fb(ua[(c >>> 3) >>> 0]);
          };
        default:
          throw new TypeError(`invalid float width (${b}): ${a}`);
      }
    },
    Oc = Object.assign({ optional: !0 }, Kc),
    Pc = globalThis.TextDecoder ? new TextDecoder('utf-16le') : void 0,
    Qc = (a, b, c) => {
      a >>>= 1;
      b = Xa(sa, a, b / 2, c);
      if (16 < b - a && Pc) return Pc.decode(sa.subarray(a >>> 0, b >>> 0));
      for (c = ''; a < b; ++a) c += String.fromCharCode(sa[a >>> 0]);
      return c;
    },
    Rc = (a, b, c) => {
      c ??= 2147483647;
      if (2 > c) return 0;
      c -= 2;
      var d = b;
      c = c < 2 * a.length ? c / 2 : a.length;
      for (var e = 0; e < c; ++e) ((y[(b >>> 1) >>> 0] = a.charCodeAt(e)), (b += 2));
      y[(b >>> 1) >>> 0] = 0;
      return b - d;
    },
    Sc = (a) => 2 * a.length,
    Tc = (a, b, c) => {
      var d = '';
      a >>>= 2;
      for (var e = 0; !(e >= b / 4); e++) {
        var f = E[(a + e) >>> 0];
        if (!f && !c) break;
        d += String.fromCodePoint(f);
      }
      return d;
    },
    Uc = (a, b, c) => {
      b >>>= 0;
      c ??= 2147483647;
      if (4 > c) return 0;
      var d = b;
      c = d + c - 4;
      for (var e = 0; e < a.length; ++e) {
        var f = a.codePointAt(e);
        65535 < f && e++;
        D[(b >>> 2) >>> 0] = f;
        b += 4;
        if (b + 4 > c) break;
      }
      D[(b >>> 2) >>> 0] = 0;
      return b - d;
    },
    Vc = (a) => {
      for (var b = 0, c = 0; c < a.length; ++c) (65535 < a.codePointAt(c) && c++, (b += 4));
      return b;
    },
    Wc = (a) => {
      a = a.split('.');
      for (var b = 0; 4 > b; b++) {
        var c = Number(a[b]);
        if (isNaN(c)) return null;
        a[b] = c;
      }
      return (a[0] | (a[1] << 8) | (a[2] << 16) | (a[3] << 24)) >>> 0;
    },
    Yc = (a) => {
      var b,
        c,
        d = [];
      if (
        !/^((?=.*::)(?!.*::.+::)(::)?([\dA-F]{1,4}:(:|\b)|){5}|([\dA-F]{1,4}:){6})((([\dA-F]{1,4}((?!\3)::|:\b|$))|(?!\2\3)){2}|(((2[0-4]|1\d|[1-9])?\d|25[0-5])\.?\b){4})$/i.test(
          a,
        )
      )
        return null;
      if ('::' === a) return [0, 0, 0, 0, 0, 0, 0, 0];
      a = a.startsWith('::') ? a.replace('::', 'Z:') : a.replace('::', ':Z:');
      0 < a.indexOf('.')
        ? ((a = a.replace(RegExp('[.]', 'g'), ':')),
          (a = a.split(':')),
          (a[a.length - 4] = Number(a[a.length - 4]) + 256 * Number(a[a.length - 3])),
          (a[a.length - 3] = Number(a[a.length - 2]) + 256 * Number(a[a.length - 1])),
          (a = a.slice(0, a.length - 2)))
        : (a = a.split(':'));
      for (b = c = 0; b < a.length; b++)
        if ('string' == typeof a[b])
          if ('Z' === a[b]) {
            for (c = 0; c < 8 - a.length + 1; c++) d[b + c] = 0;
            --c;
          } else d[b + c] = Xc(parseInt(a[b], 16));
        else d[b + c] = a[b];
      return [(d[1] << 16) | d[0], (d[3] << 16) | d[2], (d[5] << 16) | d[4], (d[7] << 16) | d[6]];
    },
    Zc = 1,
    $c = {},
    ad = 0,
    bd = [],
    cd = (a) => {
      var b = bd.length;
      bd.push(a);
      return b;
    },
    dd = (a, b) => {
      for (var c = Array(a), d = 0; d < a; ++d) c[d] = Mc(E[((b + 4 * d) >>> 2) >>> 0], `parameter ${d}`);
      return c;
    },
    ed = (a, b, c) => {
      var d = [];
      a = a(d, c);
      d.length && (E[(b >>> 2) >>> 0] = W(d));
      return a;
    },
    fd = {},
    gd = (a) => {
      var b = fd[a];
      return void 0 === b ? U(a) : b;
    },
    hd = [0, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335],
    jd = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334],
    kd = {},
    ld = (a) => {
      pa = a;
      Ja || 0 < ad || (g.onExit?.(a), (oa = !0));
      ea(a, new Ea(a));
    },
    md = (a) => {
      if (!oa)
        try {
          a();
        } catch (b) {
          b instanceof Ea || 'unwind' == b || ea(1, b);
        } finally {
          if (!(Ja || 0 < ad))
            try {
              ((pa = a = pa), ld(a));
            } catch (b) {
              b instanceof Ea || 'unwind' == b || ea(1, b);
            }
        }
    },
    nd = {},
    pd = () => {
      if (!od) {
        var a = {
            USER: 'web_user',
            LOGNAME: 'web_user',
            PATH: '/',
            PWD: '/',
            HOME: '/home/web_user',
            LANG: (globalThis.navigator?.language ?? 'C').replace('-', '_') + '.UTF-8',
            _: da || './this.program',
          },
          b;
        for (b in nd) void 0 === nd[b] ? delete a[b] : (a[b] = nd[b]);
        var c = [];
        for (b in a) c.push(`${b}=${a[b]}`);
        od = c;
      }
      return od;
    },
    od,
    sd = (a) => {
      a = a.getArg(qd, 0);
      return rd(a);
    };
  I.wd = (a, b, c, d, e, f, h, k, m, l) => {
    rb(a, b, c, d, e, k, m, l).then(f).catch(h);
  };
  I.Hd = rb;
  I.Db = Array(4096);
  I.jb(J, {}, '/');
  I.mkdir('/tmp');
  I.mkdir('/home');
  I.mkdir('/home/web_user');
  (function () {
    I.mkdir('/dev');
    eb(I.Jb(1, 3), { read: () => 0, write: (d, e, f, h) => h, rb: () => 0 });
    Db('/dev/null', I.Jb(1, 3));
    db(I.Jb(5, 0), gb);
    db(I.Jb(6, 0), hb);
    Db('/dev/tty', I.Jb(5, 0));
    Db('/dev/tty1', I.Jb(6, 0));
    var a = new Uint8Array(1024),
      b = 0,
      c = () => {
        0 === b && (Ta(a), (b = a.byteLength));
        return a[--b];
      };
    I.Ib('/dev', 'random', c);
    I.Ib('/dev', 'urandom', c);
    I.mkdir('/dev/shm');
    I.mkdir('/dev/shm/tmp');
  })();
  (function () {
    I.mkdir('/proc');
    var a = I.mkdir('/proc/self');
    I.mkdir('/proc/self/fd');
    I.jb(
      {
        jb() {
          var b = I.createNode(a, 'fd', 16895, 73);
          b.cb = { rb: J.cb.rb };
          b.$a = {
            lookup(c, d) {
              c = +d;
              var e = O(c);
              c = { parent: null, jb: { xc: 'fake' }, $a: { readlink: () => e.path }, id: c + 1 };
              return (c.parent = c);
            },
            readdir() {
              return Array.from(I.streams.entries())
                .filter(([, c]) => c)
                .map(([c]) => c.toString());
            },
          };
          return b;
        },
      },
      {},
      '/proc/self/fd',
    );
  })();
  I.Mc = { MEMFS: J };
  (() => {
    let a = ac.prototype;
    Object.assign(a, {
      isAliasOf: function (c) {
        if (!(this instanceof ac && c instanceof ac)) return !1;
        var d = this.Za.ib.ab,
          e = this.Za.gb;
        c.Za = c.Za;
        var f = c.Za.ib.ab;
        for (c = c.Za.gb; d.qb; ) ((e = d.Tb(e)), (d = d.qb));
        for (; f.qb; ) ((c = f.Tb(c)), (f = f.qb));
        return d === f && e === c;
      },
      clone: function () {
        this.Za.gb || Wb(this);
        if (this.Za.Sb) return ((this.Za.count.value += 1), this);
        var c = Zb,
          d = Object,
          e = d.create,
          f = Object.getPrototypeOf(this),
          h = this.Za;
        c = c(
          e.call(d, f, {
            Za: { value: { count: h.count, Nb: h.Nb, Sb: h.Sb, gb: h.gb, ib: h.ib, pb: h.pb, tb: h.tb } },
          }),
        );
        c.Za.count.value += 1;
        c.Za.Nb = !1;
        return c;
      },
      ['delete']() {
        this.Za.gb || Wb(this);
        if (this.Za.Nb && !this.Za.Sb) throw new V('Object already scheduled for deletion');
        Yb(this);
        var c = this.Za;
        --c.count.value;
        0 === c.count.value && (c.pb ? c.tb.zb(c.pb) : c.ib.ab.zb(c.gb));
        this.Za.Sb || ((this.Za.pb = void 0), (this.Za.gb = void 0));
      },
      isDeleted: function () {
        return !this.Za.gb;
      },
      deleteLater: function () {
        this.Za.gb || Wb(this);
        if (this.Za.Nb && !this.Za.Sb) throw new V('Object already scheduled for deletion');
        $b.push(this);
        this.Za.Nb = !0;
        return this;
      },
    });
    const b = Symbol.dispose;
    b && (a[b] = a['delete']);
  })();
  Object.assign(sc.prototype, {
    Pc(a) {
      this.yc && (a = this.yc(a));
      return a;
    },
    qc(a) {
      this.zb?.(a);
    },
    sb: Pb,
    fb: function (a) {
      function b() {
        return this.Xb ? rc(this.ab.Hb, { ib: this.ad, gb: c, tb: this, pb: a }) : rc(this.ab.Hb, { ib: this, gb: a });
      }
      var c = this.Pc(a);
      if (!c) return (this.qc(a), null);
      var d = qc(this.ab, c);
      if (void 0 !== d) {
        if (0 === d.Za.count.value) return ((d.Za.gb = c), (d.Za.pb = a), d.clone());
        d = d.clone();
        this.qc(a);
        return d;
      }
      d = this.ab.Nc(c);
      d = cc[d];
      if (!d) return b.call(this);
      d = this.Wb ? d.Ic : d.pointerType;
      var e = oc(c, this.ab, d.ab);
      return null === e
        ? b.call(this)
        : this.Xb
          ? rc(d.ab.Hb, { ib: d, gb: e, tb: this, pb: a })
          : rc(d.ab.Hb, { ib: d, gb: e });
    },
  });
  g.noExitRuntime && (Ja = g.noExitRuntime);
  g.preloadPlugins && (nb = g.preloadPlugins);
  g.print && (ma = g.print);
  g.printErr && (p = g.printErr);
  g.wasmBinary && (na = g.wasmBinary);
  g.thisProgram && (da = g.thisProgram);
  if (g.preInit)
    for ('function' == typeof g.preInit && (g.preInit = [g.preInit]); 0 < g.preInit.length; ) g.preInit.shift()();
  g.FS = I;
  g.incrementExceptionRefcount = (a) => {
    a = sd(a);
    td(a);
  };
  g.decrementExceptionRefcount = (a) => {
    a = sd(a);
    ud(a);
  };
  g.getExceptionMessage = (a) => {
    var b = sd(a);
    a = vd();
    var c = wd(4),
      d = wd(4);
    xd(b, c, d);
    b = E[(c >>> 2) >>> 0];
    d = E[(d >>> 2) >>> 0];
    c = P(b);
    Y(b);
    if (d) {
      var e = P(d);
      Y(d);
    }
    yd(a);
    return [c, e];
  };
  var xc,
    zd,
    Y,
    Xc,
    Ad,
    za,
    yd,
    wd,
    vd,
    ud,
    td,
    rd,
    xd,
    qd,
    ya,
    La,
    Bd = {
      S: function (a, b) {
        return Ma(a >>> 0)(b);
      },
      da: function (a, b) {
        a >>>= 0;
        try {
          return ((a = P(a)), I.chmod(a, b), 0);
        } catch (c) {
          if ('undefined' == typeof I || 'ErrnoError' !== c.name) throw c;
          return -c.nb;
        }
      },
      F: function (a, b, c) {
        Mb = c >>> 0;
        try {
          var d = O(a);
          switch (b) {
            case 0:
              var e = Q();
              if (0 > e) break;
              for (; I.streams[e]; ) e++;
              return zb(d, e).fd;
            case 1:
            case 2:
              return 0;
            case 3:
              return d.flags;
            case 4:
              return ((e = Q()), (d.flags |= e), 0);
            case 12:
              return ((e = Q()), (y[((e + 0) >>> 1) >>> 0] = 2), 0);
            case 13:
            case 14:
              return 0;
          }
          return -28;
        } catch (f) {
          if ('undefined' == typeof I || 'ErrnoError' !== f.name) throw f;
          return -f.nb;
        }
      },
      ba: function (a, b) {
        try {
          return Lb(b >>> 0, I.fstat(a));
        } catch (c) {
          if ('undefined' == typeof I || 'ErrnoError' !== c.name) throw c;
          return -c.nb;
        }
      },
      ha: function (a, b, c) {
        Mb = c >>> 0;
        try {
          var d = O(a);
          switch (b) {
            case 21509:
              return d.tty ? 0 : -59;
            case 21505:
              if (!d.tty) return -59;
              if (d.tty.Eb.Uc) {
                a = [
                  3, 28, 127, 21, 4, 0, 1, 0, 17, 19, 26, 0, 18, 15, 23, 22, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                  0, 0,
                ];
                var e = Q();
                D[(e >>> 2) >>> 0] = 25856;
                D[((e + 4) >>> 2) >>> 0] = 5;
                D[((e + 8) >>> 2) >>> 0] = 191;
                D[((e + 12) >>> 2) >>> 0] = 35387;
                for (var f = 0; 32 > f; f++) u[(e + f + 17) >>> 0] = a[f] || 0;
              }
              return 0;
            case 21510:
            case 21511:
            case 21512:
              return d.tty ? 0 : -59;
            case 21506:
            case 21507:
            case 21508:
              if (!d.tty) return -59;
              if (d.tty.Eb.Vc) for (e = Q(), a = [], f = 0; 32 > f; f++) a.push(u[(e + f + 17) >>> 0]);
              return 0;
            case 21519:
              if (!d.tty) return -59;
              e = Q();
              return (D[(e >>> 2) >>> 0] = 0);
            case 21520:
              return d.tty ? -28 : -59;
            case 21537:
            case 21531:
              return ((e = Q()), I.cc(d, b, e));
            case 21523:
              if (!d.tty) return -59;
              d.tty.Eb.Wc &&
                ((f = [24, 80]), (e = Q()), (y[(e >>> 1) >>> 0] = f[0]), (y[((e + 2) >>> 1) >>> 0] = f[1]));
              return 0;
            case 21524:
              return d.tty ? 0 : -59;
            case 21515:
              return d.tty ? 0 : -59;
            default:
              return -28;
          }
        } catch (h) {
          if ('undefined' == typeof I || 'ErrnoError' !== h.name) throw h;
          return -h.nb;
        }
      },
      $: function (a, b) {
        a >>>= 0;
        b >>>= 0;
        try {
          return ((a = P(a)), Lb(b, I.lstat(a)));
        } catch (c) {
          if ('undefined' == typeof I || 'ErrnoError' !== c.name) throw c;
          return -c.nb;
        }
      },
      _: function (a, b, c, d) {
        b >>>= 0;
        c >>>= 0;
        try {
          b = P(b);
          var e = d & 256;
          b = Kb(a, b, d & 4096);
          return Lb(c, e ? I.lstat(b) : I.stat(b));
        } catch (f) {
          if ('undefined' == typeof I || 'ErrnoError' !== f.name) throw f;
          return -f.nb;
        }
      },
      I: function (a, b, c, d) {
        b >>>= 0;
        Mb = d >>>= 0;
        try {
          b = P(b);
          b = Kb(a, b);
          var e = d ? Q() : 0;
          return I.open(b, c, e).fd;
        } catch (f) {
          if ('undefined' == typeof I || 'ErrnoError' !== f.name) throw f;
          return -f.nb;
        }
      },
      aa: function (a, b) {
        a >>>= 0;
        b >>>= 0;
        try {
          return ((a = P(a)), Lb(b, I.stat(a)));
        } catch (c) {
          if ('undefined' == typeof I || 'ErrnoError' !== c.name) throw c;
          return -c.nb;
        }
      },
      V: () => H(''),
      q: function (a) {
        a >>>= 0;
        var b = Nb[a];
        delete Nb[a];
        var c = b.kc,
          d = b.zb,
          e = b.tc,
          f = e.map((h) => h.Sc).concat(e.map((h) => h.ed));
        T([a], f, (h) => {
          var k = {},
            m,
            l;
          for ([m, l] of e.entries()) {
            const n = h[m],
              r = l.Pb,
              q = l.Rc,
              t = h[m + e.length],
              v = l.dd,
              x = l.gd;
            k[l.Lc] = {
              read: (B) => n.fb(r(q, B)),
              write: (B, A) => {
                var z = [];
                v(x, B, t.lb(z, A));
                Ob(z);
              },
              optional: n.optional,
            };
          }
          return [
            {
              name: b.name,
              fb: (n) => {
                var r = {},
                  q;
                for (q in k) r[q] = k[q].read(n);
                d(n);
                return r;
              },
              lb: (n, r) => {
                for (var q in k) if (!(q in r || k[q].optional)) throw new TypeError(`Missing field: "${q}"`);
                var t = c();
                for (q in k) k[q].write(t, r[q]);
                null !== n && n.push(d, t);
                return t;
              },
              sb: Pb,
              ob: d,
            },
          ];
        });
      },
      K: function (a, b, c, d, e) {
        a >>>= 0;
        c >>>= 0;
        b = U(b >>> 0);
        d = 0n === d;
        let f = (h) => h;
        if (d) {
          const h = 8 * c;
          f = (k) => BigInt.asUintN(h, k);
          e = f(e);
        }
        S(a, {
          name: b,
          fb: f,
          lb: (h, k) => {
            'number' == typeof k && (k = BigInt(k));
            return k;
          },
          sb: Vb(b, c, !d),
          ob: null,
        });
      },
      L: function (a, b, c, d) {
        b = U(b >>> 0);
        S(a >>> 0, {
          name: b,
          fb: function (e) {
            return !!e;
          },
          lb: function (e, f) {
            return f ? c : d;
          },
          sb: function (e) {
            return this.fb(w[e >>> 0]);
          },
          ob: null,
        });
      },
      l: function (a, b, c, d, e, f, h, k, m, l, n, r, q) {
        a >>>= 0;
        b >>>= 0;
        c >>>= 0;
        d >>>= 0;
        f >>>= 0;
        h >>>= 0;
        k >>>= 0;
        m >>>= 0;
        l >>>= 0;
        n >>>= 0;
        r >>>= 0;
        q >>>= 0;
        n = U(n);
        f = X(e >>> 0, f);
        k &&= X(h, k);
        l &&= X(m, l);
        q = X(r, q);
        var t = hc(n);
        gc(t, function () {
          zc(`Cannot construct ${n} due to unbound types`, [d]);
        });
        T([a, b, c], d ? [d] : [], (v) => {
          v = v[0];
          if (d) {
            var x = v.ab;
            var B = x.Hb;
          } else B = ac.prototype;
          v = bc(n, function (...G) {
            if (Object.getPrototypeOf(this) !== A) throw new V(`Use 'new' to construct ${n}`);
            if (void 0 === z.hb) throw new V(`${n} has no accessible constructor`);
            if (void 0 === z.hb[G.length]) {
              var L = -1,
                Jc;
              for (Jc in z.hb) {
                var Fb = +Jc;
                Fb > G.length && (0 > L || Fb < L) && (L = Fb);
              }
              if (0 <= L) for (; G.length < L; ) G.push(void 0);
            }
            L = void 0;
            void 0 !== z.hb[G.length] &&
              (void 0 !== z.hb[G.length].Ob
                ? (L = z.hb[G.length].Ob)
                : ((L = ec(G, z.hb[G.length].Gb)), (L = z.hb[G.length].kb[L])));
            if (void 0 === L) {
              if (void 0 === z.hb[G.length])
                throw new V(
                  `Tried to invoke ctor of ${n} with invalid number of parameters (${G.length}) - expected (${Object.keys(z.hb).toString()}) parameters instead!`,
                );
              L = z.hb[G.length].Gb.map((fa) => '(' + fa.map((Gb) => ('string' === typeof Gb ? Gb : R[Gb].name)) + ')');
              G = G.map((fa) =>
                'object' === typeof fa && fa.constructor && fa.constructor.name ? fa.constructor.name : typeof fa,
              );
              throw new V(
                `Tried to invoke ctor of ${n} with invalid signature (${G}) - expected [${L}] parameters instead!`,
              );
            }
            return L.apply(this, G);
          });
          var A = Object.create(B, { constructor: { value: v } });
          v.prototype = A;
          var z = new ic(n, v, A, q, x, f, k, l);
          if (z.qb) {
            var C;
            (C = z.qb).Ub ?? (C.Ub = []);
            z.qb.Ub.push(z);
          }
          x = new sc(n, z, !0, !1, !1);
          C = new sc(n + '*', z, !1, !1, !1);
          B = new sc(n + ' const*', z, !1, !0, !1);
          cc[a] = { pointerType: C, Ic: B };
          tc(t, v);
          return [x, C, B];
        });
      },
      e: function (a, b, c, d, e, f, h, k) {
        a >>>= 0;
        b >>>= 0;
        e >>>= 0;
        f >>>= 0;
        h >>>= 0;
        var m = Cc(c, d >>> 0);
        b = U(b);
        b = Dc(b);
        f = X(e, f);
        T([], [a], (l) => {
          function n() {
            zc(`Cannot call ${r} due to unbound types`, m);
          }
          l = l[0];
          var r = `${l.name}.${b}`;
          b.startsWith('@@') && (b = Symbol[b.substring(2)]);
          var q = l.ab.constructor,
            t = m.slice(1),
            v = t.join(', ');
          void 0 === q[b]
            ? ((n.Bb = c - 1), (q[b] = n))
            : (void 0 === q[b].bb && q[b].Bb !== c - 1) || (void 0 !== q[b].bb && void 0 === q[b].bb[c - 1])
              ? (dc(q, b, r), (n.Fb = v), (q[b].bb[c - 1] = n))
              : (fc(q, b, r, c - 1), (q[b].bb[c - 1].kb[v] = n));
          T([], m, (x) => {
            x = [x[0], null].concat(x.slice(1));
            x = Bc(r, x, null, f, h, k);
            var B = t.map((z) => Ec(z)),
              A = B.join(', ');
            void 0 === q[b].bb
              ? ((x.Bb = c - 1), (x.Fb = A), (x.Mb = B), (q[b] = x))
              : void 0 === q[b].bb[c - 1].kb
                ? ((x.Fb = A), (x.Mb = B), (q[b].bb[c - 1] = x))
                : (delete q[b].bb[c - 1].kb[v], (q[b].bb[c - 1].kb[A] = x), q[b].bb[c - 1].Gb.push(B));
            if (l.ab.Ub) for (const z of l.ab.Ub) z.constructor.hasOwnProperty(b) || (z.constructor[b] = x);
            return [];
          });
          return [];
        });
      },
      d: function (a, b, c, d, e, f) {
        a >>>= 0;
        d >>>= 0;
        e >>>= 0;
        f >>>= 0;
        var h = Cc(b, c >>> 0);
        e = X(d, e);
        T([], [a], (k) => {
          function m() {
            zc(`Cannot construct ${k.name} due to unbound types`, h);
          }
          k = k[0];
          var l = `constructor ${k.name}`;
          void 0 === k.ab.hb && (k.ab.hb = []);
          var n = h.slice(1),
            r = n.join(', ');
          if (void 0 !== k.ab.hb[b - 1] && void 0 !== k.ab.hb[b - 1].kb[r])
            throw new V(
              `Cannot register multiple constructors with identical javascript types of parameters for class '${k.name}'!`,
            );
          void 0 === k.ab.hb[b - 1] ? (k.ab.hb[b - 1] = { Ob: m, kb: {}, Gb: [] }) : delete k.ab.hb[b - 1].Ob;
          k.ab.hb[b - 1].kb[r] = m;
          T([], h, (q) => {
            q.splice(1, 0, null);
            delete k.ab.hb[b - 1].kb[r];
            q = Bc(l, q, null, e, f);
            var t = n.map((x) => Ec(x)),
              v = t.join(', ');
            void 0 !== k.ab.hb[b - 1].Ob && (k.ab.hb[b - 1].Ob = q);
            k.ab.hb[b - 1].kb[v] = q;
            k.ab.hb[b - 1].Gb.push(t);
            return [];
          });
          return [];
        });
      },
      a: function (a, b, c, d, e, f, h, k, m) {
        a >>>= 0;
        b >>>= 0;
        e >>>= 0;
        f >>>= 0;
        h >>>= 0;
        var l = Cc(c, d >>> 0);
        b = U(b);
        b = Dc(b);
        f = X(e, f);
        T([], [a], (n) => {
          function r() {
            zc(`Cannot call ${q} due to unbound types`, l);
          }
          n = n[0];
          var q = `${n.name}.${b}`;
          b.startsWith('@@') && (b = Symbol[b.substring(2)]);
          k && n.ab.bd.push(b);
          var t = n.ab.Hb,
            v = t[b],
            x = l.slice(2),
            B = x.join(', ');
          void 0 === v || (void 0 === v.bb && v.className !== n.name && v.Fb === B)
            ? ((r.Bb = c - 2), (r.Fb = B), (r.className = n.name), (t[b] = r))
            : (void 0 === t[b].bb && t[b].Bb !== c - 2) || (void 0 !== t[b].bb && void 0 === t[b].bb[c - 2])
              ? (dc(t, b, q), (r.Fb = B), (t[b].bb[c - 2] = r))
              : (fc(t, b, q, c - 2), (t[b].bb[c - 2].kb[B] = r));
          T([], l, (A) => {
            A = Bc(q, A, n, f, h, m);
            var z = x.map((G) => Ec(G)),
              C = z.join(', ');
            void 0 === t[b].bb
              ? ((A.Bb = c - 2), (A.Fb = C), (A.Mb = z), (t[b] = A))
              : void 0 === t[b].bb[c - 2].kb
                ? ((A.Fb = C), (A.Mb = z), (t[b].bb[c - 2] = A))
                : (delete t[b].bb[c - 2].kb[B], (t[b].bb[c - 2].kb[C] = A), t[b].bb[c - 2].Gb.push(z));
            return [];
          });
          return [];
        });
      },
      x: function (a, b, c, d, e, f, h, k, m, l) {
        a >>>= 0;
        b >>>= 0;
        c >>>= 0;
        e >>>= 0;
        f >>>= 0;
        h >>>= 0;
        k >>>= 0;
        m >>>= 0;
        l >>>= 0;
        b = U(b);
        e = X(d >>> 0, e);
        T([], [a], (n) => {
          n = n[0];
          var r = `${n.name}.${b}`,
            q = {
              get() {
                zc(`Cannot access ${r} due to unbound types`, [c, h]);
              },
              enumerable: !0,
              configurable: !0,
            };
          q.set = m
            ? () => zc(`Cannot access ${r} due to unbound types`, [c, h])
            : () => {
                throw new V(r + ' is a read-only property');
              };
          Object.defineProperty(n.ab.Hb, b, q);
          T([], m ? [c, h] : [c], (t) => {
            var v = t[0],
              x = {
                get() {
                  var A = Fc(this, n, r + ' getter');
                  return v.fb(e(f, A));
                },
                enumerable: !0,
              };
            if (m) {
              m = X(k, m);
              var B = t[1];
              x.set = function (A) {
                var z = Fc(this, n, r + ' setter'),
                  C = [];
                m(l, z, B.lb(C, A));
                Ob(C);
              };
            }
            Object.defineProperty(n.ab.Hb, b, x);
            return [];
          });
          return [];
        });
      },
      la: function (a) {
        return S(a >>> 0, Kc);
      },
      C: function (a, b, c, d, e) {
        a >>>= 0;
        c >>>= 0;
        b = U(b >>> 0);
        e = 0 === e ? 'object' : 1 === e ? 'number' : 'string';
        switch (e) {
          case 'object':
            function h() {}
            h.values = {};
            S(a, {
              name: b,
              constructor: h,
              valueType: e,
              fb: function (k) {
                return this.constructor.values[k];
              },
              lb: (k, m) => m.value,
              sb: Lc(b, c, d),
              ob: null,
            });
            gc(b, h);
            break;
          case 'number':
            var f = {};
            S(a, { name: b, fc: f, valueType: e, fb: (k) => k, lb: (k, m) => m, sb: Lc(b, c, d), ob: null });
            gc(b, f);
            delete g[b].Bb;
            break;
          case 'string':
            ((f = {}),
              S(a, {
                name: b,
                Cc: {},
                zc: {},
                fc: f,
                valueType: e,
                fb: function (k) {
                  return this.zc[k];
                },
                lb: function (k, m) {
                  return this.Cc[m];
                },
                sb: Lc(b, c, d),
                ob: null,
              }),
              gc(b, f),
              delete g[b].Bb);
        }
      },
      o: function (a, b, c) {
        b >>>= 0;
        var d = Mc(a >>> 0, 'enum');
        b = U(b);
        switch (d.valueType) {
          case 'object':
            a = d.constructor;
            d = Object.create(d.constructor.prototype, {
              value: { value: c },
              constructor: { value: bc(`${d.name}_${b}`, function () {}) },
            });
            a.values[c] = d;
            a[b] = d;
            break;
          case 'number':
            d.fc[b] = c;
            break;
          case 'string':
            ((d.Cc[b] = c), (d.zc[c] = b), (d.fc[b] = b));
        }
      },
      J: function (a, b, c) {
        b = U(b >>> 0);
        S(a >>> 0, { name: b, fb: (d) => d, lb: (d, e) => e, sb: Nc(b, c >>> 0), ob: null });
      },
      A: function (a, b, c, d, e) {
        a >>>= 0;
        c >>>= 0;
        b = U(b >>> 0);
        let f = (k) => k;
        if (0 === d) {
          var h = 32 - 8 * c;
          f = (k) => (k << h) >>> h;
          e = f(e);
        }
        S(a, { name: b, fb: f, lb: (k, m) => m, sb: Vb(b, c, 0 !== d), ob: null });
      },
      r: function (a, b, c) {
        function d(f) {
          return new e(u.buffer, E[((f + 4) >>> 2) >>> 0], E[(f >>> 2) >>> 0]);
        }
        var e = [
          Int8Array,
          Uint8Array,
          Int16Array,
          Uint16Array,
          Int32Array,
          Uint32Array,
          Float32Array,
          Float64Array,
          BigInt64Array,
          BigUint64Array,
        ][b];
        c = U(c >>> 0);
        S(a >>> 0, { name: c, fb: d, sb: d }, { Tc: !0 });
      },
      B: function (a) {
        S(a >>> 0, Oc);
      },
      y: function (a, b, c, d, e, f, h, k, m, l, n, r) {
        a >>>= 0;
        b >>>= 0;
        c >>>= 0;
        f >>>= 0;
        h >>>= 0;
        k >>>= 0;
        m >>>= 0;
        l >>>= 0;
        n >>>= 0;
        r >>>= 0;
        c = U(c);
        f = X(e >>> 0, f);
        k = X(h, k);
        l = X(m, l);
        r = X(n, r);
        T([a], [b], (q) => {
          q = q[0];
          return [new sc(c, q.ab, !1, !1, !0, q, d, f, k, l, r)];
        });
      },
      ma: function (a, b) {
        b = U(b >>> 0);
        S(a >>> 0, {
          name: b,
          fb(c) {
            var d = P(c + 4, E[(c >>> 2) >>> 0], !0);
            Y(c);
            return d;
          },
          lb(c, d) {
            d instanceof ArrayBuffer && (d = new Uint8Array(d));
            var e = 'string' == typeof d;
            if (!(e || (ArrayBuffer.isView(d) && 1 == d.BYTES_PER_ELEMENT)))
              throw new V('Cannot pass non-string to std::string');
            var f = e ? $a(d) : d.length;
            var h = zd(4 + f + 1),
              k = h + 4;
            E[(h >>> 2) >>> 0] = f;
            e ? ab(d, w, k, f + 1) : w.set(d, k >>> 0);
            null !== c && c.push(Y, h);
            return h;
          },
          sb: Pb,
          ob(c) {
            Y(c);
          },
        });
      },
      G: function (a, b, c) {
        b >>>= 0;
        c >>>= 0;
        c = U(c);
        if (2 === b) {
          var d = Qc;
          var e = Rc;
          var f = Sc;
        } else ((d = Tc), (e = Uc), (f = Vc));
        S(a >>> 0, {
          name: c,
          fb: (h) => {
            var k = d(h + 4, E[(h >>> 2) >>> 0] * b, !0);
            Y(h);
            return k;
          },
          lb: (h, k) => {
            if ('string' != typeof k) throw new V(`Cannot pass non-string to C++ string type ${c}`);
            var m = f(k),
              l = zd(4 + m + b);
            E[(l >>> 2) >>> 0] = m / b;
            e(k, l + 4, m + b);
            null !== h && h.push(Y, l);
            return l;
          },
          sb: Pb,
          ob(h) {
            Y(h);
          },
        });
      },
      t: function (a, b, c, d, e, f) {
        e >>>= 0;
        f >>>= 0;
        Nb[a >>> 0] = { name: U(b >>> 0), kc: X(c >>> 0, d >>> 0), zb: X(e, f), tc: [] };
      },
      n: function (a, b, c, d, e, f, h, k, m, l) {
        f >>>= 0;
        h >>>= 0;
        k >>>= 0;
        m >>>= 0;
        l >>>= 0;
        Nb[a >>> 0].tc.push({ Lc: U(b >>> 0), Sc: c >>> 0, Pb: X(d >>> 0, e >>> 0), Rc: f, ed: h, dd: X(k, m), gd: l });
      },
      M: function (a, b) {
        b = U(b >>> 0);
        S(a >>> 0, { wc: !0, name: b, fb: () => {}, lb: () => {} });
      },
      O: function (a) {
        a = P(a >>> 0);
        var b = Wc(a);
        null === b &&
          ((b = Yc(a)),
          null === b &&
            ($c[a] ? (b = $c[a]) : ((b = Zc++), (b = '172.29.' + (b & 255) + '.' + (b & 65280)), ($c[a] = b)),
            (a = b)));
        return Wc(a);
      },
      U: () => {
        Ja = !1;
        ad = 0;
      },
      h: function (a, b, c) {
        var [d, ...e] = dd(a, b >>> 0);
        b = d.lb.bind(d);
        var f = e.map((m) => m.sb.bind(m));
        a--;
        var h = { toValue: Z };
        a = f.map((m, l) => {
          var n = `argFromPtr${l}`;
          h[n] = m;
          return `${n}(args${l ? '+' + 8 * l : ''})`;
        });
        switch (c) {
          case 0:
            var k = 'toValue(handle)';
            break;
          case 2:
            k = 'new (toValue(handle))';
            break;
          case 3:
            k = '';
            break;
          case 1:
            ((h.getStringOrSymbol = gd), (k = 'toValue(handle)[getStringOrSymbol(methodName)]'));
        }
        k += `(${a})`;
        d.wc ||
          ((h.toReturnWire = b),
          (h.emval_returnValue = ed),
          (k = `return emval_returnValue(toReturnWire, destructorsRef, ${k})`));
        k = `return function (handle, methodName, destructorsRef, args) {\n${k}\n}`;
        c = new Function(Object.keys(h), k)(...Object.values(h));
        k = `methodCaller<(${e.map((m) => m.name)}) => ${d.name}>`;
        return cd(bc(k, c));
      },
      b: Ic,
      p: function (a) {
        a >>>= 0;
        if (!a) return W(globalThis);
        a = gd(a);
        return W(globalThis[a]);
      },
      c: function (a) {
        a = gd(a >>> 0);
        return W(g[a]);
      },
      z: function (a, b) {
        b >>>= 0;
        a = Z(a >>> 0);
        b = Z(b);
        return W(a[b]);
      },
      i: function (a) {
        a >>>= 0;
        9 < a && (Hc[a + 1] += 1);
      },
      k: function (a, b) {
        b >>>= 0;
        a = Z(a >>> 0);
        b = Z(b);
        return a instanceof b;
      },
      g: function (a, b, c, d, e) {
        return bd[a >>> 0](b >>> 0, c >>> 0, d >>> 0, e >>> 0);
      },
      m: function (a) {
        return W(gd(a >>> 0));
      },
      v: function () {
        return W({});
      },
      f: function (a) {
        a >>>= 0;
        var b = Z(a);
        Ob(b);
        Ic(a);
      },
      s: function (a, b, c) {
        b >>>= 0;
        c >>>= 0;
        a = Z(a >>> 0);
        b = Z(b);
        c = Z(c);
        a[b] = c;
      },
      ka: function (a) {
        a = Z(a >>> 0);
        throw a;
      },
      j: function (a) {
        a = Z(a >>> 0);
        return W(typeof a);
      },
      W: function (a, b) {
        a = -9007199254740992 > a || 9007199254740992 < a ? NaN : Number(a);
        b >>>= 0;
        a = new Date(1e3 * a);
        D[(b >>> 2) >>> 0] = a.getSeconds();
        D[((b + 4) >>> 2) >>> 0] = a.getMinutes();
        D[((b + 8) >>> 2) >>> 0] = a.getHours();
        D[((b + 12) >>> 2) >>> 0] = a.getDate();
        D[((b + 16) >>> 2) >>> 0] = a.getMonth();
        D[((b + 20) >>> 2) >>> 0] = a.getFullYear() - 1900;
        D[((b + 24) >>> 2) >>> 0] = a.getDay();
        var c = a.getFullYear();
        D[((b + 28) >>> 2) >>> 0] =
          ((0 !== c % 4 || (0 === c % 100 && 0 !== c % 400) ? jd : hd)[a.getMonth()] + a.getDate() - 1) | 0;
        D[((b + 36) >>> 2) >>> 0] = -(60 * a.getTimezoneOffset());
        c = new Date(a.getFullYear(), 6, 1).getTimezoneOffset();
        var d = new Date(a.getFullYear(), 0, 1).getTimezoneOffset();
        D[((b + 32) >>> 2) >>> 0] = (c != d && a.getTimezoneOffset() == Math.min(d, c)) | 0;
      },
      N: (a, b) => {
        kd[a] && (clearTimeout(kd[a].id), delete kd[a]);
        if (!b) return 0;
        var c = setTimeout(() => {
          delete kd[a];
          md(() => Ad(a, performance.now()));
        }, b);
        kd[a] = { id: c, Kd: b };
        return 0;
      },
      ea: function (a, b, c, d) {
        c >>>= 0;
        d >>>= 0;
        var e = new Date().getFullYear(),
          f = new Date(e, 0, 1).getTimezoneOffset();
        e = new Date(e, 6, 1).getTimezoneOffset();
        E[((a >>> 0) >>> 2) >>> 0] = 60 * Math.max(f, e);
        D[((b >>> 0) >>> 2) >>> 0] = Number(f != e);
        b = (h) => {
          var k = Math.abs(h);
          return `UTC${0 <= h ? '-' : '+'}${String(Math.floor(k / 60)).padStart(2, '0')}${String(k % 60).padStart(2, '0')}`;
        };
        a = b(f);
        b = b(e);
        e < f ? (ab(a, w, c, 17), ab(b, w, d, 17)) : (ab(a, w, d, 17), ab(b, w, c, 17));
      },
      ca: function (a, b, c) {
        if (!(0 <= a && 3 >= a)) return 28;
        F[((c >>> 0) >>> 3) >>> 0] = BigInt(Math.round(1e6 * (0 === a ? Date.now() : performance.now())));
        return 0;
      },
      u: () => Date.now(),
      H: function (a) {
        return p(P(a >>> 0));
      },
      ia: function (a, b, c) {
        b >>>= 0;
        var d = Error().stack.toString(),
          e = d.split('\n');
        d = '';
        var f = RegExp('\\s*(.*?)@(.*?):([0-9]+):([0-9]+)'),
          h = RegExp('\\s*at (.*?) \\((.*):(.*):(.*)\\)'),
          k;
        for (k of e) {
          var m = h.exec(k);
          if (5 == m?.length) {
            e = m[1];
            var l = m[2];
            var n = m[3];
            m = m[4];
          } else if (((m = f.exec(k)), 4 <= m?.length)) ((e = m[1]), (l = m[2]), (n = m[3]), (m = m[4] | 0));
          else {
            d += k + '\n';
            continue;
          }
          '_emscripten_log' == e || '_emscripten_get_callstack' == e
            ? (d = '')
            : a & 24 &&
              (a & 64 && (l = l.substring(l.replace(/\\/g, '/').lastIndexOf('/') + 1)),
              (d += `    at ${e} (${l}:${n}:${m})\n`));
        }
        a = d = d.replace(/\s+$/, '');
        return !b || 0 >= c ? $a(a) + 1 : ab(a, w, b, c) + 1;
      },
      R: function () {
        return 4294901760;
      },
      D: () => performance.now(),
      P: function (a) {
        a >>>= 0;
        var b = w.length;
        if (4294901760 < a) return !1;
        for (var c = 1; 4 >= c; c *= 2) {
          var d = b * (1 + 0.2 / c);
          d = Math.min(d, a + 100663296);
          a: {
            d =
              ((Math.min(4294901760, 65536 * Math.ceil(Math.max(a, d) / 65536)) - ya.buffer.byteLength + 65535) /
                65536) |
              0;
            try {
              ya.grow(d);
              xa();
              var e = 1;
              break a;
            } catch (f) {}
            e = void 0;
          }
          if (e) return !0;
        }
        return !1;
      },
      Y: function (a, b) {
        a >>>= 0;
        b >>>= 0;
        var c = 0,
          d = 0,
          e;
        for (e of pd()) {
          var f = b + c;
          E[((a + d) >>> 2) >>> 0] = f;
          c += ab(e, w, f, Infinity) + 1;
          d += 4;
        }
        return 0;
      },
      Z: function (a, b) {
        a >>>= 0;
        b >>>= 0;
        var c = pd();
        E[(a >>> 2) >>> 0] = c.length;
        a = 0;
        for (var d of c) a += $a(d) + 1;
        E[(b >>> 2) >>> 0] = a;
        return 0;
      },
      ja: (a) => {
        pa = a;
        ld(a);
      },
      E: function (a) {
        try {
          var b = O(a);
          I.close(b);
          return 0;
        } catch (c) {
          if ('undefined' == typeof I || 'ErrnoError' !== c.name) throw c;
          return c.nb;
        }
      },
      ga: function (a, b, c, d) {
        b >>>= 0;
        c >>>= 0;
        d >>>= 0;
        try {
          a: {
            var e = O(a);
            a = b;
            for (var f, h = (b = 0); h < c; h++) {
              var k = E[(a >>> 2) >>> 0],
                m = E[((a + 4) >>> 2) >>> 0];
              a += 8;
              var l = I.read(e, u, k, m, f);
              if (0 > l) {
                var n = -1;
                break a;
              }
              b += l;
              if (l < m) break;
              'undefined' != typeof f && (f += l);
            }
            n = b;
          }
          E[(d >>> 2) >>> 0] = n;
          return 0;
        } catch (r) {
          if ('undefined' == typeof I || 'ErrnoError' !== r.name) throw r;
          return r.nb;
        }
      },
      X: function (a, b, c, d) {
        b = -9007199254740992 > b || 9007199254740992 < b ? NaN : Number(b);
        d >>>= 0;
        try {
          if (isNaN(b)) return 61;
          var e = O(a);
          I.rb(e, b, c);
          F[(d >>> 3) >>> 0] = BigInt(e.position);
          e.ac && 0 === b && 0 === c && (e.ac = null);
          return 0;
        } catch (f) {
          if ('undefined' == typeof I || 'ErrnoError' !== f.name) throw f;
          return f.nb;
        }
      },
      fa: function (a, b, c, d) {
        b >>>= 0;
        c >>>= 0;
        d >>>= 0;
        try {
          a: {
            var e = O(a);
            a = b;
            for (var f, h = (b = 0); h < c; h++) {
              var k = E[(a >>> 2) >>> 0],
                m = E[((a + 4) >>> 2) >>> 0];
              a += 8;
              var l = I.write(e, u, k, m, f);
              if (0 > l) {
                var n = -1;
                break a;
              }
              b += l;
              if (l < m) break;
              'undefined' != typeof f && (f += l);
            }
            n = b;
          }
          E[(d >>> 2) >>> 0] = n;
          return 0;
        } catch (r) {
          if ('undefined' == typeof I || 'ErrnoError' !== r.name) throw r;
          return r.nb;
        }
      },
      w: function () {
        g.__ocjsRbvDispose__ = function () {
          for (const a in this)
            if (Object.prototype.hasOwnProperty.call(this, a)) {
              const b = this[a];
              if (b && 'function' === typeof b.delete) {
                try {
                  b.delete();
                } catch {}
                this[a] = void 0;
              }
            }
        };
      },
      T: ld,
      Q: function (a, b) {
        a >>>= 0;
        try {
          return (Ta(w.subarray(a >>> 0, (a + (b >>> 0)) >>> 0)), 0);
        } catch (c) {
          if ('undefined' == typeof I || 'ErrnoError' !== c.name) throw c;
          return c.nb;
        }
      },
    };
  function Cd() {
    var a = Dd;
    a = Object.assign({}, a);
    var b = (d) => (e) => d(e) >>> 0,
      c = (d) => (e, f) => d(e, f) >>> 0;
    a.pa = b(a.pa);
    a.sa = b(a.sa);
    a.realloc = c(a.realloc);
    a.calloc = c(a.calloc);
    a.za = b(a.za);
    a.Ka = c(a.Ka);
    a.Sa = b(a.Sa);
    a.Ta = (
      (d) => () =>
        d() >>> 0
    )(a.Ta);
    return a;
  }
  function Ed() {
    function a() {
      g.calledRun = !0;
      if (!oa) {
        wa = !0;
        g.noFSInit || I.bc || ob();
        Dd.oa();
        I.vc = !1;
        qa?.(g);
        g.onRuntimeInitialized?.();
        if (g.postRun)
          for ('function' == typeof g.postRun && (g.postRun = [g.postRun]); g.postRun.length; ) {
            var b = g.postRun.shift();
            Ga.push(b);
          }
        Fa(Ga);
      }
    }
    if (0 < lb) mb = Ed;
    else {
      if (g.preRun) for ('function' == typeof g.preRun && (g.preRun = [g.preRun]); g.preRun.length; ) Ia();
      Fa(Ha);
      0 < lb
        ? (mb = Ed)
        : g.setStatus
          ? (g.setStatus('Running...'),
            setTimeout(() => {
              setTimeout(() => g.setStatus(''), 1);
              a();
            }, 1))
          : a();
    }
  }
  var Dd;
  Dd = await (async function () {
    function a(c) {
      Dd = c.exports;
      c = Dd = Cd();
      xc = c.pa;
      g.__ZdlPvm = c.qa;
      zd = g._malloc = c.sa;
      Y = g._free = c.ta;
      g.__ZdaPv = c.va;
      g.__ZdlPv = c.wa;
      g.___libc_free = c.xa;
      g.___libc_malloc = c.ya;
      g._emscripten_builtin_malloc = c.za;
      Xc = c.Aa;
      Ad = c.Ba;
      g._strndup = c.Ca;
      g.__ZdaPvm = c.Da;
      g.__Znaj = c.Ea;
      g.__ZnajSt11align_val_t = c.Fa;
      g.__Znwj = c.Ga;
      g.__ZnwjSt11align_val_t = c.Ha;
      g.___libc_calloc = c.Ia;
      g.___libc_realloc = c.Ja;
      g._emscripten_builtin_calloc = c.Ka;
      g._emscripten_builtin_free = c.La;
      g._emscripten_builtin_realloc = c.Ma;
      g._malloc_size = c.Na;
      g._malloc_usable_size = c.Oa;
      g._reallocf = c.Pa;
      za = c.Qa;
      yd = c.Ra;
      wd = c.Sa;
      vd = c.Ta;
      ud = c.Ua;
      td = c.Va;
      rd = c.Wa;
      xd = c.Xa;
      ya = c.na;
      La = c.ra;
      qd = c.ua;
      xa();
      return Dd;
    }
    var b = { a: Bd };
    if (g.instantiateWasm)
      return new Promise((c) => {
        g.instantiateWasm(b, (d, e) => {
          c(a(d, e));
        });
      });
    Aa ??= g.locateFile
      ? g.locateFile
        ? g.locateFile('geospec_opencascade_single.wasm', ia)
        : ia + 'geospec_opencascade_single.wasm'
      : new URL('geospec_opencascade_single.wasm', import.meta.url).href;
    return a((await Da(b)).instance);
  })();
  Ed();
  wa
    ? (moduleRtn = g)
    : (moduleRtn = new Promise((a, b) => {
        qa = a;
        ra = b;
      }));
  return moduleRtn;
}
export default Module;
