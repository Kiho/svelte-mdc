<script>
  import { onDestroy, onMount } from "svelte";
  import { MDCTabIndicator } from "@material/tab-indicator";
  import { processClasses } from "../helpers.js";

  export let indicator;
  export let icon;
  export let underline;

  onMount(() => {
    mdcComponent = new MDCTabIndicator(indicator);
  });

  onDestroy(() => {
    mdcComponent.destroy();
  });

  // [svelte-upgrade warning]
  // this function needs to be manually rewritten
  export let attrs;
  $: {
    let result = Object.assign({}, $$props);
    let cls = "mdc-tab-indicator";
    let classes = [cls];
    for (let key of ["active", "fade"]) {
      if (result[key]) {
        classes.push(cls + "--" + key);
      }
      delete result[key];
    }
    for (let key of ["underline", "icon"]) {
      delete result[key];
    }
    result["class"] = processClasses(classes, result["class"]);
    attrs = result;
  }

  export let classContent;
  $: {
    let cls = "mdc-tab-indicator__content";
    let classes = [cls];
    if (icon.length) {
      classes.push(cls + "--icon");
      classes.push("material-icons");
    } else if (underline) {
      classes.push(cls + "--underline");
    }
    classContent = classes.join(" ");
  }
</script>

<span bind:this="{indicator}" {...attrs}>
  <span class="{classContent}">{icon}</span>
</span>
