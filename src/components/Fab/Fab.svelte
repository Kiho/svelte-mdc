
<script>
  import { afterUpdate, onDestroy, onMount } from "svelte";
  import { processClasses } from "../helpers";
  import { mdcAfterUpdate, mdcOnDestroy } from '../useRipple';

  export let self = null;
  export let ripple = false;
  export let icon = '';
  export let label = '';
  export let className = '';
  export let mini = false;
  export let exited = false;
  export let extended = false;

  let mdcComponent, prevRipple;
  onMount(() => {
    mdcAfterUpdate(self, mdcComponent, ripple, prevRipple, x => prevRipple = x);
    mdcOnDestroy(mdcComponent);
  });
</script>

<button 
    class="mdc-fab"
    class:mdc-fab--mini={mini}
    class:mdc-fab--exited={exited}
    class:mdc-fab--extended={extended}
    on:click on:mouseup on:mousedown bind:this="{self}" >    
  <span class="material-icons mdc-fab__icon">{icon}</span>
  {#if label}
  <span class="mdc-fab__label">{label}</span>
  {/if}
</button>

<style type='text/scss'>
  .mdc-fab--absolute-right.mdc-fab--absolute-right {
    position: fixed;
    bottom: 1rem;
    right: 1rem;

    @media(min-width: 1024px) {
      bottom: 1.5rem;
      right: 1.5rem;
    }
  }
</style>
