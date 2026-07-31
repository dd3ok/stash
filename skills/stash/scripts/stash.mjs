#!/usr/bin/env node
import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __commonJS = (cb, mod) => function __require2() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/yaml/dist/nodes/identity.js
var require_identity = __commonJS({
  "node_modules/yaml/dist/nodes/identity.js"(exports) {
    "use strict";
    var ALIAS = /* @__PURE__ */ Symbol.for("yaml.alias");
    var DOC = /* @__PURE__ */ Symbol.for("yaml.document");
    var MAP = /* @__PURE__ */ Symbol.for("yaml.map");
    var PAIR = /* @__PURE__ */ Symbol.for("yaml.pair");
    var SCALAR = /* @__PURE__ */ Symbol.for("yaml.scalar");
    var SEQ = /* @__PURE__ */ Symbol.for("yaml.seq");
    var NODE_TYPE = /* @__PURE__ */ Symbol.for("yaml.node.type");
    var isAlias = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === ALIAS;
    var isDocument = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === DOC;
    var isMap = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === MAP;
    var isPair = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === PAIR;
    var isScalar = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === SCALAR;
    var isSeq = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === SEQ;
    function isCollection(node) {
      if (node && typeof node === "object")
        switch (node[NODE_TYPE]) {
          case MAP:
          case SEQ:
            return true;
        }
      return false;
    }
    function isNode(node) {
      if (node && typeof node === "object")
        switch (node[NODE_TYPE]) {
          case ALIAS:
          case MAP:
          case SCALAR:
          case SEQ:
            return true;
        }
      return false;
    }
    var hasAnchor = (node) => (isScalar(node) || isCollection(node)) && !!node.anchor;
    exports.ALIAS = ALIAS;
    exports.DOC = DOC;
    exports.MAP = MAP;
    exports.NODE_TYPE = NODE_TYPE;
    exports.PAIR = PAIR;
    exports.SCALAR = SCALAR;
    exports.SEQ = SEQ;
    exports.hasAnchor = hasAnchor;
    exports.isAlias = isAlias;
    exports.isCollection = isCollection;
    exports.isDocument = isDocument;
    exports.isMap = isMap;
    exports.isNode = isNode;
    exports.isPair = isPair;
    exports.isScalar = isScalar;
    exports.isSeq = isSeq;
  }
});

// node_modules/yaml/dist/visit.js
var require_visit = __commonJS({
  "node_modules/yaml/dist/visit.js"(exports) {
    "use strict";
    var identity = require_identity();
    var BREAK = /* @__PURE__ */ Symbol("break visit");
    var SKIP = /* @__PURE__ */ Symbol("skip children");
    var REMOVE = /* @__PURE__ */ Symbol("remove node");
    function visit(node, visitor) {
      const visitor_ = initVisitor(visitor);
      if (identity.isDocument(node)) {
        const cd = visit_(null, node.contents, visitor_, Object.freeze([node]));
        if (cd === REMOVE)
          node.contents = null;
      } else
        visit_(null, node, visitor_, Object.freeze([]));
    }
    visit.BREAK = BREAK;
    visit.SKIP = SKIP;
    visit.REMOVE = REMOVE;
    function visit_(key, node, visitor, path7) {
      const ctrl = callVisitor(key, node, visitor, path7);
      if (identity.isNode(ctrl) || identity.isPair(ctrl)) {
        replaceNode(key, path7, ctrl);
        return visit_(key, ctrl, visitor, path7);
      }
      if (typeof ctrl !== "symbol") {
        if (identity.isCollection(node)) {
          path7 = Object.freeze(path7.concat(node));
          for (let i = 0; i < node.items.length; ++i) {
            const ci = visit_(i, node.items[i], visitor, path7);
            if (typeof ci === "number")
              i = ci - 1;
            else if (ci === BREAK)
              return BREAK;
            else if (ci === REMOVE) {
              node.items.splice(i, 1);
              i -= 1;
            }
          }
        } else if (identity.isPair(node)) {
          path7 = Object.freeze(path7.concat(node));
          const ck = visit_("key", node.key, visitor, path7);
          if (ck === BREAK)
            return BREAK;
          else if (ck === REMOVE)
            node.key = null;
          const cv = visit_("value", node.value, visitor, path7);
          if (cv === BREAK)
            return BREAK;
          else if (cv === REMOVE)
            node.value = null;
        }
      }
      return ctrl;
    }
    async function visitAsync(node, visitor) {
      const visitor_ = initVisitor(visitor);
      if (identity.isDocument(node)) {
        const cd = await visitAsync_(null, node.contents, visitor_, Object.freeze([node]));
        if (cd === REMOVE)
          node.contents = null;
      } else
        await visitAsync_(null, node, visitor_, Object.freeze([]));
    }
    visitAsync.BREAK = BREAK;
    visitAsync.SKIP = SKIP;
    visitAsync.REMOVE = REMOVE;
    async function visitAsync_(key, node, visitor, path7) {
      const ctrl = await callVisitor(key, node, visitor, path7);
      if (identity.isNode(ctrl) || identity.isPair(ctrl)) {
        replaceNode(key, path7, ctrl);
        return visitAsync_(key, ctrl, visitor, path7);
      }
      if (typeof ctrl !== "symbol") {
        if (identity.isCollection(node)) {
          path7 = Object.freeze(path7.concat(node));
          for (let i = 0; i < node.items.length; ++i) {
            const ci = await visitAsync_(i, node.items[i], visitor, path7);
            if (typeof ci === "number")
              i = ci - 1;
            else if (ci === BREAK)
              return BREAK;
            else if (ci === REMOVE) {
              node.items.splice(i, 1);
              i -= 1;
            }
          }
        } else if (identity.isPair(node)) {
          path7 = Object.freeze(path7.concat(node));
          const ck = await visitAsync_("key", node.key, visitor, path7);
          if (ck === BREAK)
            return BREAK;
          else if (ck === REMOVE)
            node.key = null;
          const cv = await visitAsync_("value", node.value, visitor, path7);
          if (cv === BREAK)
            return BREAK;
          else if (cv === REMOVE)
            node.value = null;
        }
      }
      return ctrl;
    }
    function initVisitor(visitor) {
      if (typeof visitor === "object" && (visitor.Collection || visitor.Node || visitor.Value)) {
        return Object.assign({
          Alias: visitor.Node,
          Map: visitor.Node,
          Scalar: visitor.Node,
          Seq: visitor.Node
        }, visitor.Value && {
          Map: visitor.Value,
          Scalar: visitor.Value,
          Seq: visitor.Value
        }, visitor.Collection && {
          Map: visitor.Collection,
          Seq: visitor.Collection
        }, visitor);
      }
      return visitor;
    }
    function callVisitor(key, node, visitor, path7) {
      if (typeof visitor === "function")
        return visitor(key, node, path7);
      if (identity.isMap(node))
        return visitor.Map?.(key, node, path7);
      if (identity.isSeq(node))
        return visitor.Seq?.(key, node, path7);
      if (identity.isPair(node))
        return visitor.Pair?.(key, node, path7);
      if (identity.isScalar(node))
        return visitor.Scalar?.(key, node, path7);
      if (identity.isAlias(node))
        return visitor.Alias?.(key, node, path7);
      return void 0;
    }
    function replaceNode(key, path7, node) {
      const parent = path7[path7.length - 1];
      if (identity.isCollection(parent)) {
        parent.items[key] = node;
      } else if (identity.isPair(parent)) {
        if (key === "key")
          parent.key = node;
        else
          parent.value = node;
      } else if (identity.isDocument(parent)) {
        parent.contents = node;
      } else {
        const pt = identity.isAlias(parent) ? "alias" : "scalar";
        throw new Error(`Cannot replace node with ${pt} parent`);
      }
    }
    exports.visit = visit;
    exports.visitAsync = visitAsync;
  }
});

// node_modules/yaml/dist/doc/directives.js
var require_directives = __commonJS({
  "node_modules/yaml/dist/doc/directives.js"(exports) {
    "use strict";
    var identity = require_identity();
    var visit = require_visit();
    var escapeChars = {
      "!": "%21",
      ",": "%2C",
      "[": "%5B",
      "]": "%5D",
      "{": "%7B",
      "}": "%7D"
    };
    var escapeTagName = (tn) => tn.replace(/[!,[\]{}]/g, (ch) => escapeChars[ch]);
    var Directives = class _Directives {
      constructor(yaml, tags) {
        this.docStart = null;
        this.docEnd = false;
        this.yaml = Object.assign({}, _Directives.defaultYaml, yaml);
        this.tags = Object.assign({}, _Directives.defaultTags, tags);
      }
      clone() {
        const copy = new _Directives(this.yaml, this.tags);
        copy.docStart = this.docStart;
        return copy;
      }
      /**
       * During parsing, get a Directives instance for the current document and
       * update the stream state according to the current version's spec.
       */
      atDocument() {
        const res = new _Directives(this.yaml, this.tags);
        switch (this.yaml.version) {
          case "1.1":
            this.atNextDocument = true;
            break;
          case "1.2":
            this.atNextDocument = false;
            this.yaml = {
              explicit: _Directives.defaultYaml.explicit,
              version: "1.2"
            };
            this.tags = Object.assign({}, _Directives.defaultTags);
            break;
        }
        return res;
      }
      /**
       * @param onError - May be called even if the action was successful
       * @returns `true` on success
       */
      add(line, onError) {
        if (this.atNextDocument) {
          this.yaml = { explicit: _Directives.defaultYaml.explicit, version: "1.1" };
          this.tags = Object.assign({}, _Directives.defaultTags);
          this.atNextDocument = false;
        }
        const parts = line.trim().split(/[ \t]+/);
        const name = parts.shift();
        switch (name) {
          case "%TAG": {
            if (parts.length !== 2) {
              onError(0, "%TAG directive should contain exactly two parts");
              if (parts.length < 2)
                return false;
            }
            const [handle, prefix] = parts;
            this.tags[handle] = prefix;
            return true;
          }
          case "%YAML": {
            this.yaml.explicit = true;
            if (parts.length !== 1) {
              onError(0, "%YAML directive should contain exactly one part");
              return false;
            }
            const [version] = parts;
            if (version === "1.1" || version === "1.2") {
              this.yaml.version = version;
              return true;
            } else {
              const isValid = /^\d+\.\d+$/.test(version);
              onError(6, `Unsupported YAML version ${version}`, isValid);
              return false;
            }
          }
          default:
            onError(0, `Unknown directive ${name}`, true);
            return false;
        }
      }
      /**
       * Resolves a tag, matching handles to those defined in %TAG directives.
       *
       * @returns Resolved tag, which may also be the non-specific tag `'!'` or a
       *   `'!local'` tag, or `null` if unresolvable.
       */
      tagName(source, onError) {
        if (source === "!")
          return "!";
        if (source[0] !== "!") {
          onError(`Not a valid tag: ${source}`);
          return null;
        }
        if (source[1] === "<") {
          const verbatim = source.slice(2, -1);
          if (verbatim === "!" || verbatim === "!!") {
            onError(`Verbatim tags aren't resolved, so ${source} is invalid.`);
            return null;
          }
          if (source[source.length - 1] !== ">")
            onError("Verbatim tags must end with a >");
          return verbatim;
        }
        const [, handle, suffix] = source.match(/^(.*!)([^!]*)$/s);
        if (!suffix)
          onError(`The ${source} tag has no suffix`);
        const prefix = this.tags[handle];
        if (prefix) {
          try {
            return prefix + decodeURIComponent(suffix);
          } catch (error) {
            onError(String(error));
            return null;
          }
        }
        if (handle === "!")
          return source;
        onError(`Could not resolve tag: ${source}`);
        return null;
      }
      /**
       * Given a fully resolved tag, returns its printable string form,
       * taking into account current tag prefixes and defaults.
       */
      tagString(tag) {
        for (const [handle, prefix] of Object.entries(this.tags)) {
          if (tag.startsWith(prefix))
            return handle + escapeTagName(tag.substring(prefix.length));
        }
        return tag[0] === "!" ? tag : `!<${tag}>`;
      }
      toString(doc) {
        const lines = this.yaml.explicit ? [`%YAML ${this.yaml.version || "1.2"}`] : [];
        const tagEntries = Object.entries(this.tags);
        let tagNames;
        if (doc && tagEntries.length > 0 && identity.isNode(doc.contents)) {
          const tags = {};
          visit.visit(doc.contents, (_key, node) => {
            if (identity.isNode(node) && node.tag)
              tags[node.tag] = true;
          });
          tagNames = Object.keys(tags);
        } else
          tagNames = [];
        for (const [handle, prefix] of tagEntries) {
          if (handle === "!!" && prefix === "tag:yaml.org,2002:")
            continue;
          if (!doc || tagNames.some((tn) => tn.startsWith(prefix)))
            lines.push(`%TAG ${handle} ${prefix}`);
        }
        return lines.join("\n");
      }
    };
    Directives.defaultYaml = { explicit: false, version: "1.2" };
    Directives.defaultTags = { "!!": "tag:yaml.org,2002:" };
    exports.Directives = Directives;
  }
});

// node_modules/yaml/dist/doc/anchors.js
var require_anchors = __commonJS({
  "node_modules/yaml/dist/doc/anchors.js"(exports) {
    "use strict";
    var identity = require_identity();
    var visit = require_visit();
    function anchorIsValid(anchor) {
      if (/[\x00-\x19\s,[\]{}]/.test(anchor)) {
        const sa = JSON.stringify(anchor);
        const msg = `Anchor must not contain whitespace or control characters: ${sa}`;
        throw new Error(msg);
      }
      return true;
    }
    function anchorNames(root) {
      const anchors = /* @__PURE__ */ new Set();
      visit.visit(root, {
        Value(_key, node) {
          if (node.anchor)
            anchors.add(node.anchor);
        }
      });
      return anchors;
    }
    function findNewAnchor(prefix, exclude) {
      for (let i = 1; true; ++i) {
        const name = `${prefix}${i}`;
        if (!exclude.has(name))
          return name;
      }
    }
    function createNodeAnchors(doc, prefix) {
      const aliasObjects = [];
      const sourceObjects = /* @__PURE__ */ new Map();
      let prevAnchors = null;
      return {
        onAnchor: (source) => {
          aliasObjects.push(source);
          prevAnchors ?? (prevAnchors = anchorNames(doc));
          const anchor = findNewAnchor(prefix, prevAnchors);
          prevAnchors.add(anchor);
          return anchor;
        },
        /**
         * With circular references, the source node is only resolved after all
         * of its child nodes are. This is why anchors are set only after all of
         * the nodes have been created.
         */
        setAnchors: () => {
          for (const source of aliasObjects) {
            const ref = sourceObjects.get(source);
            if (typeof ref === "object" && ref.anchor && (identity.isScalar(ref.node) || identity.isCollection(ref.node))) {
              ref.node.anchor = ref.anchor;
            } else {
              const error = new Error("Failed to resolve repeated object (this should not happen)");
              error.source = source;
              throw error;
            }
          }
        },
        sourceObjects
      };
    }
    exports.anchorIsValid = anchorIsValid;
    exports.anchorNames = anchorNames;
    exports.createNodeAnchors = createNodeAnchors;
    exports.findNewAnchor = findNewAnchor;
  }
});

// node_modules/yaml/dist/doc/applyReviver.js
var require_applyReviver = __commonJS({
  "node_modules/yaml/dist/doc/applyReviver.js"(exports) {
    "use strict";
    function applyReviver(reviver, obj, key, val) {
      if (val && typeof val === "object") {
        if (Array.isArray(val)) {
          for (let i = 0, len = val.length; i < len; ++i) {
            const v0 = val[i];
            const v1 = applyReviver(reviver, val, String(i), v0);
            if (v1 === void 0)
              delete val[i];
            else if (v1 !== v0)
              val[i] = v1;
          }
        } else if (val instanceof Map) {
          for (const k of Array.from(val.keys())) {
            const v0 = val.get(k);
            const v1 = applyReviver(reviver, val, k, v0);
            if (v1 === void 0)
              val.delete(k);
            else if (v1 !== v0)
              val.set(k, v1);
          }
        } else if (val instanceof Set) {
          for (const v0 of Array.from(val)) {
            const v1 = applyReviver(reviver, val, v0, v0);
            if (v1 === void 0)
              val.delete(v0);
            else if (v1 !== v0) {
              val.delete(v0);
              val.add(v1);
            }
          }
        } else {
          for (const [k, v0] of Object.entries(val)) {
            const v1 = applyReviver(reviver, val, k, v0);
            if (v1 === void 0)
              delete val[k];
            else if (v1 !== v0)
              val[k] = v1;
          }
        }
      }
      return reviver.call(obj, key, val);
    }
    exports.applyReviver = applyReviver;
  }
});

// node_modules/yaml/dist/nodes/toJS.js
var require_toJS = __commonJS({
  "node_modules/yaml/dist/nodes/toJS.js"(exports) {
    "use strict";
    var identity = require_identity();
    function toJS(value, arg, ctx) {
      if (Array.isArray(value))
        return value.map((v, i) => toJS(v, String(i), ctx));
      if (value && typeof value.toJSON === "function") {
        if (!ctx || !identity.hasAnchor(value))
          return value.toJSON(arg, ctx);
        const data = { aliasCount: 0, count: 1, res: void 0 };
        ctx.anchors.set(value, data);
        ctx.onCreate = (res2) => {
          data.res = res2;
          delete ctx.onCreate;
        };
        const res = value.toJSON(arg, ctx);
        if (ctx.onCreate)
          ctx.onCreate(res);
        return res;
      }
      if (typeof value === "bigint" && !ctx?.keep)
        return Number(value);
      return value;
    }
    exports.toJS = toJS;
  }
});

// node_modules/yaml/dist/nodes/Node.js
var require_Node = __commonJS({
  "node_modules/yaml/dist/nodes/Node.js"(exports) {
    "use strict";
    var applyReviver = require_applyReviver();
    var identity = require_identity();
    var toJS = require_toJS();
    var NodeBase = class {
      constructor(type) {
        Object.defineProperty(this, identity.NODE_TYPE, { value: type });
      }
      /** Create a copy of this node.  */
      clone() {
        const copy = Object.create(Object.getPrototypeOf(this), Object.getOwnPropertyDescriptors(this));
        if (this.range)
          copy.range = this.range.slice();
        return copy;
      }
      /** A plain JavaScript representation of this node. */
      toJS(doc, { mapAsMap, maxAliasCount, onAnchor, reviver } = {}) {
        if (!identity.isDocument(doc))
          throw new TypeError("A document argument is required");
        const ctx = {
          anchors: /* @__PURE__ */ new Map(),
          doc,
          keep: true,
          mapAsMap: mapAsMap === true,
          mapKeyWarned: false,
          maxAliasCount: typeof maxAliasCount === "number" ? maxAliasCount : 100
        };
        const res = toJS.toJS(this, "", ctx);
        if (typeof onAnchor === "function")
          for (const { count, res: res2 } of ctx.anchors.values())
            onAnchor(res2, count);
        return typeof reviver === "function" ? applyReviver.applyReviver(reviver, { "": res }, "", res) : res;
      }
    };
    exports.NodeBase = NodeBase;
  }
});

// node_modules/yaml/dist/nodes/Alias.js
var require_Alias = __commonJS({
  "node_modules/yaml/dist/nodes/Alias.js"(exports) {
    "use strict";
    var anchors = require_anchors();
    var visit = require_visit();
    var identity = require_identity();
    var Node = require_Node();
    var toJS = require_toJS();
    var Alias = class extends Node.NodeBase {
      constructor(source) {
        super(identity.ALIAS);
        this.source = source;
        Object.defineProperty(this, "tag", {
          set() {
            throw new Error("Alias nodes cannot have tags");
          }
        });
      }
      /**
       * Resolve the value of this alias within `doc`, finding the last
       * instance of the `source` anchor before this node.
       */
      resolve(doc, ctx) {
        if (ctx?.maxAliasCount === 0)
          throw new ReferenceError("Alias resolution is disabled");
        let nodes;
        if (ctx?.aliasResolveCache) {
          nodes = ctx.aliasResolveCache;
        } else {
          nodes = [];
          visit.visit(doc, {
            Node: (_key, node) => {
              if (identity.isAlias(node) || identity.hasAnchor(node))
                nodes.push(node);
            }
          });
          if (ctx)
            ctx.aliasResolveCache = nodes;
        }
        let found = void 0;
        for (const node of nodes) {
          if (node === this)
            break;
          if (node.anchor === this.source)
            found = node;
        }
        return found;
      }
      toJSON(_arg, ctx) {
        if (!ctx)
          return { source: this.source };
        const { anchors: anchors2, doc, maxAliasCount } = ctx;
        const source = this.resolve(doc, ctx);
        if (!source) {
          const msg = `Unresolved alias (the anchor must be set before the alias): ${this.source}`;
          throw new ReferenceError(msg);
        }
        let data = anchors2.get(source);
        if (!data) {
          toJS.toJS(source, null, ctx);
          data = anchors2.get(source);
        }
        if (data?.res === void 0) {
          const msg = "This should not happen: Alias anchor was not resolved?";
          throw new ReferenceError(msg);
        }
        if (maxAliasCount >= 0) {
          data.count += 1;
          if (data.aliasCount === 0)
            data.aliasCount = getAliasCount(doc, source, anchors2);
          if (data.count * data.aliasCount > maxAliasCount) {
            const msg = "Excessive alias count indicates a resource exhaustion attack";
            throw new ReferenceError(msg);
          }
        }
        return data.res;
      }
      toString(ctx, _onComment, _onChompKeep) {
        const src = `*${this.source}`;
        if (ctx) {
          anchors.anchorIsValid(this.source);
          if (ctx.options.verifyAliasOrder && !ctx.anchors.has(this.source)) {
            const msg = `Unresolved alias (the anchor must be set before the alias): ${this.source}`;
            throw new Error(msg);
          }
          if (ctx.implicitKey)
            return `${src} `;
        }
        return src;
      }
    };
    function getAliasCount(doc, node, anchors2) {
      if (identity.isAlias(node)) {
        const source = node.resolve(doc);
        const anchor = anchors2 && source && anchors2.get(source);
        return anchor ? anchor.count * anchor.aliasCount : 0;
      } else if (identity.isCollection(node)) {
        let count = 0;
        for (const item of node.items) {
          const c = getAliasCount(doc, item, anchors2);
          if (c > count)
            count = c;
        }
        return count;
      } else if (identity.isPair(node)) {
        const kc = getAliasCount(doc, node.key, anchors2);
        const vc = getAliasCount(doc, node.value, anchors2);
        return Math.max(kc, vc);
      }
      return 1;
    }
    exports.Alias = Alias;
  }
});

// node_modules/yaml/dist/nodes/Scalar.js
var require_Scalar = __commonJS({
  "node_modules/yaml/dist/nodes/Scalar.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Node = require_Node();
    var toJS = require_toJS();
    var isScalarValue = (value) => !value || typeof value !== "function" && typeof value !== "object";
    var Scalar = class extends Node.NodeBase {
      constructor(value) {
        super(identity.SCALAR);
        this.value = value;
      }
      toJSON(arg, ctx) {
        return ctx?.keep ? this.value : toJS.toJS(this.value, arg, ctx);
      }
      toString() {
        return String(this.value);
      }
    };
    Scalar.BLOCK_FOLDED = "BLOCK_FOLDED";
    Scalar.BLOCK_LITERAL = "BLOCK_LITERAL";
    Scalar.PLAIN = "PLAIN";
    Scalar.QUOTE_DOUBLE = "QUOTE_DOUBLE";
    Scalar.QUOTE_SINGLE = "QUOTE_SINGLE";
    exports.Scalar = Scalar;
    exports.isScalarValue = isScalarValue;
  }
});

// node_modules/yaml/dist/doc/createNode.js
var require_createNode = __commonJS({
  "node_modules/yaml/dist/doc/createNode.js"(exports) {
    "use strict";
    var Alias = require_Alias();
    var identity = require_identity();
    var Scalar = require_Scalar();
    var defaultTagPrefix = "tag:yaml.org,2002:";
    function findTagObject(value, tagName, tags) {
      if (tagName) {
        const match = tags.filter((t) => t.tag === tagName);
        const tagObj = match.find((t) => !t.format) ?? match[0];
        if (!tagObj)
          throw new Error(`Tag ${tagName} not found`);
        return tagObj;
      }
      return tags.find((t) => t.identify?.(value) && !t.format);
    }
    function createNode(value, tagName, ctx) {
      if (identity.isDocument(value))
        value = value.contents;
      if (identity.isNode(value))
        return value;
      if (identity.isPair(value)) {
        const map = ctx.schema[identity.MAP].createNode?.(ctx.schema, null, ctx);
        map.items.push(value);
        return map;
      }
      if (value instanceof String || value instanceof Number || value instanceof Boolean || typeof BigInt !== "undefined" && value instanceof BigInt) {
        value = value.valueOf();
      }
      const { aliasDuplicateObjects, onAnchor, onTagObj, schema, sourceObjects } = ctx;
      let ref = void 0;
      if (aliasDuplicateObjects && value && typeof value === "object") {
        ref = sourceObjects.get(value);
        if (ref) {
          ref.anchor ?? (ref.anchor = onAnchor(value));
          return new Alias.Alias(ref.anchor);
        } else {
          ref = { anchor: null, node: null };
          sourceObjects.set(value, ref);
        }
      }
      if (tagName?.startsWith("!!"))
        tagName = defaultTagPrefix + tagName.slice(2);
      let tagObj = findTagObject(value, tagName, schema.tags);
      if (!tagObj) {
        if (value && typeof value.toJSON === "function") {
          value = value.toJSON();
        }
        if (!value || typeof value !== "object") {
          const node2 = new Scalar.Scalar(value);
          if (ref)
            ref.node = node2;
          return node2;
        }
        tagObj = value instanceof Map ? schema[identity.MAP] : Symbol.iterator in Object(value) ? schema[identity.SEQ] : schema[identity.MAP];
      }
      if (onTagObj) {
        onTagObj(tagObj);
        delete ctx.onTagObj;
      }
      const node = tagObj?.createNode ? tagObj.createNode(ctx.schema, value, ctx) : typeof tagObj?.nodeClass?.from === "function" ? tagObj.nodeClass.from(ctx.schema, value, ctx) : new Scalar.Scalar(value);
      if (tagName)
        node.tag = tagName;
      else if (!tagObj.default)
        node.tag = tagObj.tag;
      if (ref)
        ref.node = node;
      return node;
    }
    exports.createNode = createNode;
  }
});

// node_modules/yaml/dist/nodes/Collection.js
var require_Collection = __commonJS({
  "node_modules/yaml/dist/nodes/Collection.js"(exports) {
    "use strict";
    var createNode = require_createNode();
    var identity = require_identity();
    var Node = require_Node();
    function collectionFromPath(schema, path7, value) {
      let v = value;
      for (let i = path7.length - 1; i >= 0; --i) {
        const k = path7[i];
        if (typeof k === "number" && Number.isInteger(k) && k >= 0) {
          const a = [];
          a[k] = v;
          v = a;
        } else {
          v = /* @__PURE__ */ new Map([[k, v]]);
        }
      }
      return createNode.createNode(v, void 0, {
        aliasDuplicateObjects: false,
        keepUndefined: false,
        onAnchor: () => {
          throw new Error("This should not happen, please report a bug.");
        },
        schema,
        sourceObjects: /* @__PURE__ */ new Map()
      });
    }
    var isEmptyPath = (path7) => path7 == null || typeof path7 === "object" && !!path7[Symbol.iterator]().next().done;
    var Collection = class extends Node.NodeBase {
      constructor(type, schema) {
        super(type);
        Object.defineProperty(this, "schema", {
          value: schema,
          configurable: true,
          enumerable: false,
          writable: true
        });
      }
      /**
       * Create a copy of this collection.
       *
       * @param schema - If defined, overwrites the original's schema
       */
      clone(schema) {
        const copy = Object.create(Object.getPrototypeOf(this), Object.getOwnPropertyDescriptors(this));
        if (schema)
          copy.schema = schema;
        copy.items = copy.items.map((it) => identity.isNode(it) || identity.isPair(it) ? it.clone(schema) : it);
        if (this.range)
          copy.range = this.range.slice();
        return copy;
      }
      /**
       * Adds a value to the collection. For `!!map` and `!!omap` the value must
       * be a Pair instance or a `{ key, value }` object, which may not have a key
       * that already exists in the map.
       */
      addIn(path7, value) {
        if (isEmptyPath(path7))
          this.add(value);
        else {
          const [key, ...rest] = path7;
          const node = this.get(key, true);
          if (identity.isCollection(node))
            node.addIn(rest, value);
          else if (node === void 0 && this.schema)
            this.set(key, collectionFromPath(this.schema, rest, value));
          else
            throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
        }
      }
      /**
       * Removes a value from the collection.
       * @returns `true` if the item was found and removed.
       */
      deleteIn(path7) {
        const [key, ...rest] = path7;
        if (rest.length === 0)
          return this.delete(key);
        const node = this.get(key, true);
        if (identity.isCollection(node))
          return node.deleteIn(rest);
        else
          throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
      }
      /**
       * Returns item at `key`, or `undefined` if not found. By default unwraps
       * scalar values from their surrounding node; to disable set `keepScalar` to
       * `true` (collections are always returned intact).
       */
      getIn(path7, keepScalar) {
        const [key, ...rest] = path7;
        const node = this.get(key, true);
        if (rest.length === 0)
          return !keepScalar && identity.isScalar(node) ? node.value : node;
        else
          return identity.isCollection(node) ? node.getIn(rest, keepScalar) : void 0;
      }
      hasAllNullValues(allowScalar) {
        return this.items.every((node) => {
          if (!identity.isPair(node))
            return false;
          const n = node.value;
          return n == null || allowScalar && identity.isScalar(n) && n.value == null && !n.commentBefore && !n.comment && !n.tag;
        });
      }
      /**
       * Checks if the collection includes a value with the key `key`.
       */
      hasIn(path7) {
        const [key, ...rest] = path7;
        if (rest.length === 0)
          return this.has(key);
        const node = this.get(key, true);
        return identity.isCollection(node) ? node.hasIn(rest) : false;
      }
      /**
       * Sets a value in this collection. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       */
      setIn(path7, value) {
        const [key, ...rest] = path7;
        if (rest.length === 0) {
          this.set(key, value);
        } else {
          const node = this.get(key, true);
          if (identity.isCollection(node))
            node.setIn(rest, value);
          else if (node === void 0 && this.schema)
            this.set(key, collectionFromPath(this.schema, rest, value));
          else
            throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
        }
      }
    };
    exports.Collection = Collection;
    exports.collectionFromPath = collectionFromPath;
    exports.isEmptyPath = isEmptyPath;
  }
});

// node_modules/yaml/dist/stringify/stringifyComment.js
var require_stringifyComment = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyComment.js"(exports) {
    "use strict";
    var stringifyComment = (str) => str.replace(/^(?!$)(?: $)?/gm, "#");
    function indentComment(comment, indent) {
      if (/^\n+$/.test(comment))
        return comment.substring(1);
      return indent ? comment.replace(/^(?! *$)/gm, indent) : comment;
    }
    var lineComment = (str, indent, comment) => str.endsWith("\n") ? indentComment(comment, indent) : comment.includes("\n") ? "\n" + indentComment(comment, indent) : (str.endsWith(" ") ? "" : " ") + comment;
    exports.indentComment = indentComment;
    exports.lineComment = lineComment;
    exports.stringifyComment = stringifyComment;
  }
});

// node_modules/yaml/dist/stringify/foldFlowLines.js
var require_foldFlowLines = __commonJS({
  "node_modules/yaml/dist/stringify/foldFlowLines.js"(exports) {
    "use strict";
    var FOLD_FLOW = "flow";
    var FOLD_BLOCK = "block";
    var FOLD_QUOTED = "quoted";
    function foldFlowLines(text, indent, mode = "flow", { indentAtStart, lineWidth = 80, minContentWidth = 20, onFold, onOverflow } = {}) {
      if (!lineWidth || lineWidth < 0)
        return text;
      if (lineWidth < minContentWidth)
        minContentWidth = 0;
      const endStep = Math.max(1 + minContentWidth, 1 + lineWidth - indent.length);
      if (text.length <= endStep)
        return text;
      const folds = [];
      const escapedFolds = {};
      let end = lineWidth - indent.length;
      if (typeof indentAtStart === "number") {
        if (indentAtStart > lineWidth - Math.max(2, minContentWidth))
          folds.push(0);
        else
          end = lineWidth - indentAtStart;
      }
      let split = void 0;
      let prev = void 0;
      let overflow = false;
      let i = -1;
      let escStart = -1;
      let escEnd = -1;
      if (mode === FOLD_BLOCK) {
        i = consumeMoreIndentedLines(text, i, indent.length);
        if (i !== -1)
          end = i + endStep;
      }
      for (let ch; ch = text[i += 1]; ) {
        if (mode === FOLD_QUOTED && ch === "\\") {
          escStart = i;
          switch (text[i + 1]) {
            case "x":
              i += 3;
              break;
            case "u":
              i += 5;
              break;
            case "U":
              i += 9;
              break;
            default:
              i += 1;
          }
          escEnd = i;
        }
        if (ch === "\n") {
          if (mode === FOLD_BLOCK)
            i = consumeMoreIndentedLines(text, i, indent.length);
          end = i + indent.length + endStep;
          split = void 0;
        } else {
          if (ch === " " && prev && prev !== " " && prev !== "\n" && prev !== "	") {
            const next = text[i + 1];
            if (next && next !== " " && next !== "\n" && next !== "	")
              split = i;
          }
          if (i >= end) {
            if (split) {
              folds.push(split);
              end = split + endStep;
              split = void 0;
            } else if (mode === FOLD_QUOTED) {
              while (prev === " " || prev === "	") {
                prev = ch;
                ch = text[i += 1];
                overflow = true;
              }
              const j = i > escEnd + 1 ? i - 2 : escStart - 1;
              if (escapedFolds[j])
                return text;
              folds.push(j);
              escapedFolds[j] = true;
              end = j + endStep;
              split = void 0;
            } else {
              overflow = true;
            }
          }
        }
        prev = ch;
      }
      if (overflow && onOverflow)
        onOverflow();
      if (folds.length === 0)
        return text;
      if (onFold)
        onFold();
      let res = text.slice(0, folds[0]);
      for (let i2 = 0; i2 < folds.length; ++i2) {
        const fold = folds[i2];
        const end2 = folds[i2 + 1] || text.length;
        if (fold === 0)
          res = `
${indent}${text.slice(0, end2)}`;
        else {
          if (mode === FOLD_QUOTED && escapedFolds[fold])
            res += `${text[fold]}\\`;
          res += `
${indent}${text.slice(fold + 1, end2)}`;
        }
      }
      return res;
    }
    function consumeMoreIndentedLines(text, i, indent) {
      let end = i;
      let start = i + 1;
      let ch = text[start];
      while (ch === " " || ch === "	") {
        if (i < start + indent) {
          ch = text[++i];
        } else {
          do {
            ch = text[++i];
          } while (ch && ch !== "\n");
          end = i;
          start = i + 1;
          ch = text[start];
        }
      }
      return end;
    }
    exports.FOLD_BLOCK = FOLD_BLOCK;
    exports.FOLD_FLOW = FOLD_FLOW;
    exports.FOLD_QUOTED = FOLD_QUOTED;
    exports.foldFlowLines = foldFlowLines;
  }
});

// node_modules/yaml/dist/stringify/stringifyString.js
var require_stringifyString = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyString.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var foldFlowLines = require_foldFlowLines();
    var getFoldOptions = (ctx, isBlock) => ({
      indentAtStart: isBlock ? ctx.indent.length : ctx.indentAtStart,
      lineWidth: ctx.options.lineWidth,
      minContentWidth: ctx.options.minContentWidth
    });
    var containsDocumentMarker = (str) => /^(%|---|\.\.\.)/m.test(str);
    function lineLengthOverLimit(str, lineWidth, indentLength) {
      if (!lineWidth || lineWidth < 0)
        return false;
      const limit = lineWidth - indentLength;
      const strLen = str.length;
      if (strLen <= limit)
        return false;
      for (let i = 0, start = 0; i < strLen; ++i) {
        if (str[i] === "\n") {
          if (i - start > limit)
            return true;
          start = i + 1;
          if (strLen - start <= limit)
            return false;
        }
      }
      return true;
    }
    function doubleQuotedString(value, ctx) {
      const json = JSON.stringify(value);
      if (ctx.options.doubleQuotedAsJSON)
        return json;
      const { implicitKey } = ctx;
      const minMultiLineLength = ctx.options.doubleQuotedMinMultiLineLength;
      const indent = ctx.indent || (containsDocumentMarker(value) ? "  " : "");
      let str = "";
      let start = 0;
      for (let i = 0, ch = json[i]; ch; ch = json[++i]) {
        if (ch === " " && json[i + 1] === "\\" && json[i + 2] === "n") {
          str += json.slice(start, i) + "\\ ";
          i += 1;
          start = i;
          ch = "\\";
        }
        if (ch === "\\")
          switch (json[i + 1]) {
            case "u":
              {
                str += json.slice(start, i);
                const code = json.substr(i + 2, 4);
                switch (code) {
                  case "0000":
                    str += "\\0";
                    break;
                  case "0007":
                    str += "\\a";
                    break;
                  case "000b":
                    str += "\\v";
                    break;
                  case "001b":
                    str += "\\e";
                    break;
                  case "0085":
                    str += "\\N";
                    break;
                  case "00a0":
                    str += "\\_";
                    break;
                  case "2028":
                    str += "\\L";
                    break;
                  case "2029":
                    str += "\\P";
                    break;
                  default:
                    if (code.substr(0, 2) === "00")
                      str += "\\x" + code.substr(2);
                    else
                      str += json.substr(i, 6);
                }
                i += 5;
                start = i + 1;
              }
              break;
            case "n":
              if (implicitKey || json[i + 2] === '"' || json.length < minMultiLineLength) {
                i += 1;
              } else {
                str += json.slice(start, i) + "\n\n";
                while (json[i + 2] === "\\" && json[i + 3] === "n" && json[i + 4] !== '"') {
                  str += "\n";
                  i += 2;
                }
                str += indent;
                if (json[i + 2] === " ")
                  str += "\\";
                i += 1;
                start = i + 1;
              }
              break;
            default:
              i += 1;
          }
      }
      str = start ? str + json.slice(start) : json;
      return implicitKey ? str : foldFlowLines.foldFlowLines(str, indent, foldFlowLines.FOLD_QUOTED, getFoldOptions(ctx, false));
    }
    function singleQuotedString(value, ctx) {
      if (ctx.options.singleQuote === false || ctx.implicitKey && value.includes("\n") || /[ \t]\n|\n[ \t]/.test(value))
        return doubleQuotedString(value, ctx);
      const indent = ctx.indent || (containsDocumentMarker(value) ? "  " : "");
      const res = "'" + value.replace(/'/g, "''").replace(/\n+/g, `$&
${indent}`) + "'";
      return ctx.implicitKey ? res : foldFlowLines.foldFlowLines(res, indent, foldFlowLines.FOLD_FLOW, getFoldOptions(ctx, false));
    }
    function quotedString(value, ctx) {
      const { singleQuote } = ctx.options;
      let qs;
      if (singleQuote === false)
        qs = doubleQuotedString;
      else {
        const hasDouble = value.includes('"');
        const hasSingle = value.includes("'");
        if (hasDouble && !hasSingle)
          qs = singleQuotedString;
        else if (hasSingle && !hasDouble)
          qs = doubleQuotedString;
        else
          qs = singleQuote ? singleQuotedString : doubleQuotedString;
      }
      return qs(value, ctx);
    }
    var blockEndNewlines;
    try {
      blockEndNewlines = new RegExp("(^|(?<!\n))\n+(?!\n|$)", "g");
    } catch {
      blockEndNewlines = /\n+(?!\n|$)/g;
    }
    function blockString({ comment, type, value }, ctx, onComment, onChompKeep) {
      const { blockQuote, commentString, lineWidth } = ctx.options;
      if (!blockQuote || /\n[\t ]+$/.test(value)) {
        return quotedString(value, ctx);
      }
      const indent = ctx.indent || (ctx.forceBlockIndent || containsDocumentMarker(value) ? "  " : "");
      const literal = blockQuote === "literal" ? true : blockQuote === "folded" || type === Scalar.Scalar.BLOCK_FOLDED ? false : type === Scalar.Scalar.BLOCK_LITERAL ? true : !lineLengthOverLimit(value, lineWidth, indent.length);
      if (!value)
        return literal ? "|\n" : ">\n";
      let chomp;
      let endStart;
      for (endStart = value.length; endStart > 0; --endStart) {
        const ch = value[endStart - 1];
        if (ch !== "\n" && ch !== "	" && ch !== " ")
          break;
      }
      let end = value.substring(endStart);
      const endNlPos = end.indexOf("\n");
      if (endNlPos === -1) {
        chomp = "-";
      } else if (value === end || endNlPos !== end.length - 1) {
        chomp = "+";
        if (onChompKeep)
          onChompKeep();
      } else {
        chomp = "";
      }
      if (end) {
        value = value.slice(0, -end.length);
        if (end[end.length - 1] === "\n")
          end = end.slice(0, -1);
        end = end.replace(blockEndNewlines, `$&${indent}`);
      }
      let startWithSpace = false;
      let startEnd;
      let startNlPos = -1;
      for (startEnd = 0; startEnd < value.length; ++startEnd) {
        const ch = value[startEnd];
        if (ch === " ")
          startWithSpace = true;
        else if (ch === "\n")
          startNlPos = startEnd;
        else
          break;
      }
      let start = value.substring(0, startNlPos < startEnd ? startNlPos + 1 : startEnd);
      if (start) {
        value = value.substring(start.length);
        start = start.replace(/\n+/g, `$&${indent}`);
      }
      const indentSize = indent ? "2" : "1";
      let header = (startWithSpace ? indentSize : "") + chomp;
      if (comment) {
        header += " " + commentString(comment.replace(/ ?[\r\n]+/g, " "));
        if (onComment)
          onComment();
      }
      if (!literal) {
        const foldedValue = value.replace(/\n+/g, "\n$&").replace(/(?:^|\n)([\t ].*)(?:([\n\t ]*)\n(?![\n\t ]))?/g, "$1$2").replace(/\n+/g, `$&${indent}`);
        let literalFallback = false;
        const foldOptions = getFoldOptions(ctx, true);
        if (blockQuote !== "folded" && type !== Scalar.Scalar.BLOCK_FOLDED) {
          foldOptions.onOverflow = () => {
            literalFallback = true;
          };
        }
        const body = foldFlowLines.foldFlowLines(`${start}${foldedValue}${end}`, indent, foldFlowLines.FOLD_BLOCK, foldOptions);
        if (!literalFallback)
          return `>${header}
${indent}${body}`;
      }
      value = value.replace(/\n+/g, `$&${indent}`);
      return `|${header}
${indent}${start}${value}${end}`;
    }
    function plainString(item, ctx, onComment, onChompKeep) {
      const { type, value } = item;
      const { actualString, implicitKey, indent, indentStep, inFlow } = ctx;
      if (implicitKey && value.includes("\n") || inFlow && /[[\]{},]/.test(value)) {
        return quotedString(value, ctx);
      }
      if (/^[\n\t ,[\]{}#&*!|>'"%@`]|^[?-]$|^[?-][ \t]|[\n:][ \t]|[ \t]\n|[\n\t ]#|[\n\t :]$/.test(value)) {
        return implicitKey || inFlow || !value.includes("\n") ? quotedString(value, ctx) : blockString(item, ctx, onComment, onChompKeep);
      }
      if (!implicitKey && !inFlow && type !== Scalar.Scalar.PLAIN && value.includes("\n")) {
        return blockString(item, ctx, onComment, onChompKeep);
      }
      if (containsDocumentMarker(value)) {
        if (indent === "") {
          ctx.forceBlockIndent = true;
          return blockString(item, ctx, onComment, onChompKeep);
        } else if (implicitKey && indent === indentStep) {
          return quotedString(value, ctx);
        }
      }
      const str = value.replace(/\n+/g, `$&
${indent}`);
      if (actualString) {
        const test = (tag) => tag.default && tag.tag !== "tag:yaml.org,2002:str" && tag.test?.test(str);
        const { compat, tags } = ctx.doc.schema;
        if (tags.some(test) || compat?.some(test))
          return quotedString(value, ctx);
      }
      return implicitKey ? str : foldFlowLines.foldFlowLines(str, indent, foldFlowLines.FOLD_FLOW, getFoldOptions(ctx, false));
    }
    function stringifyString(item, ctx, onComment, onChompKeep) {
      const { implicitKey, inFlow } = ctx;
      const ss = typeof item.value === "string" ? item : Object.assign({}, item, { value: String(item.value) });
      let { type } = item;
      if (type !== Scalar.Scalar.QUOTE_DOUBLE) {
        if (/[\x00-\x08\x0b-\x1f\x7f-\x9f\u{D800}-\u{DFFF}]/u.test(ss.value))
          type = Scalar.Scalar.QUOTE_DOUBLE;
      }
      const _stringify = (_type) => {
        switch (_type) {
          case Scalar.Scalar.BLOCK_FOLDED:
          case Scalar.Scalar.BLOCK_LITERAL:
            return implicitKey || inFlow ? quotedString(ss.value, ctx) : blockString(ss, ctx, onComment, onChompKeep);
          case Scalar.Scalar.QUOTE_DOUBLE:
            return doubleQuotedString(ss.value, ctx);
          case Scalar.Scalar.QUOTE_SINGLE:
            return singleQuotedString(ss.value, ctx);
          case Scalar.Scalar.PLAIN:
            return plainString(ss, ctx, onComment, onChompKeep);
          default:
            return null;
        }
      };
      let res = _stringify(type);
      if (res === null) {
        const { defaultKeyType, defaultStringType } = ctx.options;
        const t = implicitKey && defaultKeyType || defaultStringType;
        res = _stringify(t);
        if (res === null)
          throw new Error(`Unsupported default string type ${t}`);
      }
      return res;
    }
    exports.stringifyString = stringifyString;
  }
});

// node_modules/yaml/dist/stringify/stringify.js
var require_stringify = __commonJS({
  "node_modules/yaml/dist/stringify/stringify.js"(exports) {
    "use strict";
    var anchors = require_anchors();
    var identity = require_identity();
    var stringifyComment = require_stringifyComment();
    var stringifyString = require_stringifyString();
    function createStringifyContext(doc, options) {
      const opt = Object.assign({
        blockQuote: true,
        commentString: stringifyComment.stringifyComment,
        defaultKeyType: null,
        defaultStringType: "PLAIN",
        directives: null,
        doubleQuotedAsJSON: false,
        doubleQuotedMinMultiLineLength: 40,
        falseStr: "false",
        flowCollectionPadding: true,
        indentSeq: true,
        lineWidth: 80,
        minContentWidth: 20,
        nullStr: "null",
        simpleKeys: false,
        singleQuote: null,
        trailingComma: false,
        trueStr: "true",
        verifyAliasOrder: true
      }, doc.schema.toStringOptions, options);
      let inFlow;
      switch (opt.collectionStyle) {
        case "block":
          inFlow = false;
          break;
        case "flow":
          inFlow = true;
          break;
        default:
          inFlow = null;
      }
      return {
        anchors: /* @__PURE__ */ new Set(),
        doc,
        flowCollectionPadding: opt.flowCollectionPadding ? " " : "",
        indent: "",
        indentStep: typeof opt.indent === "number" ? " ".repeat(opt.indent) : "  ",
        inFlow,
        options: opt
      };
    }
    function getTagObject(tags, item) {
      if (item.tag) {
        const match = tags.filter((t) => t.tag === item.tag);
        if (match.length > 0)
          return match.find((t) => t.format === item.format) ?? match[0];
      }
      let tagObj = void 0;
      let obj;
      if (identity.isScalar(item)) {
        obj = item.value;
        let match = tags.filter((t) => t.identify?.(obj));
        if (match.length > 1) {
          const testMatch = match.filter((t) => t.test);
          if (testMatch.length > 0)
            match = testMatch;
        }
        tagObj = match.find((t) => t.format === item.format) ?? match.find((t) => !t.format);
      } else {
        obj = item;
        tagObj = tags.find((t) => t.nodeClass && obj instanceof t.nodeClass);
      }
      if (!tagObj) {
        const name = obj?.constructor?.name ?? (obj === null ? "null" : typeof obj);
        throw new Error(`Tag not resolved for ${name} value`);
      }
      return tagObj;
    }
    function stringifyProps(node, tagObj, { anchors: anchors$1, doc }) {
      if (!doc.directives)
        return "";
      const props = [];
      const anchor = (identity.isScalar(node) || identity.isCollection(node)) && node.anchor;
      if (anchor && anchors.anchorIsValid(anchor)) {
        anchors$1.add(anchor);
        props.push(`&${anchor}`);
      }
      const tag = node.tag ?? (tagObj.default ? null : tagObj.tag);
      if (tag)
        props.push(doc.directives.tagString(tag));
      return props.join(" ");
    }
    function stringify(item, ctx, onComment, onChompKeep) {
      if (identity.isPair(item))
        return item.toString(ctx, onComment, onChompKeep);
      if (identity.isAlias(item)) {
        if (ctx.doc.directives)
          return item.toString(ctx);
        if (ctx.resolvedAliases?.has(item)) {
          throw new TypeError(`Cannot stringify circular structure without alias nodes`);
        } else {
          if (ctx.resolvedAliases)
            ctx.resolvedAliases.add(item);
          else
            ctx.resolvedAliases = /* @__PURE__ */ new Set([item]);
          item = item.resolve(ctx.doc);
        }
      }
      let tagObj = void 0;
      const node = identity.isNode(item) ? item : ctx.doc.createNode(item, { onTagObj: (o) => tagObj = o });
      tagObj ?? (tagObj = getTagObject(ctx.doc.schema.tags, node));
      const props = stringifyProps(node, tagObj, ctx);
      if (props.length > 0)
        ctx.indentAtStart = (ctx.indentAtStart ?? 0) + props.length + 1;
      const str = typeof tagObj.stringify === "function" ? tagObj.stringify(node, ctx, onComment, onChompKeep) : identity.isScalar(node) ? stringifyString.stringifyString(node, ctx, onComment, onChompKeep) : node.toString(ctx, onComment, onChompKeep);
      if (!props)
        return str;
      return identity.isScalar(node) || str[0] === "{" || str[0] === "[" ? `${props} ${str}` : `${props}
${ctx.indent}${str}`;
    }
    exports.createStringifyContext = createStringifyContext;
    exports.stringify = stringify;
  }
});

// node_modules/yaml/dist/stringify/stringifyPair.js
var require_stringifyPair = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyPair.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var stringify = require_stringify();
    var stringifyComment = require_stringifyComment();
    function stringifyPair({ key, value }, ctx, onComment, onChompKeep) {
      const { allNullValues, doc, indent, indentStep, options: { commentString, indentSeq, simpleKeys } } = ctx;
      let keyComment = identity.isNode(key) && key.comment || null;
      if (simpleKeys) {
        if (keyComment) {
          throw new Error("With simple keys, key nodes cannot have comments");
        }
        if (identity.isCollection(key) || !identity.isNode(key) && typeof key === "object") {
          const msg = "With simple keys, collection cannot be used as a key value";
          throw new Error(msg);
        }
      }
      let explicitKey = !simpleKeys && (!key || keyComment && value == null && !ctx.inFlow || identity.isCollection(key) || (identity.isScalar(key) ? key.type === Scalar.Scalar.BLOCK_FOLDED || key.type === Scalar.Scalar.BLOCK_LITERAL : typeof key === "object"));
      ctx = Object.assign({}, ctx, {
        allNullValues: false,
        implicitKey: !explicitKey && (simpleKeys || !allNullValues),
        indent: indent + indentStep
      });
      let keyCommentDone = false;
      let chompKeep = false;
      let str = stringify.stringify(key, ctx, () => keyCommentDone = true, () => chompKeep = true);
      if (!explicitKey && !ctx.inFlow && str.length > 1024) {
        if (simpleKeys)
          throw new Error("With simple keys, single line scalar must not span more than 1024 characters");
        explicitKey = true;
      }
      if (ctx.inFlow) {
        if (allNullValues || value == null) {
          if (keyCommentDone && onComment)
            onComment();
          return str === "" ? "?" : explicitKey ? `? ${str}` : str;
        }
      } else if (allNullValues && !simpleKeys || value == null && explicitKey) {
        str = `? ${str}`;
        if (keyComment && !keyCommentDone) {
          str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment));
        } else if (chompKeep && onChompKeep)
          onChompKeep();
        return str;
      }
      if (keyCommentDone)
        keyComment = null;
      if (explicitKey) {
        if (keyComment)
          str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment));
        str = `? ${str}
${indent}:`;
      } else {
        str = `${str}:`;
        if (keyComment)
          str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment));
      }
      let vsb, vcb, valueComment;
      if (identity.isNode(value)) {
        vsb = !!value.spaceBefore;
        vcb = value.commentBefore;
        valueComment = value.comment;
      } else {
        vsb = false;
        vcb = null;
        valueComment = null;
        if (value && typeof value === "object")
          value = doc.createNode(value);
      }
      ctx.implicitKey = false;
      if (!explicitKey && !keyComment && identity.isScalar(value))
        ctx.indentAtStart = str.length + 1;
      chompKeep = false;
      if (!indentSeq && indentStep.length >= 2 && !ctx.inFlow && !explicitKey && identity.isSeq(value) && !value.flow && !value.tag && !value.anchor) {
        ctx.indent = ctx.indent.substring(2);
      }
      let valueCommentDone = false;
      const valueStr = stringify.stringify(value, ctx, () => valueCommentDone = true, () => chompKeep = true);
      let ws = " ";
      if (keyComment || vsb || vcb) {
        ws = vsb ? "\n" : "";
        if (vcb) {
          const cs = commentString(vcb);
          ws += `
${stringifyComment.indentComment(cs, ctx.indent)}`;
        }
        if (valueStr === "" && !ctx.inFlow) {
          if (ws === "\n" && valueComment)
            ws = "\n\n";
        } else {
          ws += `
${ctx.indent}`;
        }
      } else if (!explicitKey && identity.isCollection(value)) {
        const vs0 = valueStr[0];
        const nl0 = valueStr.indexOf("\n");
        const hasNewline = nl0 !== -1;
        const flow = ctx.inFlow ?? value.flow ?? value.items.length === 0;
        if (hasNewline || !flow) {
          let hasPropsLine = false;
          if (hasNewline && (vs0 === "&" || vs0 === "!")) {
            let sp0 = valueStr.indexOf(" ");
            if (vs0 === "&" && sp0 !== -1 && sp0 < nl0 && valueStr[sp0 + 1] === "!") {
              sp0 = valueStr.indexOf(" ", sp0 + 1);
            }
            if (sp0 === -1 || nl0 < sp0)
              hasPropsLine = true;
          }
          if (!hasPropsLine)
            ws = `
${ctx.indent}`;
        }
      } else if (valueStr === "" || valueStr[0] === "\n") {
        ws = "";
      }
      str += ws + valueStr;
      if (ctx.inFlow) {
        if (valueCommentDone && onComment)
          onComment();
      } else if (valueComment && !valueCommentDone) {
        str += stringifyComment.lineComment(str, ctx.indent, commentString(valueComment));
      } else if (chompKeep && onChompKeep) {
        onChompKeep();
      }
      return str;
    }
    exports.stringifyPair = stringifyPair;
  }
});

// node_modules/yaml/dist/log.js
var require_log = __commonJS({
  "node_modules/yaml/dist/log.js"(exports) {
    "use strict";
    var node_process = __require("process");
    function debug(logLevel, ...messages) {
      if (logLevel === "debug")
        console.log(...messages);
    }
    function warn(logLevel, warning) {
      if (logLevel === "debug" || logLevel === "warn") {
        if (typeof node_process.emitWarning === "function")
          node_process.emitWarning(warning);
        else
          console.warn(warning);
      }
    }
    exports.debug = debug;
    exports.warn = warn;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/merge.js
var require_merge = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/merge.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var MERGE_KEY = "<<";
    var merge = {
      identify: (value) => value === MERGE_KEY || typeof value === "symbol" && value.description === MERGE_KEY,
      default: "key",
      tag: "tag:yaml.org,2002:merge",
      test: /^<<$/,
      resolve: () => Object.assign(new Scalar.Scalar(Symbol(MERGE_KEY)), {
        addToJSMap: addMergeToJSMap
      }),
      stringify: () => MERGE_KEY
    };
    var isMergeKey = (ctx, key) => (merge.identify(key) || identity.isScalar(key) && (!key.type || key.type === Scalar.Scalar.PLAIN) && merge.identify(key.value)) && ctx?.doc.schema.tags.some((tag) => tag.tag === merge.tag && tag.default);
    function addMergeToJSMap(ctx, map, value) {
      const source = resolveAliasValue(ctx, value);
      if (identity.isSeq(source))
        for (const it of source.items)
          mergeValue(ctx, map, it);
      else if (Array.isArray(source))
        for (const it of source)
          mergeValue(ctx, map, it);
      else
        mergeValue(ctx, map, source);
    }
    function mergeValue(ctx, map, value) {
      const source = resolveAliasValue(ctx, value);
      if (!identity.isMap(source))
        throw new Error("Merge sources must be maps or map aliases");
      const srcMap = source.toJSON(null, ctx, Map);
      for (const [key, value2] of srcMap) {
        if (map instanceof Map) {
          if (!map.has(key))
            map.set(key, value2);
        } else if (map instanceof Set) {
          map.add(key);
        } else if (!Object.prototype.hasOwnProperty.call(map, key)) {
          Object.defineProperty(map, key, {
            value: value2,
            writable: true,
            enumerable: true,
            configurable: true
          });
        }
      }
      return map;
    }
    function resolveAliasValue(ctx, value) {
      return ctx && identity.isAlias(value) ? value.resolve(ctx.doc, ctx) : value;
    }
    exports.addMergeToJSMap = addMergeToJSMap;
    exports.isMergeKey = isMergeKey;
    exports.merge = merge;
  }
});

// node_modules/yaml/dist/nodes/addPairToJSMap.js
var require_addPairToJSMap = __commonJS({
  "node_modules/yaml/dist/nodes/addPairToJSMap.js"(exports) {
    "use strict";
    var log = require_log();
    var merge = require_merge();
    var stringify = require_stringify();
    var identity = require_identity();
    var toJS = require_toJS();
    function addPairToJSMap(ctx, map, { key, value }) {
      if (identity.isNode(key) && key.addToJSMap)
        key.addToJSMap(ctx, map, value);
      else if (merge.isMergeKey(ctx, key))
        merge.addMergeToJSMap(ctx, map, value);
      else {
        const jsKey = toJS.toJS(key, "", ctx);
        if (map instanceof Map) {
          map.set(jsKey, toJS.toJS(value, jsKey, ctx));
        } else if (map instanceof Set) {
          map.add(jsKey);
        } else {
          const stringKey = stringifyKey(key, jsKey, ctx);
          const jsValue = toJS.toJS(value, stringKey, ctx);
          if (stringKey in map)
            Object.defineProperty(map, stringKey, {
              value: jsValue,
              writable: true,
              enumerable: true,
              configurable: true
            });
          else
            map[stringKey] = jsValue;
        }
      }
      return map;
    }
    function stringifyKey(key, jsKey, ctx) {
      if (jsKey === null)
        return "";
      if (typeof jsKey !== "object")
        return String(jsKey);
      if (identity.isNode(key) && ctx?.doc) {
        const strCtx = stringify.createStringifyContext(ctx.doc, {});
        strCtx.anchors = /* @__PURE__ */ new Set();
        for (const node of ctx.anchors.keys())
          strCtx.anchors.add(node.anchor);
        strCtx.inFlow = true;
        strCtx.inStringifyKey = true;
        const strKey = key.toString(strCtx);
        if (!ctx.mapKeyWarned) {
          let jsonStr = JSON.stringify(strKey);
          if (jsonStr.length > 40)
            jsonStr = jsonStr.substring(0, 36) + '..."';
          log.warn(ctx.doc.options.logLevel, `Keys with collection values will be stringified due to JS Object restrictions: ${jsonStr}. Set mapAsMap: true to use object keys.`);
          ctx.mapKeyWarned = true;
        }
        return strKey;
      }
      return JSON.stringify(jsKey);
    }
    exports.addPairToJSMap = addPairToJSMap;
  }
});

// node_modules/yaml/dist/nodes/Pair.js
var require_Pair = __commonJS({
  "node_modules/yaml/dist/nodes/Pair.js"(exports) {
    "use strict";
    var createNode = require_createNode();
    var stringifyPair = require_stringifyPair();
    var addPairToJSMap = require_addPairToJSMap();
    var identity = require_identity();
    function createPair(key, value, ctx) {
      const k = createNode.createNode(key, void 0, ctx);
      const v = createNode.createNode(value, void 0, ctx);
      return new Pair(k, v);
    }
    var Pair = class _Pair {
      constructor(key, value = null) {
        Object.defineProperty(this, identity.NODE_TYPE, { value: identity.PAIR });
        this.key = key;
        this.value = value;
      }
      clone(schema) {
        let { key, value } = this;
        if (identity.isNode(key))
          key = key.clone(schema);
        if (identity.isNode(value))
          value = value.clone(schema);
        return new _Pair(key, value);
      }
      toJSON(_, ctx) {
        const pair = ctx?.mapAsMap ? /* @__PURE__ */ new Map() : {};
        return addPairToJSMap.addPairToJSMap(ctx, pair, this);
      }
      toString(ctx, onComment, onChompKeep) {
        return ctx?.doc ? stringifyPair.stringifyPair(this, ctx, onComment, onChompKeep) : JSON.stringify(this);
      }
    };
    exports.Pair = Pair;
    exports.createPair = createPair;
  }
});

// node_modules/yaml/dist/stringify/stringifyCollection.js
var require_stringifyCollection = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyCollection.js"(exports) {
    "use strict";
    var identity = require_identity();
    var stringify = require_stringify();
    var stringifyComment = require_stringifyComment();
    function stringifyCollection(collection, ctx, options) {
      const flow = ctx.inFlow ?? collection.flow;
      const stringify2 = flow ? stringifyFlowCollection : stringifyBlockCollection;
      return stringify2(collection, ctx, options);
    }
    function stringifyBlockCollection({ comment, items }, ctx, { blockItemPrefix, flowChars, itemIndent, onChompKeep, onComment }) {
      const { indent, options: { commentString } } = ctx;
      const itemCtx = Object.assign({}, ctx, { indent: itemIndent, type: null });
      let chompKeep = false;
      const lines = [];
      for (let i = 0; i < items.length; ++i) {
        const item = items[i];
        let comment2 = null;
        if (identity.isNode(item)) {
          if (!chompKeep && item.spaceBefore)
            lines.push("");
          addCommentBefore(ctx, lines, item.commentBefore, chompKeep);
          if (item.comment)
            comment2 = item.comment;
        } else if (identity.isPair(item)) {
          const ik = identity.isNode(item.key) ? item.key : null;
          if (ik) {
            if (!chompKeep && ik.spaceBefore)
              lines.push("");
            addCommentBefore(ctx, lines, ik.commentBefore, chompKeep);
          }
        }
        chompKeep = false;
        let str2 = stringify.stringify(item, itemCtx, () => comment2 = null, () => chompKeep = true);
        if (comment2)
          str2 += stringifyComment.lineComment(str2, itemIndent, commentString(comment2));
        if (chompKeep && comment2)
          chompKeep = false;
        lines.push(blockItemPrefix + str2);
      }
      let str;
      if (lines.length === 0) {
        str = flowChars.start + flowChars.end;
      } else {
        str = lines[0];
        for (let i = 1; i < lines.length; ++i) {
          const line = lines[i];
          str += line ? `
${indent}${line}` : "\n";
        }
      }
      if (comment) {
        str += "\n" + stringifyComment.indentComment(commentString(comment), indent);
        if (onComment)
          onComment();
      } else if (chompKeep && onChompKeep)
        onChompKeep();
      return str;
    }
    function stringifyFlowCollection({ items }, ctx, { flowChars, itemIndent }) {
      const { indent, indentStep, flowCollectionPadding: fcPadding, options: { commentString } } = ctx;
      itemIndent += indentStep;
      const itemCtx = Object.assign({}, ctx, {
        indent: itemIndent,
        inFlow: true,
        type: null
      });
      let reqNewline = false;
      let linesAtValue = 0;
      const lines = [];
      for (let i = 0; i < items.length; ++i) {
        const item = items[i];
        let comment = null;
        if (identity.isNode(item)) {
          if (item.spaceBefore)
            lines.push("");
          addCommentBefore(ctx, lines, item.commentBefore, false);
          if (item.comment)
            comment = item.comment;
        } else if (identity.isPair(item)) {
          const ik = identity.isNode(item.key) ? item.key : null;
          if (ik) {
            if (ik.spaceBefore)
              lines.push("");
            addCommentBefore(ctx, lines, ik.commentBefore, false);
            if (ik.comment)
              reqNewline = true;
          }
          const iv = identity.isNode(item.value) ? item.value : null;
          if (iv) {
            if (iv.comment)
              comment = iv.comment;
            if (iv.commentBefore)
              reqNewline = true;
          } else if (item.value == null && ik?.comment) {
            comment = ik.comment;
          }
        }
        if (comment)
          reqNewline = true;
        let str = stringify.stringify(item, itemCtx, () => comment = null);
        reqNewline || (reqNewline = lines.length > linesAtValue || str.includes("\n"));
        if (i < items.length - 1) {
          str += ",";
        } else if (ctx.options.trailingComma) {
          if (ctx.options.lineWidth > 0) {
            reqNewline || (reqNewline = lines.reduce((sum, line) => sum + line.length + 2, 2) + (str.length + 2) > ctx.options.lineWidth);
          }
          if (reqNewline) {
            str += ",";
          }
        }
        if (comment)
          str += stringifyComment.lineComment(str, itemIndent, commentString(comment));
        lines.push(str);
        linesAtValue = lines.length;
      }
      const { start, end } = flowChars;
      if (lines.length === 0) {
        return start + end;
      } else {
        if (!reqNewline) {
          const len = lines.reduce((sum, line) => sum + line.length + 2, 2);
          reqNewline = ctx.options.lineWidth > 0 && len > ctx.options.lineWidth;
        }
        if (reqNewline) {
          let str = start;
          for (const line of lines)
            str += line ? `
${indentStep}${indent}${line}` : "\n";
          return `${str}
${indent}${end}`;
        } else {
          return `${start}${fcPadding}${lines.join(" ")}${fcPadding}${end}`;
        }
      }
    }
    function addCommentBefore({ indent, options: { commentString } }, lines, comment, chompKeep) {
      if (comment && chompKeep)
        comment = comment.replace(/^\n+/, "");
      if (comment) {
        const ic = stringifyComment.indentComment(commentString(comment), indent);
        lines.push(ic.trimStart());
      }
    }
    exports.stringifyCollection = stringifyCollection;
  }
});

// node_modules/yaml/dist/nodes/YAMLMap.js
var require_YAMLMap = __commonJS({
  "node_modules/yaml/dist/nodes/YAMLMap.js"(exports) {
    "use strict";
    var stringifyCollection = require_stringifyCollection();
    var addPairToJSMap = require_addPairToJSMap();
    var Collection = require_Collection();
    var identity = require_identity();
    var Pair = require_Pair();
    var Scalar = require_Scalar();
    function findPair(items, key) {
      const k = identity.isScalar(key) ? key.value : key;
      for (const it of items) {
        if (identity.isPair(it)) {
          if (it.key === key || it.key === k)
            return it;
          if (identity.isScalar(it.key) && it.key.value === k)
            return it;
        }
      }
      return void 0;
    }
    var YAMLMap = class extends Collection.Collection {
      static get tagName() {
        return "tag:yaml.org,2002:map";
      }
      constructor(schema) {
        super(identity.MAP, schema);
        this.items = [];
      }
      /**
       * A generic collection parsing method that can be extended
       * to other node classes that inherit from YAMLMap
       */
      static from(schema, obj, ctx) {
        const { keepUndefined, replacer } = ctx;
        const map = new this(schema);
        const add = (key, value) => {
          if (typeof replacer === "function")
            value = replacer.call(obj, key, value);
          else if (Array.isArray(replacer) && !replacer.includes(key))
            return;
          if (value !== void 0 || keepUndefined)
            map.items.push(Pair.createPair(key, value, ctx));
        };
        if (obj instanceof Map) {
          for (const [key, value] of obj)
            add(key, value);
        } else if (obj && typeof obj === "object") {
          for (const key of Object.keys(obj))
            add(key, obj[key]);
        }
        if (typeof schema.sortMapEntries === "function") {
          map.items.sort(schema.sortMapEntries);
        }
        return map;
      }
      /**
       * Adds a value to the collection.
       *
       * @param overwrite - If not set `true`, using a key that is already in the
       *   collection will throw. Otherwise, overwrites the previous value.
       */
      add(pair, overwrite) {
        let _pair;
        if (identity.isPair(pair))
          _pair = pair;
        else if (!pair || typeof pair !== "object" || !("key" in pair)) {
          _pair = new Pair.Pair(pair, pair?.value);
        } else
          _pair = new Pair.Pair(pair.key, pair.value);
        const prev = findPair(this.items, _pair.key);
        const sortEntries = this.schema?.sortMapEntries;
        if (prev) {
          if (!overwrite)
            throw new Error(`Key ${_pair.key} already set`);
          if (identity.isScalar(prev.value) && Scalar.isScalarValue(_pair.value))
            prev.value.value = _pair.value;
          else
            prev.value = _pair.value;
        } else if (sortEntries) {
          const i = this.items.findIndex((item) => sortEntries(_pair, item) < 0);
          if (i === -1)
            this.items.push(_pair);
          else
            this.items.splice(i, 0, _pair);
        } else {
          this.items.push(_pair);
        }
      }
      delete(key) {
        const it = findPair(this.items, key);
        if (!it)
          return false;
        const del = this.items.splice(this.items.indexOf(it), 1);
        return del.length > 0;
      }
      get(key, keepScalar) {
        const it = findPair(this.items, key);
        const node = it?.value;
        return (!keepScalar && identity.isScalar(node) ? node.value : node) ?? void 0;
      }
      has(key) {
        return !!findPair(this.items, key);
      }
      set(key, value) {
        this.add(new Pair.Pair(key, value), true);
      }
      /**
       * @param ctx - Conversion context, originally set in Document#toJS()
       * @param {Class} Type - If set, forces the returned collection type
       * @returns Instance of Type, Map, or Object
       */
      toJSON(_, ctx, Type) {
        const map = Type ? new Type() : ctx?.mapAsMap ? /* @__PURE__ */ new Map() : {};
        if (ctx?.onCreate)
          ctx.onCreate(map);
        for (const item of this.items)
          addPairToJSMap.addPairToJSMap(ctx, map, item);
        return map;
      }
      toString(ctx, onComment, onChompKeep) {
        if (!ctx)
          return JSON.stringify(this);
        for (const item of this.items) {
          if (!identity.isPair(item))
            throw new Error(`Map items must all be pairs; found ${JSON.stringify(item)} instead`);
        }
        if (!ctx.allNullValues && this.hasAllNullValues(false))
          ctx = Object.assign({}, ctx, { allNullValues: true });
        return stringifyCollection.stringifyCollection(this, ctx, {
          blockItemPrefix: "",
          flowChars: { start: "{", end: "}" },
          itemIndent: ctx.indent || "",
          onChompKeep,
          onComment
        });
      }
    };
    exports.YAMLMap = YAMLMap;
    exports.findPair = findPair;
  }
});

// node_modules/yaml/dist/schema/common/map.js
var require_map = __commonJS({
  "node_modules/yaml/dist/schema/common/map.js"(exports) {
    "use strict";
    var identity = require_identity();
    var YAMLMap = require_YAMLMap();
    var map = {
      collection: "map",
      default: true,
      nodeClass: YAMLMap.YAMLMap,
      tag: "tag:yaml.org,2002:map",
      resolve(map2, onError) {
        if (!identity.isMap(map2))
          onError("Expected a mapping for this tag");
        return map2;
      },
      createNode: (schema, obj, ctx) => YAMLMap.YAMLMap.from(schema, obj, ctx)
    };
    exports.map = map;
  }
});

// node_modules/yaml/dist/nodes/YAMLSeq.js
var require_YAMLSeq = __commonJS({
  "node_modules/yaml/dist/nodes/YAMLSeq.js"(exports) {
    "use strict";
    var createNode = require_createNode();
    var stringifyCollection = require_stringifyCollection();
    var Collection = require_Collection();
    var identity = require_identity();
    var Scalar = require_Scalar();
    var toJS = require_toJS();
    var YAMLSeq = class extends Collection.Collection {
      static get tagName() {
        return "tag:yaml.org,2002:seq";
      }
      constructor(schema) {
        super(identity.SEQ, schema);
        this.items = [];
      }
      add(value) {
        this.items.push(value);
      }
      /**
       * Removes a value from the collection.
       *
       * `key` must contain a representation of an integer for this to succeed.
       * It may be wrapped in a `Scalar`.
       *
       * @returns `true` if the item was found and removed.
       */
      delete(key) {
        const idx = asItemIndex(key);
        if (typeof idx !== "number")
          return false;
        const del = this.items.splice(idx, 1);
        return del.length > 0;
      }
      get(key, keepScalar) {
        const idx = asItemIndex(key);
        if (typeof idx !== "number")
          return void 0;
        const it = this.items[idx];
        return !keepScalar && identity.isScalar(it) ? it.value : it;
      }
      /**
       * Checks if the collection includes a value with the key `key`.
       *
       * `key` must contain a representation of an integer for this to succeed.
       * It may be wrapped in a `Scalar`.
       */
      has(key) {
        const idx = asItemIndex(key);
        return typeof idx === "number" && idx < this.items.length;
      }
      /**
       * Sets a value in this collection. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       *
       * If `key` does not contain a representation of an integer, this will throw.
       * It may be wrapped in a `Scalar`.
       */
      set(key, value) {
        const idx = asItemIndex(key);
        if (typeof idx !== "number")
          throw new Error(`Expected a valid index, not ${key}.`);
        const prev = this.items[idx];
        if (identity.isScalar(prev) && Scalar.isScalarValue(value))
          prev.value = value;
        else
          this.items[idx] = value;
      }
      toJSON(_, ctx) {
        const seq = [];
        if (ctx?.onCreate)
          ctx.onCreate(seq);
        let i = 0;
        for (const item of this.items)
          seq.push(toJS.toJS(item, String(i++), ctx));
        return seq;
      }
      toString(ctx, onComment, onChompKeep) {
        if (!ctx)
          return JSON.stringify(this);
        return stringifyCollection.stringifyCollection(this, ctx, {
          blockItemPrefix: "- ",
          flowChars: { start: "[", end: "]" },
          itemIndent: (ctx.indent || "") + "  ",
          onChompKeep,
          onComment
        });
      }
      static from(schema, obj, ctx) {
        const { replacer } = ctx;
        const seq = new this(schema);
        if (obj && Symbol.iterator in Object(obj)) {
          let i = 0;
          for (let it of obj) {
            if (typeof replacer === "function") {
              const key = obj instanceof Set ? it : String(i++);
              it = replacer.call(obj, key, it);
            }
            seq.items.push(createNode.createNode(it, void 0, ctx));
          }
        }
        return seq;
      }
    };
    function asItemIndex(key) {
      let idx = identity.isScalar(key) ? key.value : key;
      if (idx && typeof idx === "string")
        idx = Number(idx);
      return typeof idx === "number" && Number.isInteger(idx) && idx >= 0 ? idx : null;
    }
    exports.YAMLSeq = YAMLSeq;
  }
});

// node_modules/yaml/dist/schema/common/seq.js
var require_seq = __commonJS({
  "node_modules/yaml/dist/schema/common/seq.js"(exports) {
    "use strict";
    var identity = require_identity();
    var YAMLSeq = require_YAMLSeq();
    var seq = {
      collection: "seq",
      default: true,
      nodeClass: YAMLSeq.YAMLSeq,
      tag: "tag:yaml.org,2002:seq",
      resolve(seq2, onError) {
        if (!identity.isSeq(seq2))
          onError("Expected a sequence for this tag");
        return seq2;
      },
      createNode: (schema, obj, ctx) => YAMLSeq.YAMLSeq.from(schema, obj, ctx)
    };
    exports.seq = seq;
  }
});

// node_modules/yaml/dist/schema/common/string.js
var require_string = __commonJS({
  "node_modules/yaml/dist/schema/common/string.js"(exports) {
    "use strict";
    var stringifyString = require_stringifyString();
    var string = {
      identify: (value) => typeof value === "string",
      default: true,
      tag: "tag:yaml.org,2002:str",
      resolve: (str) => str,
      stringify(item, ctx, onComment, onChompKeep) {
        ctx = Object.assign({ actualString: true }, ctx);
        return stringifyString.stringifyString(item, ctx, onComment, onChompKeep);
      }
    };
    exports.string = string;
  }
});

// node_modules/yaml/dist/schema/common/null.js
var require_null = __commonJS({
  "node_modules/yaml/dist/schema/common/null.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var nullTag = {
      identify: (value) => value == null,
      createNode: () => new Scalar.Scalar(null),
      default: true,
      tag: "tag:yaml.org,2002:null",
      test: /^(?:~|[Nn]ull|NULL)?$/,
      resolve: () => new Scalar.Scalar(null),
      stringify: ({ source }, ctx) => typeof source === "string" && nullTag.test.test(source) ? source : ctx.options.nullStr
    };
    exports.nullTag = nullTag;
  }
});

// node_modules/yaml/dist/schema/core/bool.js
var require_bool = __commonJS({
  "node_modules/yaml/dist/schema/core/bool.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var boolTag = {
      identify: (value) => typeof value === "boolean",
      default: true,
      tag: "tag:yaml.org,2002:bool",
      test: /^(?:[Tt]rue|TRUE|[Ff]alse|FALSE)$/,
      resolve: (str) => new Scalar.Scalar(str[0] === "t" || str[0] === "T"),
      stringify({ source, value }, ctx) {
        if (source && boolTag.test.test(source)) {
          const sv = source[0] === "t" || source[0] === "T";
          if (value === sv)
            return source;
        }
        return value ? ctx.options.trueStr : ctx.options.falseStr;
      }
    };
    exports.boolTag = boolTag;
  }
});

// node_modules/yaml/dist/stringify/stringifyNumber.js
var require_stringifyNumber = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyNumber.js"(exports) {
    "use strict";
    function stringifyNumber({ format, minFractionDigits, tag, value }) {
      if (typeof value === "bigint")
        return String(value);
      const num = typeof value === "number" ? value : Number(value);
      if (!isFinite(num))
        return isNaN(num) ? ".nan" : num < 0 ? "-.inf" : ".inf";
      let n = Object.is(value, -0) ? "-0" : JSON.stringify(value);
      if (!format && minFractionDigits && (!tag || tag === "tag:yaml.org,2002:float") && /^-?\d/.test(n) && !n.includes("e")) {
        let i = n.indexOf(".");
        if (i < 0) {
          i = n.length;
          n += ".";
        }
        let d = minFractionDigits - (n.length - i - 1);
        while (d-- > 0)
          n += "0";
      }
      return n;
    }
    exports.stringifyNumber = stringifyNumber;
  }
});

// node_modules/yaml/dist/schema/core/float.js
var require_float = __commonJS({
  "node_modules/yaml/dist/schema/core/float.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var stringifyNumber = require_stringifyNumber();
    var floatNaN = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$/,
      resolve: (str) => str.slice(-3).toLowerCase() === "nan" ? NaN : str[0] === "-" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY,
      stringify: stringifyNumber.stringifyNumber
    };
    var floatExp = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      format: "EXP",
      test: /^[-+]?(?:\.[0-9]+|[0-9]+(?:\.[0-9]*)?)[eE][-+]?[0-9]+$/,
      resolve: (str) => parseFloat(str),
      stringify(node) {
        const num = Number(node.value);
        return isFinite(num) ? num.toExponential() : stringifyNumber.stringifyNumber(node);
      }
    };
    var float = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^[-+]?(?:\.[0-9]+|[0-9]+\.[0-9]*)$/,
      resolve(str) {
        const node = new Scalar.Scalar(parseFloat(str));
        const dot = str.indexOf(".");
        if (dot !== -1 && str[str.length - 1] === "0")
          node.minFractionDigits = str.length - dot - 1;
        return node;
      },
      stringify: stringifyNumber.stringifyNumber
    };
    exports.float = float;
    exports.floatExp = floatExp;
    exports.floatNaN = floatNaN;
  }
});

// node_modules/yaml/dist/schema/core/int.js
var require_int = __commonJS({
  "node_modules/yaml/dist/schema/core/int.js"(exports) {
    "use strict";
    var stringifyNumber = require_stringifyNumber();
    var intIdentify = (value) => typeof value === "bigint" || Number.isInteger(value);
    var intResolve = (str, offset, radix, { intAsBigInt }) => intAsBigInt ? BigInt(str) : parseInt(str.substring(offset), radix);
    function intStringify(node, radix, prefix) {
      const { value } = node;
      if (intIdentify(value) && value >= 0)
        return prefix + value.toString(radix);
      return stringifyNumber.stringifyNumber(node);
    }
    var intOct = {
      identify: (value) => intIdentify(value) && value >= 0,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "OCT",
      test: /^0o[0-7]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 8, opt),
      stringify: (node) => intStringify(node, 8, "0o")
    };
    var int = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      test: /^[-+]?[0-9]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 0, 10, opt),
      stringify: stringifyNumber.stringifyNumber
    };
    var intHex = {
      identify: (value) => intIdentify(value) && value >= 0,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "HEX",
      test: /^0x[0-9a-fA-F]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 16, opt),
      stringify: (node) => intStringify(node, 16, "0x")
    };
    exports.int = int;
    exports.intHex = intHex;
    exports.intOct = intOct;
  }
});

// node_modules/yaml/dist/schema/core/schema.js
var require_schema = __commonJS({
  "node_modules/yaml/dist/schema/core/schema.js"(exports) {
    "use strict";
    var map = require_map();
    var _null = require_null();
    var seq = require_seq();
    var string = require_string();
    var bool = require_bool();
    var float = require_float();
    var int = require_int();
    var schema = [
      map.map,
      seq.seq,
      string.string,
      _null.nullTag,
      bool.boolTag,
      int.intOct,
      int.int,
      int.intHex,
      float.floatNaN,
      float.floatExp,
      float.float
    ];
    exports.schema = schema;
  }
});

// node_modules/yaml/dist/schema/json/schema.js
var require_schema2 = __commonJS({
  "node_modules/yaml/dist/schema/json/schema.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var map = require_map();
    var seq = require_seq();
    function intIdentify(value) {
      return typeof value === "bigint" || Number.isInteger(value);
    }
    var stringifyJSON = ({ value }) => JSON.stringify(value);
    var jsonScalars = [
      {
        identify: (value) => typeof value === "string",
        default: true,
        tag: "tag:yaml.org,2002:str",
        resolve: (str) => str,
        stringify: stringifyJSON
      },
      {
        identify: (value) => value == null,
        createNode: () => new Scalar.Scalar(null),
        default: true,
        tag: "tag:yaml.org,2002:null",
        test: /^null$/,
        resolve: () => null,
        stringify: stringifyJSON
      },
      {
        identify: (value) => typeof value === "boolean",
        default: true,
        tag: "tag:yaml.org,2002:bool",
        test: /^true$|^false$/,
        resolve: (str) => str === "true",
        stringify: stringifyJSON
      },
      {
        identify: intIdentify,
        default: true,
        tag: "tag:yaml.org,2002:int",
        test: /^-?(?:0|[1-9][0-9]*)$/,
        resolve: (str, _onError, { intAsBigInt }) => intAsBigInt ? BigInt(str) : parseInt(str, 10),
        stringify: ({ value }) => intIdentify(value) ? value.toString() : JSON.stringify(value)
      },
      {
        identify: (value) => typeof value === "number",
        default: true,
        tag: "tag:yaml.org,2002:float",
        test: /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]*)?(?:[eE][-+]?[0-9]+)?$/,
        resolve: (str) => parseFloat(str),
        stringify: stringifyJSON
      }
    ];
    var jsonError = {
      default: true,
      tag: "",
      test: /^/,
      resolve(str, onError) {
        onError(`Unresolved plain scalar ${JSON.stringify(str)}`);
        return str;
      }
    };
    var schema = [map.map, seq.seq].concat(jsonScalars, jsonError);
    exports.schema = schema;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/binary.js
var require_binary = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/binary.js"(exports) {
    "use strict";
    var node_buffer = __require("buffer");
    var Scalar = require_Scalar();
    var stringifyString = require_stringifyString();
    var binary = {
      identify: (value) => value instanceof Uint8Array,
      // Buffer inherits from Uint8Array
      default: false,
      tag: "tag:yaml.org,2002:binary",
      /**
       * Returns a Buffer in node and an Uint8Array in browsers
       *
       * To use the resulting buffer as an image, you'll want to do something like:
       *
       *   const blob = new Blob([buffer], { type: 'image/jpeg' })
       *   document.querySelector('#photo').src = URL.createObjectURL(blob)
       */
      resolve(src, onError) {
        if (typeof node_buffer.Buffer === "function") {
          return node_buffer.Buffer.from(src, "base64");
        } else if (typeof atob === "function") {
          const str = atob(src.replace(/[\n\r]/g, ""));
          const buffer = new Uint8Array(str.length);
          for (let i = 0; i < str.length; ++i)
            buffer[i] = str.charCodeAt(i);
          return buffer;
        } else {
          onError("This environment does not support reading binary tags; either Buffer or atob is required");
          return src;
        }
      },
      stringify({ comment, type, value }, ctx, onComment, onChompKeep) {
        if (!value)
          return "";
        const buf = value;
        let str;
        if (typeof node_buffer.Buffer === "function") {
          str = buf instanceof node_buffer.Buffer ? buf.toString("base64") : node_buffer.Buffer.from(buf.buffer).toString("base64");
        } else if (typeof btoa === "function") {
          let s = "";
          for (let i = 0; i < buf.length; ++i)
            s += String.fromCharCode(buf[i]);
          str = btoa(s);
        } else {
          throw new Error("This environment does not support writing binary tags; either Buffer or btoa is required");
        }
        type ?? (type = Scalar.Scalar.BLOCK_LITERAL);
        if (type !== Scalar.Scalar.QUOTE_DOUBLE) {
          const lineWidth = Math.max(ctx.options.lineWidth - ctx.indent.length, ctx.options.minContentWidth);
          const n = Math.ceil(str.length / lineWidth);
          const lines = new Array(n);
          for (let i = 0, o = 0; i < n; ++i, o += lineWidth) {
            lines[i] = str.substr(o, lineWidth);
          }
          str = lines.join(type === Scalar.Scalar.BLOCK_LITERAL ? "\n" : " ");
        }
        return stringifyString.stringifyString({ comment, type, value: str }, ctx, onComment, onChompKeep);
      }
    };
    exports.binary = binary;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/pairs.js
var require_pairs = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/pairs.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Pair = require_Pair();
    var Scalar = require_Scalar();
    var YAMLSeq = require_YAMLSeq();
    function resolvePairs(seq, onError) {
      if (identity.isSeq(seq)) {
        for (let i = 0; i < seq.items.length; ++i) {
          let item = seq.items[i];
          if (identity.isPair(item))
            continue;
          else if (identity.isMap(item)) {
            if (item.items.length > 1)
              onError("Each pair must have its own sequence indicator");
            const pair = item.items[0] || new Pair.Pair(new Scalar.Scalar(null));
            if (item.commentBefore)
              pair.key.commentBefore = pair.key.commentBefore ? `${item.commentBefore}
${pair.key.commentBefore}` : item.commentBefore;
            if (item.comment) {
              const cn = pair.value ?? pair.key;
              cn.comment = cn.comment ? `${item.comment}
${cn.comment}` : item.comment;
            }
            item = pair;
          }
          seq.items[i] = identity.isPair(item) ? item : new Pair.Pair(item);
        }
      } else
        onError("Expected a sequence for this tag");
      return seq;
    }
    function createPairs(schema, iterable, ctx) {
      const { replacer } = ctx;
      const pairs2 = new YAMLSeq.YAMLSeq(schema);
      pairs2.tag = "tag:yaml.org,2002:pairs";
      let i = 0;
      if (iterable && Symbol.iterator in Object(iterable))
        for (let it of iterable) {
          if (typeof replacer === "function")
            it = replacer.call(iterable, String(i++), it);
          let key, value;
          if (Array.isArray(it)) {
            if (it.length === 2) {
              key = it[0];
              value = it[1];
            } else
              throw new TypeError(`Expected [key, value] tuple: ${it}`);
          } else if (it && it instanceof Object) {
            const keys = Object.keys(it);
            if (keys.length === 1) {
              key = keys[0];
              value = it[key];
            } else {
              throw new TypeError(`Expected tuple with one key, not ${keys.length} keys`);
            }
          } else {
            key = it;
          }
          pairs2.items.push(Pair.createPair(key, value, ctx));
        }
      return pairs2;
    }
    var pairs = {
      collection: "seq",
      default: false,
      tag: "tag:yaml.org,2002:pairs",
      resolve: resolvePairs,
      createNode: createPairs
    };
    exports.createPairs = createPairs;
    exports.pairs = pairs;
    exports.resolvePairs = resolvePairs;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/omap.js
var require_omap = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/omap.js"(exports) {
    "use strict";
    var identity = require_identity();
    var toJS = require_toJS();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var pairs = require_pairs();
    var YAMLOMap = class _YAMLOMap extends YAMLSeq.YAMLSeq {
      constructor() {
        super();
        this.add = YAMLMap.YAMLMap.prototype.add.bind(this);
        this.delete = YAMLMap.YAMLMap.prototype.delete.bind(this);
        this.get = YAMLMap.YAMLMap.prototype.get.bind(this);
        this.has = YAMLMap.YAMLMap.prototype.has.bind(this);
        this.set = YAMLMap.YAMLMap.prototype.set.bind(this);
        this.tag = _YAMLOMap.tag;
      }
      /**
       * If `ctx` is given, the return type is actually `Map<unknown, unknown>`,
       * but TypeScript won't allow widening the signature of a child method.
       */
      toJSON(_, ctx) {
        if (!ctx)
          return super.toJSON(_);
        const map = /* @__PURE__ */ new Map();
        if (ctx?.onCreate)
          ctx.onCreate(map);
        for (const pair of this.items) {
          let key, value;
          if (identity.isPair(pair)) {
            key = toJS.toJS(pair.key, "", ctx);
            value = toJS.toJS(pair.value, key, ctx);
          } else {
            key = toJS.toJS(pair, "", ctx);
          }
          if (map.has(key))
            throw new Error("Ordered maps must not include duplicate keys");
          map.set(key, value);
        }
        return map;
      }
      static from(schema, iterable, ctx) {
        const pairs$1 = pairs.createPairs(schema, iterable, ctx);
        const omap2 = new this();
        omap2.items = pairs$1.items;
        return omap2;
      }
    };
    YAMLOMap.tag = "tag:yaml.org,2002:omap";
    var omap = {
      collection: "seq",
      identify: (value) => value instanceof Map,
      nodeClass: YAMLOMap,
      default: false,
      tag: "tag:yaml.org,2002:omap",
      resolve(seq, onError) {
        const pairs$1 = pairs.resolvePairs(seq, onError);
        const seenKeys = [];
        for (const { key } of pairs$1.items) {
          if (identity.isScalar(key)) {
            if (seenKeys.includes(key.value)) {
              onError(`Ordered maps must not include duplicate keys: ${key.value}`);
            } else {
              seenKeys.push(key.value);
            }
          }
        }
        return Object.assign(new YAMLOMap(), pairs$1);
      },
      createNode: (schema, iterable, ctx) => YAMLOMap.from(schema, iterable, ctx)
    };
    exports.YAMLOMap = YAMLOMap;
    exports.omap = omap;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/bool.js
var require_bool2 = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/bool.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    function boolStringify({ value, source }, ctx) {
      const boolObj = value ? trueTag : falseTag;
      if (source && boolObj.test.test(source))
        return source;
      return value ? ctx.options.trueStr : ctx.options.falseStr;
    }
    var trueTag = {
      identify: (value) => value === true,
      default: true,
      tag: "tag:yaml.org,2002:bool",
      test: /^(?:Y|y|[Yy]es|YES|[Tt]rue|TRUE|[Oo]n|ON)$/,
      resolve: () => new Scalar.Scalar(true),
      stringify: boolStringify
    };
    var falseTag = {
      identify: (value) => value === false,
      default: true,
      tag: "tag:yaml.org,2002:bool",
      test: /^(?:N|n|[Nn]o|NO|[Ff]alse|FALSE|[Oo]ff|OFF)$/,
      resolve: () => new Scalar.Scalar(false),
      stringify: boolStringify
    };
    exports.falseTag = falseTag;
    exports.trueTag = trueTag;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/float.js
var require_float2 = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/float.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var stringifyNumber = require_stringifyNumber();
    var floatNaN = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$/,
      resolve: (str) => str.slice(-3).toLowerCase() === "nan" ? NaN : str[0] === "-" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY,
      stringify: stringifyNumber.stringifyNumber
    };
    var floatExp = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      format: "EXP",
      test: /^[-+]?(?:[0-9][0-9_]*)?(?:\.[0-9_]*)?[eE][-+]?[0-9]+$/,
      resolve: (str) => parseFloat(str.replace(/_/g, "")),
      stringify(node) {
        const num = Number(node.value);
        return isFinite(num) ? num.toExponential() : stringifyNumber.stringifyNumber(node);
      }
    };
    var float = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^[-+]?(?:[0-9][0-9_]*)?\.[0-9_]*$/,
      resolve(str) {
        const node = new Scalar.Scalar(parseFloat(str.replace(/_/g, "")));
        const dot = str.indexOf(".");
        if (dot !== -1) {
          const f = str.substring(dot + 1).replace(/_/g, "");
          if (f[f.length - 1] === "0")
            node.minFractionDigits = f.length;
        }
        return node;
      },
      stringify: stringifyNumber.stringifyNumber
    };
    exports.float = float;
    exports.floatExp = floatExp;
    exports.floatNaN = floatNaN;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/int.js
var require_int2 = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/int.js"(exports) {
    "use strict";
    var stringifyNumber = require_stringifyNumber();
    var intIdentify = (value) => typeof value === "bigint" || Number.isInteger(value);
    function intResolve(str, offset, radix, { intAsBigInt }) {
      const sign = str[0];
      if (sign === "-" || sign === "+")
        offset += 1;
      str = str.substring(offset).replace(/_/g, "");
      if (intAsBigInt) {
        switch (radix) {
          case 2:
            str = `0b${str}`;
            break;
          case 8:
            str = `0o${str}`;
            break;
          case 16:
            str = `0x${str}`;
            break;
        }
        const n2 = BigInt(str);
        return sign === "-" ? BigInt(-1) * n2 : n2;
      }
      const n = parseInt(str, radix);
      return sign === "-" ? -1 * n : n;
    }
    function intStringify(node, radix, prefix) {
      const { value } = node;
      if (intIdentify(value)) {
        const str = value.toString(radix);
        return value < 0 ? "-" + prefix + str.substr(1) : prefix + str;
      }
      return stringifyNumber.stringifyNumber(node);
    }
    var intBin = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "BIN",
      test: /^[-+]?0b[0-1_]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 2, opt),
      stringify: (node) => intStringify(node, 2, "0b")
    };
    var intOct = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "OCT",
      test: /^[-+]?0[0-7_]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 1, 8, opt),
      stringify: (node) => intStringify(node, 8, "0")
    };
    var int = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      test: /^[-+]?[0-9][0-9_]*$/,
      resolve: (str, _onError, opt) => intResolve(str, 0, 10, opt),
      stringify: stringifyNumber.stringifyNumber
    };
    var intHex = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "HEX",
      test: /^[-+]?0x[0-9a-fA-F_]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 16, opt),
      stringify: (node) => intStringify(node, 16, "0x")
    };
    exports.int = int;
    exports.intBin = intBin;
    exports.intHex = intHex;
    exports.intOct = intOct;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/set.js
var require_set = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/set.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Pair = require_Pair();
    var YAMLMap = require_YAMLMap();
    var YAMLSet = class _YAMLSet extends YAMLMap.YAMLMap {
      constructor(schema) {
        super(schema);
        this.tag = _YAMLSet.tag;
      }
      add(key) {
        let pair;
        if (identity.isPair(key))
          pair = key;
        else if (key && typeof key === "object" && "key" in key && "value" in key && key.value === null)
          pair = new Pair.Pair(key.key, null);
        else
          pair = new Pair.Pair(key, null);
        const prev = YAMLMap.findPair(this.items, pair.key);
        if (!prev)
          this.items.push(pair);
      }
      /**
       * If `keepPair` is `true`, returns the Pair matching `key`.
       * Otherwise, returns the value of that Pair's key.
       */
      get(key, keepPair) {
        const pair = YAMLMap.findPair(this.items, key);
        return !keepPair && identity.isPair(pair) ? identity.isScalar(pair.key) ? pair.key.value : pair.key : pair;
      }
      set(key, value) {
        if (typeof value !== "boolean")
          throw new Error(`Expected boolean value for set(key, value) in a YAML set, not ${typeof value}`);
        const prev = YAMLMap.findPair(this.items, key);
        if (prev && !value) {
          this.items.splice(this.items.indexOf(prev), 1);
        } else if (!prev && value) {
          this.items.push(new Pair.Pair(key));
        }
      }
      toJSON(_, ctx) {
        return super.toJSON(_, ctx, Set);
      }
      toString(ctx, onComment, onChompKeep) {
        if (!ctx)
          return JSON.stringify(this);
        if (this.hasAllNullValues(true))
          return super.toString(Object.assign({}, ctx, { allNullValues: true }), onComment, onChompKeep);
        else
          throw new Error("Set items must all have null values");
      }
      static from(schema, iterable, ctx) {
        const { replacer } = ctx;
        const set2 = new this(schema);
        if (iterable && Symbol.iterator in Object(iterable))
          for (let value of iterable) {
            if (typeof replacer === "function")
              value = replacer.call(iterable, value, value);
            set2.items.push(Pair.createPair(value, null, ctx));
          }
        return set2;
      }
    };
    YAMLSet.tag = "tag:yaml.org,2002:set";
    var set = {
      collection: "map",
      identify: (value) => value instanceof Set,
      nodeClass: YAMLSet,
      default: false,
      tag: "tag:yaml.org,2002:set",
      createNode: (schema, iterable, ctx) => YAMLSet.from(schema, iterable, ctx),
      resolve(map, onError) {
        if (identity.isMap(map)) {
          if (map.hasAllNullValues(true))
            return Object.assign(new YAMLSet(), map);
          else
            onError("Set items must all have null values");
        } else
          onError("Expected a mapping for this tag");
        return map;
      }
    };
    exports.YAMLSet = YAMLSet;
    exports.set = set;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/timestamp.js
var require_timestamp = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/timestamp.js"(exports) {
    "use strict";
    var stringifyNumber = require_stringifyNumber();
    function parseSexagesimal(str, asBigInt) {
      const sign = str[0];
      const parts = sign === "-" || sign === "+" ? str.substring(1) : str;
      const num = (n) => asBigInt ? BigInt(n) : Number(n);
      const res = parts.replace(/_/g, "").split(":").reduce((res2, p) => res2 * num(60) + num(p), num(0));
      return sign === "-" ? num(-1) * res : res;
    }
    function stringifySexagesimal(node) {
      let { value } = node;
      let num = (n) => n;
      if (typeof value === "bigint")
        num = (n) => BigInt(n);
      else if (isNaN(value) || !isFinite(value))
        return stringifyNumber.stringifyNumber(node);
      let sign = "";
      if (value < 0) {
        sign = "-";
        value *= num(-1);
      }
      const _60 = num(60);
      const parts = [value % _60];
      if (value < 60) {
        parts.unshift(0);
      } else {
        value = (value - parts[0]) / _60;
        parts.unshift(value % _60);
        if (value >= 60) {
          value = (value - parts[0]) / _60;
          parts.unshift(value);
        }
      }
      return sign + parts.map((n) => String(n).padStart(2, "0")).join(":").replace(/000000\d*$/, "");
    }
    var intTime = {
      identify: (value) => typeof value === "bigint" || Number.isInteger(value),
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "TIME",
      test: /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+$/,
      resolve: (str, _onError, { intAsBigInt }) => parseSexagesimal(str, intAsBigInt),
      stringify: stringifySexagesimal
    };
    var floatTime = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      format: "TIME",
      test: /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+\.[0-9_]*$/,
      resolve: (str) => parseSexagesimal(str, false),
      stringify: stringifySexagesimal
    };
    var timestamp = {
      identify: (value) => value instanceof Date,
      default: true,
      tag: "tag:yaml.org,2002:timestamp",
      // If the time zone is omitted, the timestamp is assumed to be specified in UTC. The time part
      // may be omitted altogether, resulting in a date format. In such a case, the time part is
      // assumed to be 00:00:00Z (start of day, UTC).
      test: RegExp("^([0-9]{4})-([0-9]{1,2})-([0-9]{1,2})(?:(?:t|T|[ \\t]+)([0-9]{1,2}):([0-9]{1,2}):([0-9]{1,2}(\\.[0-9]+)?)(?:[ \\t]*(Z|[-+][012]?[0-9](?::[0-9]{2})?))?)?$"),
      resolve(str) {
        const match = str.match(timestamp.test);
        if (!match)
          throw new Error("!!timestamp expects a date, starting with yyyy-mm-dd");
        const [, year, month, day, hour, minute, second] = match.map(Number);
        const millisec = match[7] ? Number((match[7] + "00").substr(1, 3)) : 0;
        let date = Date.UTC(year, month - 1, day, hour || 0, minute || 0, second || 0, millisec);
        const tz = match[8];
        if (tz && tz !== "Z") {
          let d = parseSexagesimal(tz, false);
          if (Math.abs(d) < 30)
            d *= 60;
          date -= 6e4 * d;
        }
        return new Date(date);
      },
      stringify: ({ value }) => value?.toISOString().replace(/(T00:00:00)?\.000Z$/, "") ?? ""
    };
    exports.floatTime = floatTime;
    exports.intTime = intTime;
    exports.timestamp = timestamp;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/schema.js
var require_schema3 = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/schema.js"(exports) {
    "use strict";
    var map = require_map();
    var _null = require_null();
    var seq = require_seq();
    var string = require_string();
    var binary = require_binary();
    var bool = require_bool2();
    var float = require_float2();
    var int = require_int2();
    var merge = require_merge();
    var omap = require_omap();
    var pairs = require_pairs();
    var set = require_set();
    var timestamp = require_timestamp();
    var schema = [
      map.map,
      seq.seq,
      string.string,
      _null.nullTag,
      bool.trueTag,
      bool.falseTag,
      int.intBin,
      int.intOct,
      int.int,
      int.intHex,
      float.floatNaN,
      float.floatExp,
      float.float,
      binary.binary,
      merge.merge,
      omap.omap,
      pairs.pairs,
      set.set,
      timestamp.intTime,
      timestamp.floatTime,
      timestamp.timestamp
    ];
    exports.schema = schema;
  }
});

// node_modules/yaml/dist/schema/tags.js
var require_tags = __commonJS({
  "node_modules/yaml/dist/schema/tags.js"(exports) {
    "use strict";
    var map = require_map();
    var _null = require_null();
    var seq = require_seq();
    var string = require_string();
    var bool = require_bool();
    var float = require_float();
    var int = require_int();
    var schema = require_schema();
    var schema$1 = require_schema2();
    var binary = require_binary();
    var merge = require_merge();
    var omap = require_omap();
    var pairs = require_pairs();
    var schema$2 = require_schema3();
    var set = require_set();
    var timestamp = require_timestamp();
    var schemas = /* @__PURE__ */ new Map([
      ["core", schema.schema],
      ["failsafe", [map.map, seq.seq, string.string]],
      ["json", schema$1.schema],
      ["yaml11", schema$2.schema],
      ["yaml-1.1", schema$2.schema]
    ]);
    var tagsByName = {
      binary: binary.binary,
      bool: bool.boolTag,
      float: float.float,
      floatExp: float.floatExp,
      floatNaN: float.floatNaN,
      floatTime: timestamp.floatTime,
      int: int.int,
      intHex: int.intHex,
      intOct: int.intOct,
      intTime: timestamp.intTime,
      map: map.map,
      merge: merge.merge,
      null: _null.nullTag,
      omap: omap.omap,
      pairs: pairs.pairs,
      seq: seq.seq,
      set: set.set,
      timestamp: timestamp.timestamp
    };
    var coreKnownTags = {
      "tag:yaml.org,2002:binary": binary.binary,
      "tag:yaml.org,2002:merge": merge.merge,
      "tag:yaml.org,2002:omap": omap.omap,
      "tag:yaml.org,2002:pairs": pairs.pairs,
      "tag:yaml.org,2002:set": set.set,
      "tag:yaml.org,2002:timestamp": timestamp.timestamp
    };
    function getTags(customTags, schemaName, addMergeTag) {
      const schemaTags = schemas.get(schemaName);
      if (schemaTags && !customTags) {
        return addMergeTag && !schemaTags.includes(merge.merge) ? schemaTags.concat(merge.merge) : schemaTags.slice();
      }
      let tags = schemaTags;
      if (!tags) {
        if (Array.isArray(customTags))
          tags = [];
        else {
          const keys = Array.from(schemas.keys()).filter((key) => key !== "yaml11").map((key) => JSON.stringify(key)).join(", ");
          throw new Error(`Unknown schema "${schemaName}"; use one of ${keys} or define customTags array`);
        }
      }
      if (Array.isArray(customTags)) {
        for (const tag of customTags)
          tags = tags.concat(tag);
      } else if (typeof customTags === "function") {
        tags = customTags(tags.slice());
      }
      if (addMergeTag)
        tags = tags.concat(merge.merge);
      return tags.reduce((tags2, tag) => {
        const tagObj = typeof tag === "string" ? tagsByName[tag] : tag;
        if (!tagObj) {
          const tagName = JSON.stringify(tag);
          const keys = Object.keys(tagsByName).map((key) => JSON.stringify(key)).join(", ");
          throw new Error(`Unknown custom tag ${tagName}; use one of ${keys}`);
        }
        if (!tags2.includes(tagObj))
          tags2.push(tagObj);
        return tags2;
      }, []);
    }
    exports.coreKnownTags = coreKnownTags;
    exports.getTags = getTags;
  }
});

// node_modules/yaml/dist/schema/Schema.js
var require_Schema = __commonJS({
  "node_modules/yaml/dist/schema/Schema.js"(exports) {
    "use strict";
    var identity = require_identity();
    var map = require_map();
    var seq = require_seq();
    var string = require_string();
    var tags = require_tags();
    var sortMapEntriesByKey = (a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
    var Schema = class _Schema {
      constructor({ compat, customTags, merge, resolveKnownTags, schema, sortMapEntries, toStringDefaults }) {
        this.compat = Array.isArray(compat) ? tags.getTags(compat, "compat") : compat ? tags.getTags(null, compat) : null;
        this.name = typeof schema === "string" && schema || "core";
        this.knownTags = resolveKnownTags ? tags.coreKnownTags : {};
        this.tags = tags.getTags(customTags, this.name, merge);
        this.toStringOptions = toStringDefaults ?? null;
        Object.defineProperty(this, identity.MAP, { value: map.map });
        Object.defineProperty(this, identity.SCALAR, { value: string.string });
        Object.defineProperty(this, identity.SEQ, { value: seq.seq });
        this.sortMapEntries = typeof sortMapEntries === "function" ? sortMapEntries : sortMapEntries === true ? sortMapEntriesByKey : null;
      }
      clone() {
        const copy = Object.create(_Schema.prototype, Object.getOwnPropertyDescriptors(this));
        copy.tags = this.tags.slice();
        return copy;
      }
    };
    exports.Schema = Schema;
  }
});

// node_modules/yaml/dist/stringify/stringifyDocument.js
var require_stringifyDocument = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyDocument.js"(exports) {
    "use strict";
    var identity = require_identity();
    var stringify = require_stringify();
    var stringifyComment = require_stringifyComment();
    function stringifyDocument(doc, options) {
      const lines = [];
      let hasDirectives = options.directives === true;
      if (options.directives !== false && doc.directives) {
        const dir = doc.directives.toString(doc);
        if (dir) {
          lines.push(dir);
          hasDirectives = true;
        } else if (doc.directives.docStart)
          hasDirectives = true;
      }
      if (hasDirectives)
        lines.push("---");
      const ctx = stringify.createStringifyContext(doc, options);
      const { commentString } = ctx.options;
      if (doc.commentBefore) {
        if (lines.length !== 1)
          lines.unshift("");
        const cs = commentString(doc.commentBefore);
        lines.unshift(stringifyComment.indentComment(cs, ""));
      }
      let chompKeep = false;
      let contentComment = null;
      if (doc.contents) {
        if (identity.isNode(doc.contents)) {
          if (doc.contents.spaceBefore && hasDirectives)
            lines.push("");
          if (doc.contents.commentBefore) {
            const cs = commentString(doc.contents.commentBefore);
            lines.push(stringifyComment.indentComment(cs, ""));
          }
          ctx.forceBlockIndent = !!doc.comment;
          contentComment = doc.contents.comment;
        }
        const onChompKeep = contentComment ? void 0 : () => chompKeep = true;
        let body = stringify.stringify(doc.contents, ctx, () => contentComment = null, onChompKeep);
        if (contentComment)
          body += stringifyComment.lineComment(body, "", commentString(contentComment));
        if ((body[0] === "|" || body[0] === ">") && lines[lines.length - 1] === "---") {
          lines[lines.length - 1] = `--- ${body}`;
        } else
          lines.push(body);
      } else {
        lines.push(stringify.stringify(doc.contents, ctx));
      }
      if (doc.directives?.docEnd) {
        if (doc.comment) {
          const cs = commentString(doc.comment);
          if (cs.includes("\n")) {
            lines.push("...");
            lines.push(stringifyComment.indentComment(cs, ""));
          } else {
            lines.push(`... ${cs}`);
          }
        } else {
          lines.push("...");
        }
      } else {
        let dc = doc.comment;
        if (dc && chompKeep)
          dc = dc.replace(/^\n+/, "");
        if (dc) {
          if ((!chompKeep || contentComment) && lines[lines.length - 1] !== "")
            lines.push("");
          lines.push(stringifyComment.indentComment(commentString(dc), ""));
        }
      }
      return lines.join("\n") + "\n";
    }
    exports.stringifyDocument = stringifyDocument;
  }
});

// node_modules/yaml/dist/doc/Document.js
var require_Document = __commonJS({
  "node_modules/yaml/dist/doc/Document.js"(exports) {
    "use strict";
    var Alias = require_Alias();
    var Collection = require_Collection();
    var identity = require_identity();
    var Pair = require_Pair();
    var toJS = require_toJS();
    var Schema = require_Schema();
    var stringifyDocument = require_stringifyDocument();
    var anchors = require_anchors();
    var applyReviver = require_applyReviver();
    var createNode = require_createNode();
    var directives = require_directives();
    var Document = class _Document {
      constructor(value, replacer, options) {
        this.commentBefore = null;
        this.comment = null;
        this.errors = [];
        this.warnings = [];
        Object.defineProperty(this, identity.NODE_TYPE, { value: identity.DOC });
        let _replacer = null;
        if (typeof replacer === "function" || Array.isArray(replacer)) {
          _replacer = replacer;
        } else if (options === void 0 && replacer) {
          options = replacer;
          replacer = void 0;
        }
        const opt = Object.assign({
          intAsBigInt: false,
          keepSourceTokens: false,
          logLevel: "warn",
          prettyErrors: true,
          strict: true,
          stringKeys: false,
          uniqueKeys: true,
          version: "1.2"
        }, options);
        this.options = opt;
        let { version } = opt;
        if (options?._directives) {
          this.directives = options._directives.atDocument();
          if (this.directives.yaml.explicit)
            version = this.directives.yaml.version;
        } else
          this.directives = new directives.Directives({ version });
        this.setSchema(version, options);
        this.contents = value === void 0 ? null : this.createNode(value, _replacer, options);
      }
      /**
       * Create a deep copy of this Document and its contents.
       *
       * Custom Node values that inherit from `Object` still refer to their original instances.
       */
      clone() {
        const copy = Object.create(_Document.prototype, {
          [identity.NODE_TYPE]: { value: identity.DOC }
        });
        copy.commentBefore = this.commentBefore;
        copy.comment = this.comment;
        copy.errors = this.errors.slice();
        copy.warnings = this.warnings.slice();
        copy.options = Object.assign({}, this.options);
        if (this.directives)
          copy.directives = this.directives.clone();
        copy.schema = this.schema.clone();
        copy.contents = identity.isNode(this.contents) ? this.contents.clone(copy.schema) : this.contents;
        if (this.range)
          copy.range = this.range.slice();
        return copy;
      }
      /** Adds a value to the document. */
      add(value) {
        if (assertCollection(this.contents))
          this.contents.add(value);
      }
      /** Adds a value to the document. */
      addIn(path7, value) {
        if (assertCollection(this.contents))
          this.contents.addIn(path7, value);
      }
      /**
       * Create a new `Alias` node, ensuring that the target `node` has the required anchor.
       *
       * If `node` already has an anchor, `name` is ignored.
       * Otherwise, the `node.anchor` value will be set to `name`,
       * or if an anchor with that name is already present in the document,
       * `name` will be used as a prefix for a new unique anchor.
       * If `name` is undefined, the generated anchor will use 'a' as a prefix.
       */
      createAlias(node, name) {
        if (!node.anchor) {
          const prev = anchors.anchorNames(this);
          node.anchor = // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          !name || prev.has(name) ? anchors.findNewAnchor(name || "a", prev) : name;
        }
        return new Alias.Alias(node.anchor);
      }
      createNode(value, replacer, options) {
        let _replacer = void 0;
        if (typeof replacer === "function") {
          value = replacer.call({ "": value }, "", value);
          _replacer = replacer;
        } else if (Array.isArray(replacer)) {
          const keyToStr = (v) => typeof v === "number" || v instanceof String || v instanceof Number;
          const asStr = replacer.filter(keyToStr).map(String);
          if (asStr.length > 0)
            replacer = replacer.concat(asStr);
          _replacer = replacer;
        } else if (options === void 0 && replacer) {
          options = replacer;
          replacer = void 0;
        }
        const { aliasDuplicateObjects, anchorPrefix, flow, keepUndefined, onTagObj, tag } = options ?? {};
        const { onAnchor, setAnchors, sourceObjects } = anchors.createNodeAnchors(
          this,
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          anchorPrefix || "a"
        );
        const ctx = {
          aliasDuplicateObjects: aliasDuplicateObjects ?? true,
          keepUndefined: keepUndefined ?? false,
          onAnchor,
          onTagObj,
          replacer: _replacer,
          schema: this.schema,
          sourceObjects
        };
        const node = createNode.createNode(value, tag, ctx);
        if (flow && identity.isCollection(node))
          node.flow = true;
        setAnchors();
        return node;
      }
      /**
       * Convert a key and a value into a `Pair` using the current schema,
       * recursively wrapping all values as `Scalar` or `Collection` nodes.
       */
      createPair(key, value, options = {}) {
        const k = this.createNode(key, null, options);
        const v = this.createNode(value, null, options);
        return new Pair.Pair(k, v);
      }
      /**
       * Removes a value from the document.
       * @returns `true` if the item was found and removed.
       */
      delete(key) {
        return assertCollection(this.contents) ? this.contents.delete(key) : false;
      }
      /**
       * Removes a value from the document.
       * @returns `true` if the item was found and removed.
       */
      deleteIn(path7) {
        if (Collection.isEmptyPath(path7)) {
          if (this.contents == null)
            return false;
          this.contents = null;
          return true;
        }
        return assertCollection(this.contents) ? this.contents.deleteIn(path7) : false;
      }
      /**
       * Returns item at `key`, or `undefined` if not found. By default unwraps
       * scalar values from their surrounding node; to disable set `keepScalar` to
       * `true` (collections are always returned intact).
       */
      get(key, keepScalar) {
        return identity.isCollection(this.contents) ? this.contents.get(key, keepScalar) : void 0;
      }
      /**
       * Returns item at `path`, or `undefined` if not found. By default unwraps
       * scalar values from their surrounding node; to disable set `keepScalar` to
       * `true` (collections are always returned intact).
       */
      getIn(path7, keepScalar) {
        if (Collection.isEmptyPath(path7))
          return !keepScalar && identity.isScalar(this.contents) ? this.contents.value : this.contents;
        return identity.isCollection(this.contents) ? this.contents.getIn(path7, keepScalar) : void 0;
      }
      /**
       * Checks if the document includes a value with the key `key`.
       */
      has(key) {
        return identity.isCollection(this.contents) ? this.contents.has(key) : false;
      }
      /**
       * Checks if the document includes a value at `path`.
       */
      hasIn(path7) {
        if (Collection.isEmptyPath(path7))
          return this.contents !== void 0;
        return identity.isCollection(this.contents) ? this.contents.hasIn(path7) : false;
      }
      /**
       * Sets a value in this document. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       */
      set(key, value) {
        if (this.contents == null) {
          this.contents = Collection.collectionFromPath(this.schema, [key], value);
        } else if (assertCollection(this.contents)) {
          this.contents.set(key, value);
        }
      }
      /**
       * Sets a value in this document. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       */
      setIn(path7, value) {
        if (Collection.isEmptyPath(path7)) {
          this.contents = value;
        } else if (this.contents == null) {
          this.contents = Collection.collectionFromPath(this.schema, Array.from(path7), value);
        } else if (assertCollection(this.contents)) {
          this.contents.setIn(path7, value);
        }
      }
      /**
       * Change the YAML version and schema used by the document.
       * A `null` version disables support for directives, explicit tags, anchors, and aliases.
       * It also requires the `schema` option to be given as a `Schema` instance value.
       *
       * Overrides all previously set schema options.
       */
      setSchema(version, options = {}) {
        if (typeof version === "number")
          version = String(version);
        let opt;
        switch (version) {
          case "1.1":
            if (this.directives)
              this.directives.yaml.version = "1.1";
            else
              this.directives = new directives.Directives({ version: "1.1" });
            opt = { resolveKnownTags: false, schema: "yaml-1.1" };
            break;
          case "1.2":
          case "next":
            if (this.directives)
              this.directives.yaml.version = version;
            else
              this.directives = new directives.Directives({ version });
            opt = { resolveKnownTags: true, schema: "core" };
            break;
          case null:
            if (this.directives)
              delete this.directives;
            opt = null;
            break;
          default: {
            const sv = JSON.stringify(version);
            throw new Error(`Expected '1.1', '1.2' or null as first argument, but found: ${sv}`);
          }
        }
        if (options.schema instanceof Object)
          this.schema = options.schema;
        else if (opt)
          this.schema = new Schema.Schema(Object.assign(opt, options));
        else
          throw new Error(`With a null YAML version, the { schema: Schema } option is required`);
      }
      // json & jsonArg are only used from toJSON()
      toJS({ json, jsonArg, mapAsMap, maxAliasCount, onAnchor, reviver } = {}) {
        const ctx = {
          anchors: /* @__PURE__ */ new Map(),
          doc: this,
          keep: !json,
          mapAsMap: mapAsMap === true,
          mapKeyWarned: false,
          maxAliasCount: typeof maxAliasCount === "number" ? maxAliasCount : 100
        };
        const res = toJS.toJS(this.contents, jsonArg ?? "", ctx);
        if (typeof onAnchor === "function")
          for (const { count, res: res2 } of ctx.anchors.values())
            onAnchor(res2, count);
        return typeof reviver === "function" ? applyReviver.applyReviver(reviver, { "": res }, "", res) : res;
      }
      /**
       * A JSON representation of the document `contents`.
       *
       * @param jsonArg Used by `JSON.stringify` to indicate the array index or
       *   property name.
       */
      toJSON(jsonArg, onAnchor) {
        return this.toJS({ json: true, jsonArg, mapAsMap: false, onAnchor });
      }
      /** A YAML representation of the document. */
      toString(options = {}) {
        if (this.errors.length > 0)
          throw new Error("Document with errors cannot be stringified");
        if ("indent" in options && (!Number.isInteger(options.indent) || Number(options.indent) <= 0)) {
          const s = JSON.stringify(options.indent);
          throw new Error(`"indent" option must be a positive integer, not ${s}`);
        }
        return stringifyDocument.stringifyDocument(this, options);
      }
    };
    function assertCollection(contents) {
      if (identity.isCollection(contents))
        return true;
      throw new Error("Expected a YAML collection as document contents");
    }
    exports.Document = Document;
  }
});

// node_modules/yaml/dist/errors.js
var require_errors = __commonJS({
  "node_modules/yaml/dist/errors.js"(exports) {
    "use strict";
    var YAMLError = class extends Error {
      constructor(name, pos, code, message) {
        super();
        this.name = name;
        this.code = code;
        this.message = message;
        this.pos = pos;
      }
    };
    var YAMLParseError = class extends YAMLError {
      constructor(pos, code, message) {
        super("YAMLParseError", pos, code, message);
      }
    };
    var YAMLWarning = class extends YAMLError {
      constructor(pos, code, message) {
        super("YAMLWarning", pos, code, message);
      }
    };
    var prettifyError = (src, lc) => (error) => {
      if (error.pos[0] === -1)
        return;
      error.linePos = error.pos.map((pos) => lc.linePos(pos));
      const { line, col } = error.linePos[0];
      error.message += ` at line ${line}, column ${col}`;
      let ci = col - 1;
      let lineStr = src.substring(lc.lineStarts[line - 1], lc.lineStarts[line]).replace(/[\n\r]+$/, "");
      if (ci >= 60 && lineStr.length > 80) {
        const trimStart = Math.min(ci - 39, lineStr.length - 79);
        lineStr = "\u2026" + lineStr.substring(trimStart);
        ci -= trimStart - 1;
      }
      if (lineStr.length > 80)
        lineStr = lineStr.substring(0, 79) + "\u2026";
      if (line > 1 && /^ *$/.test(lineStr.substring(0, ci))) {
        let prev = src.substring(lc.lineStarts[line - 2], lc.lineStarts[line - 1]);
        if (prev.length > 80)
          prev = prev.substring(0, 79) + "\u2026\n";
        lineStr = prev + lineStr;
      }
      if (/[^ ]/.test(lineStr)) {
        let count = 1;
        const end = error.linePos[1];
        if (end?.line === line && end.col > col) {
          count = Math.max(1, Math.min(end.col - col, 80 - ci));
        }
        const pointer = " ".repeat(ci) + "^".repeat(count);
        error.message += `:

${lineStr}
${pointer}
`;
      }
    };
    exports.YAMLError = YAMLError;
    exports.YAMLParseError = YAMLParseError;
    exports.YAMLWarning = YAMLWarning;
    exports.prettifyError = prettifyError;
  }
});

// node_modules/yaml/dist/compose/resolve-props.js
var require_resolve_props = __commonJS({
  "node_modules/yaml/dist/compose/resolve-props.js"(exports) {
    "use strict";
    function resolveProps(tokens, { flow, indicator, next, offset, onError, parentIndent, startOnNewline }) {
      let spaceBefore = false;
      let atNewline = startOnNewline;
      let hasSpace = startOnNewline;
      let comment = "";
      let commentSep = "";
      let hasNewline = false;
      let reqSpace = false;
      let tab = null;
      let anchor = null;
      let tag = null;
      let newlineAfterProp = null;
      let comma = null;
      let found = null;
      let start = null;
      for (const token of tokens) {
        if (reqSpace) {
          if (token.type !== "space" && token.type !== "newline" && token.type !== "comma")
            onError(token.offset, "MISSING_CHAR", "Tags and anchors must be separated from the next token by white space");
          reqSpace = false;
        }
        if (tab) {
          if (atNewline && token.type !== "comment" && token.type !== "newline") {
            onError(tab, "TAB_AS_INDENT", "Tabs are not allowed as indentation");
          }
          tab = null;
        }
        switch (token.type) {
          case "space":
            if (!flow && (indicator !== "doc-start" || next?.type !== "flow-collection") && token.source.includes("	")) {
              tab = token;
            }
            hasSpace = true;
            break;
          case "comment": {
            if (!hasSpace)
              onError(token, "MISSING_CHAR", "Comments must be separated from other tokens by white space characters");
            const cb = token.source.substring(1) || " ";
            if (!comment)
              comment = cb;
            else
              comment += commentSep + cb;
            commentSep = "";
            atNewline = false;
            break;
          }
          case "newline":
            if (atNewline) {
              if (comment)
                comment += token.source;
              else if (!found || indicator !== "seq-item-ind")
                spaceBefore = true;
            } else
              commentSep += token.source;
            atNewline = true;
            hasNewline = true;
            if (anchor || tag)
              newlineAfterProp = token;
            hasSpace = true;
            break;
          case "anchor":
            if (anchor)
              onError(token, "MULTIPLE_ANCHORS", "A node can have at most one anchor");
            if (token.source.endsWith(":"))
              onError(token.offset + token.source.length - 1, "BAD_ALIAS", "Anchor ending in : is ambiguous", true);
            anchor = token;
            start ?? (start = token.offset);
            atNewline = false;
            hasSpace = false;
            reqSpace = true;
            break;
          case "tag": {
            if (tag)
              onError(token, "MULTIPLE_TAGS", "A node can have at most one tag");
            tag = token;
            start ?? (start = token.offset);
            atNewline = false;
            hasSpace = false;
            reqSpace = true;
            break;
          }
          case indicator:
            if (anchor || tag)
              onError(token, "BAD_PROP_ORDER", `Anchors and tags must be after the ${token.source} indicator`);
            if (found)
              onError(token, "UNEXPECTED_TOKEN", `Unexpected ${token.source} in ${flow ?? "collection"}`);
            found = token;
            atNewline = indicator === "seq-item-ind" || indicator === "explicit-key-ind";
            hasSpace = false;
            break;
          case "comma":
            if (flow) {
              if (comma)
                onError(token, "UNEXPECTED_TOKEN", `Unexpected , in ${flow}`);
              comma = token;
              atNewline = false;
              hasSpace = false;
              break;
            }
          // else fallthrough
          default:
            onError(token, "UNEXPECTED_TOKEN", `Unexpected ${token.type} token`);
            atNewline = false;
            hasSpace = false;
        }
      }
      const last = tokens[tokens.length - 1];
      const end = last ? last.offset + last.source.length : offset;
      if (reqSpace && next && next.type !== "space" && next.type !== "newline" && next.type !== "comma" && (next.type !== "scalar" || next.source !== "")) {
        onError(next.offset, "MISSING_CHAR", "Tags and anchors must be separated from the next token by white space");
      }
      if (tab && (atNewline && tab.indent <= parentIndent || next?.type === "block-map" || next?.type === "block-seq"))
        onError(tab, "TAB_AS_INDENT", "Tabs are not allowed as indentation");
      return {
        comma,
        found,
        spaceBefore,
        comment,
        hasNewline,
        anchor,
        tag,
        newlineAfterProp,
        end,
        start: start ?? end
      };
    }
    exports.resolveProps = resolveProps;
  }
});

// node_modules/yaml/dist/compose/util-contains-newline.js
var require_util_contains_newline = __commonJS({
  "node_modules/yaml/dist/compose/util-contains-newline.js"(exports) {
    "use strict";
    function containsNewline(key) {
      if (!key)
        return null;
      switch (key.type) {
        case "alias":
        case "scalar":
        case "double-quoted-scalar":
        case "single-quoted-scalar":
          if (key.source.includes("\n"))
            return true;
          if (key.end) {
            for (const st of key.end)
              if (st.type === "newline")
                return true;
          }
          return false;
        case "flow-collection":
          for (const it of key.items) {
            for (const st of it.start)
              if (st.type === "newline")
                return true;
            if (it.sep) {
              for (const st of it.sep)
                if (st.type === "newline")
                  return true;
            }
            if (containsNewline(it.key) || containsNewline(it.value))
              return true;
          }
          return false;
        default:
          return true;
      }
    }
    exports.containsNewline = containsNewline;
  }
});

// node_modules/yaml/dist/compose/util-flow-indent-check.js
var require_util_flow_indent_check = __commonJS({
  "node_modules/yaml/dist/compose/util-flow-indent-check.js"(exports) {
    "use strict";
    var utilContainsNewline = require_util_contains_newline();
    function flowIndentCheck(indent, fc, onError) {
      if (fc?.type === "flow-collection") {
        const end = fc.end[0];
        if (end.indent === indent && (end.source === "]" || end.source === "}") && utilContainsNewline.containsNewline(fc)) {
          const msg = "Flow end indicator should be more indented than parent";
          onError(end, "BAD_INDENT", msg, true);
        }
      }
    }
    exports.flowIndentCheck = flowIndentCheck;
  }
});

// node_modules/yaml/dist/compose/util-map-includes.js
var require_util_map_includes = __commonJS({
  "node_modules/yaml/dist/compose/util-map-includes.js"(exports) {
    "use strict";
    var identity = require_identity();
    function mapIncludes(ctx, items, search) {
      const { uniqueKeys } = ctx.options;
      if (uniqueKeys === false)
        return false;
      const isEqual = typeof uniqueKeys === "function" ? uniqueKeys : (a, b) => a === b || identity.isScalar(a) && identity.isScalar(b) && a.value === b.value;
      return items.some((pair) => isEqual(pair.key, search));
    }
    exports.mapIncludes = mapIncludes;
  }
});

// node_modules/yaml/dist/compose/resolve-block-map.js
var require_resolve_block_map = __commonJS({
  "node_modules/yaml/dist/compose/resolve-block-map.js"(exports) {
    "use strict";
    var Pair = require_Pair();
    var YAMLMap = require_YAMLMap();
    var resolveProps = require_resolve_props();
    var utilContainsNewline = require_util_contains_newline();
    var utilFlowIndentCheck = require_util_flow_indent_check();
    var utilMapIncludes = require_util_map_includes();
    var startColMsg = "All mapping items must start at the same column";
    function resolveBlockMap({ composeNode, composeEmptyNode }, ctx, bm, onError, tag) {
      const NodeClass = tag?.nodeClass ?? YAMLMap.YAMLMap;
      const map = new NodeClass(ctx.schema);
      if (ctx.atRoot)
        ctx.atRoot = false;
      let offset = bm.offset;
      let commentEnd = null;
      for (const collItem of bm.items) {
        const { start, key, sep, value } = collItem;
        const keyProps = resolveProps.resolveProps(start, {
          indicator: "explicit-key-ind",
          next: key ?? sep?.[0],
          offset,
          onError,
          parentIndent: bm.indent,
          startOnNewline: true
        });
        const implicitKey = !keyProps.found;
        if (implicitKey) {
          if (key) {
            if (key.type === "block-seq")
              onError(offset, "BLOCK_AS_IMPLICIT_KEY", "A block sequence may not be used as an implicit map key");
            else if ("indent" in key && key.indent !== bm.indent)
              onError(offset, "BAD_INDENT", startColMsg);
          }
          if (!keyProps.anchor && !keyProps.tag && !sep) {
            commentEnd = keyProps.end;
            if (keyProps.comment) {
              if (map.comment)
                map.comment += "\n" + keyProps.comment;
              else
                map.comment = keyProps.comment;
            }
            continue;
          }
          if (keyProps.newlineAfterProp || utilContainsNewline.containsNewline(key)) {
            onError(key ?? start[start.length - 1], "MULTILINE_IMPLICIT_KEY", "Implicit keys need to be on a single line");
          }
        } else if (keyProps.found?.indent !== bm.indent) {
          onError(offset, "BAD_INDENT", startColMsg);
        }
        ctx.atKey = true;
        const keyStart = keyProps.end;
        const keyNode = key ? composeNode(ctx, key, keyProps, onError) : composeEmptyNode(ctx, keyStart, start, null, keyProps, onError);
        if (ctx.schema.compat)
          utilFlowIndentCheck.flowIndentCheck(bm.indent, key, onError);
        ctx.atKey = false;
        if (utilMapIncludes.mapIncludes(ctx, map.items, keyNode))
          onError(keyStart, "DUPLICATE_KEY", "Map keys must be unique");
        const valueProps = resolveProps.resolveProps(sep ?? [], {
          indicator: "map-value-ind",
          next: value,
          offset: keyNode.range[2],
          onError,
          parentIndent: bm.indent,
          startOnNewline: !key || key.type === "block-scalar"
        });
        offset = valueProps.end;
        if (valueProps.found) {
          if (implicitKey) {
            if (value?.type === "block-map" && !valueProps.hasNewline)
              onError(offset, "BLOCK_AS_IMPLICIT_KEY", "Nested mappings are not allowed in compact mappings");
            if (ctx.options.strict && keyProps.start < valueProps.found.offset - 1024)
              onError(keyNode.range, "KEY_OVER_1024_CHARS", "The : indicator must be at most 1024 chars after the start of an implicit block mapping key");
          }
          const valueNode = value ? composeNode(ctx, value, valueProps, onError) : composeEmptyNode(ctx, offset, sep, null, valueProps, onError);
          if (ctx.schema.compat)
            utilFlowIndentCheck.flowIndentCheck(bm.indent, value, onError);
          offset = valueNode.range[2];
          const pair = new Pair.Pair(keyNode, valueNode);
          if (ctx.options.keepSourceTokens)
            pair.srcToken = collItem;
          map.items.push(pair);
        } else {
          if (implicitKey)
            onError(keyNode.range, "MISSING_CHAR", "Implicit map keys need to be followed by map values");
          if (valueProps.comment) {
            if (keyNode.comment)
              keyNode.comment += "\n" + valueProps.comment;
            else
              keyNode.comment = valueProps.comment;
          }
          const pair = new Pair.Pair(keyNode);
          if (ctx.options.keepSourceTokens)
            pair.srcToken = collItem;
          map.items.push(pair);
        }
      }
      if (commentEnd && commentEnd < offset)
        onError(commentEnd, "IMPOSSIBLE", "Map comment with trailing content");
      map.range = [bm.offset, offset, commentEnd ?? offset];
      return map;
    }
    exports.resolveBlockMap = resolveBlockMap;
  }
});

// node_modules/yaml/dist/compose/resolve-block-seq.js
var require_resolve_block_seq = __commonJS({
  "node_modules/yaml/dist/compose/resolve-block-seq.js"(exports) {
    "use strict";
    var YAMLSeq = require_YAMLSeq();
    var resolveProps = require_resolve_props();
    var utilFlowIndentCheck = require_util_flow_indent_check();
    function resolveBlockSeq({ composeNode, composeEmptyNode }, ctx, bs, onError, tag) {
      const NodeClass = tag?.nodeClass ?? YAMLSeq.YAMLSeq;
      const seq = new NodeClass(ctx.schema);
      if (ctx.atRoot)
        ctx.atRoot = false;
      if (ctx.atKey)
        ctx.atKey = false;
      let offset = bs.offset;
      let commentEnd = null;
      for (const { start, value } of bs.items) {
        const props = resolveProps.resolveProps(start, {
          indicator: "seq-item-ind",
          next: value,
          offset,
          onError,
          parentIndent: bs.indent,
          startOnNewline: true
        });
        if (!props.found) {
          if (props.anchor || props.tag || value) {
            if (value?.type === "block-seq")
              onError(props.end, "BAD_INDENT", "All sequence items must start at the same column");
            else
              onError(offset, "MISSING_CHAR", "Sequence item without - indicator");
          } else {
            commentEnd = props.end;
            if (props.comment)
              seq.comment = props.comment;
            continue;
          }
        }
        const node = value ? composeNode(ctx, value, props, onError) : composeEmptyNode(ctx, props.end, start, null, props, onError);
        if (ctx.schema.compat)
          utilFlowIndentCheck.flowIndentCheck(bs.indent, value, onError);
        offset = node.range[2];
        seq.items.push(node);
      }
      seq.range = [bs.offset, offset, commentEnd ?? offset];
      return seq;
    }
    exports.resolveBlockSeq = resolveBlockSeq;
  }
});

// node_modules/yaml/dist/compose/resolve-end.js
var require_resolve_end = __commonJS({
  "node_modules/yaml/dist/compose/resolve-end.js"(exports) {
    "use strict";
    function resolveEnd(end, offset, reqSpace, onError) {
      let comment = "";
      if (end) {
        let hasSpace = false;
        let sep = "";
        for (const token of end) {
          const { source, type } = token;
          switch (type) {
            case "space":
              hasSpace = true;
              break;
            case "comment": {
              if (reqSpace && !hasSpace)
                onError(token, "MISSING_CHAR", "Comments must be separated from other tokens by white space characters");
              const cb = source.substring(1) || " ";
              if (!comment)
                comment = cb;
              else
                comment += sep + cb;
              sep = "";
              break;
            }
            case "newline":
              if (comment)
                sep += source;
              hasSpace = true;
              break;
            default:
              onError(token, "UNEXPECTED_TOKEN", `Unexpected ${type} at node end`);
          }
          offset += source.length;
        }
      }
      return { comment, offset };
    }
    exports.resolveEnd = resolveEnd;
  }
});

// node_modules/yaml/dist/compose/resolve-flow-collection.js
var require_resolve_flow_collection = __commonJS({
  "node_modules/yaml/dist/compose/resolve-flow-collection.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Pair = require_Pair();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var resolveEnd = require_resolve_end();
    var resolveProps = require_resolve_props();
    var utilContainsNewline = require_util_contains_newline();
    var utilMapIncludes = require_util_map_includes();
    var blockMsg = "Block collections are not allowed within flow collections";
    var isBlock = (token) => token && (token.type === "block-map" || token.type === "block-seq");
    function resolveFlowCollection({ composeNode, composeEmptyNode }, ctx, fc, onError, tag) {
      const isMap = fc.start.source === "{";
      const fcName = isMap ? "flow map" : "flow sequence";
      const NodeClass = tag?.nodeClass ?? (isMap ? YAMLMap.YAMLMap : YAMLSeq.YAMLSeq);
      const coll = new NodeClass(ctx.schema);
      coll.flow = true;
      const atRoot = ctx.atRoot;
      if (atRoot)
        ctx.atRoot = false;
      if (ctx.atKey)
        ctx.atKey = false;
      let offset = fc.offset + fc.start.source.length;
      for (let i = 0; i < fc.items.length; ++i) {
        const collItem = fc.items[i];
        const { start, key, sep, value } = collItem;
        const props = resolveProps.resolveProps(start, {
          flow: fcName,
          indicator: "explicit-key-ind",
          next: key ?? sep?.[0],
          offset,
          onError,
          parentIndent: fc.indent,
          startOnNewline: false
        });
        if (!props.found) {
          if (!props.anchor && !props.tag && !sep && !value) {
            if (i === 0 && props.comma)
              onError(props.comma, "UNEXPECTED_TOKEN", `Unexpected , in ${fcName}`);
            else if (i < fc.items.length - 1)
              onError(props.start, "UNEXPECTED_TOKEN", `Unexpected empty item in ${fcName}`);
            if (props.comment) {
              if (coll.comment)
                coll.comment += "\n" + props.comment;
              else
                coll.comment = props.comment;
            }
            offset = props.end;
            continue;
          }
          if (!isMap && ctx.options.strict && utilContainsNewline.containsNewline(key))
            onError(
              key,
              // checked by containsNewline()
              "MULTILINE_IMPLICIT_KEY",
              "Implicit keys of flow sequence pairs need to be on a single line"
            );
        }
        if (i === 0) {
          if (props.comma)
            onError(props.comma, "UNEXPECTED_TOKEN", `Unexpected , in ${fcName}`);
        } else {
          if (!props.comma)
            onError(props.start, "MISSING_CHAR", `Missing , between ${fcName} items`);
          if (props.comment) {
            let prevItemComment = "";
            loop: for (const st of start) {
              switch (st.type) {
                case "comma":
                case "space":
                  break;
                case "comment":
                  prevItemComment = st.source.substring(1);
                  break loop;
                default:
                  break loop;
              }
            }
            if (prevItemComment) {
              let prev = coll.items[coll.items.length - 1];
              if (identity.isPair(prev))
                prev = prev.value ?? prev.key;
              if (prev.comment)
                prev.comment += "\n" + prevItemComment;
              else
                prev.comment = prevItemComment;
              props.comment = props.comment.substring(prevItemComment.length + 1);
            }
          }
        }
        if (!isMap && !sep && !props.found) {
          const valueNode = value ? composeNode(ctx, value, props, onError) : composeEmptyNode(ctx, props.end, sep, null, props, onError);
          coll.items.push(valueNode);
          offset = valueNode.range[2];
          if (isBlock(value))
            onError(valueNode.range, "BLOCK_IN_FLOW", blockMsg);
        } else {
          ctx.atKey = true;
          const keyStart = props.end;
          const keyNode = key ? composeNode(ctx, key, props, onError) : composeEmptyNode(ctx, keyStart, start, null, props, onError);
          if (isBlock(key))
            onError(keyNode.range, "BLOCK_IN_FLOW", blockMsg);
          ctx.atKey = false;
          const valueProps = resolveProps.resolveProps(sep ?? [], {
            flow: fcName,
            indicator: "map-value-ind",
            next: value,
            offset: keyNode.range[2],
            onError,
            parentIndent: fc.indent,
            startOnNewline: false
          });
          if (valueProps.found) {
            if (!isMap && !props.found && ctx.options.strict) {
              if (sep)
                for (const st of sep) {
                  if (st === valueProps.found)
                    break;
                  if (st.type === "newline") {
                    onError(st, "MULTILINE_IMPLICIT_KEY", "Implicit keys of flow sequence pairs need to be on a single line");
                    break;
                  }
                }
              if (props.start < valueProps.found.offset - 1024)
                onError(valueProps.found, "KEY_OVER_1024_CHARS", "The : indicator must be at most 1024 chars after the start of an implicit flow sequence key");
            }
          } else if (value) {
            if ("source" in value && value.source?.[0] === ":")
              onError(value, "MISSING_CHAR", `Missing space after : in ${fcName}`);
            else
              onError(valueProps.start, "MISSING_CHAR", `Missing , or : between ${fcName} items`);
          }
          const valueNode = value ? composeNode(ctx, value, valueProps, onError) : valueProps.found ? composeEmptyNode(ctx, valueProps.end, sep, null, valueProps, onError) : null;
          if (valueNode) {
            if (isBlock(value))
              onError(valueNode.range, "BLOCK_IN_FLOW", blockMsg);
          } else if (valueProps.comment) {
            if (keyNode.comment)
              keyNode.comment += "\n" + valueProps.comment;
            else
              keyNode.comment = valueProps.comment;
          }
          const pair = new Pair.Pair(keyNode, valueNode);
          if (ctx.options.keepSourceTokens)
            pair.srcToken = collItem;
          if (isMap) {
            const map = coll;
            if (utilMapIncludes.mapIncludes(ctx, map.items, keyNode))
              onError(keyStart, "DUPLICATE_KEY", "Map keys must be unique");
            map.items.push(pair);
          } else {
            const map = new YAMLMap.YAMLMap(ctx.schema);
            map.flow = true;
            map.items.push(pair);
            const endRange = (valueNode ?? keyNode).range;
            map.range = [keyNode.range[0], endRange[1], endRange[2]];
            coll.items.push(map);
          }
          offset = valueNode ? valueNode.range[2] : valueProps.end;
        }
      }
      const expectedEnd = isMap ? "}" : "]";
      const [ce, ...ee] = fc.end;
      let cePos = offset;
      if (ce?.source === expectedEnd)
        cePos = ce.offset + ce.source.length;
      else {
        const name = fcName[0].toUpperCase() + fcName.substring(1);
        const msg = atRoot ? `${name} must end with a ${expectedEnd}` : `${name} in block collection must be sufficiently indented and end with a ${expectedEnd}`;
        onError(offset, atRoot ? "MISSING_CHAR" : "BAD_INDENT", msg);
        if (ce && ce.source.length !== 1)
          ee.unshift(ce);
      }
      if (ee.length > 0) {
        const end = resolveEnd.resolveEnd(ee, cePos, ctx.options.strict, onError);
        if (end.comment) {
          if (coll.comment)
            coll.comment += "\n" + end.comment;
          else
            coll.comment = end.comment;
        }
        coll.range = [fc.offset, cePos, end.offset];
      } else {
        coll.range = [fc.offset, cePos, cePos];
      }
      return coll;
    }
    exports.resolveFlowCollection = resolveFlowCollection;
  }
});

// node_modules/yaml/dist/compose/compose-collection.js
var require_compose_collection = __commonJS({
  "node_modules/yaml/dist/compose/compose-collection.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var resolveBlockMap = require_resolve_block_map();
    var resolveBlockSeq = require_resolve_block_seq();
    var resolveFlowCollection = require_resolve_flow_collection();
    function resolveCollection(CN, ctx, token, onError, tagName, tag) {
      const coll = token.type === "block-map" ? resolveBlockMap.resolveBlockMap(CN, ctx, token, onError, tag) : token.type === "block-seq" ? resolveBlockSeq.resolveBlockSeq(CN, ctx, token, onError, tag) : resolveFlowCollection.resolveFlowCollection(CN, ctx, token, onError, tag);
      const Coll = coll.constructor;
      if (tagName === "!" || tagName === Coll.tagName) {
        coll.tag = Coll.tagName;
        return coll;
      }
      if (tagName)
        coll.tag = tagName;
      return coll;
    }
    function composeCollection(CN, ctx, token, props, onError) {
      const tagToken = props.tag;
      const tagName = !tagToken ? null : ctx.directives.tagName(tagToken.source, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg));
      if (token.type === "block-seq") {
        const { anchor, newlineAfterProp: nl } = props;
        const lastProp = anchor && tagToken ? anchor.offset > tagToken.offset ? anchor : tagToken : anchor ?? tagToken;
        if (lastProp && (!nl || nl.offset < lastProp.offset)) {
          const message = "Missing newline after block sequence props";
          onError(lastProp, "MISSING_CHAR", message);
        }
      }
      const expType = token.type === "block-map" ? "map" : token.type === "block-seq" ? "seq" : token.start.source === "{" ? "map" : "seq";
      if (!tagToken || !tagName || tagName === "!" || tagName === YAMLMap.YAMLMap.tagName && expType === "map" || tagName === YAMLSeq.YAMLSeq.tagName && expType === "seq") {
        return resolveCollection(CN, ctx, token, onError, tagName);
      }
      let tag = ctx.schema.tags.find((t) => t.tag === tagName && t.collection === expType);
      if (!tag) {
        const kt = ctx.schema.knownTags[tagName];
        if (kt?.collection === expType) {
          ctx.schema.tags.push(Object.assign({}, kt, { default: false }));
          tag = kt;
        } else {
          if (kt) {
            onError(tagToken, "BAD_COLLECTION_TYPE", `${kt.tag} used for ${expType} collection, but expects ${kt.collection ?? "scalar"}`, true);
          } else {
            onError(tagToken, "TAG_RESOLVE_FAILED", `Unresolved tag: ${tagName}`, true);
          }
          return resolveCollection(CN, ctx, token, onError, tagName);
        }
      }
      const coll = resolveCollection(CN, ctx, token, onError, tagName, tag);
      const res = tag.resolve?.(coll, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg), ctx.options) ?? coll;
      const node = identity.isNode(res) ? res : new Scalar.Scalar(res);
      node.range = coll.range;
      node.tag = tagName;
      if (tag?.format)
        node.format = tag.format;
      return node;
    }
    exports.composeCollection = composeCollection;
  }
});

// node_modules/yaml/dist/compose/resolve-block-scalar.js
var require_resolve_block_scalar = __commonJS({
  "node_modules/yaml/dist/compose/resolve-block-scalar.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    function resolveBlockScalar(ctx, scalar, onError) {
      const start = scalar.offset;
      const header = parseBlockScalarHeader(scalar, ctx.options.strict, onError);
      if (!header)
        return { value: "", type: null, comment: "", range: [start, start, start] };
      const type = header.mode === ">" ? Scalar.Scalar.BLOCK_FOLDED : Scalar.Scalar.BLOCK_LITERAL;
      const lines = scalar.source ? splitLines(scalar.source) : [];
      let chompStart = lines.length;
      for (let i = lines.length - 1; i >= 0; --i) {
        const content = lines[i][1];
        if (content === "" || content === "\r")
          chompStart = i;
        else
          break;
      }
      if (chompStart === 0) {
        const value2 = header.chomp === "+" && lines.length > 0 ? "\n".repeat(Math.max(1, lines.length - 1)) : "";
        let end2 = start + header.length;
        if (scalar.source)
          end2 += scalar.source.length;
        return { value: value2, type, comment: header.comment, range: [start, end2, end2] };
      }
      let trimIndent = scalar.indent + header.indent;
      let offset = scalar.offset + header.length;
      let contentStart = 0;
      for (let i = 0; i < chompStart; ++i) {
        const [indent, content] = lines[i];
        if (content === "" || content === "\r") {
          if (header.indent === 0 && indent.length > trimIndent)
            trimIndent = indent.length;
        } else {
          if (indent.length < trimIndent) {
            const message = "Block scalars with more-indented leading empty lines must use an explicit indentation indicator";
            onError(offset + indent.length, "MISSING_CHAR", message);
          }
          if (header.indent === 0)
            trimIndent = indent.length;
          contentStart = i;
          if (trimIndent === 0 && !ctx.atRoot) {
            const message = "Block scalar values in collections must be indented";
            onError(offset, "BAD_INDENT", message);
          }
          break;
        }
        offset += indent.length + content.length + 1;
      }
      for (let i = lines.length - 1; i >= chompStart; --i) {
        if (lines[i][0].length > trimIndent)
          chompStart = i + 1;
      }
      let value = "";
      let sep = "";
      let prevMoreIndented = false;
      for (let i = 0; i < contentStart; ++i)
        value += lines[i][0].slice(trimIndent) + "\n";
      for (let i = contentStart; i < chompStart; ++i) {
        let [indent, content] = lines[i];
        offset += indent.length + content.length + 1;
        const crlf = content[content.length - 1] === "\r";
        if (crlf)
          content = content.slice(0, -1);
        if (content && indent.length < trimIndent) {
          const src = header.indent ? "explicit indentation indicator" : "first line";
          const message = `Block scalar lines must not be less indented than their ${src}`;
          onError(offset - content.length - (crlf ? 2 : 1), "BAD_INDENT", message);
          indent = "";
        }
        if (type === Scalar.Scalar.BLOCK_LITERAL) {
          value += sep + indent.slice(trimIndent) + content;
          sep = "\n";
        } else if (indent.length > trimIndent || content[0] === "	") {
          if (sep === " ")
            sep = "\n";
          else if (!prevMoreIndented && sep === "\n")
            sep = "\n\n";
          value += sep + indent.slice(trimIndent) + content;
          sep = "\n";
          prevMoreIndented = true;
        } else if (content === "") {
          if (sep === "\n")
            value += "\n";
          else
            sep = "\n";
        } else {
          value += sep + content;
          sep = " ";
          prevMoreIndented = false;
        }
      }
      switch (header.chomp) {
        case "-":
          break;
        case "+":
          for (let i = chompStart; i < lines.length; ++i)
            value += "\n" + lines[i][0].slice(trimIndent);
          if (value[value.length - 1] !== "\n")
            value += "\n";
          break;
        default:
          value += "\n";
      }
      const end = start + header.length + scalar.source.length;
      return { value, type, comment: header.comment, range: [start, end, end] };
    }
    function parseBlockScalarHeader({ offset, props }, strict, onError) {
      if (props[0].type !== "block-scalar-header") {
        onError(props[0], "IMPOSSIBLE", "Block scalar header not found");
        return null;
      }
      const { source } = props[0];
      const mode = source[0];
      let indent = 0;
      let chomp = "";
      let error = -1;
      for (let i = 1; i < source.length; ++i) {
        const ch = source[i];
        if (!chomp && (ch === "-" || ch === "+"))
          chomp = ch;
        else {
          const n = Number(ch);
          if (!indent && n)
            indent = n;
          else if (error === -1)
            error = offset + i;
        }
      }
      if (error !== -1)
        onError(error, "UNEXPECTED_TOKEN", `Block scalar header includes extra characters: ${source}`);
      let hasSpace = false;
      let comment = "";
      let length = source.length;
      for (let i = 1; i < props.length; ++i) {
        const token = props[i];
        switch (token.type) {
          case "space":
            hasSpace = true;
          // fallthrough
          case "newline":
            length += token.source.length;
            break;
          case "comment":
            if (strict && !hasSpace) {
              const message = "Comments must be separated from other tokens by white space characters";
              onError(token, "MISSING_CHAR", message);
            }
            length += token.source.length;
            comment = token.source.substring(1);
            break;
          case "error":
            onError(token, "UNEXPECTED_TOKEN", token.message);
            length += token.source.length;
            break;
          /* istanbul ignore next should not happen */
          default: {
            const message = `Unexpected token in block scalar header: ${token.type}`;
            onError(token, "UNEXPECTED_TOKEN", message);
            const ts = token.source;
            if (ts && typeof ts === "string")
              length += ts.length;
          }
        }
      }
      return { mode, indent, chomp, comment, length };
    }
    function splitLines(source) {
      const split = source.split(/\n( *)/);
      const first = split[0];
      const m = first.match(/^( *)/);
      const line0 = m?.[1] ? [m[1], first.slice(m[1].length)] : ["", first];
      const lines = [line0];
      for (let i = 1; i < split.length; i += 2)
        lines.push([split[i], split[i + 1]]);
      return lines;
    }
    exports.resolveBlockScalar = resolveBlockScalar;
  }
});

// node_modules/yaml/dist/compose/resolve-flow-scalar.js
var require_resolve_flow_scalar = __commonJS({
  "node_modules/yaml/dist/compose/resolve-flow-scalar.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var resolveEnd = require_resolve_end();
    function resolveFlowScalar(scalar, strict, onError) {
      const { offset, type, source, end } = scalar;
      let _type;
      let value;
      const _onError = (rel, code, msg) => onError(offset + rel, code, msg);
      switch (type) {
        case "scalar":
          _type = Scalar.Scalar.PLAIN;
          value = plainValue(source, _onError);
          break;
        case "single-quoted-scalar":
          _type = Scalar.Scalar.QUOTE_SINGLE;
          value = singleQuotedValue(source, _onError);
          break;
        case "double-quoted-scalar":
          _type = Scalar.Scalar.QUOTE_DOUBLE;
          value = doubleQuotedValue(source, _onError);
          break;
        /* istanbul ignore next should not happen */
        default:
          onError(scalar, "UNEXPECTED_TOKEN", `Expected a flow scalar value, but found: ${type}`);
          return {
            value: "",
            type: null,
            comment: "",
            range: [offset, offset + source.length, offset + source.length]
          };
      }
      const valueEnd = offset + source.length;
      const re = resolveEnd.resolveEnd(end, valueEnd, strict, onError);
      return {
        value,
        type: _type,
        comment: re.comment,
        range: [offset, valueEnd, re.offset]
      };
    }
    function plainValue(source, onError) {
      let badChar = "";
      switch (source[0]) {
        /* istanbul ignore next should not happen */
        case "	":
          badChar = "a tab character";
          break;
        case ",":
          badChar = "flow indicator character ,";
          break;
        case "%":
          badChar = "directive indicator character %";
          break;
        case "|":
        case ">": {
          badChar = `block scalar indicator ${source[0]}`;
          break;
        }
        case "@":
        case "`": {
          badChar = `reserved character ${source[0]}`;
          break;
        }
      }
      if (badChar)
        onError(0, "BAD_SCALAR_START", `Plain value cannot start with ${badChar}`);
      return foldLines(source);
    }
    function singleQuotedValue(source, onError) {
      if (source[source.length - 1] !== "'" || source.length === 1)
        onError(source.length, "MISSING_CHAR", "Missing closing 'quote");
      return foldLines(source.slice(1, -1)).replace(/''/g, "'");
    }
    function foldLines(source) {
      let first, line;
      try {
        first = new RegExp("(.*?)(?<![ 	])[ 	]*\r?\n", "sy");
        line = new RegExp("[ 	]*(.*?)(?:(?<![ 	])[ 	]*)?\r?\n", "sy");
      } catch {
        first = /(.*?)[ \t]*\r?\n/sy;
        line = /[ \t]*(.*?)[ \t]*\r?\n/sy;
      }
      let match = first.exec(source);
      if (!match)
        return source;
      let res = match[1];
      let sep = " ";
      let pos = first.lastIndex;
      line.lastIndex = pos;
      while (match = line.exec(source)) {
        if (match[1] === "") {
          if (sep === "\n")
            res += sep;
          else
            sep = "\n";
        } else {
          res += sep + match[1];
          sep = " ";
        }
        pos = line.lastIndex;
      }
      const last = /[ \t]*(.*)/sy;
      last.lastIndex = pos;
      match = last.exec(source);
      return res + sep + (match?.[1] ?? "");
    }
    function doubleQuotedValue(source, onError) {
      let res = "";
      for (let i = 1; i < source.length - 1; ++i) {
        const ch = source[i];
        if (ch === "\r" && source[i + 1] === "\n")
          continue;
        if (ch === "\n") {
          const { fold, offset } = foldNewline(source, i);
          res += fold;
          i = offset;
        } else if (ch === "\\") {
          let next = source[++i];
          const cc = escapeCodes[next];
          if (cc)
            res += cc;
          else if (next === "\n") {
            next = source[i + 1];
            while (next === " " || next === "	")
              next = source[++i + 1];
          } else if (next === "\r" && source[i + 1] === "\n") {
            next = source[++i + 1];
            while (next === " " || next === "	")
              next = source[++i + 1];
          } else if (next === "x" || next === "u" || next === "U") {
            const length = next === "x" ? 2 : next === "u" ? 4 : 8;
            res += parseCharCode(source, i + 1, length, onError);
            i += length;
          } else {
            const raw = source.substr(i - 1, 2);
            onError(i - 1, "BAD_DQ_ESCAPE", `Invalid escape sequence ${raw}`);
            res += raw;
          }
        } else if (ch === " " || ch === "	") {
          const wsStart = i;
          let next = source[i + 1];
          while (next === " " || next === "	")
            next = source[++i + 1];
          if (next !== "\n" && !(next === "\r" && source[i + 2] === "\n"))
            res += i > wsStart ? source.slice(wsStart, i + 1) : ch;
        } else {
          res += ch;
        }
      }
      if (source[source.length - 1] !== '"' || source.length === 1)
        onError(source.length, "MISSING_CHAR", 'Missing closing "quote');
      return res;
    }
    function foldNewline(source, offset) {
      let fold = "";
      let ch = source[offset + 1];
      while (ch === " " || ch === "	" || ch === "\n" || ch === "\r") {
        if (ch === "\r" && source[offset + 2] !== "\n")
          break;
        if (ch === "\n")
          fold += "\n";
        offset += 1;
        ch = source[offset + 1];
      }
      if (!fold)
        fold = " ";
      return { fold, offset };
    }
    var escapeCodes = {
      "0": "\0",
      // null character
      a: "\x07",
      // bell character
      b: "\b",
      // backspace
      e: "\x1B",
      // escape character
      f: "\f",
      // form feed
      n: "\n",
      // line feed
      r: "\r",
      // carriage return
      t: "	",
      // horizontal tab
      v: "\v",
      // vertical tab
      N: "\x85",
      // Unicode next line
      _: "\xA0",
      // Unicode non-breaking space
      L: "\u2028",
      // Unicode line separator
      P: "\u2029",
      // Unicode paragraph separator
      " ": " ",
      '"': '"',
      "/": "/",
      "\\": "\\",
      "	": "	"
    };
    function parseCharCode(source, offset, length, onError) {
      const cc = source.substr(offset, length);
      const ok = cc.length === length && /^[0-9a-fA-F]+$/.test(cc);
      const code = ok ? parseInt(cc, 16) : NaN;
      try {
        return String.fromCodePoint(code);
      } catch {
        const raw = source.substr(offset - 2, length + 2);
        onError(offset - 2, "BAD_DQ_ESCAPE", `Invalid escape sequence ${raw}`);
        return raw;
      }
    }
    exports.resolveFlowScalar = resolveFlowScalar;
  }
});

// node_modules/yaml/dist/compose/compose-scalar.js
var require_compose_scalar = __commonJS({
  "node_modules/yaml/dist/compose/compose-scalar.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var resolveBlockScalar = require_resolve_block_scalar();
    var resolveFlowScalar = require_resolve_flow_scalar();
    function composeScalar(ctx, token, tagToken, onError) {
      const { value, type, comment, range } = token.type === "block-scalar" ? resolveBlockScalar.resolveBlockScalar(ctx, token, onError) : resolveFlowScalar.resolveFlowScalar(token, ctx.options.strict, onError);
      const tagName = tagToken ? ctx.directives.tagName(tagToken.source, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg)) : null;
      let tag;
      if (ctx.options.stringKeys && ctx.atKey) {
        tag = ctx.schema[identity.SCALAR];
      } else if (tagName)
        tag = findScalarTagByName(ctx.schema, value, tagName, tagToken, onError);
      else if (token.type === "scalar")
        tag = findScalarTagByTest(ctx, value, token, onError);
      else
        tag = ctx.schema[identity.SCALAR];
      let scalar;
      try {
        const res = tag.resolve(value, (msg) => onError(tagToken ?? token, "TAG_RESOLVE_FAILED", msg), ctx.options);
        scalar = identity.isScalar(res) ? res : new Scalar.Scalar(res);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        onError(tagToken ?? token, "TAG_RESOLVE_FAILED", msg);
        scalar = new Scalar.Scalar(value);
      }
      scalar.range = range;
      scalar.source = value;
      if (type)
        scalar.type = type;
      if (tagName)
        scalar.tag = tagName;
      if (tag.format)
        scalar.format = tag.format;
      if (comment)
        scalar.comment = comment;
      return scalar;
    }
    function findScalarTagByName(schema, value, tagName, tagToken, onError) {
      if (tagName === "!")
        return schema[identity.SCALAR];
      const matchWithTest = [];
      for (const tag of schema.tags) {
        if (!tag.collection && tag.tag === tagName) {
          if (tag.default && tag.test)
            matchWithTest.push(tag);
          else
            return tag;
        }
      }
      for (const tag of matchWithTest)
        if (tag.test?.test(value))
          return tag;
      const kt = schema.knownTags[tagName];
      if (kt && !kt.collection) {
        schema.tags.push(Object.assign({}, kt, { default: false, test: void 0 }));
        return kt;
      }
      onError(tagToken, "TAG_RESOLVE_FAILED", `Unresolved tag: ${tagName}`, tagName !== "tag:yaml.org,2002:str");
      return schema[identity.SCALAR];
    }
    function findScalarTagByTest({ atKey, directives, schema }, value, token, onError) {
      const tag = schema.tags.find((tag2) => (tag2.default === true || atKey && tag2.default === "key") && tag2.test?.test(value)) || schema[identity.SCALAR];
      if (schema.compat) {
        const compat = schema.compat.find((tag2) => tag2.default && tag2.test?.test(value)) ?? schema[identity.SCALAR];
        if (tag.tag !== compat.tag) {
          const ts = directives.tagString(tag.tag);
          const cs = directives.tagString(compat.tag);
          const msg = `Value may be parsed as either ${ts} or ${cs}`;
          onError(token, "TAG_RESOLVE_FAILED", msg, true);
        }
      }
      return tag;
    }
    exports.composeScalar = composeScalar;
  }
});

// node_modules/yaml/dist/compose/util-empty-scalar-position.js
var require_util_empty_scalar_position = __commonJS({
  "node_modules/yaml/dist/compose/util-empty-scalar-position.js"(exports) {
    "use strict";
    function emptyScalarPosition(offset, before, pos) {
      if (before) {
        pos ?? (pos = before.length);
        for (let i = pos - 1; i >= 0; --i) {
          let st = before[i];
          switch (st.type) {
            case "space":
            case "comment":
            case "newline":
              offset -= st.source.length;
              continue;
          }
          st = before[++i];
          while (st?.type === "space") {
            offset += st.source.length;
            st = before[++i];
          }
          break;
        }
      }
      return offset;
    }
    exports.emptyScalarPosition = emptyScalarPosition;
  }
});

// node_modules/yaml/dist/compose/compose-node.js
var require_compose_node = __commonJS({
  "node_modules/yaml/dist/compose/compose-node.js"(exports) {
    "use strict";
    var Alias = require_Alias();
    var identity = require_identity();
    var composeCollection = require_compose_collection();
    var composeScalar = require_compose_scalar();
    var resolveEnd = require_resolve_end();
    var utilEmptyScalarPosition = require_util_empty_scalar_position();
    var CN = { composeNode, composeEmptyNode };
    function composeNode(ctx, token, props, onError) {
      const atKey = ctx.atKey;
      const { spaceBefore, comment, anchor, tag } = props;
      let node;
      let isSrcToken = true;
      switch (token.type) {
        case "alias":
          node = composeAlias(ctx, token, onError);
          if (anchor || tag)
            onError(token, "ALIAS_PROPS", "An alias node must not specify any properties");
          break;
        case "scalar":
        case "single-quoted-scalar":
        case "double-quoted-scalar":
        case "block-scalar":
          node = composeScalar.composeScalar(ctx, token, tag, onError);
          if (anchor)
            node.anchor = anchor.source.substring(1);
          break;
        case "block-map":
        case "block-seq":
        case "flow-collection":
          try {
            node = composeCollection.composeCollection(CN, ctx, token, props, onError);
            if (anchor)
              node.anchor = anchor.source.substring(1);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            onError(token, "RESOURCE_EXHAUSTION", message);
          }
          break;
        default: {
          const message = token.type === "error" ? token.message : `Unsupported token (type: ${token.type})`;
          onError(token, "UNEXPECTED_TOKEN", message);
          isSrcToken = false;
        }
      }
      node ?? (node = composeEmptyNode(ctx, token.offset, void 0, null, props, onError));
      if (anchor && node.anchor === "")
        onError(anchor, "BAD_ALIAS", "Anchor cannot be an empty string");
      if (atKey && ctx.options.stringKeys && (!identity.isScalar(node) || typeof node.value !== "string" || node.tag && node.tag !== "tag:yaml.org,2002:str")) {
        const msg = "With stringKeys, all keys must be strings";
        onError(tag ?? token, "NON_STRING_KEY", msg);
      }
      if (spaceBefore)
        node.spaceBefore = true;
      if (comment) {
        if (token.type === "scalar" && token.source === "")
          node.comment = comment;
        else
          node.commentBefore = comment;
      }
      if (ctx.options.keepSourceTokens && isSrcToken)
        node.srcToken = token;
      return node;
    }
    function composeEmptyNode(ctx, offset, before, pos, { spaceBefore, comment, anchor, tag, end }, onError) {
      const token = {
        type: "scalar",
        offset: utilEmptyScalarPosition.emptyScalarPosition(offset, before, pos),
        indent: -1,
        source: ""
      };
      const node = composeScalar.composeScalar(ctx, token, tag, onError);
      if (anchor) {
        node.anchor = anchor.source.substring(1);
        if (node.anchor === "")
          onError(anchor, "BAD_ALIAS", "Anchor cannot be an empty string");
      }
      if (spaceBefore)
        node.spaceBefore = true;
      if (comment) {
        node.comment = comment;
        node.range[2] = end;
      }
      return node;
    }
    function composeAlias({ options }, { offset, source, end }, onError) {
      const alias = new Alias.Alias(source.substring(1));
      if (alias.source === "")
        onError(offset, "BAD_ALIAS", "Alias cannot be an empty string");
      if (alias.source.endsWith(":"))
        onError(offset + source.length - 1, "BAD_ALIAS", "Alias ending in : is ambiguous", true);
      const valueEnd = offset + source.length;
      const re = resolveEnd.resolveEnd(end, valueEnd, options.strict, onError);
      alias.range = [offset, valueEnd, re.offset];
      if (re.comment)
        alias.comment = re.comment;
      return alias;
    }
    exports.composeEmptyNode = composeEmptyNode;
    exports.composeNode = composeNode;
  }
});

// node_modules/yaml/dist/compose/compose-doc.js
var require_compose_doc = __commonJS({
  "node_modules/yaml/dist/compose/compose-doc.js"(exports) {
    "use strict";
    var Document = require_Document();
    var composeNode = require_compose_node();
    var resolveEnd = require_resolve_end();
    var resolveProps = require_resolve_props();
    function composeDoc(options, directives, { offset, start, value, end }, onError) {
      const opts = Object.assign({ _directives: directives }, options);
      const doc = new Document.Document(void 0, opts);
      const ctx = {
        atKey: false,
        atRoot: true,
        directives: doc.directives,
        options: doc.options,
        schema: doc.schema
      };
      const props = resolveProps.resolveProps(start, {
        indicator: "doc-start",
        next: value ?? end?.[0],
        offset,
        onError,
        parentIndent: 0,
        startOnNewline: true
      });
      if (props.found) {
        doc.directives.docStart = true;
        if (value && (value.type === "block-map" || value.type === "block-seq") && !props.hasNewline)
          onError(props.end, "MISSING_CHAR", "Block collection cannot start on same line with directives-end marker");
      }
      doc.contents = value ? composeNode.composeNode(ctx, value, props, onError) : composeNode.composeEmptyNode(ctx, props.end, start, null, props, onError);
      const contentEnd = doc.contents.range[2];
      const re = resolveEnd.resolveEnd(end, contentEnd, false, onError);
      if (re.comment)
        doc.comment = re.comment;
      doc.range = [offset, contentEnd, re.offset];
      return doc;
    }
    exports.composeDoc = composeDoc;
  }
});

// node_modules/yaml/dist/compose/composer.js
var require_composer = __commonJS({
  "node_modules/yaml/dist/compose/composer.js"(exports) {
    "use strict";
    var node_process = __require("process");
    var directives = require_directives();
    var Document = require_Document();
    var errors = require_errors();
    var identity = require_identity();
    var composeDoc = require_compose_doc();
    var resolveEnd = require_resolve_end();
    function getErrorPos(src) {
      if (typeof src === "number")
        return [src, src + 1];
      if (Array.isArray(src))
        return src.length === 2 ? src : [src[0], src[1]];
      const { offset, source } = src;
      return [offset, offset + (typeof source === "string" ? source.length : 1)];
    }
    function parsePrelude(prelude) {
      let comment = "";
      let atComment = false;
      let afterEmptyLine = false;
      for (let i = 0; i < prelude.length; ++i) {
        const source = prelude[i];
        switch (source[0]) {
          case "#":
            comment += (comment === "" ? "" : afterEmptyLine ? "\n\n" : "\n") + (source.substring(1) || " ");
            atComment = true;
            afterEmptyLine = false;
            break;
          case "%":
            if (prelude[i + 1]?.[0] !== "#")
              i += 1;
            atComment = false;
            break;
          default:
            if (!atComment)
              afterEmptyLine = true;
            atComment = false;
        }
      }
      return { comment, afterEmptyLine };
    }
    var Composer = class {
      constructor(options = {}) {
        this.doc = null;
        this.atDirectives = false;
        this.prelude = [];
        this.errors = [];
        this.warnings = [];
        this.onError = (source, code, message, warning) => {
          const pos = getErrorPos(source);
          if (warning)
            this.warnings.push(new errors.YAMLWarning(pos, code, message));
          else
            this.errors.push(new errors.YAMLParseError(pos, code, message));
        };
        this.directives = new directives.Directives({ version: options.version || "1.2" });
        this.options = options;
      }
      decorate(doc, afterDoc) {
        const { comment, afterEmptyLine } = parsePrelude(this.prelude);
        if (comment) {
          const dc = doc.contents;
          if (afterDoc) {
            doc.comment = doc.comment ? `${doc.comment}
${comment}` : comment;
          } else if (afterEmptyLine || doc.directives.docStart || !dc) {
            doc.commentBefore = comment;
          } else if (identity.isCollection(dc) && !dc.flow && dc.items.length > 0) {
            let it = dc.items[0];
            if (identity.isPair(it))
              it = it.key;
            const cb = it.commentBefore;
            it.commentBefore = cb ? `${comment}
${cb}` : comment;
          } else {
            const cb = dc.commentBefore;
            dc.commentBefore = cb ? `${comment}
${cb}` : comment;
          }
        }
        if (afterDoc) {
          for (let i = 0; i < this.errors.length; ++i)
            doc.errors.push(this.errors[i]);
          for (let i = 0; i < this.warnings.length; ++i)
            doc.warnings.push(this.warnings[i]);
        } else {
          doc.errors = this.errors;
          doc.warnings = this.warnings;
        }
        this.prelude = [];
        this.errors = [];
        this.warnings = [];
      }
      /**
       * Current stream status information.
       *
       * Mostly useful at the end of input for an empty stream.
       */
      streamInfo() {
        return {
          comment: parsePrelude(this.prelude).comment,
          directives: this.directives,
          errors: this.errors,
          warnings: this.warnings
        };
      }
      /**
       * Compose tokens into documents.
       *
       * @param forceDoc - If the stream contains no document, still emit a final document including any comments and directives that would be applied to a subsequent document.
       * @param endOffset - Should be set if `forceDoc` is also set, to set the document range end and to indicate errors correctly.
       */
      *compose(tokens, forceDoc = false, endOffset = -1) {
        for (const token of tokens)
          yield* this.next(token);
        yield* this.end(forceDoc, endOffset);
      }
      /** Advance the composer by one CST token. */
      *next(token) {
        if (node_process.env.LOG_STREAM)
          console.dir(token, { depth: null });
        switch (token.type) {
          case "directive":
            this.directives.add(token.source, (offset, message, warning) => {
              const pos = getErrorPos(token);
              pos[0] += offset;
              this.onError(pos, "BAD_DIRECTIVE", message, warning);
            });
            this.prelude.push(token.source);
            this.atDirectives = true;
            break;
          case "document": {
            const doc = composeDoc.composeDoc(this.options, this.directives, token, this.onError);
            if (this.atDirectives && !doc.directives.docStart)
              this.onError(token, "MISSING_CHAR", "Missing directives-end/doc-start indicator line");
            this.decorate(doc, false);
            if (this.doc)
              yield this.doc;
            this.doc = doc;
            this.atDirectives = false;
            break;
          }
          case "byte-order-mark":
          case "space":
            break;
          case "comment":
          case "newline":
            this.prelude.push(token.source);
            break;
          case "error": {
            const msg = token.source ? `${token.message}: ${JSON.stringify(token.source)}` : token.message;
            const error = new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", msg);
            if (this.atDirectives || !this.doc)
              this.errors.push(error);
            else
              this.doc.errors.push(error);
            break;
          }
          case "doc-end": {
            if (!this.doc) {
              const msg = "Unexpected doc-end without preceding document";
              this.errors.push(new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", msg));
              break;
            }
            this.doc.directives.docEnd = true;
            const end = resolveEnd.resolveEnd(token.end, token.offset + token.source.length, this.doc.options.strict, this.onError);
            this.decorate(this.doc, true);
            if (end.comment) {
              const dc = this.doc.comment;
              this.doc.comment = dc ? `${dc}
${end.comment}` : end.comment;
            }
            this.doc.range[2] = end.offset;
            break;
          }
          default:
            this.errors.push(new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", `Unsupported token ${token.type}`));
        }
      }
      /**
       * Call at end of input to yield any remaining document.
       *
       * @param forceDoc - If the stream contains no document, still emit a final document including any comments and directives that would be applied to a subsequent document.
       * @param endOffset - Should be set if `forceDoc` is also set, to set the document range end and to indicate errors correctly.
       */
      *end(forceDoc = false, endOffset = -1) {
        if (this.doc) {
          this.decorate(this.doc, true);
          yield this.doc;
          this.doc = null;
        } else if (forceDoc) {
          const opts = Object.assign({ _directives: this.directives }, this.options);
          const doc = new Document.Document(void 0, opts);
          if (this.atDirectives)
            this.onError(endOffset, "MISSING_CHAR", "Missing directives-end indicator line");
          doc.range = [0, endOffset, endOffset];
          this.decorate(doc, false);
          yield doc;
        }
      }
    };
    exports.Composer = Composer;
  }
});

// node_modules/yaml/dist/parse/cst-scalar.js
var require_cst_scalar = __commonJS({
  "node_modules/yaml/dist/parse/cst-scalar.js"(exports) {
    "use strict";
    var resolveBlockScalar = require_resolve_block_scalar();
    var resolveFlowScalar = require_resolve_flow_scalar();
    var errors = require_errors();
    var stringifyString = require_stringifyString();
    function resolveAsScalar(token, strict = true, onError) {
      if (token) {
        const _onError = (pos, code, message) => {
          const offset = typeof pos === "number" ? pos : Array.isArray(pos) ? pos[0] : pos.offset;
          if (onError)
            onError(offset, code, message);
          else
            throw new errors.YAMLParseError([offset, offset + 1], code, message);
        };
        switch (token.type) {
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar":
            return resolveFlowScalar.resolveFlowScalar(token, strict, _onError);
          case "block-scalar":
            return resolveBlockScalar.resolveBlockScalar({ options: { strict } }, token, _onError);
        }
      }
      return null;
    }
    function createScalarToken(value, context) {
      const { implicitKey = false, indent, inFlow = false, offset = -1, type = "PLAIN" } = context;
      const source = stringifyString.stringifyString({ type, value }, {
        implicitKey,
        indent: indent > 0 ? " ".repeat(indent) : "",
        inFlow,
        options: { blockQuote: true, lineWidth: -1 }
      });
      const end = context.end ?? [
        { type: "newline", offset: -1, indent, source: "\n" }
      ];
      switch (source[0]) {
        case "|":
        case ">": {
          const he = source.indexOf("\n");
          const head = source.substring(0, he);
          const body = source.substring(he + 1) + "\n";
          const props = [
            { type: "block-scalar-header", offset, indent, source: head }
          ];
          if (!addEndtoBlockProps(props, end))
            props.push({ type: "newline", offset: -1, indent, source: "\n" });
          return { type: "block-scalar", offset, indent, props, source: body };
        }
        case '"':
          return { type: "double-quoted-scalar", offset, indent, source, end };
        case "'":
          return { type: "single-quoted-scalar", offset, indent, source, end };
        default:
          return { type: "scalar", offset, indent, source, end };
      }
    }
    function setScalarValue(token, value, context = {}) {
      let { afterKey = false, implicitKey = false, inFlow = false, type } = context;
      let indent = "indent" in token ? token.indent : null;
      if (afterKey && typeof indent === "number")
        indent += 2;
      if (!type)
        switch (token.type) {
          case "single-quoted-scalar":
            type = "QUOTE_SINGLE";
            break;
          case "double-quoted-scalar":
            type = "QUOTE_DOUBLE";
            break;
          case "block-scalar": {
            const header = token.props[0];
            if (header.type !== "block-scalar-header")
              throw new Error("Invalid block scalar header");
            type = header.source[0] === ">" ? "BLOCK_FOLDED" : "BLOCK_LITERAL";
            break;
          }
          default:
            type = "PLAIN";
        }
      const source = stringifyString.stringifyString({ type, value }, {
        implicitKey: implicitKey || indent === null,
        indent: indent !== null && indent > 0 ? " ".repeat(indent) : "",
        inFlow,
        options: { blockQuote: true, lineWidth: -1 }
      });
      switch (source[0]) {
        case "|":
        case ">":
          setBlockScalarValue(token, source);
          break;
        case '"':
          setFlowScalarValue(token, source, "double-quoted-scalar");
          break;
        case "'":
          setFlowScalarValue(token, source, "single-quoted-scalar");
          break;
        default:
          setFlowScalarValue(token, source, "scalar");
      }
    }
    function setBlockScalarValue(token, source) {
      const he = source.indexOf("\n");
      const head = source.substring(0, he);
      const body = source.substring(he + 1) + "\n";
      if (token.type === "block-scalar") {
        const header = token.props[0];
        if (header.type !== "block-scalar-header")
          throw new Error("Invalid block scalar header");
        header.source = head;
        token.source = body;
      } else {
        const { offset } = token;
        const indent = "indent" in token ? token.indent : -1;
        const props = [
          { type: "block-scalar-header", offset, indent, source: head }
        ];
        if (!addEndtoBlockProps(props, "end" in token ? token.end : void 0))
          props.push({ type: "newline", offset: -1, indent, source: "\n" });
        for (const key of Object.keys(token))
          if (key !== "type" && key !== "offset")
            delete token[key];
        Object.assign(token, { type: "block-scalar", indent, props, source: body });
      }
    }
    function addEndtoBlockProps(props, end) {
      if (end)
        for (const st of end)
          switch (st.type) {
            case "space":
            case "comment":
              props.push(st);
              break;
            case "newline":
              props.push(st);
              return true;
          }
      return false;
    }
    function setFlowScalarValue(token, source, type) {
      switch (token.type) {
        case "scalar":
        case "double-quoted-scalar":
        case "single-quoted-scalar":
          token.type = type;
          token.source = source;
          break;
        case "block-scalar": {
          const end = token.props.slice(1);
          let oa = source.length;
          if (token.props[0].type === "block-scalar-header")
            oa -= token.props[0].source.length;
          for (const tok of end)
            tok.offset += oa;
          delete token.props;
          Object.assign(token, { type, source, end });
          break;
        }
        case "block-map":
        case "block-seq": {
          const offset = token.offset + source.length;
          const nl = { type: "newline", offset, indent: token.indent, source: "\n" };
          delete token.items;
          Object.assign(token, { type, source, end: [nl] });
          break;
        }
        default: {
          const indent = "indent" in token ? token.indent : -1;
          const end = "end" in token && Array.isArray(token.end) ? token.end.filter((st) => st.type === "space" || st.type === "comment" || st.type === "newline") : [];
          for (const key of Object.keys(token))
            if (key !== "type" && key !== "offset")
              delete token[key];
          Object.assign(token, { type, indent, source, end });
        }
      }
    }
    exports.createScalarToken = createScalarToken;
    exports.resolveAsScalar = resolveAsScalar;
    exports.setScalarValue = setScalarValue;
  }
});

// node_modules/yaml/dist/parse/cst-stringify.js
var require_cst_stringify = __commonJS({
  "node_modules/yaml/dist/parse/cst-stringify.js"(exports) {
    "use strict";
    var stringify = (cst) => "type" in cst ? stringifyToken(cst) : stringifyItem(cst);
    function stringifyToken(token) {
      switch (token.type) {
        case "block-scalar": {
          let res = "";
          for (const tok of token.props)
            res += stringifyToken(tok);
          return res + token.source;
        }
        case "block-map":
        case "block-seq": {
          let res = "";
          for (const item of token.items)
            res += stringifyItem(item);
          return res;
        }
        case "flow-collection": {
          let res = token.start.source;
          for (const item of token.items)
            res += stringifyItem(item);
          for (const st of token.end)
            res += st.source;
          return res;
        }
        case "document": {
          let res = stringifyItem(token);
          if (token.end)
            for (const st of token.end)
              res += st.source;
          return res;
        }
        default: {
          let res = token.source;
          if ("end" in token && token.end)
            for (const st of token.end)
              res += st.source;
          return res;
        }
      }
    }
    function stringifyItem({ start, key, sep, value }) {
      let res = "";
      for (const st of start)
        res += st.source;
      if (key)
        res += stringifyToken(key);
      if (sep)
        for (const st of sep)
          res += st.source;
      if (value)
        res += stringifyToken(value);
      return res;
    }
    exports.stringify = stringify;
  }
});

// node_modules/yaml/dist/parse/cst-visit.js
var require_cst_visit = __commonJS({
  "node_modules/yaml/dist/parse/cst-visit.js"(exports) {
    "use strict";
    var BREAK = /* @__PURE__ */ Symbol("break visit");
    var SKIP = /* @__PURE__ */ Symbol("skip children");
    var REMOVE = /* @__PURE__ */ Symbol("remove item");
    function visit(cst, visitor) {
      if ("type" in cst && cst.type === "document")
        cst = { start: cst.start, value: cst.value };
      _visit(Object.freeze([]), cst, visitor);
    }
    visit.BREAK = BREAK;
    visit.SKIP = SKIP;
    visit.REMOVE = REMOVE;
    visit.itemAtPath = (cst, path7) => {
      let item = cst;
      for (const [field, index] of path7) {
        const tok = item?.[field];
        if (tok && "items" in tok) {
          item = tok.items[index];
        } else
          return void 0;
      }
      return item;
    };
    visit.parentCollection = (cst, path7) => {
      const parent = visit.itemAtPath(cst, path7.slice(0, -1));
      const field = path7[path7.length - 1][0];
      const coll = parent?.[field];
      if (coll && "items" in coll)
        return coll;
      throw new Error("Parent collection not found");
    };
    function _visit(path7, item, visitor) {
      let ctrl = visitor(item, path7);
      if (typeof ctrl === "symbol")
        return ctrl;
      for (const field of ["key", "value"]) {
        const token = item[field];
        if (token && "items" in token) {
          for (let i = 0; i < token.items.length; ++i) {
            const ci = _visit(Object.freeze(path7.concat([[field, i]])), token.items[i], visitor);
            if (typeof ci === "number")
              i = ci - 1;
            else if (ci === BREAK)
              return BREAK;
            else if (ci === REMOVE) {
              token.items.splice(i, 1);
              i -= 1;
            }
          }
          if (typeof ctrl === "function" && field === "key")
            ctrl = ctrl(item, path7);
        }
      }
      return typeof ctrl === "function" ? ctrl(item, path7) : ctrl;
    }
    exports.visit = visit;
  }
});

// node_modules/yaml/dist/parse/cst.js
var require_cst = __commonJS({
  "node_modules/yaml/dist/parse/cst.js"(exports) {
    "use strict";
    var cstScalar = require_cst_scalar();
    var cstStringify = require_cst_stringify();
    var cstVisit = require_cst_visit();
    var BOM = "\uFEFF";
    var DOCUMENT = "";
    var FLOW_END = "";
    var SCALAR = "";
    var isCollection = (token) => !!token && "items" in token;
    var isScalar = (token) => !!token && (token.type === "scalar" || token.type === "single-quoted-scalar" || token.type === "double-quoted-scalar" || token.type === "block-scalar");
    function prettyToken(token) {
      switch (token) {
        case BOM:
          return "<BOM>";
        case DOCUMENT:
          return "<DOC>";
        case FLOW_END:
          return "<FLOW_END>";
        case SCALAR:
          return "<SCALAR>";
        default:
          return JSON.stringify(token);
      }
    }
    function tokenType(source) {
      switch (source) {
        case BOM:
          return "byte-order-mark";
        case DOCUMENT:
          return "doc-mode";
        case FLOW_END:
          return "flow-error-end";
        case SCALAR:
          return "scalar";
        case "---":
          return "doc-start";
        case "...":
          return "doc-end";
        case "":
        case "\n":
        case "\r\n":
          return "newline";
        case "-":
          return "seq-item-ind";
        case "?":
          return "explicit-key-ind";
        case ":":
          return "map-value-ind";
        case "{":
          return "flow-map-start";
        case "}":
          return "flow-map-end";
        case "[":
          return "flow-seq-start";
        case "]":
          return "flow-seq-end";
        case ",":
          return "comma";
      }
      switch (source[0]) {
        case " ":
        case "	":
          return "space";
        case "#":
          return "comment";
        case "%":
          return "directive-line";
        case "*":
          return "alias";
        case "&":
          return "anchor";
        case "!":
          return "tag";
        case "'":
          return "single-quoted-scalar";
        case '"':
          return "double-quoted-scalar";
        case "|":
        case ">":
          return "block-scalar-header";
      }
      return null;
    }
    exports.createScalarToken = cstScalar.createScalarToken;
    exports.resolveAsScalar = cstScalar.resolveAsScalar;
    exports.setScalarValue = cstScalar.setScalarValue;
    exports.stringify = cstStringify.stringify;
    exports.visit = cstVisit.visit;
    exports.BOM = BOM;
    exports.DOCUMENT = DOCUMENT;
    exports.FLOW_END = FLOW_END;
    exports.SCALAR = SCALAR;
    exports.isCollection = isCollection;
    exports.isScalar = isScalar;
    exports.prettyToken = prettyToken;
    exports.tokenType = tokenType;
  }
});

// node_modules/yaml/dist/parse/lexer.js
var require_lexer = __commonJS({
  "node_modules/yaml/dist/parse/lexer.js"(exports) {
    "use strict";
    var cst = require_cst();
    function isEmpty(ch) {
      switch (ch) {
        case void 0:
        case " ":
        case "\n":
        case "\r":
        case "	":
          return true;
        default:
          return false;
      }
    }
    var hexDigits = new Set("0123456789ABCDEFabcdef");
    var tagChars = new Set("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-#;/?:@&=+$_.!~*'()");
    var flowIndicatorChars = new Set(",[]{}");
    var invalidAnchorChars = new Set(" ,[]{}\n\r	");
    var isNotAnchorChar = (ch) => !ch || invalidAnchorChars.has(ch);
    var Lexer = class {
      constructor() {
        this.atEnd = false;
        this.blockScalarIndent = -1;
        this.blockScalarKeep = false;
        this.buffer = "";
        this.flowKey = false;
        this.flowLevel = 0;
        this.indentNext = 0;
        this.indentValue = 0;
        this.lineEndPos = null;
        this.next = null;
        this.pos = 0;
      }
      /**
       * Generate YAML tokens from the `source` string. If `incomplete`,
       * a part of the last line may be left as a buffer for the next call.
       *
       * @returns A generator of lexical tokens
       */
      *lex(source, incomplete = false) {
        if (source) {
          if (typeof source !== "string")
            throw TypeError("source is not a string");
          this.buffer = this.buffer ? this.buffer + source : source;
          this.lineEndPos = null;
        }
        this.atEnd = !incomplete;
        let next = this.next ?? "stream";
        while (next && (incomplete || this.hasChars(1)))
          next = yield* this.parseNext(next);
      }
      atLineEnd() {
        let i = this.pos;
        let ch = this.buffer[i];
        while (ch === " " || ch === "	")
          ch = this.buffer[++i];
        if (!ch || ch === "#" || ch === "\n")
          return true;
        if (ch === "\r")
          return this.buffer[i + 1] === "\n";
        return false;
      }
      charAt(n) {
        return this.buffer[this.pos + n];
      }
      continueScalar(offset) {
        let ch = this.buffer[offset];
        if (this.indentNext > 0) {
          let indent = 0;
          while (ch === " ")
            ch = this.buffer[++indent + offset];
          if (ch === "\r") {
            const next = this.buffer[indent + offset + 1];
            if (next === "\n" || !next && !this.atEnd)
              return offset + indent + 1;
          }
          return ch === "\n" || indent >= this.indentNext || !ch && !this.atEnd ? offset + indent : -1;
        }
        if (ch === "-" || ch === ".") {
          const dt = this.buffer.substr(offset, 3);
          if ((dt === "---" || dt === "...") && isEmpty(this.buffer[offset + 3]))
            return -1;
        }
        return offset;
      }
      getLine() {
        let end = this.lineEndPos;
        if (typeof end !== "number" || end !== -1 && end < this.pos) {
          end = this.buffer.indexOf("\n", this.pos);
          this.lineEndPos = end;
        }
        if (end === -1)
          return this.atEnd ? this.buffer.substring(this.pos) : null;
        if (this.buffer[end - 1] === "\r")
          end -= 1;
        return this.buffer.substring(this.pos, end);
      }
      hasChars(n) {
        return this.pos + n <= this.buffer.length;
      }
      setNext(state) {
        this.buffer = this.buffer.substring(this.pos);
        this.pos = 0;
        this.lineEndPos = null;
        this.next = state;
        return null;
      }
      peek(n) {
        return this.buffer.substr(this.pos, n);
      }
      *parseNext(next) {
        switch (next) {
          case "stream":
            return yield* this.parseStream();
          case "line-start":
            return yield* this.parseLineStart();
          case "block-start":
            return yield* this.parseBlockStart();
          case "doc":
            return yield* this.parseDocument();
          case "flow":
            return yield* this.parseFlowCollection();
          case "quoted-scalar":
            return yield* this.parseQuotedScalar();
          case "block-scalar":
            return yield* this.parseBlockScalar();
          case "plain-scalar":
            return yield* this.parsePlainScalar();
        }
      }
      *parseStream() {
        let line = this.getLine();
        if (line === null)
          return this.setNext("stream");
        if (line[0] === cst.BOM) {
          yield* this.pushCount(1);
          line = line.substring(1);
        }
        if (line[0] === "%") {
          let dirEnd = line.length;
          let cs = line.indexOf("#");
          while (cs !== -1) {
            const ch = line[cs - 1];
            if (ch === " " || ch === "	") {
              dirEnd = cs - 1;
              break;
            } else {
              cs = line.indexOf("#", cs + 1);
            }
          }
          while (true) {
            const ch = line[dirEnd - 1];
            if (ch === " " || ch === "	")
              dirEnd -= 1;
            else
              break;
          }
          const n = (yield* this.pushCount(dirEnd)) + (yield* this.pushSpaces(true));
          yield* this.pushCount(line.length - n);
          this.pushNewline();
          return "stream";
        }
        if (this.atLineEnd()) {
          const sp = yield* this.pushSpaces(true);
          yield* this.pushCount(line.length - sp);
          yield* this.pushNewline();
          return "stream";
        }
        yield cst.DOCUMENT;
        return yield* this.parseLineStart();
      }
      *parseLineStart() {
        const ch = this.charAt(0);
        if (!ch && !this.atEnd)
          return this.setNext("line-start");
        if (ch === "-" || ch === ".") {
          if (!this.atEnd && !this.hasChars(4))
            return this.setNext("line-start");
          const s = this.peek(3);
          if ((s === "---" || s === "...") && isEmpty(this.charAt(3))) {
            yield* this.pushCount(3);
            this.indentValue = 0;
            this.indentNext = 0;
            return s === "---" ? "doc" : "stream";
          }
        }
        this.indentValue = yield* this.pushSpaces(false);
        if (this.indentNext > this.indentValue && !isEmpty(this.charAt(1)))
          this.indentNext = this.indentValue;
        return yield* this.parseBlockStart();
      }
      *parseBlockStart() {
        const [ch0, ch1] = this.peek(2);
        if (!ch1 && !this.atEnd)
          return this.setNext("block-start");
        if ((ch0 === "-" || ch0 === "?" || ch0 === ":") && isEmpty(ch1)) {
          const n = (yield* this.pushCount(1)) + (yield* this.pushSpaces(true));
          this.indentNext = this.indentValue + 1;
          this.indentValue += n;
          return "block-start";
        }
        return "doc";
      }
      *parseDocument() {
        yield* this.pushSpaces(true);
        const line = this.getLine();
        if (line === null)
          return this.setNext("doc");
        let n = yield* this.pushIndicators();
        switch (line[n]) {
          case "#":
            yield* this.pushCount(line.length - n);
          // fallthrough
          case void 0:
            yield* this.pushNewline();
            return yield* this.parseLineStart();
          case "{":
          case "[":
            yield* this.pushCount(1);
            this.flowKey = false;
            this.flowLevel = 1;
            return "flow";
          case "}":
          case "]":
            yield* this.pushCount(1);
            return "doc";
          case "*":
            yield* this.pushUntil(isNotAnchorChar);
            return "doc";
          case '"':
          case "'":
            return yield* this.parseQuotedScalar();
          case "|":
          case ">":
            n += yield* this.parseBlockScalarHeader();
            n += yield* this.pushSpaces(true);
            yield* this.pushCount(line.length - n);
            yield* this.pushNewline();
            return yield* this.parseBlockScalar();
          default:
            return yield* this.parsePlainScalar();
        }
      }
      *parseFlowCollection() {
        let nl, sp;
        let indent = -1;
        do {
          nl = yield* this.pushNewline();
          if (nl > 0) {
            sp = yield* this.pushSpaces(false);
            this.indentValue = indent = sp;
          } else {
            sp = 0;
          }
          sp += yield* this.pushSpaces(true);
        } while (nl + sp > 0);
        const line = this.getLine();
        if (line === null)
          return this.setNext("flow");
        if (indent !== -1 && indent < this.indentNext && line[0] !== "#" || indent === 0 && (line.startsWith("---") || line.startsWith("...")) && isEmpty(line[3])) {
          const atFlowEndMarker = indent === this.indentNext - 1 && this.flowLevel === 1 && (line[0] === "]" || line[0] === "}");
          if (!atFlowEndMarker) {
            this.flowLevel = 0;
            yield cst.FLOW_END;
            return yield* this.parseLineStart();
          }
        }
        let n = 0;
        while (line[n] === ",") {
          n += yield* this.pushCount(1);
          n += yield* this.pushSpaces(true);
          this.flowKey = false;
        }
        n += yield* this.pushIndicators();
        switch (line[n]) {
          case void 0:
            return "flow";
          case "#":
            yield* this.pushCount(line.length - n);
            return "flow";
          case "{":
          case "[":
            yield* this.pushCount(1);
            this.flowKey = false;
            this.flowLevel += 1;
            return "flow";
          case "}":
          case "]":
            yield* this.pushCount(1);
            this.flowKey = true;
            this.flowLevel -= 1;
            return this.flowLevel ? "flow" : "doc";
          case "*":
            yield* this.pushUntil(isNotAnchorChar);
            return "flow";
          case '"':
          case "'":
            this.flowKey = true;
            return yield* this.parseQuotedScalar();
          case ":": {
            const next = this.charAt(1);
            if (this.flowKey || isEmpty(next) || next === ",") {
              this.flowKey = false;
              yield* this.pushCount(1);
              yield* this.pushSpaces(true);
              return "flow";
            }
          }
          // fallthrough
          default:
            this.flowKey = false;
            return yield* this.parsePlainScalar();
        }
      }
      *parseQuotedScalar() {
        const quote = this.charAt(0);
        let end = this.buffer.indexOf(quote, this.pos + 1);
        if (quote === "'") {
          while (end !== -1 && this.buffer[end + 1] === "'")
            end = this.buffer.indexOf("'", end + 2);
        } else {
          while (end !== -1) {
            let n = 0;
            while (this.buffer[end - 1 - n] === "\\")
              n += 1;
            if (n % 2 === 0)
              break;
            end = this.buffer.indexOf('"', end + 1);
          }
        }
        const qb = this.buffer.substring(0, end);
        let nl = qb.indexOf("\n", this.pos);
        if (nl !== -1) {
          while (nl !== -1) {
            const cs = this.continueScalar(nl + 1);
            if (cs === -1)
              break;
            nl = qb.indexOf("\n", cs);
          }
          if (nl !== -1) {
            end = nl - (qb[nl - 1] === "\r" ? 2 : 1);
          }
        }
        if (end === -1) {
          if (!this.atEnd)
            return this.setNext("quoted-scalar");
          end = this.buffer.length;
        }
        yield* this.pushToIndex(end + 1, false);
        return this.flowLevel ? "flow" : "doc";
      }
      *parseBlockScalarHeader() {
        this.blockScalarIndent = -1;
        this.blockScalarKeep = false;
        let i = this.pos;
        while (true) {
          const ch = this.buffer[++i];
          if (ch === "+")
            this.blockScalarKeep = true;
          else if (ch > "0" && ch <= "9")
            this.blockScalarIndent = Number(ch) - 1;
          else if (ch !== "-")
            break;
        }
        return yield* this.pushUntil((ch) => isEmpty(ch) || ch === "#");
      }
      *parseBlockScalar() {
        let nl = this.pos - 1;
        let indent = 0;
        let ch;
        loop: for (let i2 = this.pos; ch = this.buffer[i2]; ++i2) {
          switch (ch) {
            case " ":
              indent += 1;
              break;
            case "\n":
              nl = i2;
              indent = 0;
              break;
            case "\r": {
              const next = this.buffer[i2 + 1];
              if (!next && !this.atEnd)
                return this.setNext("block-scalar");
              if (next === "\n")
                break;
            }
            // fallthrough
            default:
              break loop;
          }
        }
        if (!ch && !this.atEnd)
          return this.setNext("block-scalar");
        if (indent >= this.indentNext) {
          if (this.blockScalarIndent === -1)
            this.indentNext = indent;
          else {
            this.indentNext = this.blockScalarIndent + (this.indentNext === 0 ? 1 : this.indentNext);
          }
          do {
            const cs = this.continueScalar(nl + 1);
            if (cs === -1)
              break;
            nl = this.buffer.indexOf("\n", cs);
          } while (nl !== -1);
          if (nl === -1) {
            if (!this.atEnd)
              return this.setNext("block-scalar");
            nl = this.buffer.length;
          }
        }
        let i = nl + 1;
        ch = this.buffer[i];
        while (ch === " ")
          ch = this.buffer[++i];
        if (ch === "	") {
          while (ch === "	" || ch === " " || ch === "\r" || ch === "\n")
            ch = this.buffer[++i];
          nl = i - 1;
        } else if (!this.blockScalarKeep) {
          do {
            let i2 = nl - 1;
            let ch2 = this.buffer[i2];
            if (ch2 === "\r")
              ch2 = this.buffer[--i2];
            const lastChar = i2;
            while (ch2 === " ")
              ch2 = this.buffer[--i2];
            if (ch2 === "\n" && i2 >= this.pos && i2 + 1 + indent > lastChar)
              nl = i2;
            else
              break;
          } while (true);
        }
        yield cst.SCALAR;
        yield* this.pushToIndex(nl + 1, true);
        return yield* this.parseLineStart();
      }
      *parsePlainScalar() {
        const inFlow = this.flowLevel > 0;
        let end = this.pos - 1;
        let i = this.pos - 1;
        let ch;
        while (ch = this.buffer[++i]) {
          if (ch === ":") {
            const next = this.buffer[i + 1];
            if (isEmpty(next) || inFlow && flowIndicatorChars.has(next))
              break;
            end = i;
          } else if (isEmpty(ch)) {
            let next = this.buffer[i + 1];
            if (ch === "\r") {
              if (next === "\n") {
                i += 1;
                ch = "\n";
                next = this.buffer[i + 1];
              } else
                end = i;
            }
            if (next === "#" || inFlow && flowIndicatorChars.has(next))
              break;
            if (ch === "\n") {
              const cs = this.continueScalar(i + 1);
              if (cs === -1)
                break;
              i = Math.max(i, cs - 2);
            }
          } else {
            if (inFlow && flowIndicatorChars.has(ch))
              break;
            end = i;
          }
        }
        if (!ch && !this.atEnd)
          return this.setNext("plain-scalar");
        yield cst.SCALAR;
        yield* this.pushToIndex(end + 1, true);
        return inFlow ? "flow" : "doc";
      }
      *pushCount(n) {
        if (n > 0) {
          yield this.buffer.substr(this.pos, n);
          this.pos += n;
          return n;
        }
        return 0;
      }
      *pushToIndex(i, allowEmpty) {
        const s = this.buffer.slice(this.pos, i);
        if (s) {
          yield s;
          this.pos += s.length;
          return s.length;
        } else if (allowEmpty)
          yield "";
        return 0;
      }
      *pushIndicators() {
        let n = 0;
        loop: while (true) {
          switch (this.charAt(0)) {
            case "!":
              n += yield* this.pushTag();
              n += yield* this.pushSpaces(true);
              continue loop;
            case "&":
              n += yield* this.pushUntil(isNotAnchorChar);
              n += yield* this.pushSpaces(true);
              continue loop;
            case "-":
            // this is an error
            case "?":
            // this is an error outside flow collections
            case ":": {
              const inFlow = this.flowLevel > 0;
              const ch1 = this.charAt(1);
              if (isEmpty(ch1) || inFlow && flowIndicatorChars.has(ch1)) {
                if (!inFlow)
                  this.indentNext = this.indentValue + 1;
                else if (this.flowKey)
                  this.flowKey = false;
                n += yield* this.pushCount(1);
                n += yield* this.pushSpaces(true);
                continue loop;
              }
            }
          }
          break loop;
        }
        return n;
      }
      *pushTag() {
        if (this.charAt(1) === "<") {
          let i = this.pos + 2;
          let ch = this.buffer[i];
          while (!isEmpty(ch) && ch !== ">")
            ch = this.buffer[++i];
          return yield* this.pushToIndex(ch === ">" ? i + 1 : i, false);
        } else {
          let i = this.pos + 1;
          let ch = this.buffer[i];
          while (ch) {
            if (tagChars.has(ch))
              ch = this.buffer[++i];
            else if (ch === "%" && hexDigits.has(this.buffer[i + 1]) && hexDigits.has(this.buffer[i + 2])) {
              ch = this.buffer[i += 3];
            } else
              break;
          }
          return yield* this.pushToIndex(i, false);
        }
      }
      *pushNewline() {
        const ch = this.buffer[this.pos];
        if (ch === "\n")
          return yield* this.pushCount(1);
        else if (ch === "\r" && this.charAt(1) === "\n")
          return yield* this.pushCount(2);
        else
          return 0;
      }
      *pushSpaces(allowTabs) {
        let i = this.pos - 1;
        let ch;
        do {
          ch = this.buffer[++i];
        } while (ch === " " || allowTabs && ch === "	");
        const n = i - this.pos;
        if (n > 0) {
          yield this.buffer.substr(this.pos, n);
          this.pos = i;
        }
        return n;
      }
      *pushUntil(test) {
        let i = this.pos;
        let ch = this.buffer[i];
        while (!test(ch))
          ch = this.buffer[++i];
        return yield* this.pushToIndex(i, false);
      }
    };
    exports.Lexer = Lexer;
  }
});

// node_modules/yaml/dist/parse/line-counter.js
var require_line_counter = __commonJS({
  "node_modules/yaml/dist/parse/line-counter.js"(exports) {
    "use strict";
    var LineCounter = class {
      constructor() {
        this.lineStarts = [];
        this.addNewLine = (offset) => this.lineStarts.push(offset);
        this.linePos = (offset) => {
          let low = 0;
          let high = this.lineStarts.length;
          while (low < high) {
            const mid = low + high >> 1;
            if (this.lineStarts[mid] < offset)
              low = mid + 1;
            else
              high = mid;
          }
          if (this.lineStarts[low] === offset)
            return { line: low + 1, col: 1 };
          if (low === 0)
            return { line: 0, col: offset };
          const start = this.lineStarts[low - 1];
          return { line: low, col: offset - start + 1 };
        };
      }
    };
    exports.LineCounter = LineCounter;
  }
});

// node_modules/yaml/dist/parse/parser.js
var require_parser = __commonJS({
  "node_modules/yaml/dist/parse/parser.js"(exports) {
    "use strict";
    var node_process = __require("process");
    var cst = require_cst();
    var lexer = require_lexer();
    function includesToken(list, type) {
      for (let i = 0; i < list.length; ++i)
        if (list[i].type === type)
          return true;
      return false;
    }
    function findNonEmptyIndex(list) {
      for (let i = 0; i < list.length; ++i) {
        switch (list[i].type) {
          case "space":
          case "comment":
          case "newline":
            break;
          default:
            return i;
        }
      }
      return -1;
    }
    function isFlowToken(token) {
      switch (token?.type) {
        case "alias":
        case "scalar":
        case "single-quoted-scalar":
        case "double-quoted-scalar":
        case "flow-collection":
          return true;
        default:
          return false;
      }
    }
    function getPrevProps(parent) {
      switch (parent.type) {
        case "document":
          return parent.start;
        case "block-map": {
          const it = parent.items[parent.items.length - 1];
          return it.sep ?? it.start;
        }
        case "block-seq":
          return parent.items[parent.items.length - 1].start;
        /* istanbul ignore next should not happen */
        default:
          return [];
      }
    }
    function getFirstKeyStartProps(prev) {
      if (prev.length === 0)
        return [];
      let i = prev.length;
      loop: while (--i >= 0) {
        switch (prev[i].type) {
          case "doc-start":
          case "explicit-key-ind":
          case "map-value-ind":
          case "seq-item-ind":
          case "newline":
            break loop;
        }
      }
      while (prev[++i]?.type === "space") {
      }
      return prev.splice(i, prev.length);
    }
    function arrayPushArray(target, source) {
      if (source.length < 1e5)
        Array.prototype.push.apply(target, source);
      else
        for (let i = 0; i < source.length; ++i)
          target.push(source[i]);
    }
    function fixFlowSeqItems(fc) {
      if (fc.start.type === "flow-seq-start") {
        for (const it of fc.items) {
          if (it.sep && !it.value && !includesToken(it.start, "explicit-key-ind") && !includesToken(it.sep, "map-value-ind")) {
            if (it.key)
              it.value = it.key;
            delete it.key;
            if (isFlowToken(it.value)) {
              if (it.value.end)
                arrayPushArray(it.value.end, it.sep);
              else
                it.value.end = it.sep;
            } else
              arrayPushArray(it.start, it.sep);
            delete it.sep;
          }
        }
      }
    }
    var Parser = class {
      /**
       * @param onNewLine - If defined, called separately with the start position of
       *   each new line (in `parse()`, including the start of input).
       */
      constructor(onNewLine) {
        this.atNewLine = true;
        this.atScalar = false;
        this.indent = 0;
        this.offset = 0;
        this.onKeyLine = false;
        this.stack = [];
        this.source = "";
        this.type = "";
        this.lexer = new lexer.Lexer();
        this.onNewLine = onNewLine;
      }
      /**
       * Parse `source` as a YAML stream.
       * If `incomplete`, a part of the last line may be left as a buffer for the next call.
       *
       * Errors are not thrown, but yielded as `{ type: 'error', message }` tokens.
       *
       * @returns A generator of tokens representing each directive, document, and other structure.
       */
      *parse(source, incomplete = false) {
        if (this.onNewLine && this.offset === 0)
          this.onNewLine(0);
        for (const lexeme of this.lexer.lex(source, incomplete))
          yield* this.next(lexeme);
        if (!incomplete)
          yield* this.end();
      }
      /**
       * Advance the parser by the `source` of one lexical token.
       */
      *next(source) {
        this.source = source;
        if (node_process.env.LOG_TOKENS)
          console.log("|", cst.prettyToken(source));
        if (this.atScalar) {
          this.atScalar = false;
          yield* this.step();
          this.offset += source.length;
          return;
        }
        const type = cst.tokenType(source);
        if (!type) {
          const message = `Not a YAML token: ${source}`;
          yield* this.pop({ type: "error", offset: this.offset, message, source });
          this.offset += source.length;
        } else if (type === "scalar") {
          this.atNewLine = false;
          this.atScalar = true;
          this.type = "scalar";
        } else {
          this.type = type;
          yield* this.step();
          switch (type) {
            case "newline":
              this.atNewLine = true;
              this.indent = 0;
              if (this.onNewLine)
                this.onNewLine(this.offset + source.length);
              break;
            case "space":
              if (this.atNewLine && source[0] === " ")
                this.indent += source.length;
              break;
            case "explicit-key-ind":
            case "map-value-ind":
            case "seq-item-ind":
              if (this.atNewLine)
                this.indent += source.length;
              break;
            case "doc-mode":
            case "flow-error-end":
              return;
            default:
              this.atNewLine = false;
          }
          this.offset += source.length;
        }
      }
      /** Call at end of input to push out any remaining constructions */
      *end() {
        while (this.stack.length > 0)
          yield* this.pop();
      }
      get sourceToken() {
        const st = {
          type: this.type,
          offset: this.offset,
          indent: this.indent,
          source: this.source
        };
        return st;
      }
      *step() {
        const top = this.peek(1);
        if (this.type === "doc-end" && top?.type !== "doc-end") {
          while (this.stack.length > 0)
            yield* this.pop();
          this.stack.push({
            type: "doc-end",
            offset: this.offset,
            source: this.source
          });
          return;
        }
        if (!top)
          return yield* this.stream();
        switch (top.type) {
          case "document":
            return yield* this.document(top);
          case "alias":
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar":
            return yield* this.scalar(top);
          case "block-scalar":
            return yield* this.blockScalar(top);
          case "block-map":
            return yield* this.blockMap(top);
          case "block-seq":
            return yield* this.blockSequence(top);
          case "flow-collection":
            return yield* this.flowCollection(top);
          case "doc-end":
            return yield* this.documentEnd(top);
        }
        yield* this.pop();
      }
      peek(n) {
        return this.stack[this.stack.length - n];
      }
      *pop(error) {
        const token = error ?? this.stack.pop();
        if (!token) {
          const message = "Tried to pop an empty stack";
          yield { type: "error", offset: this.offset, source: "", message };
        } else if (this.stack.length === 0) {
          yield token;
        } else {
          const top = this.peek(1);
          if (token.type === "block-scalar") {
            token.indent = "indent" in top ? top.indent : 0;
          } else if (token.type === "flow-collection" && top.type === "document") {
            token.indent = 0;
          }
          if (token.type === "flow-collection")
            fixFlowSeqItems(token);
          switch (top.type) {
            case "document":
              top.value = token;
              break;
            case "block-scalar":
              top.props.push(token);
              break;
            case "block-map": {
              const it = top.items[top.items.length - 1];
              if (it.value) {
                top.items.push({ start: [], key: token, sep: [] });
                this.onKeyLine = true;
                return;
              } else if (it.sep) {
                it.value = token;
              } else {
                Object.assign(it, { key: token, sep: [] });
                this.onKeyLine = !it.explicitKey;
                return;
              }
              break;
            }
            case "block-seq": {
              const it = top.items[top.items.length - 1];
              if (it.value)
                top.items.push({ start: [], value: token });
              else
                it.value = token;
              break;
            }
            case "flow-collection": {
              const it = top.items[top.items.length - 1];
              if (!it || it.value)
                top.items.push({ start: [], key: token, sep: [] });
              else if (it.sep)
                it.value = token;
              else
                Object.assign(it, { key: token, sep: [] });
              return;
            }
            /* istanbul ignore next should not happen */
            default:
              yield* this.pop();
              yield* this.pop(token);
          }
          if ((top.type === "document" || top.type === "block-map" || top.type === "block-seq") && (token.type === "block-map" || token.type === "block-seq")) {
            const last = token.items[token.items.length - 1];
            if (last && !last.sep && !last.value && last.start.length > 0 && findNonEmptyIndex(last.start) === -1 && (token.indent === 0 || last.start.every((st) => st.type !== "comment" || st.indent < token.indent))) {
              if (top.type === "document")
                top.end = last.start;
              else
                top.items.push({ start: last.start });
              token.items.splice(-1, 1);
            }
          }
        }
      }
      *stream() {
        switch (this.type) {
          case "directive-line":
            yield { type: "directive", offset: this.offset, source: this.source };
            return;
          case "byte-order-mark":
          case "space":
          case "comment":
          case "newline":
            yield this.sourceToken;
            return;
          case "doc-mode":
          case "doc-start": {
            const doc = {
              type: "document",
              offset: this.offset,
              start: []
            };
            if (this.type === "doc-start")
              doc.start.push(this.sourceToken);
            this.stack.push(doc);
            return;
          }
        }
        yield {
          type: "error",
          offset: this.offset,
          message: `Unexpected ${this.type} token in YAML stream`,
          source: this.source
        };
      }
      *document(doc) {
        if (doc.value)
          return yield* this.lineEnd(doc);
        switch (this.type) {
          case "doc-start": {
            if (findNonEmptyIndex(doc.start) !== -1) {
              yield* this.pop();
              yield* this.step();
            } else
              doc.start.push(this.sourceToken);
            return;
          }
          case "anchor":
          case "tag":
          case "space":
          case "comment":
          case "newline":
            doc.start.push(this.sourceToken);
            return;
        }
        const bv = this.startBlockValue(doc);
        if (bv)
          this.stack.push(bv);
        else {
          yield {
            type: "error",
            offset: this.offset,
            message: `Unexpected ${this.type} token in YAML document`,
            source: this.source
          };
        }
      }
      *scalar(scalar) {
        if (this.type === "map-value-ind") {
          const prev = getPrevProps(this.peek(2));
          const start = getFirstKeyStartProps(prev);
          let sep;
          if (scalar.end) {
            sep = scalar.end;
            sep.push(this.sourceToken);
            delete scalar.end;
          } else
            sep = [this.sourceToken];
          const map = {
            type: "block-map",
            offset: scalar.offset,
            indent: scalar.indent,
            items: [{ start, key: scalar, sep }]
          };
          this.onKeyLine = true;
          this.stack[this.stack.length - 1] = map;
        } else
          yield* this.lineEnd(scalar);
      }
      *blockScalar(scalar) {
        switch (this.type) {
          case "space":
          case "comment":
          case "newline":
            scalar.props.push(this.sourceToken);
            return;
          case "scalar":
            scalar.source = this.source;
            this.atNewLine = true;
            this.indent = 0;
            if (this.onNewLine) {
              let nl = this.source.indexOf("\n") + 1;
              while (nl !== 0) {
                this.onNewLine(this.offset + nl);
                nl = this.source.indexOf("\n", nl) + 1;
              }
            }
            yield* this.pop();
            break;
          /* istanbul ignore next should not happen */
          default:
            yield* this.pop();
            yield* this.step();
        }
      }
      *blockMap(map) {
        const it = map.items[map.items.length - 1];
        switch (this.type) {
          case "newline":
            this.onKeyLine = false;
            if (it.value) {
              const end = "end" in it.value ? it.value.end : void 0;
              const last = Array.isArray(end) ? end[end.length - 1] : void 0;
              if (last?.type === "comment")
                end?.push(this.sourceToken);
              else
                map.items.push({ start: [this.sourceToken] });
            } else if (it.sep) {
              it.sep.push(this.sourceToken);
            } else {
              it.start.push(this.sourceToken);
            }
            return;
          case "space":
          case "comment":
            if (it.value) {
              map.items.push({ start: [this.sourceToken] });
            } else if (it.sep) {
              it.sep.push(this.sourceToken);
            } else {
              if (this.atIndentedComment(it.start, map.indent)) {
                const prev = map.items[map.items.length - 2];
                const end = prev?.value?.end;
                if (Array.isArray(end)) {
                  arrayPushArray(end, it.start);
                  end.push(this.sourceToken);
                  map.items.pop();
                  return;
                }
              }
              it.start.push(this.sourceToken);
            }
            return;
        }
        if (this.indent >= map.indent) {
          const atMapIndent = !this.onKeyLine && this.indent === map.indent;
          const atNextItem = atMapIndent && (it.sep || it.explicitKey) && this.type !== "seq-item-ind";
          let start = [];
          if (atNextItem && it.sep && !it.value) {
            const nl = [];
            for (let i = 0; i < it.sep.length; ++i) {
              const st = it.sep[i];
              switch (st.type) {
                case "newline":
                  nl.push(i);
                  break;
                case "space":
                  break;
                case "comment":
                  if (st.indent > map.indent)
                    nl.length = 0;
                  break;
                default:
                  nl.length = 0;
              }
            }
            if (nl.length >= 2)
              start = it.sep.splice(nl[1]);
          }
          switch (this.type) {
            case "anchor":
            case "tag":
              if (atNextItem || it.value) {
                start.push(this.sourceToken);
                map.items.push({ start });
                this.onKeyLine = true;
              } else if (it.sep) {
                it.sep.push(this.sourceToken);
              } else {
                it.start.push(this.sourceToken);
              }
              return;
            case "explicit-key-ind":
              if (!it.sep && !it.explicitKey) {
                it.start.push(this.sourceToken);
                it.explicitKey = true;
              } else if (atNextItem || it.value) {
                start.push(this.sourceToken);
                map.items.push({ start, explicitKey: true });
              } else {
                this.stack.push({
                  type: "block-map",
                  offset: this.offset,
                  indent: this.indent,
                  items: [{ start: [this.sourceToken], explicitKey: true }]
                });
              }
              this.onKeyLine = true;
              return;
            case "map-value-ind":
              if (it.explicitKey) {
                if (!it.sep) {
                  if (includesToken(it.start, "newline")) {
                    Object.assign(it, { key: null, sep: [this.sourceToken] });
                  } else {
                    const start2 = getFirstKeyStartProps(it.start);
                    this.stack.push({
                      type: "block-map",
                      offset: this.offset,
                      indent: this.indent,
                      items: [{ start: start2, key: null, sep: [this.sourceToken] }]
                    });
                  }
                } else if (it.value) {
                  map.items.push({ start: [], key: null, sep: [this.sourceToken] });
                } else if (includesToken(it.sep, "map-value-ind")) {
                  this.stack.push({
                    type: "block-map",
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start, key: null, sep: [this.sourceToken] }]
                  });
                } else if (isFlowToken(it.key) && !includesToken(it.sep, "newline")) {
                  const start2 = getFirstKeyStartProps(it.start);
                  const key = it.key;
                  const sep = it.sep;
                  sep.push(this.sourceToken);
                  delete it.key;
                  delete it.sep;
                  this.stack.push({
                    type: "block-map",
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start: start2, key, sep }]
                  });
                } else if (start.length > 0) {
                  it.sep = it.sep.concat(start, this.sourceToken);
                } else {
                  it.sep.push(this.sourceToken);
                }
              } else {
                if (!it.sep) {
                  Object.assign(it, { key: null, sep: [this.sourceToken] });
                } else if (it.value || atNextItem) {
                  map.items.push({ start, key: null, sep: [this.sourceToken] });
                } else if (includesToken(it.sep, "map-value-ind")) {
                  this.stack.push({
                    type: "block-map",
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start: [], key: null, sep: [this.sourceToken] }]
                  });
                } else {
                  it.sep.push(this.sourceToken);
                }
              }
              this.onKeyLine = true;
              return;
            case "alias":
            case "scalar":
            case "single-quoted-scalar":
            case "double-quoted-scalar": {
              const fs = this.flowScalar(this.type);
              if (atNextItem || it.value) {
                map.items.push({ start, key: fs, sep: [] });
                this.onKeyLine = true;
              } else if (it.sep) {
                this.stack.push(fs);
              } else {
                Object.assign(it, { key: fs, sep: [] });
                this.onKeyLine = true;
              }
              return;
            }
            default: {
              const bv = this.startBlockValue(map);
              if (bv) {
                if (bv.type === "block-seq") {
                  if (!it.explicitKey && it.sep && !includesToken(it.sep, "newline")) {
                    yield* this.pop({
                      type: "error",
                      offset: this.offset,
                      message: "Unexpected block-seq-ind on same line with key",
                      source: this.source
                    });
                    return;
                  }
                } else if (atMapIndent) {
                  map.items.push({ start });
                }
                this.stack.push(bv);
                return;
              }
            }
          }
        }
        yield* this.pop();
        yield* this.step();
      }
      *blockSequence(seq) {
        const it = seq.items[seq.items.length - 1];
        switch (this.type) {
          case "newline":
            if (it.value) {
              const end = "end" in it.value ? it.value.end : void 0;
              const last = Array.isArray(end) ? end[end.length - 1] : void 0;
              if (last?.type === "comment")
                end?.push(this.sourceToken);
              else
                seq.items.push({ start: [this.sourceToken] });
            } else
              it.start.push(this.sourceToken);
            return;
          case "space":
          case "comment":
            if (it.value)
              seq.items.push({ start: [this.sourceToken] });
            else {
              if (this.atIndentedComment(it.start, seq.indent)) {
                const prev = seq.items[seq.items.length - 2];
                const end = prev?.value?.end;
                if (Array.isArray(end)) {
                  arrayPushArray(end, it.start);
                  end.push(this.sourceToken);
                  seq.items.pop();
                  return;
                }
              }
              it.start.push(this.sourceToken);
            }
            return;
          case "anchor":
          case "tag":
            if (it.value || this.indent <= seq.indent)
              break;
            it.start.push(this.sourceToken);
            return;
          case "seq-item-ind":
            if (this.indent !== seq.indent)
              break;
            if (it.value || includesToken(it.start, "seq-item-ind"))
              seq.items.push({ start: [this.sourceToken] });
            else
              it.start.push(this.sourceToken);
            return;
        }
        if (this.indent > seq.indent) {
          const bv = this.startBlockValue(seq);
          if (bv) {
            this.stack.push(bv);
            return;
          }
        }
        yield* this.pop();
        yield* this.step();
      }
      *flowCollection(fc) {
        const it = fc.items[fc.items.length - 1];
        if (this.type === "flow-error-end") {
          let top;
          do {
            yield* this.pop();
            top = this.peek(1);
          } while (top?.type === "flow-collection");
        } else if (fc.end.length === 0) {
          switch (this.type) {
            case "comma":
            case "explicit-key-ind":
              if (!it || it.sep)
                fc.items.push({ start: [this.sourceToken] });
              else
                it.start.push(this.sourceToken);
              return;
            case "map-value-ind":
              if (!it || it.value)
                fc.items.push({ start: [], key: null, sep: [this.sourceToken] });
              else if (it.sep)
                it.sep.push(this.sourceToken);
              else
                Object.assign(it, { key: null, sep: [this.sourceToken] });
              return;
            case "space":
            case "comment":
            case "newline":
            case "anchor":
            case "tag":
              if (!it || it.value)
                fc.items.push({ start: [this.sourceToken] });
              else if (it.sep)
                it.sep.push(this.sourceToken);
              else
                it.start.push(this.sourceToken);
              return;
            case "alias":
            case "scalar":
            case "single-quoted-scalar":
            case "double-quoted-scalar": {
              const fs = this.flowScalar(this.type);
              if (!it || it.value)
                fc.items.push({ start: [], key: fs, sep: [] });
              else if (it.sep)
                this.stack.push(fs);
              else
                Object.assign(it, { key: fs, sep: [] });
              return;
            }
            case "flow-map-end":
            case "flow-seq-end":
              fc.end.push(this.sourceToken);
              return;
          }
          const bv = this.startBlockValue(fc);
          if (bv)
            this.stack.push(bv);
          else {
            yield* this.pop();
            yield* this.step();
          }
        } else {
          const parent = this.peek(2);
          if (parent.type === "block-map" && (this.type === "map-value-ind" && parent.indent === fc.indent || this.type === "newline" && !parent.items[parent.items.length - 1].sep)) {
            yield* this.pop();
            yield* this.step();
          } else if (this.type === "map-value-ind" && parent.type !== "flow-collection") {
            const prev = getPrevProps(parent);
            const start = getFirstKeyStartProps(prev);
            fixFlowSeqItems(fc);
            const sep = fc.end.splice(1, fc.end.length);
            sep.push(this.sourceToken);
            const map = {
              type: "block-map",
              offset: fc.offset,
              indent: fc.indent,
              items: [{ start, key: fc, sep }]
            };
            this.onKeyLine = true;
            this.stack[this.stack.length - 1] = map;
          } else {
            yield* this.lineEnd(fc);
          }
        }
      }
      flowScalar(type) {
        if (this.onNewLine) {
          let nl = this.source.indexOf("\n") + 1;
          while (nl !== 0) {
            this.onNewLine(this.offset + nl);
            nl = this.source.indexOf("\n", nl) + 1;
          }
        }
        return {
          type,
          offset: this.offset,
          indent: this.indent,
          source: this.source
        };
      }
      startBlockValue(parent) {
        switch (this.type) {
          case "alias":
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar":
            return this.flowScalar(this.type);
          case "block-scalar-header":
            return {
              type: "block-scalar",
              offset: this.offset,
              indent: this.indent,
              props: [this.sourceToken],
              source: ""
            };
          case "flow-map-start":
          case "flow-seq-start":
            return {
              type: "flow-collection",
              offset: this.offset,
              indent: this.indent,
              start: this.sourceToken,
              items: [],
              end: []
            };
          case "seq-item-ind":
            return {
              type: "block-seq",
              offset: this.offset,
              indent: this.indent,
              items: [{ start: [this.sourceToken] }]
            };
          case "explicit-key-ind": {
            this.onKeyLine = true;
            const prev = getPrevProps(parent);
            const start = getFirstKeyStartProps(prev);
            start.push(this.sourceToken);
            return {
              type: "block-map",
              offset: this.offset,
              indent: this.indent,
              items: [{ start, explicitKey: true }]
            };
          }
          case "map-value-ind": {
            this.onKeyLine = true;
            const prev = getPrevProps(parent);
            const start = getFirstKeyStartProps(prev);
            return {
              type: "block-map",
              offset: this.offset,
              indent: this.indent,
              items: [{ start, key: null, sep: [this.sourceToken] }]
            };
          }
        }
        return null;
      }
      atIndentedComment(start, indent) {
        if (this.type !== "comment")
          return false;
        if (this.indent <= indent)
          return false;
        return start.every((st) => st.type === "newline" || st.type === "space");
      }
      *documentEnd(docEnd) {
        if (this.type !== "doc-mode") {
          if (docEnd.end)
            docEnd.end.push(this.sourceToken);
          else
            docEnd.end = [this.sourceToken];
          if (this.type === "newline")
            yield* this.pop();
        }
      }
      *lineEnd(token) {
        switch (this.type) {
          case "comma":
          case "doc-start":
          case "doc-end":
          case "flow-seq-end":
          case "flow-map-end":
          case "map-value-ind":
            yield* this.pop();
            yield* this.step();
            break;
          case "newline":
            this.onKeyLine = false;
          // fallthrough
          case "space":
          case "comment":
          default:
            if (token.end)
              token.end.push(this.sourceToken);
            else
              token.end = [this.sourceToken];
            if (this.type === "newline")
              yield* this.pop();
        }
      }
    };
    exports.Parser = Parser;
  }
});

// node_modules/yaml/dist/public-api.js
var require_public_api = __commonJS({
  "node_modules/yaml/dist/public-api.js"(exports) {
    "use strict";
    var composer = require_composer();
    var Document = require_Document();
    var errors = require_errors();
    var log = require_log();
    var identity = require_identity();
    var lineCounter = require_line_counter();
    var parser = require_parser();
    function parseOptions(options) {
      const prettyErrors = options.prettyErrors !== false;
      const lineCounter$1 = options.lineCounter || prettyErrors && new lineCounter.LineCounter() || null;
      return { lineCounter: lineCounter$1, prettyErrors };
    }
    function parseAllDocuments(source, options = {}) {
      const { lineCounter: lineCounter2, prettyErrors } = parseOptions(options);
      const parser$1 = new parser.Parser(lineCounter2?.addNewLine);
      const composer$1 = new composer.Composer(options);
      const docs = Array.from(composer$1.compose(parser$1.parse(source)));
      if (prettyErrors && lineCounter2)
        for (const doc of docs) {
          doc.errors.forEach(errors.prettifyError(source, lineCounter2));
          doc.warnings.forEach(errors.prettifyError(source, lineCounter2));
        }
      if (docs.length > 0)
        return docs;
      return Object.assign([], { empty: true }, composer$1.streamInfo());
    }
    function parseDocument(source, options = {}) {
      const { lineCounter: lineCounter2, prettyErrors } = parseOptions(options);
      const parser$1 = new parser.Parser(lineCounter2?.addNewLine);
      const composer$1 = new composer.Composer(options);
      let doc = null;
      for (const _doc of composer$1.compose(parser$1.parse(source), true, source.length)) {
        if (!doc)
          doc = _doc;
        else if (doc.options.logLevel !== "silent") {
          doc.errors.push(new errors.YAMLParseError(_doc.range.slice(0, 2), "MULTIPLE_DOCS", "Source contains multiple documents; please use YAML.parseAllDocuments()"));
          break;
        }
      }
      if (prettyErrors && lineCounter2) {
        doc.errors.forEach(errors.prettifyError(source, lineCounter2));
        doc.warnings.forEach(errors.prettifyError(source, lineCounter2));
      }
      return doc;
    }
    function parse4(src, reviver, options) {
      let _reviver = void 0;
      if (typeof reviver === "function") {
        _reviver = reviver;
      } else if (options === void 0 && reviver && typeof reviver === "object") {
        options = reviver;
      }
      const doc = parseDocument(src, options);
      if (!doc)
        return null;
      doc.warnings.forEach((warning) => log.warn(doc.options.logLevel, warning));
      if (doc.errors.length > 0) {
        if (doc.options.logLevel !== "silent")
          throw doc.errors[0];
        else
          doc.errors = [];
      }
      return doc.toJS(Object.assign({ reviver: _reviver }, options));
    }
    function stringify(value, replacer, options) {
      let _replacer = null;
      if (typeof replacer === "function" || Array.isArray(replacer)) {
        _replacer = replacer;
      } else if (options === void 0 && replacer) {
        options = replacer;
      }
      if (typeof options === "string")
        options = options.length;
      if (typeof options === "number") {
        const indent = Math.round(options);
        options = indent < 1 ? void 0 : indent > 8 ? { indent: 8 } : { indent };
      }
      if (value === void 0) {
        const { keepUndefined } = options ?? replacer ?? {};
        if (!keepUndefined)
          return void 0;
      }
      if (identity.isDocument(value) && !_replacer)
        return value.toString(options);
      return new Document.Document(value, _replacer, options).toString(options);
    }
    exports.parse = parse4;
    exports.parseAllDocuments = parseAllDocuments;
    exports.parseDocument = parseDocument;
    exports.stringify = stringify;
  }
});

// node_modules/yaml/dist/index.js
var require_dist = __commonJS({
  "node_modules/yaml/dist/index.js"(exports) {
    "use strict";
    var composer = require_composer();
    var Document = require_Document();
    var Schema = require_Schema();
    var errors = require_errors();
    var Alias = require_Alias();
    var identity = require_identity();
    var Pair = require_Pair();
    var Scalar = require_Scalar();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var cst = require_cst();
    var lexer = require_lexer();
    var lineCounter = require_line_counter();
    var parser = require_parser();
    var publicApi = require_public_api();
    var visit = require_visit();
    exports.Composer = composer.Composer;
    exports.Document = Document.Document;
    exports.Schema = Schema.Schema;
    exports.YAMLError = errors.YAMLError;
    exports.YAMLParseError = errors.YAMLParseError;
    exports.YAMLWarning = errors.YAMLWarning;
    exports.Alias = Alias.Alias;
    exports.isAlias = identity.isAlias;
    exports.isCollection = identity.isCollection;
    exports.isDocument = identity.isDocument;
    exports.isMap = identity.isMap;
    exports.isNode = identity.isNode;
    exports.isPair = identity.isPair;
    exports.isScalar = identity.isScalar;
    exports.isSeq = identity.isSeq;
    exports.Pair = Pair.Pair;
    exports.Scalar = Scalar.Scalar;
    exports.YAMLMap = YAMLMap.YAMLMap;
    exports.YAMLSeq = YAMLSeq.YAMLSeq;
    exports.CST = cst;
    exports.Lexer = lexer.Lexer;
    exports.LineCounter = lineCounter.LineCounter;
    exports.Parser = parser.Parser;
    exports.parse = publicApi.parse;
    exports.parseAllDocuments = publicApi.parseAllDocuments;
    exports.parseDocument = publicApi.parseDocument;
    exports.stringify = publicApi.stringify;
    exports.visit = visit.visit;
    exports.visitAsync = visit.visitAsync;
  }
});

// src/stash-catalog.ts
import { readFile as readFile4, realpath as realpath3, stat as stat4 } from "node:fs/promises";
import path5 from "node:path";

// src/types.ts
var RESULT_SCHEMA_VERSION = 1;
var INDEX_SCHEMA_VERSION = 2;
var StashError = class extends Error {
  exitCode;
  code;
  constructor(code, message, exitCode = 10) {
    super(message);
    this.name = "StashError";
    this.code = code;
    this.exitCode = exitCode;
  }
};

// src/internal/configuration.ts
var import_yaml = __toESM(require_dist(), 1);
import { readFile, stat } from "node:fs/promises";
import path2 from "node:path";

// src/internal/util.ts
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { homedir, platform } from "node:os";
import path from "node:path";
var STOP_WORDS = /* @__PURE__ */ new Set([
  "a",
  "an",
  "and",
  "about",
  "for",
  "find",
  "list",
  "me",
  "of",
  "or",
  "show",
  "skill",
  "skills",
  "tell",
  "the",
  "to",
  "with",
  "\uAD00\uB828",
  "\uBAA9\uB85D",
  "\uBCF4\uC5EC\uC918",
  "\uC2A4\uD0AC",
  "\uC2A4\uD0AC\uB4E4",
  "\uC54C\uB824\uC918",
  "\uCC3E\uC544\uC918"
]);
function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}
async function sha256File(filePath) {
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return `sha256:${hash.digest("hex")}`;
}
function normalizeText(value) {
  return value.normalize("NFKC").toLocaleLowerCase("und").replace(/[_/\\]+/gu, " ").replace(/[-‐‑‒–—]+/gu, " ").replace(/[^\p{L}\p{N}\s]+/gu, " ").replace(/\s+/gu, " ").trim();
}
function compactText(value) {
  return normalizeText(value).replace(/\s+/gu, "");
}
function normalizeSourceIdentity(value) {
  return value.normalize("NFKC").toLocaleLowerCase("und").replace(/\s+/gu, " ").trim();
}
function normalizeSourceUrl(value) {
  try {
    return new URL(value.normalize("NFKC").trim()).href;
  } catch {
    return void 0;
  }
}
function tokenize(value) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return [];
  }
  return [
    ...new Set(
      normalized.split(/\s+/u).filter((token) => token.length >= 2 && !STOP_WORDS.has(token))
    )
  ];
}
function trigrams(value) {
  const compact = compactText(value);
  if (compact.length <= 3) {
    return compact ? /* @__PURE__ */ new Set([compact]) : /* @__PURE__ */ new Set();
  }
  const result = /* @__PURE__ */ new Set();
  for (let index = 0; index <= compact.length - 3; index += 1) {
    result.add(compact.slice(index, index + 3));
  }
  return result;
}
function jaccard(left, right) {
  if (left.size === 0 || right.size === 0) {
    return 0;
  }
  let intersection = 0;
  for (const value of left) {
    if (right.has(value)) {
      intersection += 1;
    }
  }
  return intersection / (left.size + right.size - intersection);
}
function isPathInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative);
}
function normalizeRelativePath(value) {
  if (!value || path.isAbsolute(value)) {
    return void 0;
  }
  const normalized = path.normalize(value);
  if (normalized === ".." || normalized.startsWith(`..${path.sep}`) || path.isAbsolute(normalized)) {
    return void 0;
  }
  return normalized;
}
function platformConfigPath() {
  const currentPlatform = platform();
  if (currentPlatform === "win32") {
    return path.join(
      process.env.APPDATA ?? path.join(homedir(), "AppData", "Roaming"),
      "stash",
      "config.yaml"
    );
  }
  if (currentPlatform === "darwin") {
    return path.join(
      homedir(),
      "Library",
      "Application Support",
      "stash",
      "config.yaml"
    );
  }
  return path.join(
    process.env.XDG_CONFIG_HOME ?? path.join(homedir(), ".config"),
    "stash",
    "config.yaml"
  );
}
function platformCachePath() {
  if (process.env.STASH_CACHE_DIR) {
    return path.resolve(process.env.STASH_CACHE_DIR);
  }
  const currentPlatform = platform();
  if (currentPlatform === "win32") {
    return path.join(
      process.env.LOCALAPPDATA ?? path.join(homedir(), "AppData", "Local"),
      "stash",
      "cache"
    );
  }
  if (currentPlatform === "darwin") {
    return path.join(homedir(), "Library", "Caches", "stash");
  }
  return path.join(
    process.env.XDG_CACHE_HOME ?? path.join(homedir(), ".cache"),
    "stash"
  );
}
function platformManagedPath() {
  if (process.env.STASH_MANAGED_HOME) {
    return path.resolve(process.env.STASH_MANAGED_HOME);
  }
  const currentPlatform = platform();
  if (currentPlatform === "win32") {
    return path.join(
      process.env.LOCALAPPDATA ?? path.join(homedir(), "AppData", "Local"),
      "stash",
      "managed"
    );
  }
  if (currentPlatform === "darwin") {
    return path.join(
      homedir(),
      "Library",
      "Application Support",
      "stash",
      "managed"
    );
  }
  return path.join(
    process.env.XDG_DATA_HOME ?? path.join(homedir(), ".local", "share"),
    "stash",
    "managed"
  );
}
function safeCatalogSegment(value) {
  return value.replace(/[^a-zA-Z0-9._-]/gu, "_");
}
function clampPageSize(value, fallback) {
  if (value === void 0 || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(1, Math.min(200, Math.trunc(value)));
}
function compactDescription(value, limit = 240) {
  const compact = value.replace(/\s+/gu, " ").trim();
  if (compact.length <= limit) {
    return compact;
  }
  return `${compact.slice(0, Math.max(0, limit - 1)).trimEnd()}\u2026`;
}
function mediaTypeFor(filePath) {
  switch (path.extname(filePath).toLowerCase()) {
    case ".md":
      return "text/markdown";
    case ".txt":
      return "text/plain";
    case ".json":
      return "application/json";
    case ".yaml":
    case ".yml":
      return "application/yaml";
    case ".js":
    case ".mjs":
    case ".cjs":
      return "text/javascript";
    case ".ts":
      return "text/typescript";
    case ".py":
      return "text/x-python";
    case ".ps1":
      return "text/x-powershell";
    case ".sh":
      return "text/x-shellscript";
    default:
      return void 0;
  }
}
function encodeCursor(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const checksum = createHash("sha256").update(body).digest("base64url").slice(0, 16);
  return `${body}.${checksum}`;
}
function decodeCursor(cursor) {
  const [body, checksum, ...rest] = cursor.split(".");
  if (!body || !checksum || rest.length > 0) {
    return void 0;
  }
  const expected = createHash("sha256").update(body).digest("base64url").slice(0, 16);
  if (checksum !== expected) {
    return void 0;
  }
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return void 0;
  }
}

// src/internal/configuration.ts
var DEFAULTS = {
  pageSize: 40,
  cacheTtlMs: 3e4,
  materialScoreThreshold: 2,
  locale: "en"
};
var TRUST_STATES = /* @__PURE__ */ new Set([
  "trusted",
  "reviewed",
  "unreviewed",
  "quarantined"
]);
function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function readStringArray(value) {
  if (!Array.isArray(value)) {
    return void 0;
  }
  return value.filter((item) => typeof item === "string");
}
function parseCatalog(value, baseDir, index) {
  const input = asObject(value);
  if (typeof input.id !== "string" || !/^[a-z0-9][a-z0-9._-]*$/u.test(input.id)) {
    throw new StashError(
      "invalid-config",
      `Catalog at index ${index} has an invalid id.`,
      2
    );
  }
  if (typeof input.root !== "string" || input.root.trim() === "") {
    throw new StashError(
      "invalid-config",
      `Catalog "${input.id}" must define root.`,
      2
    );
  }
  const trust = typeof input.trust === "string" && TRUST_STATES.has(input.trust) ? input.trust : void 0;
  const ignore = readStringArray(input.ignore);
  const compatibility = readStringArray(input.compatibility)?.filter(
    (item) => item === "codex" || item === "claude-code" || item === "antigravity"
  );
  return {
    id: input.id,
    root: path2.resolve(baseDir, input.root),
    ...typeof input.enabled === "boolean" ? { enabled: input.enabled } : {},
    ...trust ? { trust } : {},
    ...typeof input.followSymlinks === "boolean" ? { followSymlinks: input.followSymlinks } : {},
    ...typeof input.maxDepth === "number" ? { maxDepth: input.maxDepth } : {},
    ...ignore ? { ignore } : {},
    ...compatibility ? { compatibility } : {}
  };
}
function parseDefaults(value, overrides) {
  const input = asObject(value);
  return {
    pageSize: overrides?.pageSize ?? (typeof input.pageSize === "number" ? input.pageSize : DEFAULTS.pageSize),
    cacheTtlMs: overrides?.cacheTtlMs ?? (typeof input.cacheTtlMs === "number" ? input.cacheTtlMs : DEFAULTS.cacheTtlMs),
    materialScoreThreshold: overrides?.materialScoreThreshold ?? (typeof input.materialScoreThreshold === "number" ? input.materialScoreThreshold : DEFAULTS.materialScoreThreshold),
    locale: overrides?.locale ?? (typeof input.locale === "string" ? input.locale : DEFAULTS.locale)
  };
}
async function loadConfiguration(options) {
  const cacheDir = path2.resolve(options.cacheDir ?? platformCachePath());
  if (options.catalogs) {
    let catalogs2 = options.catalogs.map((catalog) => ({
      ...catalog,
      root: path2.resolve(catalog.root)
    }));
    const managedRoot2 = options.managedRoot ? path2.resolve(options.managedRoot) : void 0;
    if (managedRoot2) {
      catalogs2 = await includeManagedCatalog(catalogs2, managedRoot2);
    }
    validateUniqueCatalogIds(catalogs2);
    return {
      configuration: {
        version: 1,
        catalogs: catalogs2,
        defaults: parseDefaults(void 0, options.defaults),
        ...managedRoot2 ? { managedRoot: managedRoot2 } : {}
      },
      cacheDir
    };
  }
  const explicitConfig = options.configPath ?? process.env.STASH_CONFIG;
  const configPath = path2.resolve(explicitConfig ?? platformConfigPath());
  try {
    const source = await readFile(configPath, "utf8");
    const parsed = asObject((0, import_yaml.parse)(source));
    if (parsed.version !== 1) {
      throw new StashError(
        "unsupported-config",
        `Config "${configPath}" must use version: 1.`,
        5
      );
    }
    if (parsed.catalogs !== void 0 && !Array.isArray(parsed.catalogs)) {
      throw new StashError(
        "invalid-config",
        `Config "${configPath}" catalogs must be an array.`,
        2
      );
    }
    const baseDir = path2.dirname(configPath);
    let catalogs2 = (Array.isArray(parsed.catalogs) ? parsed.catalogs : []).map(
      (catalog, index) => parseCatalog(catalog, baseDir, index)
    );
    const configuredManagedRoot = typeof parsed.managedRoot === "string" && parsed.managedRoot.trim() ? path2.resolve(baseDir, parsed.managedRoot) : void 0;
    const managedRoot2 = path2.resolve(
      options.managedRoot ?? process.env.STASH_MANAGED_HOME ?? configuredManagedRoot ?? platformManagedPath()
    );
    catalogs2 = await includeManagedCatalog(catalogs2, managedRoot2);
    validateUniqueCatalogIds(catalogs2);
    return {
      configuration: {
        version: 1,
        catalogs: catalogs2,
        defaults: parseDefaults(parsed.defaults, options.defaults),
        managedRoot: managedRoot2
      },
      cacheDir,
      configPath
    };
  } catch (error) {
    if (error instanceof StashError) {
      throw error;
    }
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code !== "ENOENT") {
      throw new StashError(
        "invalid-config",
        `Unable to read config "${configPath}": ${String(error)}`,
        2
      );
    }
  }
  const managedRoot = path2.resolve(
    options.managedRoot ?? process.env.STASH_MANAGED_HOME ?? platformManagedPath()
  );
  if (process.env.STASH_HOME) {
    const catalogs2 = await includeManagedCatalog(
      [
        {
          id: "default",
          root: path2.resolve(process.env.STASH_HOME),
          enabled: true,
          trust: "unreviewed",
          followSymlinks: false
        }
      ],
      managedRoot
    );
    return {
      configuration: {
        version: 1,
        catalogs: catalogs2,
        defaults: parseDefaults(void 0, options.defaults),
        managedRoot
      },
      cacheDir
    };
  }
  if (explicitConfig) {
    throw new StashError(
      "config-not-found",
      `Stash config was not found at "${configPath}".`,
      2
    );
  }
  const catalogs = await includeManagedCatalog([], managedRoot);
  return {
    configuration: {
      version: 1,
      catalogs,
      defaults: parseDefaults(void 0, options.defaults),
      managedRoot
    },
    cacheDir
  };
}
async function includeManagedCatalog(catalogs, managedRoot) {
  if (catalogs.some((catalog) => catalog.id === "managed")) {
    throw new StashError(
      "invalid-config",
      'Catalog id "managed" is reserved for the Stash-managed store.',
      2
    );
  }
  const normalizedManagedRoot = path2.resolve(managedRoot);
  if (catalogs.some((catalog) => {
    const normalizedCatalogRoot = path2.resolve(catalog.root);
    return process.platform === "win32" ? normalizedCatalogRoot.toLocaleLowerCase("und") === normalizedManagedRoot.toLocaleLowerCase("und") : normalizedCatalogRoot === normalizedManagedRoot;
  })) {
    return catalogs;
  }
  try {
    const info = await stat(managedRoot);
    if (!info.isDirectory()) {
      throw new StashError(
        "invalid-config",
        `Managed root is not a directory: "${managedRoot}".`,
        2
      );
    }
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code === "ENOENT") {
      return catalogs;
    }
    throw error;
  }
  return [
    ...catalogs,
    {
      id: "managed",
      root: managedRoot,
      enabled: true,
      trust: "unreviewed",
      followSymlinks: false,
      compatibility: ["codex", "claude-code", "antigravity"]
    }
  ];
}
function validateUniqueCatalogIds(catalogs) {
  const seen = /* @__PURE__ */ new Set();
  for (const catalog of catalogs) {
    if (seen.has(catalog.id)) {
      throw new StashError(
        "invalid-config",
        `Duplicate catalog id "${catalog.id}".`,
        2
      );
    }
    seen.add(catalog.id);
  }
}

// src/internal/catalog-index.ts
var import_yaml2 = __toESM(require_dist(), 1);
import {
  mkdir,
  open,
  readFile as readFile2,
  readdir,
  realpath,
  rename,
  stat as stat2,
  unlink,
  writeFile
} from "node:fs/promises";
import path3 from "node:path";
var DEFAULT_IGNORE = /* @__PURE__ */ new Set([".git", "node_modules", "dist"]);
var MAX_SKILL_BYTES = 1048576;
var MAX_SIDECAR_BYTES = 262144;
var NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
var INDEX_FILE_NAME = `index-v${INDEX_SCHEMA_VERSION}.json`;
function asObject2(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function stringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return [
    ...new Set(
      value.filter((item) => typeof item === "string").map((item) => item.trim()).filter(Boolean)
    )
  ];
}
function compatibilityDefaults(vendors) {
  const supported = new Set(vendors ?? []);
  return {
    codex: supported.has("codex") ? "supported" : "unknown",
    "claude-code": supported.has("claude-code") ? "supported" : "unknown",
    antigravity: supported.has("antigravity") ? "supported" : "unknown"
  };
}
function compatibilityState(value, fallback) {
  return value === "supported" || value === "partial" || value === "unsupported" || value === "unknown" ? value : fallback;
}
function trustState(value) {
  return value === "trusted" || value === "reviewed" || value === "unreviewed" || value === "quarantined" ? value : void 0;
}
function parseFrontmatter(source) {
  const normalized = source.replace(/^\uFEFF/u, "");
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(normalized);
  if (!match?.[1]) {
    throw new Error("Missing or unclosed YAML frontmatter.");
  }
  const metadata = asObject2((0, import_yaml2.parse)(match[1]));
  return {
    metadata,
    body: normalized.slice(match[0].length)
  };
}
function parseSidecar(source, catalog) {
  const input = source ? asObject2((0, import_yaml2.parse)(source)) : {};
  if (input.schemaVersion !== void 0 && input.schemaVersion !== 1) {
    throw new Error("stash.meta.yaml must use schemaVersion: 1.");
  }
  const examples = asObject2(input.examples);
  const compatibility = asObject2(input.compatibility);
  const defaults = compatibilityDefaults(catalog.compatibility);
  const sourceInfo = asObject2(input.source);
  const risk = asObject2(input.risk);
  const trust = asObject2(input.trust);
  const parsedTrust = trustState(trust.state);
  const sourceId = typeof sourceInfo.id === "string" ? sourceInfo.id.trim() : void 0;
  if (sourceId && (sourceId.length > 64 || !NAME_PATTERN.test(sourceId))) {
    throw new Error(
      "source.id must use 1-64 lowercase letters, digits, or hyphens."
    );
  }
  const sourceDisplayName = typeof sourceInfo.displayName === "string" ? sourceInfo.displayName.trim() : void 0;
  if (sourceDisplayName && sourceDisplayName.length > 128) {
    throw new Error("source.displayName must be at most 128 characters.");
  }
  return {
    aliases: stringArray(input.aliases),
    tags: stringArray(input.tags),
    intents: stringArray(input.intents),
    positiveExamples: stringArray(examples.positive),
    negativeExamples: stringArray(examples.negative),
    compatibility: {
      codex: compatibilityState(compatibility.codex, defaults.codex),
      "claude-code": compatibilityState(
        compatibility["claude-code"],
        defaults["claude-code"]
      ),
      antigravity: compatibilityState(
        compatibility.antigravity,
        defaults.antigravity
      )
    },
    ...parsedTrust ? { trust: parsedTrust } : {},
    source: {
      ...sourceId ? { id: sourceId } : {},
      ...sourceDisplayName ? { displayName: sourceDisplayName } : {},
      ...typeof sourceInfo.url === "string" ? { url: sourceInfo.url } : {},
      ...typeof sourceInfo.revision === "string" ? { revision: sourceInfo.revision } : {},
      ...typeof sourceInfo.license === "string" ? { license: sourceInfo.license } : {}
    },
    risk: {
      ...typeof risk.level === "string" ? { level: risk.level } : {},
      capabilities: stringArray(risk.capabilities)
    }
  };
}
async function readBounded(filePath, maxBytes) {
  const info = await stat2(filePath);
  if (info.size > maxBytes) {
    throw new Error(`File exceeds ${maxBytes} bytes.`);
  }
  return readFile2(filePath, "utf8");
}
async function loadManifest(root, catalog, warnings) {
  const manifestPath = path3.join(root, "stash.catalog.yaml");
  let input = {};
  let fingerprintPart = "";
  try {
    const manifestInfo = await stat2(manifestPath);
    input = asObject2((0, import_yaml2.parse)(await readBounded(manifestPath, MAX_SIDECAR_BYTES)));
    fingerprintPart = [
      "stash.catalog.yaml",
      manifestInfo.mtimeMs,
      manifestInfo.size
    ].join("\0");
    if (input.schemaVersion !== 1) {
      warnings.push({
        code: "invalid-catalog-manifest",
        message: "stash.catalog.yaml must use schemaVersion: 1; defaults were used.",
        path: "stash.catalog.yaml"
      });
      input = {};
    }
    if (typeof input.id === "string" && input.id !== catalog.id) {
      warnings.push({
        code: "catalog-id-mismatch",
        message: `Manifest id "${input.id}" differs from configured id "${catalog.id}".`,
        path: "stash.catalog.yaml"
      });
    }
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code !== "ENOENT") {
      warnings.push({
        code: "invalid-catalog-manifest",
        message: `Unable to parse stash.catalog.yaml: ${String(error)}`,
        path: "stash.catalog.yaml"
      });
    }
  }
  const discovery = asObject2(input.skillDiscovery);
  const defaults = asObject2(input.defaults);
  const manifestIgnore = stringArray(discovery.ignore);
  const manifestTrust = trustState(defaults.trust);
  const manifestCompatibility = stringArray(defaults.compatibility).filter(
    (item) => item === "codex" || item === "claude-code" || item === "antigravity"
  );
  return {
    maxDepth: Math.max(
      1,
      Math.min(
        12,
        catalog.maxDepth ?? (typeof discovery.maxDepth === "number" ? discovery.maxDepth : 4)
      )
    ),
    ignore: /* @__PURE__ */ new Set([
      ...DEFAULT_IGNORE,
      ...catalog.ignore ?? [],
      ...manifestIgnore
    ]),
    effectiveCatalog: {
      ...catalog,
      ...catalog.trust ? {} : manifestTrust ? { trust: manifestTrust } : {},
      ...catalog.compatibility ? {} : manifestCompatibility.length > 0 ? { compatibility: manifestCompatibility } : {}
    },
    fingerprintPart
  };
}
async function discoverCandidates(catalog) {
  const warnings = [];
  let root;
  try {
    root = await realpath(path3.resolve(catalog.root));
  } catch (error) {
    throw new StashError(
      "catalog-unavailable",
      `Catalog "${catalog.id}" is unavailable at "${catalog.root}": ${String(error)}`,
      4
    );
  }
  const rootInfo = await stat2(root);
  if (!rootInfo.isDirectory()) {
    throw new StashError(
      "catalog-unavailable",
      `Catalog "${catalog.id}" root is not a directory: "${root}".`,
      4
    );
  }
  const { maxDepth, ignore, effectiveCatalog, fingerprintPart } = await loadManifest(root, catalog, warnings);
  const candidates = [];
  const visitedDirectories = /* @__PURE__ */ new Set();
  async function walk(directory, depth) {
    if (depth > maxDepth) {
      return;
    }
    const canonicalDirectory = await realpath(directory);
    if (visitedDirectories.has(canonicalDirectory)) {
      return;
    }
    visitedDirectories.add(canonicalDirectory);
    const entries = await readdir(directory, { withFileTypes: true });
    const skillEntry = entries.find(
      (entry) => entry.isFile() && entry.name === "SKILL.md"
    );
    if (skillEntry) {
      const skillFile = path3.join(directory, skillEntry.name);
      const info = await stat2(skillFile);
      const sidecarPath = path3.join(directory, "stash.meta.yaml");
      let sidecarFile;
      let sidecarModifiedMs;
      let sidecarSize;
      try {
        const sidecarInfo = await stat2(sidecarPath);
        if (sidecarInfo.isFile()) {
          sidecarFile = sidecarPath;
          sidecarModifiedMs = sidecarInfo.mtimeMs;
          sidecarSize = sidecarInfo.size;
        }
      } catch {
        sidecarFile = void 0;
      }
      candidates.push({
        skillFile,
        ...sidecarFile ? { sidecarFile } : {},
        ...sidecarModifiedMs !== void 0 ? { sidecarModifiedMs } : {},
        ...sidecarSize !== void 0 ? { sidecarSize } : {},
        modifiedMs: info.mtimeMs,
        size: info.size
      });
    }
    for (const entry of entries) {
      if (ignore.has(entry.name) || entry.name.startsWith(".")) {
        continue;
      }
      const entryPath = path3.join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(entryPath, depth + 1);
        continue;
      }
      if (entry.isSymbolicLink()) {
        if (!catalog.followSymlinks) {
          warnings.push({
            code: "symlink-skipped",
            message: `Skipped symlink "${path3.relative(root, entryPath)}".`,
            path: path3.relative(root, entryPath)
          });
          continue;
        }
        const target = await realpath(entryPath);
        if (!isPathInside(root, target)) {
          warnings.push({
            code: "symlink-escape",
            message: `Rejected symlink outside catalog root: "${path3.relative(root, entryPath)}".`,
            path: path3.relative(root, entryPath)
          });
          continue;
        }
        const targetInfo = await stat2(target);
        if (targetInfo.isDirectory()) {
          await walk(target, depth + 1);
        }
      }
    }
  }
  await walk(root, 0);
  candidates.sort(
    (left, right) => left.skillFile.localeCompare(right.skillFile, "en")
  );
  const fingerprintSource = candidates.map((candidate) => {
    const skillRelative = path3.relative(root, candidate.skillFile);
    const sidecarRelative = candidate.sidecarFile ? path3.relative(root, candidate.sidecarFile) : "";
    return [
      skillRelative,
      candidate.modifiedMs,
      candidate.size,
      sidecarRelative,
      candidate.sidecarModifiedMs ?? "",
      candidate.sidecarSize ?? ""
    ].join("\0");
  }).join("\n");
  return {
    root,
    candidates,
    warnings,
    fingerprint: sha256(`${fingerprintPart}
${fingerprintSource}`),
    effectiveCatalog
  };
}
async function buildRecord(root, candidate, catalog, warnings) {
  const relativeSkillFile = path3.relative(root, candidate.skillFile).split(path3.sep).join("/");
  const relativeSkillDirectory = path3.posix.dirname(relativeSkillFile);
  const ref = `${catalog.id}:${relativeSkillDirectory}`;
  try {
    const source = await readBounded(candidate.skillFile, MAX_SKILL_BYTES);
    const { metadata } = parseFrontmatter(source);
    if (typeof metadata.name !== "string" || metadata.name.length > 64 || !NAME_PATTERN.test(metadata.name)) {
      throw new Error("Frontmatter name must be 1-64 lowercase letters, digits, or hyphens.");
    }
    if (typeof metadata.description !== "string" || metadata.description.trim() === "" || metadata.description.length > 1024) {
      throw new Error("Frontmatter description must be a non-empty string up to 1024 characters.");
    }
    const folderName = path3.basename(path3.dirname(candidate.skillFile));
    if (folderName !== metadata.name) {
      warnings.push({
        code: "name-folder-mismatch",
        message: `Skill name "${metadata.name}" differs from folder "${folderName}".`,
        ref,
        path: relativeSkillFile
      });
    }
    const sidecarSource = candidate.sidecarFile ? await readBounded(candidate.sidecarFile, MAX_SIDECAR_BYTES) : void 0;
    const sidecar = parseSidecar(sidecarSource, catalog);
    const groupPath = path3.posix.dirname(relativeSkillDirectory);
    const group = groupPath === "." ? void 0 : groupPath;
    const sourceLicense = sidecar.source.license ?? (typeof metadata.license === "string" ? metadata.license : void 0);
    return {
      ref,
      catalogId: catalog.id,
      ...group ? { group } : {},
      name: metadata.name,
      description: metadata.description.replace(/\s+/gu, " ").trim(),
      relativeSkillFile,
      aliases: sidecar.aliases,
      tags: sidecar.tags,
      intents: sidecar.intents,
      positiveExamples: sidecar.positiveExamples,
      negativeExamples: sidecar.negativeExamples,
      compatibility: sidecar.compatibility,
      trust: sidecar.trust ?? catalog.trust ?? "unreviewed",
      source: {
        ...sidecar.source,
        ...sourceLicense ? { license: sourceLicense } : {}
      },
      risk: sidecar.risk,
      contentHash: sha256(source),
      modifiedMs: candidate.modifiedMs,
      size: candidate.size
    };
  } catch (error) {
    warnings.push({
      code: "invalid-skill",
      message: `Skipped "${relativeSkillFile}": ${String(error)}`,
      ref,
      path: relativeSkillFile
    });
    return void 0;
  }
}
async function scanCatalog(catalog, now = Date.now) {
  const discovered = await discoverCandidates(catalog);
  const warnings = [...discovered.warnings];
  const records = [];
  let skipped = 0;
  for (const candidate of discovered.candidates) {
    const record = await buildRecord(
      discovered.root,
      candidate,
      discovered.effectiveCatalog,
      warnings
    );
    if (record) {
      records.push(record);
    } else {
      skipped += 1;
    }
  }
  records.sort((left, right) => left.ref.localeCompare(right.ref, "en"));
  const seenRefs = /* @__PURE__ */ new Set();
  for (const record of records) {
    if (seenRefs.has(record.ref)) {
      warnings.push({
        code: "duplicate-ref",
        message: `Duplicate skill ref "${record.ref}".`,
        ref: record.ref
      });
    }
    seenRefs.add(record.ref);
  }
  return {
    index: {
      schemaVersion: INDEX_SCHEMA_VERSION,
      catalogId: catalog.id,
      root: discovered.root,
      generatedAt: new Date(now()).toISOString(),
      fingerprint: discovered.fingerprint,
      records,
      warnings
    },
    skipped
  };
}
async function loadCatalogIndex(catalog, cacheDir, cacheTtlMs, now) {
  const catalogCacheDir = path3.join(cacheDir, safeCatalogSegment(catalog.id));
  const indexPath = path3.join(catalogCacheDir, INDEX_FILE_NAME);
  let cached;
  try {
    const source = await readFile2(indexPath, "utf8");
    const parsed = JSON.parse(source);
    if (parsed.schemaVersion === INDEX_SCHEMA_VERSION && parsed.catalogId === catalog.id && Array.isArray(parsed.records) && parsed.records.every(
      (record) => record !== null && typeof record === "object" && record.source !== null && typeof record.source === "object"
    )) {
      cached = parsed;
      const age = now() - Date.parse(parsed.generatedAt);
      if (cacheTtlMs > 0 && Number.isFinite(age) && age >= 0 && age <= cacheTtlMs) {
        return { index: parsed, refreshed: false };
      }
    }
  } catch {
    cached = void 0;
  }
  const discovered = await discoverCandidates(catalog);
  if (cached && cached.fingerprint === discovered.fingerprint) {
    return { index: cached, refreshed: false };
  }
  return {
    index: await writeFreshIndex(catalog, cacheDir, now),
    refreshed: true
  };
}
async function writeFreshIndex(catalog, cacheDir, now = Date.now) {
  const catalogCacheDir = path3.join(cacheDir, safeCatalogSegment(catalog.id));
  await mkdir(catalogCacheDir, { recursive: true });
  const lockPath = path3.join(catalogCacheDir, "index.lock");
  const lock = await acquireLock(lockPath);
  try {
    const { index } = await scanCatalog(catalog, now);
    const indexPath = path3.join(catalogCacheDir, INDEX_FILE_NAME);
    const temporaryPath = path3.join(
      catalogCacheDir,
      `index-v${INDEX_SCHEMA_VERSION}.${process.pid}.${Date.now()}.tmp`
    );
    const serialized = `${JSON.stringify(index, null, 2)}
`;
    await writeFile(temporaryPath, serialized, { encoding: "utf8", flag: "wx" });
    await rename(temporaryPath, indexPath);
    return index;
  } finally {
    await lock.close();
    await unlink(lockPath).catch(() => void 0);
  }
}
async function acquireLock(lockPath) {
  const timeoutAt = Date.now() + 5e3;
  for (; ; ) {
    try {
      return await open(lockPath, "wx");
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
      if (code !== "EEXIST") {
        throw error;
      }
      try {
        const lockInfo = await stat2(lockPath);
        if (Date.now() - lockInfo.mtimeMs > 3e4) {
          await unlink(lockPath);
          continue;
        }
      } catch {
        continue;
      }
      if (Date.now() >= timeoutAt) {
        throw new StashError(
          "index-locked",
          `Timed out waiting for index lock "${lockPath}".`,
          4
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
}

// src/internal/managed-projection.ts
import {
  lstat,
  readFile as readFile3,
  readdir as readdir2,
  realpath as realpath2,
  stat as stat3
} from "node:fs/promises";
import { platform as platform2 } from "node:os";
import path4 from "node:path";
var MAX_FILES = 1e4;
var MAX_TOTAL_BYTES = 256 * 1024 * 1024;
function pathIdentity(value) {
  const normalized = path4.resolve(value).normalize("NFKC");
  return platform2() === "win32" ? normalized.toLocaleLowerCase("und") : normalized;
}
function validRecord(value) {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value;
  return record.schemaVersion === 1 && typeof record.skillId === "string" && typeof record.name === "string" && typeof record.treeHash === "string" && record.source !== null && typeof record.source === "object" && typeof record.source.location === "string" && Array.isArray(record.deployments);
}
async function treeHash(rootInput) {
  try {
    const rootInfo = await lstat(rootInput);
    if (rootInfo.isSymbolicLink() || !rootInfo.isDirectory()) {
      return void 0;
    }
    const root = await realpath2(rootInput);
    const entries = [];
    let files = 0;
    let totalBytes = 0;
    async function walk(directory, relativeDirectory) {
      const children = await readdir2(directory, { withFileTypes: true });
      children.sort((left, right) => left.name.localeCompare(right.name, "en"));
      for (const child of children) {
        if (relativeDirectory === "" && child.name === ".git") {
          continue;
        }
        const relativePath = relativeDirectory ? `${relativeDirectory}/${child.name}` : child.name;
        const childPath = path4.join(directory, child.name);
        const before = await lstat(childPath);
        if (before.isSymbolicLink()) {
          throw new Error("linked tree");
        }
        if (before.isDirectory()) {
          const canonical = await realpath2(childPath);
          if (!isPathInside(root, canonical)) {
            throw new Error("tree escape");
          }
          entries.push({ kind: "directory", relativePath });
          await walk(childPath, relativePath);
          continue;
        }
        if (!before.isFile()) {
          throw new Error("special file");
        }
        files += 1;
        totalBytes += before.size;
        if (files > MAX_FILES || totalBytes > MAX_TOTAL_BYTES) {
          throw new Error("tree too large");
        }
        const content = await readFile3(childPath);
        const after = await stat3(childPath);
        if (after.size !== before.size || after.mtimeMs !== before.mtimeMs) {
          throw new Error("tree changed");
        }
        entries.push({
          kind: "file",
          relativePath,
          size: content.length,
          contentHash: sha256(content)
        });
      }
    }
    await walk(root, "");
    const fingerprint = entries.map(
      (entry) => entry.kind === "directory" ? `D\0${entry.relativePath}` : `F\0${entry.relativePath}\0${entry.size}\0${entry.contentHash}`
    ).join("\n");
    return sha256(fingerprint);
  } catch {
    return void 0;
  }
}
function relatedCopy(target, record) {
  if (target.kind === "deployment" && target.deployment) {
    return {
      kind: "deployment",
      catalogId: record.catalogId,
      ref: record.ref,
      skillId: target.record.skillId,
      targetId: target.deployment.targetId,
      host: target.deployment.host,
      scope: target.deployment.scope
    };
  }
  return {
    kind: "source",
    catalogId: record.catalogId,
    ref: record.ref,
    skillId: target.record.skillId
  };
}
async function projectManagedCopies(sourceIndexes, managedRoot) {
  if (!managedRoot || !sourceIndexes.some((index) => index.catalogId === "managed")) {
    return { indexes: sourceIndexes, fingerprintPart: "" };
  }
  const indexes = sourceIndexes.map((index) => ({
    ...index,
    records: index.records.map((record) => ({ ...record })),
    warnings: [...index.warnings]
  }));
  const managedIndex = indexes.find((index) => index.catalogId === "managed");
  if (!managedIndex) {
    return { indexes, fingerprintPart: "" };
  }
  let recordFiles;
  const recordsRoot = path4.join(managedRoot, ".stash", "records");
  try {
    recordFiles = (await readdir2(recordsRoot)).filter((name) => name.endsWith(".json")).sort((left, right) => left.localeCompare(right, "en"));
  } catch {
    return { indexes, fingerprintPart: "" };
  }
  const targets = /* @__PURE__ */ new Map();
  const managedRecords = /* @__PURE__ */ new Map();
  for (const file of recordFiles) {
    try {
      const parsed = JSON.parse(
        await readFile3(path4.join(recordsRoot, file), "utf8")
      );
      if (!validRecord(parsed)) {
        throw new Error("invalid record");
      }
      managedRecords.set(parsed.name, parsed);
      targets.set(pathIdentity(parsed.source.location), {
        kind: "source",
        record: parsed,
        expectedTreeHash: parsed.treeHash
      });
      for (const deployment of parsed.deployments) {
        if (deployment.ownership === "stash" && deployment.skillId === parsed.skillId) {
          targets.set(pathIdentity(deployment.path), {
            kind: "deployment",
            record: parsed,
            expectedTreeHash: deployment.treeHash,
            deployment
          });
        }
      }
    } catch {
      managedIndex.warnings.push({
        code: "invalid-lifecycle-record",
        message: `Ignored invalid lifecycle projection record "${file}".`,
        path: `.stash/records/${file}`
      });
    }
  }
  const canonicalBySkillId = /* @__PURE__ */ new Map();
  for (const record of managedIndex.records) {
    const managedRecord = managedRecords.get(record.name);
    if (managedRecord) {
      record.managedSkillId = managedRecord.skillId;
      record.relatedCopies = [];
      canonicalBySkillId.set(managedRecord.skillId, record);
    }
  }
  const events = [];
  for (const index of indexes) {
    if (index.catalogId === "managed") {
      continue;
    }
    const visible = [];
    for (const record of index.records) {
      const skillRoot = path4.dirname(
        path4.resolve(index.root, record.relativeSkillFile)
      );
      const target = targets.get(pathIdentity(skillRoot));
      const canonical = target ? canonicalBySkillId.get(target.record.skillId) : void 0;
      if (!target || !canonical) {
        visible.push(record);
        continue;
      }
      const actualTreeHash = await treeHash(skillRoot);
      if (actualTreeHash !== target.expectedTreeHash) {
        visible.push(record);
        index.warnings.push({
          code: "managed-copy-drift",
          message: `Managed-related ${target.kind} "${record.ref}" drifted and remains a separate result.`,
          ref: record.ref,
          path: record.relativeSkillFile
        });
        events.push(`drift:${record.ref}:${actualTreeHash ?? "unavailable"}`);
        continue;
      }
      const related = relatedCopy(target, record);
      canonical.relatedCopies = [...canonical.relatedCopies ?? [], related];
      events.push(
        `fold:${record.ref}:${target.record.skillId}:${target.kind}:${actualTreeHash}`
      );
    }
    index.records = visible;
  }
  for (const record of managedIndex.records) {
    if (record.relatedCopies) {
      record.relatedCopies.sort(
        (left, right) => `${left.kind}:${left.catalogId}:${left.ref}`.localeCompare(
          `${right.kind}:${right.catalogId}:${right.ref}`,
          "en"
        )
      );
    }
  }
  return {
    indexes,
    fingerprintPart: sha256(events.sort().join("\n"))
  };
}

// src/internal/search.ts
var ROUTING_PROFILE_VERSION = 4;
var FIELD_WEIGHTS = {
  name: 6,
  alias: 6,
  intent: 3,
  tag: 3,
  example: 2,
  description: 1.5,
  source: 6,
  group: 0.5
};
function fieldsFor(record) {
  return [
    { kind: "name", weight: FIELD_WEIGHTS.name, values: [record.name] },
    { kind: "alias", weight: FIELD_WEIGHTS.alias, values: record.aliases },
    { kind: "intent", weight: FIELD_WEIGHTS.intent, values: record.intents },
    { kind: "tag", weight: FIELD_WEIGHTS.tag, values: record.tags },
    {
      kind: "example",
      weight: FIELD_WEIGHTS.example,
      values: record.positiveExamples
    },
    {
      kind: "description",
      weight: FIELD_WEIGHTS.description,
      values: [record.description]
    },
    {
      kind: "source",
      weight: FIELD_WEIGHTS.source,
      values: record.source.id ? [record.source.id] : []
    },
    {
      kind: "group",
      weight: FIELD_WEIGHTS.group,
      values: record.group ? [record.group] : []
    }
  ];
}
function tokenFrequency(values) {
  const result = /* @__PURE__ */ new Map();
  for (const value of values) {
    for (const token of tokenize(value)) {
      result.set(token, (result.get(token) ?? 0) + 1);
    }
  }
  return result;
}
function prepareRecord(record) {
  const preparedFields = fieldsFor(record).map((field) => {
    const frequencies = tokenFrequency(field.values);
    return {
      kind: field.kind,
      weight: field.weight,
      frequencies,
      length: Math.max(
        1,
        field.values.reduce((sum, value) => sum + tokenize(value).length, 0)
      )
    };
  });
  return {
    record,
    fields: preparedFields,
    allTokens: new Set(
      preparedFields.flatMap((field) => [...field.frequencies.keys()])
    )
  };
}
function documentFrequencies(records, queryTerms) {
  const result = new Map(queryTerms.map((term) => [term, 0]));
  for (const record of records) {
    for (const term of queryTerms) {
      if (record.allTokens.has(term)) {
        result.set(term, (result.get(term) ?? 0) + 1);
      }
    }
  }
  return result;
}
function idf(totalDocuments, documentFrequencyValue) {
  return Math.log(
    1 + (totalDocuments - documentFrequencyValue + 0.5) / (documentFrequencyValue + 0.5)
  );
}
function negativePenalty(record, queryTerms) {
  if (record.negativeExamples.length === 0) {
    return 1;
  }
  const negativeTerms = new Set(record.negativeExamples.flatMap(tokenize));
  const hits = queryTerms.filter((term) => negativeTerms.has(term)).length;
  if (hits === 0) {
    return 1;
  }
  return Math.max(0.25, 1 - hits / Math.max(2, queryTerms.length));
}
function scoreRecord(prepared, totalRecords, frequenciesByDocument, queryTerms) {
  let score = 0;
  const matchedTerms = /* @__PURE__ */ new Set();
  const matchedKinds = /* @__PURE__ */ new Set();
  const descriptionMatchedTerms = /* @__PURE__ */ new Set();
  const reasons = [];
  const seenReason = /* @__PURE__ */ new Set();
  for (const field of prepared.fields) {
    for (const term of queryTerms) {
      const frequency = field.frequencies.get(term) ?? 0;
      if (frequency === 0) {
        continue;
      }
      const termIdf = idf(
        totalRecords,
        frequenciesByDocument.get(term) ?? 0
      );
      const normalizedTf = frequency / (0.25 + 0.75 * field.length);
      const weightedTf = normalizedTf * field.weight;
      score += termIdf * (weightedTf * 2.2 / (weightedTf + 1.2));
      matchedTerms.add(term);
      matchedKinds.add(field.kind);
      if (field.kind === "description") {
        descriptionMatchedTerms.add(term);
      }
      if (field.kind !== "group") {
        const reasonKey = `${field.kind}:${term}`;
        if (!seenReason.has(reasonKey)) {
          reasons.push({ kind: field.kind, value: term });
          seenReason.add(reasonKey);
        }
      }
    }
  }
  score *= negativePenalty(prepared.record, queryTerms);
  return {
    score,
    matchedTerms,
    matchedKinds,
    descriptionMatchedTerms,
    reasons
  };
}
function normalizedTerms(value) {
  const normalized = normalizeText(value);
  return normalized ? normalized.split(/\s+/u) : [];
}
function containsTermSequence(haystack, needle) {
  if (needle.length === 0 || needle.length > haystack.length) {
    return false;
  }
  return haystack.some(
    (_, start) => start + needle.length <= haystack.length && needle.every((term, offset) => haystack[start + offset] === term)
  );
}
function hasTermBoundaryMatch(left, right) {
  const leftTerms = normalizedTerms(left);
  const rightTerms = normalizedTerms(right);
  return containsTermSequence(leftTerms, rightTerms) || containsTermSequence(rightTerms, leftTerms);
}
function hasPhraseMatch(record, query) {
  const compactQuery = compactText(query);
  if (!compactQuery) {
    return { matched: false };
  }
  if (compactText(record.name) === compactQuery) {
    return { matched: true, reason: { kind: "name", value: query } };
  }
  for (const alias of record.aliases) {
    if (compactText(alias) === compactQuery || hasTermBoundaryMatch(alias, query)) {
      return { matched: true, reason: { kind: "alias", value: alias } };
    }
  }
  const normalizedSourceQuery = normalizeSourceIdentity(query);
  for (const source of [
    record.source.id,
    record.source.displayName
  ]) {
    if (source && normalizeSourceIdentity(source) === normalizedSourceQuery) {
      return { matched: true, reason: { kind: "source", value: source } };
    }
  }
  if (hasTermBoundaryMatch(record.name, query)) {
    return { matched: true, reason: { kind: "name", value: record.name } };
  }
  return { matched: false };
}
function highPriorityMatch(kinds) {
  return kinds.has("name") || kinds.has("alias") || kinds.has("intent") || kinds.has("tag");
}
function classifyCandidate(prepared, totalRecords, frequenciesByDocument, query, queryTerms, materialScoreThreshold) {
  const record = prepared.record;
  const phrase = hasPhraseMatch(record, query);
  const scored = scoreRecord(
    prepared,
    totalRecords,
    frequenciesByDocument,
    queryTerms
  );
  if (phrase.matched) {
    return {
      record,
      tier: "strong",
      score: Math.max(scored.score, materialScoreThreshold * 2),
      reasons: phrase.reason ? [phrase.reason, ...scored.reasons].slice(0, 8) : scored.reasons.slice(0, 8)
    };
  }
  const denseDescriptionEvidence = scored.descriptionMatchedTerms.size >= 3;
  const materialEvidence = scored.matchedTerms.size >= 2 && scored.matchedKinds.size >= 2 && highPriorityMatch(scored.matchedKinds) || denseDescriptionEvidence || queryTerms.length === 1 && highPriorityMatch(scored.matchedKinds) && !(scored.matchedKinds.size === 1 && scored.matchedKinds.has("description"));
  const evidenceAdjustedThreshold = denseDescriptionEvidence ? materialScoreThreshold * 0.58 : scored.matchedTerms.size >= 2 && scored.matchedKinds.size >= 2 && highPriorityMatch(scored.matchedKinds) ? materialScoreThreshold * 0.75 : materialScoreThreshold;
  if (materialEvidence && scored.score >= evidenceAdjustedThreshold) {
    return {
      record,
      tier: scored.matchedTerms.size >= 2 && scored.score >= materialScoreThreshold * 2 ? "strong" : "material",
      score: scored.score,
      reasons: scored.reasons.slice(0, 8)
    };
  }
  if (scored.score > 0) {
    return {
      record,
      tier: "possible",
      score: scored.score,
      reasons: scored.reasons.slice(0, 8)
    };
  }
  return void 0;
}
function typoFallback(records, query) {
  const queryTrigrams = trigrams(query);
  if (queryTrigrams.size === 0) {
    return [];
  }
  const candidates = records.filter((record) => record.trust !== "quarantined").map((record) => {
    let best = jaccard(queryTrigrams, trigrams(record.name));
    let reasonValue = record.name;
    for (const alias of record.aliases) {
      const similarity = jaccard(queryTrigrams, trigrams(alias));
      if (similarity > best) {
        best = similarity;
        reasonValue = alias;
      }
    }
    return { record, best, reasonValue };
  }).filter((candidate) => candidate.best >= 0.62).sort(
    (left, right) => right.best - left.best || left.record.ref.localeCompare(right.record.ref, "en")
  );
  if (candidates.length === 0) {
    return [];
  }
  const first = candidates[0];
  const second = candidates[1];
  const uniqueStrong = first !== void 0 && first.best >= 0.76 && (!second || first.best - second.best >= 0.08);
  return candidates.map((candidate, index) => ({
    record: candidate.record,
    tier: uniqueStrong && index === 0 ? "strong" : "possible",
    score: candidate.best,
    reasons: [{ kind: "typo", value: candidate.reasonValue }]
  }));
}
function tierRank(tier) {
  switch (tier) {
    case "exact":
      return 0;
    case "strong":
      return 1;
    case "material":
      return 2;
    case "possible":
      return 3;
  }
}
function sortCandidates(candidates) {
  return [...candidates].sort(
    (left, right) => tierRank(left.tier) - tierRank(right.tier) || right.score - left.score || left.record.name.localeCompare(right.record.name, "en") || left.record.ref.localeCompare(right.record.ref, "en")
  );
}
function searchRecords(records, query, materialScoreThreshold) {
  const normalizedQuery = normalizeText(query);
  const queryTerms = tokenize(normalizedQuery);
  if (!normalizedQuery || queryTerms.length === 0) {
    return { relevant: [], possible: [], expandedTerms: [] };
  }
  const searchable = records.filter((record) => record.trust !== "quarantined");
  const prepared = searchable.map(prepareRecord);
  const frequenciesByDocument = documentFrequencies(prepared, queryTerms);
  const candidates = prepared.map(
    (record) => classifyCandidate(
      record,
      prepared.length,
      frequenciesByDocument,
      query,
      queryTerms,
      materialScoreThreshold
    )
  ).filter((candidate) => candidate !== void 0);
  let relevant = candidates.filter((candidate) => candidate.tier !== "possible");
  let possible = candidates.filter((candidate) => candidate.tier === "possible");
  if (relevant.length === 0) {
    const typo = typoFallback(searchable, normalizedQuery);
    relevant = typo.filter((candidate) => candidate.tier !== "possible");
    possible = [
      ...possible,
      ...typo.filter((candidate) => candidate.tier === "possible")
    ];
  }
  return {
    relevant: sortCandidates(relevant),
    possible: sortCandidates(possible),
    expandedTerms: queryTerms
  };
}
function toResolvedSkill(candidate) {
  return {
    ...toListedSkill(candidate.record),
    relevance: {
      tier: candidate.tier,
      score: Number(candidate.score.toFixed(4)),
      reasons: candidate.reasons
    }
  };
}
function toListedSkill(record) {
  return {
    ref: record.ref,
    catalogId: record.catalogId,
    ...record.group ? { group: record.group } : {},
    name: record.name,
    description: compactDescription(record.description),
    compatibility: record.compatibility,
    trust: record.trust,
    ...Object.keys(record.source).length > 0 ? { source: record.source } : {},
    contentHash: record.contentHash,
    ...record.managedSkillId ? { managedSkillId: record.managedSkillId } : {},
    ...record.relatedCopies && record.relatedCopies.length > 0 ? { relatedCopies: record.relatedCopies } : {}
  };
}

// src/stash-catalog.ts
function normalizeSourceSelector(source) {
  const url = normalizeSourceUrl(source);
  return {
    identity: normalizeSourceIdentity(source),
    ...url ? { url } : {}
  };
}
function matchesSource(record, selectors) {
  const identities = [record.source.id, record.source.displayName].filter((value) => value !== void 0).map(normalizeSourceIdentity);
  const sourceUrl = record.source.url ? normalizeSourceUrl(record.source.url) : void 0;
  return selectors.some(
    (selector) => identities.includes(selector.identity) || selector.url !== void 0 && selector.url === sourceUrl
  );
}
function sourceSortKey(record) {
  if (record.source.id) {
    return `0:${normalizeSourceIdentity(record.source.id)}`;
  }
  if (record.source.displayName) {
    return `1:${normalizeSourceIdentity(record.source.displayName)}`;
  }
  if (record.source.url) {
    return `2:${normalizeSourceUrl(record.source.url) ?? normalizeSourceIdentity(record.source.url)}`;
  }
  return "3:";
}
var StashCatalogImplementation = class {
  #configuration;
  #cacheDir;
  #now;
  constructor(configuration, cacheDir, now) {
    this.#configuration = configuration;
    this.#cacheDir = cacheDir;
    this.#now = now;
  }
  async #loadIndexes(catalogIds, applyManagedProjection = true) {
    const selected = this.#selectRegistrations(catalogIds);
    const indexes = [];
    for (const catalog of selected) {
      const loaded = await loadCatalogIndex(
        catalog,
        this.#cacheDir,
        this.#configuration.defaults.cacheTtlMs,
        this.#now
      );
      indexes.push(loaded.index);
    }
    const projected = applyManagedProjection ? await projectManagedCopies(indexes, this.#configuration.managedRoot) : { indexes, fingerprintPart: "" };
    return {
      indexes: projected.indexes,
      registrations: selected,
      warnings: projected.indexes.flatMap((index) => index.warnings),
      fingerprint: sha256(
        [
          ...projected.indexes.map(
            (index) => `${index.catalogId}:${index.fingerprint}`
          ),
          projected.fingerprintPart
        ].sort().join("\n")
      )
    };
  }
  #selectRegistrations(catalogIds) {
    const enabled = this.#configuration.catalogs.filter(
      (catalog) => catalog.enabled !== false
    );
    if (!catalogIds || catalogIds.length === 0) {
      return enabled;
    }
    const requested = new Set(catalogIds);
    const selected = enabled.filter((catalog) => requested.has(catalog.id));
    const missing = [...requested].filter(
      (id) => !selected.some((catalog) => catalog.id === id)
    );
    if (missing.length > 0) {
      throw new StashError(
        "catalog-unavailable",
        `Unknown or disabled catalog(s): ${missing.join(", ")}.`,
        4
      );
    }
    return selected;
  }
  async resolve(request) {
    const started = this.#now();
    let loaded;
    try {
      loaded = await this.#loadIndexes(request.catalogIds);
    } catch (error) {
      if (error instanceof StashError && error.code === "catalog-unavailable") {
        return {
          schemaVersion: RESULT_SCHEMA_VERSION,
          status: "catalog-unavailable",
          mode: request.kind,
          totalRelevant: 0,
          totalPossible: 0,
          page: { size: 0 },
          matches: [],
          diagnostics: {
            indexVersion: INDEX_SCHEMA_VERSION,
            stale: false,
            elapsedMs: this.#now() - started,
            warnings: [{ code: error.code, message: error.message }]
          }
        };
      }
      throw error;
    }
    const group = request.group ? normalizeText(request.group) : void 0;
    const sourceSelectors = (request.sources ?? []).map(
      normalizeSourceSelector
    );
    const hasSourceFilter = (request.sources?.length ?? 0) > 0;
    const records = loaded.indexes.flatMap((index) => index.records).filter((record) => record.trust !== "quarantined").filter(
      (record) => !hasSourceFilter || matchesSource(record, sourceSelectors)
    ).filter(
      (record) => !group || normalizeText(record.group ?? "") === group || normalizeText(record.group ?? "").startsWith(`${group} `)
    );
    switch (request.kind) {
      case "exact":
        return this.#resolveExact(
          request.name,
          records,
          loaded,
          started
        );
      case "list":
        return this.#resolveList(request, records, loaded, started);
      case "search":
        return this.#resolveSearch(request, records, loaded, started);
    }
  }
  #resolveExact(name, records, loaded, started) {
    const normalized = compactText(name);
    if (!normalized) {
      return this.#emptyResult("exact", "invalid-request", loaded, started);
    }
    const matches = records.filter(
      (record) => compactText(record.name) === normalized || record.aliases.some((alias) => compactText(alias) === normalized)
    );
    const resolved = matches.map((record) => {
      const skill = toListedSkill(record);
      skill.relevance = {
        tier: "exact",
        score: 1,
        reasons: [
          {
            kind: compactText(record.name) === normalized ? "name" : "alias",
            value: name
          }
        ]
      };
      return skill;
    });
    return {
      schemaVersion: RESULT_SCHEMA_VERSION,
      status: resolved.length === 0 ? "no-match" : resolved.length > 1 ? "ambiguous-exact" : "ok",
      mode: "exact",
      totalRelevant: resolved.length,
      totalPossible: 0,
      page: { size: resolved.length },
      matches: resolved,
      diagnostics: {
        indexVersion: INDEX_SCHEMA_VERSION,
        stale: false,
        elapsedMs: this.#now() - started,
        ...loaded.warnings.length > 0 ? { warnings: loaded.warnings } : {}
      }
    };
  }
  #resolveList(request, records, loaded, started) {
    const sorted = [...records].sort(
      (left, right) => sourceSortKey(left).localeCompare(sourceSortKey(right), "en") || left.catalogId.localeCompare(right.catalogId, "en") || (left.group ?? "").localeCompare(right.group ?? "", "en") || left.name.localeCompare(right.name, "en") || left.ref.localeCompare(right.ref, "en")
    );
    const requestHash = sha256(
      JSON.stringify({
        kind: request.kind,
        catalogIds: request.catalogIds ?? [],
        sources: request.sources ?? [],
        group: request.group ?? ""
      })
    );
    const paged = this.#page(
      sorted.map(toListedSkill),
      request.cursor,
      request.pageSize,
      loaded.fingerprint,
      requestHash
    );
    if (paged.status === "cursor-stale") {
      return this.#emptyResult("list", "cursor-stale", loaded, started);
    }
    return {
      schemaVersion: RESULT_SCHEMA_VERSION,
      status: sorted.length > 0 ? "ok" : "no-match",
      mode: "list",
      totalRelevant: sorted.length,
      totalPossible: 0,
      page: {
        size: paged.matches.length,
        ...paged.nextCursor ? { nextCursor: paged.nextCursor } : {}
      },
      matches: paged.matches,
      diagnostics: {
        indexVersion: INDEX_SCHEMA_VERSION,
        stale: false,
        elapsedMs: this.#now() - started,
        ...loaded.warnings.length > 0 ? { warnings: loaded.warnings } : {}
      }
    };
  }
  #resolveSearch(request, records, loaded, started) {
    if (!normalizeText(request.query)) {
      return this.#emptyResult("search", "invalid-request", loaded, started);
    }
    const searched = searchRecords(
      records,
      request.query,
      this.#configuration.defaults.materialScoreThreshold
    );
    const displayed = request.includePossible ? [...searched.relevant, ...searched.possible] : searched.relevant;
    const requestHash = sha256(
      JSON.stringify({
        kind: request.kind,
        query: normalizeText(request.query),
        catalogIds: request.catalogIds ?? [],
        sources: request.sources ?? [],
        group: request.group ?? "",
        includePossible: request.includePossible ?? false
      })
    );
    const paged = this.#page(
      displayed.map(toResolvedSkill),
      request.cursor,
      request.pageSize,
      loaded.fingerprint,
      requestHash
    );
    if (paged.status === "cursor-stale") {
      return this.#emptyResult("search", "cursor-stale", loaded, started);
    }
    return {
      schemaVersion: RESULT_SCHEMA_VERSION,
      status: searched.relevant.length > 0 ? "ok" : "no-match",
      mode: "search",
      totalRelevant: searched.relevant.length,
      totalPossible: searched.possible.length,
      page: {
        size: paged.matches.length,
        ...paged.nextCursor ? { nextCursor: paged.nextCursor } : {}
      },
      matches: paged.matches,
      diagnostics: {
        indexVersion: INDEX_SCHEMA_VERSION,
        stale: false,
        elapsedMs: this.#now() - started,
        expandedTerms: searched.expandedTerms,
        ...loaded.warnings.length > 0 ? { warnings: loaded.warnings } : {}
      }
    };
  }
  #page(matches, cursor, requestedPageSize, fingerprint, requestHash) {
    const pageSize = clampPageSize(
      requestedPageSize,
      this.#configuration.defaults.pageSize
    );
    let offset = 0;
    if (cursor) {
      const payload = decodeCursor(cursor);
      if (!payload || payload.version !== 1 || payload.routingProfileVersion !== ROUTING_PROFILE_VERSION || payload.fingerprint !== fingerprint || payload.requestHash !== requestHash || !Number.isInteger(payload.offset) || payload.offset < 0) {
        return { status: "cursor-stale", matches: [] };
      }
      offset = payload.offset;
    }
    const pageMatches = matches.slice(offset, offset + pageSize);
    const nextOffset = offset + pageMatches.length;
    return {
      status: "ok",
      matches: pageMatches,
      ...nextOffset < matches.length ? {
        nextCursor: encodeCursor({
          version: 1,
          routingProfileVersion: ROUTING_PROFILE_VERSION,
          fingerprint,
          requestHash,
          offset: nextOffset
        })
      } : {}
    };
  }
  #emptyResult(mode, status, loaded, started) {
    return {
      schemaVersion: RESULT_SCHEMA_VERSION,
      status,
      mode,
      totalRelevant: 0,
      totalPossible: 0,
      page: { size: 0 },
      matches: [],
      diagnostics: {
        indexVersion: INDEX_SCHEMA_VERSION,
        stale: false,
        elapsedMs: this.#now() - started,
        ...loaded.warnings.length > 0 ? { warnings: loaded.warnings } : {}
      }
    };
  }
  async read(request) {
    const resource = request.resource ?? "SKILL.md";
    const normalizedResource = normalizeRelativePath(resource);
    if (!normalizedResource) {
      return {
        schemaVersion: RESULT_SCHEMA_VERSION,
        status: "resource-outside-skill",
        ref: request.ref,
        resource
      };
    }
    const loaded = await this.#loadIndexes(void 0, false);
    let record;
    let index;
    for (const candidateIndex of loaded.indexes) {
      const candidate = candidateIndex.records.find(
        (item) => item.ref === request.ref
      );
      if (candidate) {
        record = candidate;
        index = candidateIndex;
        break;
      }
    }
    if (!record || !index) {
      return {
        schemaVersion: RESULT_SCHEMA_VERSION,
        status: "not-found",
        ref: request.ref,
        resource
      };
    }
    if (record.trust === "quarantined") {
      return {
        schemaVersion: RESULT_SCHEMA_VERSION,
        status: "quarantined",
        ref: request.ref,
        resource
      };
    }
    const skillRoot = path5.dirname(
      path5.resolve(index.root, record.relativeSkillFile)
    );
    const candidatePath = path5.resolve(skillRoot, normalizedResource);
    if (!isPathInside(skillRoot, candidatePath) || !isPathInside(index.root, candidatePath)) {
      return {
        schemaVersion: RESULT_SCHEMA_VERSION,
        status: "resource-outside-skill",
        ref: request.ref,
        resource
      };
    }
    let resolvedPath;
    let resolvedSize = 0;
    try {
      resolvedPath = await realpath3(candidatePath);
      if (!isPathInside(skillRoot, resolvedPath) || !isPathInside(index.root, resolvedPath)) {
        return {
          schemaVersion: RESULT_SCHEMA_VERSION,
          status: "resource-outside-skill",
          ref: request.ref,
          resource
        };
      }
      const info = await stat4(resolvedPath);
      if (!info.isFile()) {
        return {
          schemaVersion: RESULT_SCHEMA_VERSION,
          status: "not-found",
          ref: request.ref,
          resource
        };
      }
      resolvedSize = info.size;
    } catch {
      return {
        schemaVersion: RESULT_SCHEMA_VERSION,
        status: "not-found",
        ref: request.ref,
        resource
      };
    }
    if (request.representation === "local-path") {
      let contentHash2;
      if (request.expectedHash) {
        contentHash2 = await sha256File(resolvedPath);
        if (request.expectedHash !== contentHash2) {
          return {
            schemaVersion: RESULT_SCHEMA_VERSION,
            status: "hash-mismatch",
            ref: request.ref,
            resource,
            contentHash: contentHash2,
            bytes: resolvedSize
          };
        }
      }
      return {
        schemaVersion: RESULT_SCHEMA_VERSION,
        status: "ok",
        ref: request.ref,
        resource,
        localPath: resolvedPath,
        ...contentHash2 ? { contentHash: contentHash2 } : {},
        bytes: resolvedSize
      };
    }
    if (resolvedSize > 2097152) {
      return {
        schemaVersion: RESULT_SCHEMA_VERSION,
        status: "unsupported-resource",
        ref: request.ref,
        resource,
        bytes: resolvedSize
      };
    }
    const buffer = await readFile4(resolvedPath);
    if (buffer.includes(0)) {
      return {
        schemaVersion: RESULT_SCHEMA_VERSION,
        status: "unsupported-resource",
        ref: request.ref,
        resource,
        bytes: buffer.byteLength
      };
    }
    const contentHash = sha256(buffer);
    if (request.expectedHash && request.expectedHash !== contentHash) {
      return {
        schemaVersion: RESULT_SCHEMA_VERSION,
        status: "hash-mismatch",
        ref: request.ref,
        resource,
        contentHash,
        bytes: buffer.byteLength
      };
    }
    return {
      schemaVersion: RESULT_SCHEMA_VERSION,
      status: "ok",
      ref: request.ref,
      resource,
      mediaType: mediaTypeFor(resolvedPath) ?? "text/plain",
      contentHash,
      content: buffer.toString("utf8"),
      bytes: buffer.byteLength
    };
  }
  async refresh(request = {}) {
    const registrations = this.#selectRegistrations(request.catalogIds);
    const results = [];
    let failed = 0;
    for (const catalog of registrations) {
      try {
        const index = await writeFreshIndex(
          catalog,
          this.#cacheDir,
          this.#now
        );
        results.push({
          catalogId: catalog.id,
          indexed: index.records.length,
          skipped: index.warnings.filter(
            (warning) => warning.code === "invalid-skill"
          ).length,
          warnings: index.warnings
        });
      } catch (error) {
        failed += 1;
        results.push({
          catalogId: catalog.id,
          indexed: 0,
          skipped: 0,
          warnings: [
            {
              code: "refresh-failed",
              message: String(error)
            }
          ]
        });
      }
    }
    return {
      status: failed === 0 ? "ok" : failed === registrations.length ? "failed" : "partial",
      catalogs: results
    };
  }
  async doctor(request = {}) {
    const registrations = this.#selectRegistrations(request.catalogIds);
    const results = [];
    let failed = 0;
    for (const catalog of registrations) {
      try {
        const scanned = await scanCatalog(catalog, this.#now);
        results.push({
          catalogId: catalog.id,
          root: scanned.index.root,
          records: scanned.index.records.length,
          warnings: scanned.index.warnings,
          fingerprint: scanned.index.fingerprint
        });
      } catch (error) {
        failed += 1;
        results.push({
          catalogId: catalog.id,
          root: catalog.root,
          records: 0,
          warnings: [{ code: "doctor-failed", message: String(error) }],
          fingerprint: ""
        });
      }
    }
    const warningCount = results.reduce(
      (sum, result) => sum + result.warnings.length,
      0
    );
    return {
      status: failed === registrations.length ? "failed" : failed > 0 || warningCount > 0 ? "warning" : "ok",
      catalogs: results
    };
  }
};
async function createStashCatalog(options = {}) {
  const loaded = await loadConfiguration(options);
  return new StashCatalogImplementation(
    loaded.configuration,
    loaded.cacheDir,
    options.now ?? Date.now
  );
}

// src/stash-lifecycle.ts
var import_yaml3 = __toESM(require_dist(), 1);
import { randomUUID } from "node:crypto";
import {
  lstat as lstat2,
  mkdir as mkdir2,
  readFile as readFile5,
  readdir as readdir3,
  realpath as realpath4,
  rename as rename2,
  rm,
  stat as stat5,
  unlink as unlink2,
  writeFile as writeFile2
} from "node:fs/promises";
import { homedir as homedir2, platform as platform3 } from "node:os";
import path6 from "node:path";
var NAME_PATTERN2 = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
var MAX_FILES2 = 1e4;
var MAX_TOTAL_BYTES2 = 256 * 1024 * 1024;
var STORE_SCHEMA_VERSION = 1;
var WINDOWS_RESERVED_NAMES = /* @__PURE__ */ new Set([
  "con",
  "prn",
  "aux",
  "nul",
  "com1",
  "com2",
  "com3",
  "com4",
  "com5",
  "com6",
  "com7",
  "com8",
  "com9",
  "lpt1",
  "lpt2",
  "lpt3",
  "lpt4",
  "lpt5",
  "lpt6",
  "lpt7",
  "lpt8",
  "lpt9"
]);
function asObject3(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function compatibilityState2(value) {
  return value === "supported" || value === "partial" || value === "unsupported" || value === "unknown" ? value : "unknown";
}
function parseSkillMetadata(snapshot) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(
    snapshot.skillSource.replace(/^\uFEFF/u, "")
  );
  if (!match?.[1]) {
    throw new StashError(
      "invalid-skill",
      "SKILL.md must contain closed YAML frontmatter.",
      3
    );
  }
  const metadata = asObject3((0, import_yaml3.parse)(match[1]));
  if (typeof metadata.name !== "string" || metadata.name.length > 64 || !NAME_PATTERN2.test(metadata.name)) {
    throw new StashError(
      "invalid-skill",
      "SKILL.md name must use 1-64 lowercase letters, digits, or hyphens.",
      3
    );
  }
  if (typeof metadata.description !== "string" || metadata.description.trim() === "" || metadata.description.length > 1024) {
    throw new StashError(
      "invalid-skill",
      "SKILL.md description must be a non-empty string up to 1024 characters.",
      3
    );
  }
  let compatibility = {};
  if (snapshot.sidecarSource) {
    const sidecar = asObject3((0, import_yaml3.parse)(snapshot.sidecarSource));
    if (sidecar.schemaVersion !== void 0 && sidecar.schemaVersion !== 1) {
      throw new StashError(
        "invalid-skill",
        "stash.meta.yaml must use schemaVersion: 1.",
        3
      );
    }
    compatibility = asObject3(sidecar.compatibility);
  }
  return {
    name: metadata.name,
    compatibility: {
      codex: compatibilityState2(compatibility.codex),
      "claude-code": compatibilityState2(compatibility["claude-code"]),
      antigravity: compatibilityState2(compatibility.antigravity)
    }
  };
}
function portablePathKey(relativePath) {
  return relativePath.normalize("NFKC").toLocaleLowerCase("und");
}
function validatePortableSegment(segment) {
  if (!segment || /[. ]$/u.test(segment)) {
    throw new StashError(
      "unsafe-skill-tree",
      `Portable skill paths cannot end in a dot or space: "${segment}".`,
      3
    );
  }
  const base = segment.split(".", 1)[0]?.toLocaleLowerCase("und") ?? "";
  if (WINDOWS_RESERVED_NAMES.has(base)) {
    throw new StashError(
      "unsafe-skill-tree",
      `Portable skill paths cannot use the reserved name "${segment}".`,
      3
    );
  }
}
async function snapshotTree(sourceRoot) {
  const rootInput = path6.resolve(sourceRoot);
  const rootInfo = await lstat2(rootInput).catch((error) => {
    throw new StashError(
      "skill-unavailable",
      `Skill directory is unavailable at "${rootInput}": ${String(error)}`,
      4
    );
  });
  if (rootInfo.isSymbolicLink() || !rootInfo.isDirectory()) {
    throw new StashError(
      "unsafe-skill-tree",
      `Skill root must be a real directory, not a link: "${rootInput}".`,
      3
    );
  }
  const root = await realpath4(rootInput);
  const entries = [];
  const pathKeys = /* @__PURE__ */ new Set();
  let fileCount = 0;
  let totalBytes = 0;
  let skillSource;
  let sidecarSource;
  async function walk(directory, relativeDirectory) {
    const children = await readdir3(directory, { withFileTypes: true });
    children.sort((left, right) => left.name.localeCompare(right.name, "en"));
    for (const child of children) {
      if (relativeDirectory === "" && child.name === ".git") {
        continue;
      }
      validatePortableSegment(child.name);
      const relativePath = relativeDirectory ? `${relativeDirectory}/${child.name}` : child.name;
      const key = portablePathKey(relativePath);
      if (pathKeys.has(key)) {
        throw new StashError(
          "unsafe-skill-tree",
          `Case-insensitive path collision at "${relativePath}".`,
          3
        );
      }
      pathKeys.add(key);
      const childPath = path6.join(directory, child.name);
      const before = await lstat2(childPath);
      if (before.isSymbolicLink()) {
        throw new StashError(
          "unsafe-skill-tree",
          `Symlinks and junctions are not allowed: "${relativePath}".`,
          3
        );
      }
      if (before.isDirectory()) {
        const canonical = await realpath4(childPath);
        if (!isPathInside(root, canonical)) {
          throw new StashError(
            "unsafe-skill-tree",
            `Directory escapes the skill root: "${relativePath}".`,
            3
          );
        }
        entries.push({ kind: "directory", relativePath });
        await walk(childPath, relativePath);
        continue;
      }
      if (!before.isFile()) {
        throw new StashError(
          "unsafe-skill-tree",
          `Only regular files and directories are allowed: "${relativePath}".`,
          3
        );
      }
      fileCount += 1;
      totalBytes += before.size;
      if (fileCount > MAX_FILES2 || totalBytes > MAX_TOTAL_BYTES2) {
        throw new StashError(
          "skill-too-large",
          `Skill exceeds ${MAX_FILES2} files or ${MAX_TOTAL_BYTES2} bytes.`,
          3
        );
      }
      const content = await readFile5(childPath);
      const after = await stat5(childPath);
      if (after.size !== before.size || after.mtimeMs !== before.mtimeMs) {
        throw new StashError(
          "source-changed",
          `Skill changed while it was being read: "${relativePath}".`,
          4
        );
      }
      const contentHash = sha256(content);
      entries.push({
        kind: "file",
        relativePath,
        size: content.length,
        contentHash
      });
      if (relativePath === "SKILL.md") {
        skillSource = content.toString("utf8");
      } else if (relativePath === "stash.meta.yaml") {
        sidecarSource = content.toString("utf8");
      }
    }
  }
  await walk(root, "");
  if (skillSource === void 0) {
    throw new StashError(
      "invalid-skill",
      `Skill root must contain SKILL.md: "${root}".`,
      3
    );
  }
  const fingerprint = entries.map(
    (entry) => entry.kind === "directory" ? `D\0${entry.relativePath}` : `F\0${entry.relativePath}\0${entry.size}\0${entry.contentHash}`
  ).join("\n");
  return {
    root,
    treeHash: sha256(fingerprint),
    entries,
    skillSource,
    ...sidecarSource !== void 0 ? { sidecarSource } : {}
  };
}
async function copySnapshot(snapshot, destination) {
  await mkdir2(destination, { recursive: false });
  for (const entry of snapshot.entries) {
    const relative = entry.relativePath.split("/").join(path6.sep);
    const target = path6.join(destination, relative);
    if (entry.kind === "directory") {
      await mkdir2(target, { recursive: false });
      continue;
    }
    const source = path6.join(snapshot.root, relative);
    const content = await readFile5(source);
    if (sha256(content) !== entry.contentHash) {
      throw new StashError(
        "source-changed",
        `Skill changed while it was being copied: "${entry.relativePath}".`,
        4
      );
    }
    await writeFile2(target, content, { flag: "wx" });
  }
}
async function pathType(target) {
  try {
    const info = await lstat2(target);
    if (info.isSymbolicLink()) {
      return "link";
    }
    if (info.isDirectory()) {
      return "directory";
    }
    return "other";
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code === "ENOENT") {
      return "missing";
    }
    throw error;
  }
}
function samePath(left, right) {
  const normalizedLeft = path6.resolve(left).normalize("NFKC");
  const normalizedRight = path6.resolve(right).normalize("NFKC");
  return platform3() === "win32" ? normalizedLeft.toLocaleLowerCase("und") === normalizedRight.toLocaleLowerCase("und") : normalizedLeft === normalizedRight;
}
function pathIdentity2(value) {
  const normalized = path6.resolve(value).normalize("NFKC");
  return platform3() === "win32" ? normalized.toLocaleLowerCase("und") : normalized;
}
function targetIdentity(target) {
  return `${target.host}:${target.scope}:${pathIdentity2(target.root)}`;
}
function resolveHostRoot(target) {
  if (target.host === "antigravity-cli") {
    throw new StashError(
      "unsupported-host-layout",
      "Antigravity CLI standalone skills use flat Markdown in both user and workspace scopes; folder lifecycle is unsupported.",
      2
    );
  }
  if (target.scope === "workspace") {
    throw new StashError(
      "unsupported-host-scope",
      "Workspace lifecycle targets are not supported in this release.",
      2
    );
  }
  if (target.root) {
    return {
      host: target.host,
      scope: target.scope ?? "custom",
      root: path6.resolve(target.root)
    };
  }
  const scope = target.scope ?? "user";
  if (scope === "custom") {
    throw new StashError(
      "invalid-argument",
      "A custom lifecycle target requires root.",
      2
    );
  }
  switch (target.host) {
    case "codex":
      return {
        host: target.host,
        scope,
        root: path6.join(homedir2(), ".agents", "skills")
      };
    case "claude-code":
      return {
        host: target.host,
        scope,
        root: path6.join(homedir2(), ".claude", "skills")
      };
    case "antigravity-ide":
      return {
        host: target.host,
        scope,
        root: path6.join(homedir2(), ".gemini", "config", "skills")
      };
  }
}
async function isPluginContained(source) {
  let current = path6.dirname(source);
  for (let depth = 0; depth < 12; depth += 1) {
    const markers = [
      path6.join(current, ".claude-plugin", "plugin.json"),
      path6.join(current, ".codex-plugin", "plugin.json"),
      path6.join(current, "plugin.json")
    ];
    for (const marker of markers) {
      if (await pathType(marker) !== "missing") {
        return true;
      }
    }
    const parent = path6.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return false;
}
var StashLifecycleImplementation = class {
  #managedRoot;
  #now;
  constructor(managedRoot, now) {
    this.#managedRoot = path6.resolve(managedRoot);
    this.#now = now;
  }
  #metadataRoot() {
    return path6.join(this.#managedRoot, ".stash");
  }
  #recordPath(name) {
    return path6.join(this.#metadataRoot(), "records", `${name}.json`);
  }
  async #ensureLayout() {
    await mkdir2(path6.join(this.#metadataRoot(), "records"), { recursive: true });
    await mkdir2(path6.join(this.#metadataRoot(), "staging"), { recursive: true });
    await mkdir2(path6.join(this.#metadataRoot(), "journal"), { recursive: true });
    const manifestPath = path6.join(this.#managedRoot, "stash.catalog.yaml");
    try {
      await writeFile2(
        manifestPath,
        "schemaVersion: 1\nid: managed\ndefaults:\n  trust: unreviewed\n  compatibility:\n    - codex\n    - claude-code\n    - antigravity\nskillDiscovery:\n  ignore:\n    - .stash\n",
        { encoding: "utf8", flag: "wx" }
      );
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
      if (code !== "EEXIST") {
        throw error;
      }
    }
  }
  #journalPath(operationId) {
    return path6.join(this.#metadataRoot(), "journal", `${operationId}.json`);
  }
  async #writeJournal(journal) {
    const finalPath = this.#journalPath(journal.operationId);
    const temporaryPath = `${finalPath}.${randomUUID()}.tmp`;
    await writeFile2(temporaryPath, `${JSON.stringify(journal, null, 2)}
`, {
      encoding: "utf8",
      flag: "wx"
    });
    try {
      await rename2(temporaryPath, finalPath);
    } catch (error) {
      await unlink2(temporaryPath).catch(() => void 0);
      throw error;
    }
  }
  async #advanceArchiveJournal(journal, stage) {
    const next = { ...journal, stage };
    await this.#writeJournal(next);
    journal.stage = stage;
  }
  async #removeIncompleteManaged(journal) {
    if (journal.managedExistedBefore) {
      return;
    }
    const record = await this.#readRecord(journal.name);
    if (record && record.treeHash !== journal.treeHash) {
      throw new StashError(
        "lifecycle-recovery-conflict",
        `Managed record changed during archive recovery: "${journal.name}".`,
        4
      );
    }
    if (await pathType(journal.managedPath) === "directory") {
      const snapshot = await snapshotTree(journal.managedPath);
      if (snapshot.treeHash !== journal.treeHash) {
        throw new StashError(
          "lifecycle-recovery-conflict",
          `Managed tree changed during archive recovery: "${journal.managedPath}".`,
          4
        );
      }
      await rm(journal.managedPath, { recursive: true, force: false });
    }
    await unlink2(this.#recordPath(journal.name)).catch((error) => {
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
      if (code !== "ENOENT") {
        throw error;
      }
    });
  }
  #validateArchiveJournal(journal, journalPath) {
    const stages = /* @__PURE__ */ new Set([
      "started",
      "managed-committed",
      "source-tombstoned",
      "archive-committed"
    ]);
    if (journal.schemaVersion !== 1 || !/^[0-9a-f-]{36}$/iu.test(journal.operationId) || !stages.has(journal.stage) || !NAME_PATTERN2.test(journal.name) || !/^sha256:[0-9a-f]{64}$/iu.test(journal.treeHash) || typeof journal.managedExistedBefore !== "boolean" || typeof journal.createdAt !== "string" || typeof journal.source !== "string" || typeof journal.tombstone !== "string" || typeof journal.managedPath !== "string" || !path6.isAbsolute(journal.source) || !path6.isAbsolute(journal.tombstone) || !path6.isAbsolute(journal.managedPath)) {
      throw new StashError(
        "invalid-lifecycle-journal",
        `Invalid or unsafe lifecycle journal "${journalPath}".`,
        5
      );
    }
    const expectedManagedPath = path6.join(this.#managedRoot, journal.name);
    const expectedTombstoneParent = path6.dirname(path6.dirname(journal.source));
    if (!samePath(journal.managedPath, expectedManagedPath) || !samePath(path6.dirname(journal.tombstone), expectedTombstoneParent) || !path6.basename(journal.tombstone).startsWith(
      `.stash-archive-${journal.name}-`
    ) || isPathInside(this.#managedRoot, journal.source) || isPathInside(this.#managedRoot, journal.tombstone)) {
      throw new StashError(
        "invalid-lifecycle-journal",
        `Invalid or unsafe lifecycle journal "${journalPath}".`,
        5
      );
    }
  }
  async #recoverArchiveJournal(journal, journalPath) {
    const sourceType = await pathType(journal.source);
    const tombstoneType = await pathType(journal.tombstone);
    if (journal.stage === "archive-committed") {
      if (tombstoneType !== "missing") {
        if (tombstoneType !== "directory") {
          throw new StashError(
            "lifecycle-recovery-conflict",
            `Archive tombstone is not a directory: "${journal.tombstone}".`,
            4
          );
        }
        const snapshot = await snapshotTree(journal.tombstone);
        if (snapshot.treeHash !== journal.treeHash) {
          throw new StashError(
            "lifecycle-recovery-conflict",
            `Archive tombstone drifted: "${journal.tombstone}".`,
            4
          );
        }
        await rm(journal.tombstone, { recursive: true, force: false });
      }
      await unlink2(journalPath);
      return;
    }
    const sourceWasMoved = journal.stage === "source-tombstoned" || sourceType === "missing" && tombstoneType !== "missing";
    if (sourceWasMoved) {
      if (tombstoneType !== "directory") {
        throw new StashError(
          "lifecycle-recovery-conflict",
          `Archive source and tombstone cannot be reconciled for "${journal.name}".`,
          4
        );
      }
      if (sourceType !== "missing") {
        throw new StashError(
          "archive-restore-conflict",
          `Archive recovery preserved "${journal.tombstone}" because "${journal.source}" is occupied.`,
          4
        );
      }
      const snapshot = await snapshotTree(journal.tombstone);
      if (snapshot.treeHash !== journal.treeHash) {
        throw new StashError(
          "lifecycle-recovery-conflict",
          `Archive tombstone drifted: "${journal.tombstone}".`,
          4
        );
      }
      await rename2(journal.tombstone, journal.source);
    }
    await this.#removeIncompleteManaged(journal);
    await unlink2(journalPath);
  }
  async #recoverJournals() {
    const journalRoot = path6.join(this.#metadataRoot(), "journal");
    const files = (await readdir3(journalRoot)).filter((name) => name.endsWith(".json")).sort((left, right) => left.localeCompare(right, "en"));
    for (const file of files) {
      const journalPath = path6.join(journalRoot, file);
      let journal;
      try {
        journal = JSON.parse(await readFile5(journalPath, "utf8"));
      } catch (error) {
        throw new StashError(
          "invalid-lifecycle-journal",
          `Unable to read lifecycle journal "${journalPath}": ${String(error)}`,
          5
        );
      }
      this.#validateArchiveJournal(journal, journalPath);
      await this.#recoverArchiveJournal(journal, journalPath);
    }
  }
  async #readLockOwner(lockPath) {
    let owner;
    try {
      owner = JSON.parse(
        await readFile5(path6.join(lockPath, "owner.json"), "utf8")
      );
    } catch (error) {
      throw new StashError(
        "lifecycle-lock-corrupt",
        `Lifecycle lock metadata is missing or malformed at "${lockPath}"; refusing automatic recovery.`,
        4
      );
    }
    if (owner.schemaVersion !== 1 || !/^[0-9a-f-]{36}$/iu.test(owner.ownerToken) || !Number.isInteger(owner.pid) || owner.pid <= 0 || typeof owner.createdAt !== "string") {
      throw new StashError(
        "lifecycle-lock-corrupt",
        `Lifecycle lock metadata is invalid at "${lockPath}"; refusing automatic recovery.`,
        4
      );
    }
    return owner;
  }
  #ownerIsAlive(owner) {
    try {
      process.kill(owner.pid, 0);
      return true;
    } catch {
      return false;
    }
  }
  async #publishLock(lockPath, owner) {
    const temporaryPath = path6.join(
      this.#metadataRoot(),
      `.lifecycle-lock-${owner.ownerToken}.tmp`
    );
    await mkdir2(temporaryPath, { recursive: false });
    try {
      await writeFile2(
        path6.join(temporaryPath, "owner.json"),
        `${JSON.stringify(owner)}
`,
        { encoding: "utf8", flag: "wx" }
      );
      try {
        await rename2(temporaryPath, lockPath);
        return true;
      } catch (error) {
        if (await pathType(lockPath) === "directory") {
          return false;
        }
        throw error;
      }
    } finally {
      await rm(temporaryPath, { recursive: true, force: true }).catch(
        () => void 0
      );
    }
  }
  async #reclaimDeadLock(lockPath) {
    const guardPath = path6.join(this.#metadataRoot(), "lifecycle.reclaim");
    try {
      await mkdir2(guardPath, { recursive: false });
    } catch (error) {
      if (await pathType(guardPath) === "directory") {
        throw new StashError(
          "lifecycle-busy",
          `Another process is checking stale lifecycle ownership at "${lockPath}". If no Stash process is running, follow the documented reclaim-guard repair procedure.`,
          4
        );
      }
      throw error;
    }
    try {
      if (await pathType(lockPath) === "missing") {
        return;
      }
      if (await pathType(lockPath) !== "directory") {
        throw new StashError(
          "lifecycle-lock-corrupt",
          `Lifecycle lock is not a directory at "${lockPath}".`,
          4
        );
      }
      const owner = await this.#readLockOwner(lockPath);
      if (this.#ownerIsAlive(owner)) {
        throw new StashError(
          "lifecycle-busy",
          `Another lifecycle operation holds "${lockPath}".`,
          4
        );
      }
      const reclaimedPath = path6.join(
        this.#metadataRoot(),
        `.lifecycle-reclaimed-${owner.ownerToken}-${randomUUID()}`
      );
      await rename2(lockPath, reclaimedPath);
      const reclaimedOwner = await this.#readLockOwner(reclaimedPath);
      if (reclaimedOwner.ownerToken !== owner.ownerToken) {
        throw new StashError(
          "lifecycle-lock-corrupt",
          "Lifecycle lock ownership changed during stale recovery.",
          4
        );
      }
      await rm(reclaimedPath, { recursive: true, force: false });
    } finally {
      await rm(guardPath, { recursive: true, force: true }).catch(
        () => void 0
      );
    }
  }
  async #acquireLock(lockPath) {
    const owner = {
      schemaVersion: 1,
      ownerToken: randomUUID(),
      pid: process.pid,
      createdAt: new Date(this.#now()).toISOString()
    };
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (await this.#publishLock(lockPath, owner)) {
        return owner;
      }
      const existing = await this.#readLockOwner(lockPath);
      if (this.#ownerIsAlive(existing)) {
        throw new StashError(
          "lifecycle-busy",
          `Another lifecycle operation holds "${lockPath}".`,
          4
        );
      }
      await this.#reclaimDeadLock(lockPath);
    }
    throw new StashError(
      "lifecycle-busy",
      `Lifecycle ownership changed while acquiring "${lockPath}".`,
      4
    );
  }
  async #releaseLock(lockPath, owner) {
    const current = await this.#readLockOwner(lockPath);
    if (current.ownerToken !== owner.ownerToken) {
      throw new StashError(
        "lifecycle-lock-lost",
        `Lifecycle lock ownership changed at "${lockPath}".`,
        4
      );
    }
    await rm(lockPath, { recursive: true, force: false });
  }
  async #withLock(operation) {
    await this.#ensureLayout();
    const lockPath = path6.join(this.#metadataRoot(), "lifecycle.lock");
    const owner = await this.#acquireLock(lockPath);
    try {
      await this.#recoverJournals();
      return await operation();
    } finally {
      await this.#releaseLock(lockPath, owner);
    }
  }
  async #readRecord(name) {
    const recordPath = this.#recordPath(name);
    try {
      const parsed = JSON.parse(await readFile5(recordPath, "utf8"));
      if (parsed.schemaVersion !== STORE_SCHEMA_VERSION || typeof parsed.skillId !== "string" || parsed.skillId.length === 0 || parsed.name !== name || typeof parsed.treeHash !== "string" || !Array.isArray(parsed.deployments) || parsed.deployments.some(
        (deployment) => typeof deployment.deploymentId !== "string" || deployment.skillId !== parsed.skillId || typeof deployment.targetId !== "string" || deployment.targetId !== targetIdentity(deployment) || deployment.ownership !== "stash" || !samePath(deployment.path, path6.join(deployment.root, parsed.name))
      )) {
        throw new Error("invalid lifecycle record shape");
      }
      return parsed;
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
      if (code === "ENOENT") {
        return void 0;
      }
      throw new StashError(
        "invalid-lifecycle-record",
        `Unable to read lifecycle record "${recordPath}": ${String(error)}`,
        5
      );
    }
  }
  async #writeRecord(record) {
    const finalPath = this.#recordPath(record.name);
    const temporaryPath = `${finalPath}.${randomUUID()}.tmp`;
    await writeFile2(temporaryPath, `${JSON.stringify(record, null, 2)}
`, {
      encoding: "utf8",
      flag: "wx"
    });
    try {
      await rename2(temporaryPath, finalPath);
    } catch (error) {
      await unlink2(temporaryPath).catch(() => void 0);
      throw error;
    }
  }
  async #assertSourceBoundary(source) {
    const canonicalSource = await realpath4(source);
    const canonicalManaged = await realpath4(this.#managedRoot);
    if (isPathInside(canonicalManaged, canonicalSource) || isPathInside(canonicalSource, canonicalManaged)) {
      throw new StashError(
        "unsafe-source",
        "A lifecycle source cannot be inside, contain, or equal the managed root.",
        3
      );
    }
  }
  async #canonicalHostRoot(root, create, allowMissing = false) {
    let type = await pathType(root);
    if (type === "missing" && create) {
      await mkdir2(root, { recursive: true });
      type = await pathType(root);
    }
    if (type === "missing" && allowMissing) {
      return path6.resolve(root);
    }
    if (type !== "directory") {
      throw new StashError(
        "unsafe-host-root",
        `Host root must be a real directory, not a link or special path: "${root}".`,
        3
      );
    }
    return realpath4(root);
  }
  async #storeSource(source, kind, sourceUrl, revision, expectedTreeHash) {
    await this.#assertSourceBoundary(source);
    const snapshot = await snapshotTree(source);
    if (expectedTreeHash && snapshot.treeHash !== expectedTreeHash) {
      throw new StashError(
        "source-changed",
        `Skill changed before its managed copy could be committed: "${source}".`,
        4
      );
    }
    const metadata = parseSkillMetadata(snapshot);
    const managedPath = path6.join(this.#managedRoot, metadata.name);
    const existingType = await pathType(managedPath);
    if (existingType !== "missing") {
      if (existingType !== "directory") {
        throw new StashError(
          "managed-conflict",
          `Managed target is not a directory: "${managedPath}".`,
          3
        );
      }
      const existingRecord = await this.#readRecord(metadata.name);
      const existingSnapshot = await snapshotTree(managedPath);
      if (existingRecord && existingRecord.treeHash === snapshot.treeHash && existingSnapshot.treeHash === snapshot.treeHash) {
        return {
          record: existingRecord,
          managedPath,
          created: false
        };
      }
      throw new StashError(
        "managed-conflict",
        `Managed skill "${metadata.name}" already exists with different content or metadata.`,
        3
      );
    }
    if (await this.#readRecord(metadata.name)) {
      throw new StashError(
        "managed-conflict",
        `Lifecycle metadata exists without its managed skill: "${metadata.name}".`,
        3
      );
    }
    const stage = path6.join(this.#metadataRoot(), "staging", randomUUID());
    let committed = false;
    try {
      await copySnapshot(snapshot, stage);
      const stagedSnapshot = await snapshotTree(stage);
      if (stagedSnapshot.treeHash !== snapshot.treeHash) {
        throw new StashError(
          "copy-verification-failed",
          `Staged tree hash differs for "${metadata.name}".`,
          4
        );
      }
      const timestamp = new Date(this.#now()).toISOString();
      const record = {
        schemaVersion: STORE_SCHEMA_VERSION,
        skillId: randomUUID(),
        name: metadata.name,
        treeHash: snapshot.treeHash,
        source: {
          kind,
          location: snapshot.root,
          importedAt: timestamp,
          ...sourceUrl ? { url: sourceUrl } : {},
          ...revision ? { revision } : {}
        },
        compatibility: metadata.compatibility,
        deployments: [],
        lastValidatedAt: timestamp
      };
      await rename2(stage, managedPath);
      committed = true;
      try {
        await this.#writeRecord(record);
      } catch (error) {
        await rm(managedPath, { recursive: true, force: false }).catch(
          () => void 0
        );
        throw error;
      }
      return { record, managedPath, created: true };
    } finally {
      if (!committed) {
        await rm(stage, { recursive: true, force: true }).catch(() => void 0);
      }
    }
  }
  async install(request) {
    return this.#withLock(async () => {
      const stored = await this.#storeSource(
        path6.resolve(request.source),
        "local-import",
        request.sourceUrl,
        request.revision
      );
      return {
        status: stored.created ? "stored" : "already-stored",
        name: stored.record.name,
        skillId: stored.record.skillId,
        managedPath: stored.managedPath,
        treeHash: stored.record.treeHash
      };
    });
  }
  async archive(request) {
    return this.#withLock(async () => {
      const resolvedTarget = resolveHostRoot(request.target);
      resolvedTarget.root = await this.#canonicalHostRoot(
        resolvedTarget.root,
        false
      );
      const looksLikeName = NAME_PATTERN2.test(request.source);
      const source = path6.resolve(
        looksLikeName ? path6.join(resolvedTarget.root, request.source) : request.source
      );
      if (!samePath(path6.dirname(source), resolvedTarget.root)) {
        throw new StashError(
          "unsafe-archive-source",
          `Archive source must be an exact standalone child of the selected host root "${resolvedTarget.root}".`,
          3
        );
      }
      if (await isPluginContained(source)) {
        throw new StashError(
          "plugin-lifecycle-delegated",
          "Plugin-contained skills must be managed by the host plugin manager.",
          3
        );
      }
      await this.#assertSourceBoundary(source);
      const sourceSnapshot = await snapshotTree(source);
      const metadata = parseSkillMetadata(sourceSnapshot);
      const managedPath = path6.join(this.#managedRoot, metadata.name);
      const managedExistedBefore = await pathType(managedPath) !== "missing" || await this.#readRecord(metadata.name) !== void 0;
      const tombstoneParent = path6.dirname(resolvedTarget.root);
      await mkdir2(tombstoneParent, { recursive: true });
      const tombstone = path6.join(
        tombstoneParent,
        `.stash-archive-${metadata.name}-${randomUUID()}`
      );
      const journal = {
        schemaVersion: 1,
        operationId: randomUUID(),
        stage: "started",
        source,
        tombstone,
        name: metadata.name,
        treeHash: sourceSnapshot.treeHash,
        managedPath,
        managedExistedBefore,
        createdAt: new Date(this.#now()).toISOString()
      };
      await this.#writeJournal(journal);
      try {
        const stored = await this.#storeSource(
          source,
          "standalone-archive",
          request.sourceUrl,
          request.revision,
          journal.treeHash
        );
        if (stored.record.name !== journal.name || stored.record.treeHash !== journal.treeHash || !samePath(stored.managedPath, journal.managedPath)) {
          throw new StashError(
            "source-changed",
            `Archive source changed while the managed copy was being committed: "${source}".`,
            4
          );
        }
        await this.#advanceArchiveJournal(journal, "managed-committed");
        await rename2(source, tombstone);
        await this.#advanceArchiveJournal(journal, "source-tombstoned");
        const movedSnapshot = await snapshotTree(tombstone);
        if (movedSnapshot.treeHash !== stored.record.treeHash) {
          throw new StashError(
            "source-changed",
            `Archived source changed before removal; recovery will preserve or restore it safely.`,
            4
          );
        }
        await this.#advanceArchiveJournal(journal, "archive-committed");
        let warning;
        try {
          await rm(tombstone, { recursive: true, force: false });
        } catch (error) {
          warning = `The skill is outside host discovery, but cleanup remains at "${tombstone}": ${String(error)}`;
        }
        if (!warning) {
          try {
            await unlink2(this.#journalPath(journal.operationId));
          } catch (error) {
            warning = `Archive committed, but its recovery journal remains for later cleanup: ${String(error)}`;
          }
        }
        return {
          status: stored.created ? "stored" : "already-stored",
          name: stored.record.name,
          skillId: stored.record.skillId,
          managedPath: stored.managedPath,
          treeHash: stored.record.treeHash,
          ...warning ? { warning } : {}
        };
      } catch (error) {
        await this.#recoverArchiveJournal(
          journal,
          this.#journalPath(journal.operationId)
        );
        throw error;
      }
    });
  }
  async activate(request) {
    return this.#withLock(async () => {
      if (!NAME_PATTERN2.test(request.name)) {
        throw new StashError("invalid-argument", "Invalid skill name.", 2);
      }
      const record = await this.#readRecord(request.name);
      if (!record) {
        throw new StashError(
          "managed-skill-not-found",
          `Managed skill "${request.name}" was not found.`,
          4
        );
      }
      const managedPath = path6.join(this.#managedRoot, request.name);
      const managedSnapshot = await snapshotTree(managedPath);
      if (managedSnapshot.treeHash !== record.treeHash) {
        throw new StashError(
          "managed-drift",
          `Managed skill "${request.name}" no longer matches its recorded hash.`,
          3
        );
      }
      const target = resolveHostRoot(request.target);
      target.root = await this.#canonicalHostRoot(target.root, true);
      const deploymentPath = path6.join(target.root, request.name);
      const targetId = targetIdentity(target);
      const existing = await pathType(deploymentPath);
      const tracked = record.deployments.find(
        (deployment) => samePath(deployment.path, deploymentPath) && deployment.targetId === targetId
      );
      if (existing !== "missing") {
        if (existing === "directory" && tracked) {
          const existingSnapshot = await snapshotTree(deploymentPath);
          if (existingSnapshot.treeHash === record.treeHash) {
            return {
              status: "already-deployed",
              name: record.name,
              skillId: record.skillId,
              managedPath,
              treeHash: record.treeHash,
              deployment: tracked,
              reloadRequired: target.host !== "claude-code",
              warning: "DEPLOYED means present in a discovery root; host enable/disable overrides were not changed."
            };
          }
        }
        throw new StashError(
          "deployment-conflict",
          `Target already exists and will not be overwritten: "${deploymentPath}".`,
          3
        );
      }
      const stage = path6.join(
        path6.dirname(target.root),
        `.stash-deploy-${record.name}-${randomUUID()}`
      );
      let committed = false;
      try {
        await copySnapshot(managedSnapshot, stage);
        const stagedSnapshot = await snapshotTree(stage);
        if (stagedSnapshot.treeHash !== record.treeHash) {
          throw new StashError(
            "copy-verification-failed",
            `Deployment verification failed for "${record.name}".`,
            4
          );
        }
        await rename2(stage, deploymentPath);
        committed = true;
        const deployment = {
          deploymentId: randomUUID(),
          skillId: record.skillId,
          targetId,
          host: target.host,
          scope: target.scope,
          root: target.root,
          path: deploymentPath,
          method: "copy",
          ownership: "stash",
          treeHash: record.treeHash,
          deployedAt: new Date(this.#now()).toISOString()
        };
        record.deployments = [
          ...record.deployments.filter(
            (candidate) => !samePath(candidate.path, deploymentPath)
          ),
          deployment
        ];
        record.lastValidatedAt = new Date(this.#now()).toISOString();
        try {
          await this.#writeRecord(record);
        } catch (error) {
          await rm(deploymentPath, { recursive: true, force: false }).catch(
            () => void 0
          );
          throw error;
        }
        return {
          status: "deployed",
          name: record.name,
          skillId: record.skillId,
          managedPath,
          treeHash: record.treeHash,
          deployment,
          reloadRequired: target.host !== "claude-code",
          warning: "DEPLOYED means present in a discovery root; host enable/disable overrides were not changed."
        };
      } finally {
        if (!committed) {
          await rm(stage, { recursive: true, force: true }).catch(() => void 0);
        }
      }
    });
  }
  async deactivate(request) {
    return this.#withLock(async () => {
      const record = await this.#readRecord(request.name);
      if (!record) {
        throw new StashError(
          "managed-skill-not-found",
          `Managed skill "${request.name}" was not found.`,
          4
        );
      }
      const managedPath = path6.join(this.#managedRoot, request.name);
      const target = resolveHostRoot(request.target);
      target.root = await this.#canonicalHostRoot(target.root, false, true);
      const deploymentPath = path6.join(target.root, request.name);
      const targetId = targetIdentity(target);
      const deployment = record.deployments.find(
        (candidate) => samePath(candidate.path, deploymentPath) && candidate.targetId === targetId
      );
      if (!deployment || deployment.ownership !== "stash" || deployment.skillId !== record.skillId) {
        throw new StashError(
          "detached-deployment",
          `Stash did not create deployment "${deploymentPath}"; refusing to remove it.`,
          3
        );
      }
      const existing = await pathType(deploymentPath);
      if (existing === "missing") {
        record.deployments = record.deployments.filter(
          (candidate) => !samePath(candidate.path, deploymentPath)
        );
        record.lastValidatedAt = new Date(this.#now()).toISOString();
        await this.#writeRecord(record);
        return {
          status: "deactivated",
          name: record.name,
          skillId: record.skillId,
          managedPath,
          treeHash: record.treeHash,
          warning: "The tracked deployment was already missing."
        };
      }
      if (existing !== "directory") {
        throw new StashError(
          "deployment-drift",
          `Tracked deployment is no longer a real directory: "${deploymentPath}".`,
          3
        );
      }
      const deployedSnapshot = await snapshotTree(deploymentPath);
      if (deployedSnapshot.treeHash !== deployment.treeHash) {
        throw new StashError(
          "deployment-drift",
          `Tracked deployment changed and will not be removed: "${deploymentPath}".`,
          3
        );
      }
      const tombstone = path6.join(
        path6.dirname(target.root),
        `.stash-deactivate-${record.name}-${randomUUID()}`
      );
      await rename2(deploymentPath, tombstone);
      try {
        const movedSnapshot = await snapshotTree(tombstone);
        if (movedSnapshot.treeHash !== deployment.treeHash) {
          await rename2(tombstone, deploymentPath);
          throw new StashError(
            "deployment-drift",
            `Deployment changed during deactivation and was restored: "${deploymentPath}".`,
            3
          );
        }
        const previousDeployments = record.deployments;
        record.deployments = previousDeployments.filter(
          (candidate) => !samePath(candidate.path, deploymentPath)
        );
        record.lastValidatedAt = new Date(this.#now()).toISOString();
        try {
          await this.#writeRecord(record);
        } catch (error) {
          record.deployments = previousDeployments;
          await rename2(tombstone, deploymentPath).catch(() => void 0);
          throw error;
        }
        let warning;
        try {
          await rm(tombstone, { recursive: true, force: false });
        } catch (error) {
          warning = `Deployment left discovery, but cleanup remains at "${tombstone}": ${String(error)}`;
        }
        return {
          status: "deactivated",
          name: record.name,
          skillId: record.skillId,
          managedPath,
          treeHash: record.treeHash,
          reloadRequired: target.host !== "claude-code",
          ...warning ? { warning } : {}
        };
      } catch (error) {
        if (await pathType(tombstone) !== "missing") {
          await rename2(tombstone, deploymentPath).catch(() => void 0);
        }
        throw error;
      }
    });
  }
  async status(request = {}) {
    const recordsRoot = path6.join(this.#metadataRoot(), "records");
    let names;
    if (request.name) {
      names = [request.name];
    } else {
      try {
        names = (await readdir3(recordsRoot)).filter((name) => name.endsWith(".json")).map((name) => name.slice(0, -".json".length)).sort((left, right) => left.localeCompare(right, "en"));
      } catch (error) {
        const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
        if (code === "ENOENT") {
          names = [];
        } else {
          throw error;
        }
      }
    }
    const skills = [];
    for (const name of names) {
      const record = await this.#readRecord(name);
      if (!record) {
        continue;
      }
      const managedPath = path6.join(this.#managedRoot, name);
      const managedType = await pathType(managedPath);
      let storeState = managedType === "missing" ? "missing" : "stored";
      let storeIntegrity = managedType === "directory" ? "unknown" : managedType === "missing" ? "unknown" : "drifted";
      let actualTreeHash;
      if (managedType === "directory") {
        try {
          actualTreeHash = (await snapshotTree(managedPath)).treeHash;
          storeIntegrity = actualTreeHash === record.treeHash ? "verified" : "drifted";
        } catch {
          storeIntegrity = "drifted";
        }
      }
      const deployments = [];
      for (const deployment of record.deployments) {
        const type = await pathType(deployment.path);
        if (type === "missing") {
          deployments.push({
            ...deployment,
            state: "missing",
            integrity: "unknown",
            hostObservation: {
              override: "unknown",
              discovery: "absent",
              refresh: deployment.host === "claude-code" ? "live" : "restart-required"
            }
          });
          continue;
        }
        if (type !== "directory") {
          deployments.push({
            ...deployment,
            state: "drifted",
            integrity: "drifted",
            hostObservation: {
              override: "unknown",
              discovery: "unknown",
              refresh: deployment.host === "claude-code" ? "live" : "restart-required"
            }
          });
          continue;
        }
        try {
          const deployedHash = (await snapshotTree(deployment.path)).treeHash;
          deployments.push({
            ...deployment,
            state: deployedHash === deployment.treeHash ? "deployed" : "drifted",
            integrity: deployedHash === deployment.treeHash ? "verified" : "drifted",
            actualTreeHash: deployedHash,
            hostObservation: {
              override: "unknown",
              discovery: "present",
              refresh: deployment.host === "claude-code" ? "live" : "restart-required"
            }
          });
        } catch {
          deployments.push({
            ...deployment,
            state: "drifted",
            integrity: "unknown",
            hostObservation: {
              override: "unknown",
              discovery: "unknown",
              refresh: deployment.host === "claude-code" ? "live" : "restart-required"
            }
          });
        }
      }
      skills.push({
        skillId: record.skillId,
        name,
        managedPath,
        store: {
          state: storeState,
          integrity: storeIntegrity,
          expectedTreeHash: record.treeHash,
          ...actualTreeHash ? { actualTreeHash } : {}
        },
        source: record.source,
        deployments
      });
    }
    return {
      status: skills.length > 0 ? "ok" : "not-found",
      managedRoot: this.#managedRoot,
      skills
    };
  }
};
async function createStashLifecycle(options = {}) {
  const loaded = await loadConfiguration(options);
  const managedRoot = path6.resolve(
    loaded.configuration.managedRoot ?? options.managedRoot ?? platformManagedPath()
  );
  return new StashLifecycleImplementation(
    managedRoot,
    options.now ?? Date.now
  );
}

// src/cli.ts
function parseArguments(argv) {
  const [command, ...rest] = argv;
  const positionals = [];
  const flags2 = /* @__PURE__ */ new Map();
  for (let index = 0; index < rest.length; index += 1) {
    const current = rest[index];
    if (!current) {
      continue;
    }
    if (!current.startsWith("--")) {
      positionals.push(current);
      continue;
    }
    const [rawName, inlineValue] = current.slice(2).split("=", 2);
    const name = rawName ?? "";
    let value = inlineValue;
    if (value === void 0 && rest[index + 1] !== void 0 && !rest[index + 1]?.startsWith("--")) {
      value = rest[index + 1];
      index += 1;
    }
    const values = flags2.get(name) ?? [];
    values.push(value ?? "true");
    flags2.set(name, values);
  }
  return { ...command ? { command } : {}, positionals, flags: flags2 };
}
function flag(args, name) {
  return args.flags.get(name)?.at(-1);
}
function flags(args, name) {
  const values = args.flags.get(name);
  return values && values.length > 0 ? values : void 0;
}
function booleanFlag(args, name) {
  return args.flags.has(name) && flag(args, name) !== "false";
}
function numberFlag(args, name) {
  const value = flag(args, name);
  if (value === void 0) {
    return void 0;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new StashError(
      "invalid-argument",
      `--${name} must be a number.`,
      2
    );
  }
  return parsed;
}
function createOptions(args) {
  const root = flag(args, "root");
  const catalogId = flag(args, "root-id") ?? "default";
  const configPath = flag(args, "config");
  const cacheDir = flag(args, "cache-dir");
  const managedRoot = flag(args, "managed-root");
  const catalogs = root ? [
    {
      id: catalogId,
      root,
      enabled: true,
      trust: "unreviewed",
      followSymlinks: false,
      compatibility: ["codex", "claude-code", "antigravity"]
    }
  ] : void 0;
  return {
    ...configPath ? { configPath } : {},
    ...cacheDir ? { cacheDir } : {},
    ...managedRoot ? { managedRoot } : {},
    ...catalogs ? { catalogs } : {}
  };
}
function lifecycleTarget(args) {
  const host = flag(args, "host");
  const supported = /* @__PURE__ */ new Set([
    "codex",
    "claude-code",
    "antigravity-ide",
    "antigravity-cli"
  ]);
  if (!host || !supported.has(host)) {
    throw new StashError(
      "invalid-argument",
      "--host must be codex, claude-code, antigravity-ide, or antigravity-cli.",
      2
    );
  }
  const scope = flag(args, "scope");
  if (scope !== void 0 && scope !== "user" && scope !== "workspace" && scope !== "custom") {
    throw new StashError(
      "invalid-argument",
      "--scope must be user, workspace, or custom.",
      2
    );
  }
  const root = flag(args, "host-root");
  const workspace = flag(args, "workspace");
  return {
    host,
    ...scope ? { scope } : {},
    ...root ? { root } : {},
    ...workspace ? { workspace } : {}
  };
}
function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}
`);
}
function printResolve(result) {
  if (result.status === "no-match") {
    process.stdout.write(
      result.totalPossible > 0 ? `No materially relevant skills. ${result.totalPossible} possible match(es) were excluded.
` : "No matching skills.\n"
    );
    return;
  }
  if (result.status !== "ok" && result.status !== "ambiguous-exact") {
    process.stdout.write(`Stash: ${result.status}
`);
    return;
  }
  process.stdout.write(
    `${result.totalRelevant} relevant skill(s)` + (result.totalPossible > 0 ? `, ${result.totalPossible} possible match(es)` : "") + "\n"
  );
  let currentScope = "";
  for (const match of result.matches) {
    const group = match.group ?? "(ungrouped)";
    const source = match.source?.displayName && match.source.id ? `${match.source.displayName} [${match.source.id}]` : match.source?.displayName ?? match.source?.id ?? match.source?.url;
    const scope = source ? `${source} / ${match.catalogId} / ${group}` : `${match.catalogId} / ${group}`;
    if (scope !== currentScope) {
      currentScope = scope;
      process.stdout.write(`
${scope}
`);
    }
    const tier = match.relevance ? ` [${match.relevance.tier}]` : "";
    process.stdout.write(`- ${match.name}${tier} \u2014 ${match.description}
`);
    process.stdout.write(`  ref: ${match.ref}
`);
  }
  if (result.page.nextCursor) {
    process.stdout.write(`
next_cursor: ${result.page.nextCursor}
`);
  }
}
function printLifecycle(result) {
  process.stdout.write(
    `${result.name}: ${result.status} (${result.treeHash})
skill_id: ${result.skillId}
${result.managedPath}
`
  );
  if (result.deployment) {
    process.stdout.write(`deployment: ${result.deployment.path}
`);
  }
  if (result.reloadRequired) {
    process.stdout.write("Reload or restart the host before relying on discovery changes.\n");
  }
  if (result.warning) {
    process.stdout.write(`warning: ${result.warning}
`);
  }
}
function usage() {
  return `Stash \u2014 on-demand search for local Agent Skills

Usage:
  stash exact <name> [--source <id|name|url>] [--group <group>] [--catalog <id>] [--json]
  stash search <query> [--source <id|name|url>] [--group <group>] [--catalog <id>] [--cursor <token>] [--include-possible] [--json]
  stash list [--source <id|name|url>] [--group <group>] [--catalog <id>] [--cursor <token>] [--json]
  stash read <ref> [--resource <path>] [--format content|path|json]
  stash index [--catalog <id>] [--json]
  stash doctor [--catalog <id>] [--json]
  stash install <local-skill-dir> [--source-url <url>] [--revision <revision>] [--json]
  stash archive <standalone-skill-dir|name> --host <host> [--scope user] [--json]
  stash activate <name> --host <host> [--scope user] [--json]
  stash deactivate <name> --host <host> [--scope user] [--json]
  stash status [name] [--json]

Configuration:
  --config <path>       Override STASH_CONFIG/platform config.
  --root <path>         Use one catalog without a config file.
  --root-id <id>        Catalog id used with --root (default: default).
  --cache-dir <path>    Override STASH_CACHE_DIR/platform cache.
  --managed-root <path> Override STASH_MANAGED_HOME/platform managed store.

Lifecycle targeting:
  --host <host>         codex, claude-code, antigravity-ide, or antigravity-cli.
  --scope <scope>       user or custom (default: user; workspace is rejected).
  --host-root <path>    Explicit discovery root; implies a custom location.

Result pagination never caps the total relevant result set.
Lifecycle commands manage only the Stash-owned store and explicitly selected
standalone skills. They never mutate external catalogs, plugins, or host settings.
`;
}
async function main() {
  const args = parseArguments(process.argv.slice(2));
  if (!args.command || args.command === "help" || booleanFlag(args, "help")) {
    process.stdout.write(usage());
    return;
  }
  const catalog = await createStashCatalog(createOptions(args));
  const catalogIds = flags(args, "catalog");
  const sources = flags(args, "source");
  const group = flag(args, "group");
  const json = booleanFlag(args, "json");
  switch (args.command) {
    case "exact": {
      const name = args.positionals.join(" ").trim();
      if (!name) {
        throw new StashError(
          "invalid-argument",
          "exact requires a skill name.",
          2
        );
      }
      const result = await catalog.resolve({
        kind: "exact",
        name,
        ...catalogIds ? { catalogIds } : {},
        ...sources ? { sources } : {},
        ...group ? { group } : {}
      });
      json ? printJson(result) : printResolve(result);
      return;
    }
    case "search": {
      const query = args.positionals.join(" ").trim();
      if (!query) {
        throw new StashError(
          "invalid-argument",
          "search requires a query.",
          2
        );
      }
      const cursor = flag(args, "cursor");
      const pageSize = numberFlag(args, "page-size");
      const result = await catalog.resolve({
        kind: "search",
        query,
        ...catalogIds ? { catalogIds } : {},
        ...sources ? { sources } : {},
        ...group ? { group } : {},
        ...cursor ? { cursor } : {},
        ...pageSize !== void 0 ? { pageSize } : {},
        ...booleanFlag(args, "include-possible") ? { includePossible: true } : {}
      });
      json ? printJson(result) : printResolve(result);
      return;
    }
    case "list": {
      const cursor = flag(args, "cursor");
      const pageSize = numberFlag(args, "page-size");
      const result = await catalog.resolve({
        kind: "list",
        ...catalogIds ? { catalogIds } : {},
        ...sources ? { sources } : {},
        ...group ? { group } : {},
        ...cursor ? { cursor } : {},
        ...pageSize !== void 0 ? { pageSize } : {}
      });
      json ? printJson(result) : printResolve(result);
      return;
    }
    case "read": {
      const ref = args.positionals.join(" ").trim();
      if (!ref) {
        throw new StashError("invalid-argument", "read requires a ref.", 2);
      }
      const format = flag(args, "format") ?? "content";
      if (format !== "content" && format !== "path" && format !== "json") {
        throw new StashError(
          "invalid-argument",
          "--format must be content, path, or json.",
          2
        );
      }
      const resource = flag(args, "resource");
      const expectedHash = flag(args, "expected-hash");
      const result = await catalog.read({
        ref,
        ...resource ? { resource } : {},
        ...expectedHash ? { expectedHash } : {},
        ...format === "path" ? { representation: "local-path" } : {}
      });
      if (format === "json" || result.status !== "ok") {
        printJson(result);
      } else if (format === "path") {
        process.stdout.write(`${result.localPath ?? ""}
`);
      } else {
        process.stdout.write(result.content ?? "");
        if (result.content && !result.content.endsWith("\n")) {
          process.stdout.write("\n");
        }
      }
      return;
    }
    case "index": {
      const result = await catalog.refresh({
        ...catalogIds ? { catalogIds } : {},
        force: booleanFlag(args, "force")
      });
      if (json) {
        printJson(result);
      } else {
        for (const item of result.catalogs) {
          process.stdout.write(
            `${item.catalogId}: ${item.indexed} indexed, ${item.skipped} skipped, ${item.warnings.length} warning(s)
`
          );
        }
      }
      if (result.status === "failed") {
        process.exitCode = 4;
      }
      return;
    }
    case "doctor": {
      const result = await catalog.doctor({
        ...catalogIds ? { catalogIds } : {},
        verifyHashes: booleanFlag(args, "verify-hashes")
      });
      if (json) {
        printJson(result);
      } else {
        for (const item of result.catalogs) {
          process.stdout.write(
            `${item.catalogId}: ${item.records} record(s), ${item.warnings.length} warning(s)
`
          );
          for (const warning of item.warnings) {
            process.stdout.write(`  - ${warning.code}: ${warning.message}
`);
          }
        }
      }
      if (result.status === "failed") {
        process.exitCode = 4;
      }
      return;
    }
    case "install":
    case "import":
    case "add": {
      const source = args.positionals.join(" ").trim();
      if (!source) {
        throw new StashError(
          "invalid-argument",
          `${args.command} requires a local skill directory.`,
          2
        );
      }
      if (/^[a-z][a-z0-9+.-]*:\/\//iu.test(source)) {
        throw new StashError(
          "remote-install-unsupported",
          "Remote installation is not supported in this release. Stage the skill locally, then install that directory.",
          2
        );
      }
      const lifecycle = await createStashLifecycle(createOptions(args));
      const sourceUrl = flag(args, "source-url");
      const revision = flag(args, "revision");
      const result = await lifecycle.install({
        source,
        ...sourceUrl ? { sourceUrl } : {},
        ...revision ? { revision } : {}
      });
      json ? printJson(result) : printLifecycle(result);
      return;
    }
    case "archive": {
      const source = args.positionals.join(" ").trim();
      if (!source) {
        throw new StashError(
          "invalid-argument",
          "archive requires a standalone skill directory or a name with --host.",
          2
        );
      }
      const lifecycle = await createStashLifecycle(createOptions(args));
      const target = lifecycleTarget(args);
      const sourceUrl = flag(args, "source-url");
      const revision = flag(args, "revision");
      const result = await lifecycle.archive({
        source,
        target,
        ...sourceUrl ? { sourceUrl } : {},
        ...revision ? { revision } : {}
      });
      json ? printJson(result) : printLifecycle(result);
      return;
    }
    case "activate":
    case "deactivate": {
      const name = args.positionals.join(" ").trim();
      if (!name) {
        throw new StashError(
          "invalid-argument",
          `${args.command} requires a managed skill name.`,
          2
        );
      }
      const lifecycle = await createStashLifecycle(createOptions(args));
      const target = lifecycleTarget(args);
      const result = args.command === "activate" ? await lifecycle.activate({ name, target }) : await lifecycle.deactivate({ name, target });
      json ? printJson(result) : printLifecycle(result);
      return;
    }
    case "status": {
      const name = args.positionals.join(" ").trim();
      const lifecycle = await createStashLifecycle(createOptions(args));
      const result = await lifecycle.status(name ? { name } : {});
      if (json) {
        printJson(result);
      } else if (result.status === "not-found") {
        process.stdout.write(`No managed skills at ${result.managedRoot}.
`);
      } else {
        for (const skill of result.skills) {
          process.stdout.write(
            `${skill.name}: store=${skill.store.state}/${skill.store.integrity}, deployments=${skill.deployments.length}
`
          );
          for (const deployment of skill.deployments) {
            process.stdout.write(
              `  - ${deployment.host}/${deployment.scope}: ${deployment.state} (${deployment.path})
`
            );
          }
        }
      }
      return;
    }
    default:
      throw new StashError(
        "invalid-argument",
        `Unknown command "${args.command}".

${usage()}`,
        2
      );
  }
}
main().catch((error) => {
  if (error instanceof StashError) {
    process.stderr.write(`stash: ${error.message}
`);
    process.exitCode = error.exitCode;
    return;
  }
  process.stderr.write(
    `stash: unexpected error: ${error instanceof Error ? error.stack ?? error.message : String(error)}
`
  );
  process.exitCode = 10;
});
