<script>
  export let adjustMargin = '';
  export let level = 1;

  export let classes;
  $: {
  const classList = ['mdc-typography--display' + level]
  adjustMargin && classList.push('mdc-typography--adjust-margin')

  classes = classList.join(' ')
}
</script>

<h1 class="{classes}">
  <slot />
</h1>

