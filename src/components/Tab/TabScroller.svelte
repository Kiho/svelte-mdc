<script>
  import { onDestroy, onMount } from "svelte";

  // [svelte-upgrade suggestion]
  // manually refactor all references to __this
  import { MDCTabScroller } from "@material/tab-scroller";
  import { processClasses } from "../helpers.js";

  export let scroller;
  export let checked = false;
  export let indeterminate = false;
  let mdcComponent = null;

  onMount(() => {
    mdcComponent = new MDCTabScroller(scroller);
  });

  onDestroy(() => {
    mdcComponent.destroy();
  });

  // [svelte-upgrade warning]
  // this function needs to be manually rewritten
  export let attrs;
  $: {
    let result = Object.assign({}, $$props);
    let cls = "mdc-tab-scroller";
    let classes = [cls];
    if (["start", "end", "center"].includes(result["align"])) {
      classes.push(cls + "--align-" + result.align);
      delete result.align;
    }
    result["class"] = processClasses(classes, result["class"]);
    attrs = result;
  }
</script>

<div bind:this="{scroller}" {...attrs}>
  <div class="mdc-tab-scroller__scroll-area">
    <div class="mdc-tab-scroller__scroll-content">
      <slot></slot>
    </div>
  </div>
</div>
