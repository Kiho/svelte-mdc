<script>
  export let adjustMargin = '';
  export let level = 1;

  export let classes;
  $: {
    const classList = ['mdc-typography--subheading' + level]
    adjustMargin && classList.push('mdc-typography--adjust-margin')

    classes = classList.join(' ')
  }
</script>

{#if level < 2}
  <h3 class="{classes}">
    <slot />
  </h3>
{:else}
  <h4 class="{classes}">
    <slot />
  </h4>
{/if}

