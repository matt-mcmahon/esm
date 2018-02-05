import Compiler from "./caching-compiler.js"
import Entry from "./entry.js"
import NullObject from "./null-object.js"

import _loadESM from "./module/esm/_load.js"
import builtinEntries from "./builtin-entries.js"
import loadESM from "./module/esm/load.js"
import makeRequireFunction from "./module/make-require-function.js"
import moduleState from "./module/state.js"
import setGetter from "./util/set-getter.js"
import setProperty from "./util/set-property.js"
import setSetter from "./util/set-setter.js"
import shared from "./shared.js"

class Runtime {
  static enable(entry, exported) {
    const mod = entry.module
    const object = mod.exports
    const { prototype } = Runtime

    object.entry = entry
    entry.exports = exported

    Entry.set(mod, exported, entry)

    setGetter(object, "meta", () => {
      const meta = new NullObject
      meta.url = entry.url
      return object.meta = meta
    })

    setSetter(object, "meta", (value) => {
      setProperty(object, "meta", { value })
    })

    object._ = object
    object.d = object.default = prototype.default
    object.e = object.export = prototype.export
    object.i = object.import = prototype.import
    object.l = object.eval = prototype.eval
    object.n = object.nsSetter = prototype.nsSetter
    object.r = object.run = prototype.run
    object.u = object.update = prototype.update
    object.w = object.watch = prototype.watch
  }

  // Register a getter function that always returns the given value.
  default(value) {
    this.export([["default", () => value]])
  }

  // Register getter functions for local variables in the scope of an export
  // statement. Pass true as the second argument to indicate that the getter
  // functions always return the same values.
  export(getterPairs) {
    this.entry.addGetters(getterPairs)
  }

  eval(content) {
    // Section 18.2.1.1: Runtime Semantics: PerformEval ( x, evalRealm, strictCaller, direct )
    // Setp 2: Only evaluate strings.
    // https://tc39.github.io/ecma262/#sec-performeval
    return typeof content === "string"
      ? Compiler.compile(this.entry, content, { eval: true }).code
      : content
  }

  import(request) {
    // Section 2.2.1: Runtime Semantics: Evaluation
    // Step 6: Coerce request to a string.
    // https://tc39.github.io/proposal-dynamic-import/#sec-import-call-runtime-semantics-evaluation
    if (typeof request !== "string") {
      request = String(request)
    }

    return new Promise((resolve, reject) => {
      setImmediate(() => {
        const { entry } = this

        const setterPairs = [["*", createSetter("import", (value, childEntry) => {
          if (childEntry._loaded === 1) {
            resolve(value)
          }
        })]]

        if (request in builtinEntries) {
          return watchBuiltin(entry, request, setterPairs)
        }

        try {
          watchImport(entry, request, setterPairs, loadESM)
        } catch (e) {
          reject(e)
        }
      })
    })
  }

  nsSetter() {
    return createSetter("nsSetter", (value, childEntry) => {
      this.entry.addGettersFrom(childEntry)
    })
  }

  run(moduleWrapper) {
    const { entry } = this
    const cached = entry.package.cache[entry.cacheName]
    const isESM = cached && cached.esm
    const runner =  isESM ? runESM : runCJS
    runner(entry, moduleWrapper)
  }

  update(valueToPassThrough) {
    this.entry.update()

    // Returns the `valueToPassThrough` parameter to allow the value of the
    // original expression to pass through. For example,
    //
    //   export let a = 1
    //   a += 3
    //
    // becomes
    //
    //   runtime.export("a", () => a)
    //   let a = 1
    //   runtime.update(a += 3)
    //
    // This ensures `entry.update()` runs immediately after the assignment,
    // and does not interfere with the larger computation.
    return valueToPassThrough
  }

  watch(request, setterPairs) {
    const { entry } = this

    return request in builtinEntries
      ? watchBuiltin(entry, request, setterPairs)
      : watchImport(entry, request, setterPairs, _loadESM)
  }
}

function createSetter(from, setter) {
  setter.from = from
  return setter
}

function runCJS(entry, moduleWrapper) {
  const mod = entry.module
  const exported = mod.exports = entry.exports
  const req = makeRequireFunction(mod)

  entry.exports = null
  moduleWrapper.call(exported, shared.global, exported, req)
  mod.loaded = true
}

function runESM(entry, moduleWrapper) {
  const mod = entry.module
  const exported = mod.exports = entry.exports

  entry.exports = null

  if (entry.package.options.cjs.vars) {
    const req = makeRequireFunction(mod)
    req.main = moduleState.mainModule
    moduleWrapper.call(exported, shared.global, exported, req)
  } else {
    moduleWrapper.call(void 0, shared.global)
  }

  mod.loaded = true
  entry.update().loaded()
}

function watchBuiltin(entry, request, setterPairs) {
  entry.module.require(request)

  builtinEntries[request]
    .addSetters(setterPairs, entry)
    .update()
}

function watchImport(entry, request, setterPairs, loader) {
  moduleState.requireDepth += 1
  moduleState.passthru = true

  const mod = entry.module

  let childEntry

  try {
    childEntry = loader(request, mod, false, (childEntry) => {
      childEntry.addSetters(setterPairs, entry)
    })
  } finally {
    moduleState.passthru = false
    moduleState.requireDepth -= 1
  }

  entry._requireESM = true
  mod.require(request)

  childEntry.loaded()
  childEntry.update()
}

Object.setPrototypeOf(Runtime.prototype, null)

export default Runtime
