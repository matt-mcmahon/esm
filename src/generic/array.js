import SafeArray from "../safe/array.js"

import shared from "../shared.js"
import unapply from "../util/unapply.js"

function init() {
  const { prototype } = SafeArray

  return {
    concat: unapply(prototype.concat),
    filter: unapply(prototype.filter),
    indexOf: unapply(prototype.indexOf),
    join: unapply(prototype.join),
    of: SafeArray.of,
    push: unapply(prototype.push),
    slice: unapply(prototype.slice),
    some: unapply(prototype.some),
    sort: unapply(prototype.sort),
    unshift: unapply(prototype.unshift)
  }
}

export default shared.inited
  ? shared.module.GenericArray
  : shared.module.GenericArray = init()
