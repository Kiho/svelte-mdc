<script>
  import { createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher();

  export let icon = '';

  export function clicked() {
    dispatch('icon-clicked');
  }
</script>

<i class="material-icons" on:click="{clicked}">
    {icon}
</i>
