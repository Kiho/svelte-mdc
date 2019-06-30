const regex = /%s/gi;

export function addClassToSlot(owner: HTMLElement, name: string, className: string) {
  const el = owner.querySelector(`[slot="${name}"]`);
  el && el.classList.add(className);
}

export function addClassToSlotNodes(owner: HTMLElement, name: string, className: string) {
  const el = owner.querySelector(`[slot="${name}"]`);
  if (el && el.childNodes) {
    el.childNodes.forEach((x: ChildNode) => {
      (x as HTMLElement).classList.add(className);
    });
  }
}

export function buildClasses(classes: any, classList: any[]) {
  classList = classList || []; 
  Object.keys(classes).forEach(x => {
    classes[x] && classList.push(x);
  }) 
  return classList.join(' ');
}

export function processClasses(classes: any, userClasses: any) {
    if (!userClasses) {
      return classes.join(" ");
    }
    if (Array.isArray(userClasses)) {
      userClasses = userClasses.join(" ");
    }
    if (!regex.test(userClasses)) {
      return userClasses + " " + classes.join(" ");
    }
    return userClasses.replace(regex, classes.join(" "));
}

export function debounce (fn: any, debounceDuration: number) {
  debounceDuration = debounceDuration || 100
  return function () {
    if (!fn.debouncing) {
      var args = Array.prototype.slice.apply(arguments);
      fn.lastReturnVal = fn.apply(window, args);
      fn.debouncing = true;
    }
    clearTimeout(fn.debounceTimeout)
    fn.debounceTimeout = setTimeout(function () {
      fn.debouncing = false;
    }, debounceDuration);

    return fn.lastReturnVal;
  }
}
