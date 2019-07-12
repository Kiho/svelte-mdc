<script>
  import { processClasses } from "../helpers";
  import { Icon } from "../Icon";

  // [svelte-upgrade warning]
  // this function needs to be manually rewritten
  export let attrs;
  $: {
    let result = Object.assign({}, $$props);
    let cls = "mdc-top-app-bar__";
    var classes = [];
    for (let key of ["navigation-icon", "action-item"]) {
      if (result[key] && classes.length === 0) {
        classes.push(cls + key);
      }
      delete result[key];
    }
    result["class"] = processClasses(classes, result["class"]);
    attrs = result;
  }
</script>

<Icon on:click {...attrs}><slot></slot></Icon>
