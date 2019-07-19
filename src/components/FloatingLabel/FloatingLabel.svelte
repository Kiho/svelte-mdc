<script>
  import { beforeUpdate, onDestroy, onMount } from "svelte";
  import { MDCFloatingLabel } from '@material/floating-label';

  export let select = false;
  export let htmlFor = '';

  let self;
  let mdcComponent;
  let attrs, classes;

  onMount(() => {
    mdcComponent = MDCFloatingLabel.attachTo(self);
  });

  onDestroy(() => {
    if (mdcComponent) mdcComponent.destroy();
  });
</script>

{#if select}
<span
  bind:this={self}
  for="{htmlFor}"
  :class="{classes}"
  class="mdc-floating-label"
  {attrs}
>
  <slot />
</span>
{:else}
<label
  bind:this={self}
  for="{htmlFor}"
  :class="{classes}"
  class="mdc-floating-label"
  {attrs}
>
  <slot />
</label>
{/if}