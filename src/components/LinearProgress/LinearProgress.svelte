<script>
  import { afterUpdate, onDestroy, onMount } from "svelte";
  import { MDCLinearProgress } from "@material/linear-progress";

  export let self = null;
  export let open = false;
  export let reverse = false;
  export let indeterminate = true;
  export let progress = 0;
  export let buffer = 0;

  let mdcComponent;

  onMount(() => {
    mdcComponent = new MDCLinearProgress(self);
  });

  onDestroy(() => {
    mdcComponent.destroy();
  });

  function openClose() {
    if (open) {
      mdcComponent.open();
    } else {
      mdcComponent.close();
    }
  }

  $: reverse, mdcComponent && (mdcComponent.reverse = reverse);
  $: buffer, mdcComponent && (mdcComponent.buffer = buffer);
  $: indeterminate, mdcComponent && (mdcComponent.indeterminate = indeterminate);
  $: progress, mdcComponent && (mdcComponent.progress = progress);
  $: open, mdcComponent && openClose(open);

</script>

<div bind:this="{self}" class="mdc-linear-progress">
  <div class="mdc-linear-progress__buffering-dots"></div>
  <div class="mdc-linear-progress__buffer"></div>
  <div class="mdc-linear-progress__bar mdc-linear-progress__primary-bar">
    <span class="mdc-linear-progress__bar-inner"></span>
  </div>
  <div class="mdc-linear-progress__bar mdc-linear-progress__secondary-bar">
    <span class="mdc-linear-progress__bar-inner"></span>
  </div>
</div>

