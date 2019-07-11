const regex = /%s/gi;

export function addClassToSlot(owner, name, className) {
  if (!owner) return;
  const el = owner.querySelector(`[slot="${name}"]`);
  el && el.classList.add(className);
}

export function addClassToSlotNodes(owner, name, className) {
  if (!owner) return;
  const el = owner.querySelector(`[slot="${name}"]`);
  if ( el && el.childNodes){
    el.childNodes.forEach(x => x.classList.add(className));
  }
}

export function buildClasses(classes, classList) {
  classList = classList || []; 
  Object.keys(classes).forEach(x => {
    classes[x] && classList.push(x);
  }) 
  return classList.join(' ');
}

export function processClasses(classes, userClasses) {
    if (!userClasses) {
        return classes.join(" ");
    }
    if (Array.isArray(userClasses)) {
        userClasses = userClasses.join(" ");
    }
    if (!regex.test(userClasses)) {
        return userClasses+" "+classes.join(" ");
    }
    return userClasses.replace(regex, classes.join(" "));
}

export function debounce (fn, debounceDuration) {
  debounceDuration = debounceDuration || 100
  return function () {
    if (!fn.debouncing) {
      var args = Array.prototype.slice.apply(arguments)
      fn.lastReturnVal = fn.apply(window, args)
      fn.debouncing = true
    }
    clearTimeout(fn.debounceTimeout)
    fn.debounceTimeout = setTimeout(function () {
      fn.debouncing = false
    }, debounceDuration)

    return fn.lastReturnVal
  }
}
