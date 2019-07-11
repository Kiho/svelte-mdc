<script>
  import { processClasses } from "../helpers.js";
  // [svelte-upgrade warning]
  // this function needs to be manually rewritten
  export let attrs;
  $: {
    let result = Object.assign({}, $$props);
    let cls = "mdc-top-app-bar__section";
    let classes = [cls];
    let k = "align";
    let v;
    if ((v = result[k])) {
      if (v === "start" || v === "end") {
        classes.push(cls + "--" + k + "-" + v);
      }
      delete result[k];
    }
    result["class"] = processClasses(classes, result["class"]);
    attrs = result;
  }
</script>

<section {...attrs}>
  <slot></slot>
</section>
