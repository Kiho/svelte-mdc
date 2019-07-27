<script>
  import { createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher();

  export let icon = '';
  export let className = '';

  export function clicked() {
    dispatch('icon-clicked');
  }
</script>

<i class="material-icons {className}" on:click="{clicked}">
    {icon}
    <slot />
</i>
