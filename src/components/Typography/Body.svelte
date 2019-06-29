<script>
  export let adjustMargin = '';
  export let level = 1;

  export let classes;
  $: {
  const classList = ['mdc-typography--body' + level]
  adjustMargin && classList.push('mdc-typography--adjust-margin')

  classes = classList.join(' ')
}
</script>

<p class="{classes}">
    <slot />
</p>



<style type='text/scss'>
@import "@material/typography/mdc-typography";
</style>
