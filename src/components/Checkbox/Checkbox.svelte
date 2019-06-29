<script>
  import { onDestroy, onMount } from 'svelte';
  import { MDCCheckbox } from '@material/checkbox';

  export let self;
  export let checked = false;
  export let indeterminate = false;
  export let mdcCheckbox = null;

  onMount(() => {
    mdcCheckbox = MDCCheckbox.attachTo(self);
  });

  onDestroy(() => {
    mdcCheckbox.destroy();
  });
</script>

<div bind:this={self} class="mdc-checkbox">
  <input type="checkbox" class="mdc-checkbox__native-control" model="{checked}" />
  <div class="mdc-checkbox__background">
    <svg class="mdc-checkbox__checkmark" viewBox="0 0 24 24">
      <path class="mdc-checkbox__checkmark__path" fill="none" stroke="white" d="M1.73,12.91 8.1,19.28 22.79,4.59" />
    </svg>
    <div class="mdc-checkbox__mixedmark"></div>
  </div>
</div>

