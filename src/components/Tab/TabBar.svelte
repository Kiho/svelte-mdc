<script>
  import {
    beforeUpdate,
    createEventDispatcher,
    onDestroy,
    onMount
  } from "svelte";
  import { MDCTabBar } from "@material/tab-bar";
  import { processClasses } from "../helpers.js";
  
  const dispatch = createEventDispatcher();

  export let bar = null;
  export let activeTabIndex = 0;
  let root;
  let mdcComponent;

  onMount(() => {
    if (root && root.getTabsComponent) {
      mdcComponent = root.getTabsComponent();
    } else {
      mdcComponent = MDCTabBar.attachTo(bar);
    }
    mdcComponent.listen("MDCTabBar:activated", data => {
      dispatch("change", { activeTabIndex: data.detail.index });
      if (data.detail.index !== activeTabIndex) {
        activeTabIndex = data.detail.index;
      }
      console.log('tab-change', activeTabIndex);
    });
  });

  onDestroy(() => {
    if (!!mdcComponent) {
      mdcComponent.destroy();
    }
  });

  let prevTabIndex;
  beforeUpdate(() => {
    if (activeTabIndex && prevTabIndex) {
      mdcComponent.activateTab(activeTabIndex);
    }
    prevTabIndex = activeTabIndex;
  });

  export let attrs;
  $: {
    let result = Object.assign({ role: "tablist" }, $$props);
    let classes = ["mdc-tab-bar"];
    result["class"] = processClasses(classes, result["class"]);
    attrs = result;
  }
</script>

<div bind:this="{bar}" {...attrs}>
  <slot></slot>
</div>
